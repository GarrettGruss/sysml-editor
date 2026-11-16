import { quoteName, splitQualified, unquoteName, type Element, type ModelIndex } from "../model/index.js";
import { declarationTokens, findRuns, nameTokens, type Run } from "./decl.js";
import { isName, positionOf, tokenize, type Tok } from "./text.js";
import type { SourceLocation } from "./types.js";

export interface RefReplacement {
  uri: string;
  /** The name token to rewrite. */
  tok: Tok;
  /** The element whose declaration contains the reference. */
  holder: Element;
  refText: string;
  segIndex: number;
  /** Start of the whole reference (its first token), to tell references apart from segments. */
  runStart: number;
}

export interface EndsChange {
  holder: Element;
  oldText: string;
  /** Token texts of the run; replaced tokens are listed in `replaced`. */
  tokens: Tok[];
  replaced: Set<number>;
}

/** Where a stable record of the resolutions goes during a scan (see `snapshotResolutions`). */
export interface ScanOptions {
  snapshot?: Snapshot;
  /** Also count references written with the short name of a target (rename leaves those alone). */
  includeShortNames?: boolean;
}

export interface ScanResult {
  replacements: RefReplacement[];
  endsChanges: EndsChange[];
  /** Identifier tokens that read like the old name but could not be judged. */
  unjudged: SourceLocation[];
  skippedDocuments: string[];
  /** For the shadow check: scopes from which a replaced first segment was written. */
  firstSegScopes: Element[];
}

const SUPER_DEPTH = 8;

export class Inherit {
  private readonly memo = new Map<Element, Element[]>();
  private readonly resolved = new Map<Element, Map<string, Element[]>>();
  constructor(private readonly index: ModelIndex) {}

  /** `index.resolveAll`, remembered per scope and name for the lifetime of this object (one scan). */
  resolveAll(text: string, scope: Element): Element[] {
    let m = this.resolved.get(scope);
    if (!m) this.resolved.set(scope, (m = new Map()));
    let r = m.get(text);
    if (!r) m.set(text, (r = this.index.resolveAll(text, scope)));
    return r;
  }

  /** Declared supertypes, transitively. */
  closure(el: Element): Element[] {
    const hit = this.memo.get(el);
    if (hit) return hit;
    const out: Element[] = [];
    const seen = new Set<Element>([el]);
    let layer: Element[] = [el];
    for (let d = 0; d < SUPER_DEPTH && layer.length; d++) {
      const next: Element[] = [];
      for (const x of layer) {
        for (const text of [...x.typeNames, ...x.specializes, ...x.subsets, ...x.redefines]) {
          const r = this.resolveAll(text, x.owner ?? x)[0];
          if (r && !seen.has(r)) {
            seen.add(r);
            out.push(r);
            next.push(r);
          }
        }
      }
      layer = next;
    }
    this.memo.set(el, out);
    return out;
  }

  member(el: Element, seg: string): Element | undefined {
    for (const t of this.closure(el)) {
      const m = t.members.find((x) => x.kind !== "import" && x.kind !== "alias" && (x.name === seg || x.shortName === seg));
      if (m) return m;
    }
    return undefined;
  }

  fromScopes(scope: Element, seg: string): { el: Element; level: number } | undefined {
    let level = 0;
    for (let s: Element | undefined = scope; s; s = s.owner, level++) {
      const m = this.member(s, seg);
      if (m) return { el: m, level };
    }
    return undefined;
  }
}

/** Resolve each segment prefix of a qualified name or feature chain; undefined where unjudgeable. */
export function resolvePrefixes(index: ModelIndex, inh: Inherit, segs: string[], scope: Element, targets?: ReadonlySet<Element>): (Element | undefined)[] {
  const out: (Element | undefined)[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg === "$") {
      out.push(undefined);
      continue;
    }
    const prefix = segs.slice(0, i + 1).map((s) => (s === "$" ? s : quoteName(s))).join("::");
    const cands = inh.resolveAll(prefix, scope);
    // A namespace declared in several places yields several candidates: prefer a wanted one.
    let r: Element | undefined = cands.find((x) => targets?.has(x)) ?? cands[0];
    if (i === 0) {
      const h = inh.fromScopes(scope, seg);
      if (h) {
        let j = 0;
        let found = false;
        for (let s: Element | undefined = scope; s; s = s.owner, j++) if (r && s === r.owner) { found = true; break; }
        if (!r || h.level < (found ? j : Infinity)) r = h.el;
      }
    } else if (!r && out[i - 1]) {
      r = inh.member(out[i - 1]!, seg);
    }
    out.push(r);
  }
  return out;
}

function refTexts(e: Element): { text: string; allowFollow: boolean; isEnd: boolean }[] {
  const out: { text: string; allowFollow: boolean; isEnd: boolean }[] = [];
  const add = (texts: readonly string[], isEnd = false) => {
    for (const t of texts) if (t && !out.some((o) => o.text === t)) out.push({ text: t, allowFollow: false, isEnd });
  };
  add(e.typeNames);
  add(e.specializes);
  add(e.subsets);
  add(e.redefines);
  add(e.references);
  add(e.ends, true);
  if (e.aliasFor) add([e.aliasFor]);
  if (e.importInfo?.target && !out.some((o) => o.text === e.importInfo!.target)) out.push({ text: e.importInfo.target, allowFollow: true, isEnd: false });
  return out;
}

/** One reference found in a declaration, with what each of its segments resolves to. */
export interface RefVisit {
  uri: string;
  text: string;
  /** The element whose declaration contains the reference. */
  holder: Element;
  refText: string;
  isEnd: boolean;
  run: Run;
  /** The name tokens of the run, one per segment. */
  names: Tok[];
  /** What each segment resolves to (undefined: does not resolve, or cannot be judged). */
  resolved: (Element | undefined)[];
  scope: Element;
}

export interface WalkOptions {
  targets?: ReadonlySet<Element>;
  /** Called for every element of a scanned document (declaration names are not references). */
  onElement?: (uri: string, e: Element) => void;
  inherit?: Inherit;
}

/**
 * Visit every reference of every clean user document: resolve the reference texts of each
 * element and locate the tokens in the declaration with the lexer. Documents with syntax errors
 * are returned as skipped.
 */
export function walkReferences(index: ModelIndex, visit: (v: RefVisit) => void, opts: WalkOptions = {}): { skippedDocuments: string[] } {
  const inh = opts.inherit ?? new Inherit(index);
  const skippedDocuments: string[] = [];
  for (const uri of index.uris()) {
    const state = index.getDocument(uri)!;
    if (index.isReadOnly(uri)) continue;
    if (state.errors.length > 0 || state.detailsPending) {
      skippedDocuments.push(uri);
      continue;
    }
    const text = state.text;
    const walk = (e: Element) => {
      opts.onElement?.(uri, e);
      const refs = refTexts(e);
      if (refs.length) {
        const toks = declarationTokens(text, e);
        for (const r of refs) {
          const segs = splitQualified(r.text);
          const runs = findRuns(toks, r.text, r.allowFollow).filter((run) => !run.toks.some((t) => isOwnName(e, t)));
          if (!runs.length) continue;
          const scope = e.owner ?? e;
          const resolved = resolvePrefixes(index, inh, segs, scope, opts.targets);
          for (const run of runs) {
            const names = nameTokens(run);
            if (names.length !== segs.length) continue;
            visit({ uri, text, holder: e, refText: r.text, isEnd: r.isEnd, run, names, resolved, scope });
          }
        }
      }
      for (const m of e.members) walk(m);
    };
    for (const r of state.model.roots) walk(r);
  }
  return { skippedDocuments };
}

/**
 * Find every reference to `target` (an element, or all declarations of a merged element) by name
 * in the workspace. Identifier tokens that read like the old name but did not resolve (or were
 * not examined) are reported as not judged.
 */
export function scanReferences(index: ModelIndex, target: Element | readonly Element[], opts: ScanOptions = {}): ScanResult {
  const targets = new Set<Element>(Array.isArray(target) ? target : [target as Element]);
  const wanted = new Set<string>();
  for (const t of targets) {
    if (t.name !== undefined) wanted.add(t.name);
    if (opts.includeShortNames && t.shortName !== undefined) wanted.add(t.shortName);
  }
  const res: ScanResult = { replacements: [], endsChanges: [], unjudged: [], skippedDocuments: [], firstSegScopes: [] };
  const judged = new Map<string, Set<number>>();
  const declNames = new Map<string, Set<number>>();
  const set = (m: Map<string, Set<number>>, uri: string) => {
    let s = m.get(uri);
    if (!s) m.set(uri, (s = new Set()));
    return s;
  };
  const matches = (tok: Tok, el: Element) => {
    const n = unquoteName(tok.text);
    return n === el.name || (!!opts.includeShortNames && n === el.shortName);
  };
  const walked = walkReferences(
    index,
    (v) => {
      if (opts.snapshot) recordResolutions(index, v, opts.snapshot);
      const replaced = new Set<number>();
      v.names.forEach((tok, i) => {
        const r = v.resolved[i];
        if (r === undefined) return; // unresolved: leave the token to the unjudged count
        set(judged, v.uri).add(tok.start);
        if (targets.has(r) && matches(tok, r)) {
          replaced.add(tok.start);
          res.replacements.push({ uri: v.uri, tok, holder: v.holder, refText: v.refText, segIndex: i, runStart: v.run.toks[0]!.start });
          if (i === 0) res.firstSegScopes.push(v.scope);
        }
      });
      if (v.isEnd && replaced.size) res.endsChanges.push({ holder: v.holder, oldText: v.refText, tokens: v.run.toks, replaced });
    },
    {
      targets,
      onElement: (uri, e) => {
        if (e.nameRange) set(declNames, uri).add(e.nameRange.start.offset);
        if (e.shortNameRange) set(declNames, uri).add(e.shortNameRange.start.offset);
      },
    },
  );
  res.skippedDocuments = walked.skippedDocuments;
  for (const uri of declNames.keys()) {
    const text = index.getDocument(uri)!.text;
    const j = judged.get(uri);
    const d = declNames.get(uri)!;
    for (const t of tokenize(text)) {
      if (!isName(t) || t.hidden || j?.has(t.start) || d.has(t.start) || !wanted.has(unquoteName(t.text))) continue;
      res.unjudged.push({ uri, ...positionOf(text, t.start) });
    }
  }
  return res;
}

function isOwnName(e: Element, t: Tok): boolean {
  return t.start === e.nameRange?.start.offset || t.start === e.shortNameRange?.start.offset;
}

// ---------------------------------------------------------------------------- resolution snapshot

export interface Decl {
  uri: string;
  off: number;
}

export interface Seen {
  uri: string;
  tok: number;
  line: number;
  column: number;
  text: string;
  decls: Decl[];
  desc: string;
}

export const resolutionKey = (uri: string, tok: number, seg: number) => `${uri}\0${tok}\0${seg}`;

export function declsOf(index: ModelIndex, e: Element): Decl[] {
  const all = e.qualifiedName !== undefined ? index.findByQualifiedName(e.qualifiedName) : [];
  return (all.length ? all : [e]).map((d) => ({ uri: d.uri, off: (d.nameRange ?? d.range).start.offset }));
}

function insideOrMerged(e: Element, within: Element): boolean {
  for (let x: Element | undefined = e; x; x = x.owner) {
    if (x === within) return true;
    if (within.qualifiedName !== undefined && x.qualifiedName === within.qualifiedName && x.kind === within.kind) return true;
  }
  return false;
}

/** What every reference the scanner can resolve resolves to, keyed by token position and segment. */
export type Snapshot = Map<string, Seen>;

/** Record what each segment of one reference resolves to. */
export function recordResolutions(index: ModelIndex, v: RefVisit, out: Snapshot, within?: Element): void {
  if (within && !insideOrMerged(v.holder, within)) return;
  v.names.forEach((tok, i) => {
    const r = v.resolved[i];
    if (!r) return;
    const p = positionOf(v.text, tok.start);
    out.set(resolutionKey(v.uri, tok.start, i), { uri: v.uri, tok: tok.start, ...p, text: v.names.slice(0, i + 1).map((t) => t.text).join("::"), decls: declsOf(index, r), desc: r.qualifiedName ?? r.name ?? r.kind });
  });
}

/** What every reference the scanner can resolve resolves to, keyed by token position and segment. */
export function snapshotResolutions(index: ModelIndex, within?: Element): Snapshot {
  const out: Snapshot = new Map();
  walkReferences(index, (v) => recordResolutions(index, v, out, within));
  return out;
}

