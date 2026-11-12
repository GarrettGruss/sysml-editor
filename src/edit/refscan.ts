import { quoteName, splitQualified, unquoteName, type Element, type ModelIndex } from "../model/index.js";
import { declarationTokens, findRuns, nameTokens } from "./decl.js";
import { isName, positionOf, tokenize, type Tok } from "./text.js";
import type { SourceLocation } from "./types.js";

export interface RefReplacement {
  uri: string;
  /** The name token to rewrite. */
  tok: Tok;
  /** The element whose declaration contains the reference. */
  holder: Element;
  refText: string;
  /** The reference text with the renamed segments replaced, set by the caller. */
  segIndex: number;
}

export interface EndsChange {
  holder: Element;
  oldText: string;
  /** Token texts of the run; replaced tokens are listed in `replaced`. */
  tokens: Tok[];
  replaced: Set<number>;
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

class Inherit {
  private readonly memo = new Map<Element, Element[]>();
  constructor(private readonly index: ModelIndex) {}

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
        for (const text of [...x.types, ...x.specializes, ...x.subsets, ...x.redefines]) {
          const r = this.index.resolve(text, x.owner ?? x);
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
function resolvePrefixes(index: ModelIndex, inh: Inherit, segs: string[], scope: Element): (Element | undefined)[] {
  const out: (Element | undefined)[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg === "$") {
      out.push(undefined);
      continue;
    }
    const prefix = segs.slice(0, i + 1).map((s) => (s === "$" ? s : quoteName(s))).join("::");
    let r: Element | undefined = index.resolveAll(prefix, scope)[0];
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
  add(e.types);
  add(e.specializes);
  add(e.subsets);
  add(e.redefines);
  add(e.references);
  add(e.ends, true);
  if (e.aliasFor) add([e.aliasFor]);
  if (e.importInfo?.target && !out.some((o) => o.text === e.importInfo!.target)) out.push({ text: e.importInfo.target, allowFollow: true, isEnd: false });
  return out;
}

/**
 * Find every reference to `target` by name in the workspace: walk all clean user documents,
 * resolve the reference texts of each element (types, specializations, subsets, redefinitions,
 * references, relationship ends, import targets, alias targets; feature chains also through the
 * declared supertypes of the segments before), and locate the tokens in the declaration with the
 * lexer. Other identifier tokens that read like the old name are reported as not judged.
 */
export function scanReferences(index: ModelIndex, target: Element): ScanResult {
  const oldName = target.name!;
  const inh = new Inherit(index);
  const res: ScanResult = { replacements: [], endsChanges: [], unjudged: [], skippedDocuments: [], firstSegScopes: [] };
  for (const uri of index.uris()) {
    const state = index.getDocument(uri)!;
    if (index.isReadOnly(uri)) continue;
    if (state.errors.length > 0 || state.detailsPending) {
      res.skippedDocuments.push(uri);
      continue;
    }
    const text = state.text;
    const judged = new Set<number>();
    const declNames = new Set<number>();
    const walk = (e: Element) => {
      if (e.nameRange) declNames.add(e.nameRange.start.offset);
      if (e.shortNameRange) declNames.add(e.shortNameRange.start.offset);
      const refs = refTexts(e);
      if (refs.length) {
        const toks = declarationTokens(text, e);
        for (const r of refs) {
          const segs = splitQualified(r.text);
          const runs = findRuns(toks, r.text, r.allowFollow).filter((run) => !run.toks.some((t) => isOwnName(e, t)));
          if (!runs.length) continue;
          const scope = e.owner ?? e;
          const resolved = resolvePrefixes(index, inh, segs, scope);
          for (const run of runs) {
            const names = nameTokens(run);
            if (names.length !== segs.length) continue;
            const replaced = new Set<number>();
            names.forEach((tok, i) => {
              judged.add(tok.start);
              const hit = resolved[i] === target && unquoteName(tok.text) === oldName;
              if (hit) {
                replaced.add(tok.start);
                res.replacements.push({ uri, tok, holder: e, refText: r.text, segIndex: i });
                if (i === 0) res.firstSegScopes.push(scope);
              }
            });
            if (r.isEnd && replaced.size) res.endsChanges.push({ holder: e, oldText: r.text, tokens: run.toks, replaced });
          }
        }
      }
      for (const m of e.members) walk(m);
    };
    for (const r of state.model.roots) walk(r);
    for (const t of tokenize(text)) {
      if (!isName(t) || t.hidden || judged.has(t.start) || declNames.has(t.start) || unquoteName(t.text) !== oldName) continue;
      res.unjudged.push({ uri, ...positionOf(text, t.start) });
    }
  }
  return res;
}

function isOwnName(e: Element, t: Tok): boolean {
  return t.start === e.nameRange?.start.offset || t.start === e.shortNameRange?.start.offset;
}
