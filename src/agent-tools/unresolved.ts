import { splitQualified, type Element, type ModelIndex } from "../model/index.js";

export interface UnresolvedName {
  uri: string;
  /** 0-based. */
  line: number;
  column: number;
  name: string;
  message: string;
}

// A plain qualified name: identifiers or quoted names joined by `::`. Anything else (feature
// chains `a.b`, expressions, parameters) is not judged.
const SEG = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*|'(?:[^'\\]|\\.)*')`;
const PLAIN = new RegExp(`^(?:\\$::)?${SEG}(?:::${SEG})*$`);

const isWord = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);

function lineCol(text: string, offset: number): { line: number; column: number } {
  let line = 0;
  let last = -1;
  for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) {
    line++;
    last = i;
  }
  return { line, column: offset - last - 1 };
}

/** Offset of `name` as a whole token within [from, to), or -1. */
function findToken(text: string, name: string, from: number, to: number): number {
  for (let i = text.indexOf(name, from); i >= 0 && i + name.length <= to; i = text.indexOf(name, i + 1)) {
    if (!isWord(text[i - 1]) && text[i - 1] !== ":" && !isWord(text[i + name.length])) return i;
  }
  return -1;
}

/** Everything an element says it is a kind of. */
const supertypesOf = (e: Element): string[] => [...e.types, ...e.specializes, ...e.subsets, ...e.redefines];

/**
 * True when `name` could be a member inherited by an enclosing element through typing or
 * specialization, which the resolver does not follow. Conservative: an enclosing supertype that
 * cannot itself be resolved (or is not a plain name) means "could be", so nothing is reported.
 */
function mayBeInherited(index: ModelIndex, name: string, el: Element): boolean {
  const first = splitQualified(name)[0]!;
  const seen = new Set<Element>();
  const declares = (t: Element): boolean => {
    if (seen.has(t)) return false;
    seen.add(t);
    if (t.members.some((m) => m.kind !== "import" && (m.name === first || m.shortName === first))) return true;
    return supers(t);
  };
  const supers = (e: Element): boolean => {
    for (const s of supertypesOf(e)) {
      if (!PLAIN.test(s)) return true;
      const targets = index.resolveAll(s, e.owner ?? e);
      if (targets.length === 0) return true;
      if (targets.some(declares)) return true;
    }
    return false;
  };
  for (let scope = el.owner; scope; scope = scope.owner) if (supers(scope)) return true;
  return false;
}

/**
 * Names the resolver can judge: the type after `:` of a usage, `:>` targets of definitions, and
 * import targets. Not checked: feature chains, redefinition and subsetting on usages (they may
 * name inherited members, which the resolver does not follow), anything under `unknown` elements.
 * Documents whose text has syntax errors are skipped (their model is stale).
 */
export function findUnresolvedNames(index: ModelIndex, uri: string): UnresolvedName[] {
  const doc = index.getDocument(uri);
  if (!doc || doc.stale) return [];
  const out: UnresolvedName[] = [];

  const check = (el: Element, name: string, what: string, from: Element, start: number, end: number) => {
    if (!PLAIN.test(name)) return;
    if (index.resolve(name, from)) return;
    if (mayBeInherited(index, name, el)) return;
    let off = findToken(doc.text, name, start, end);
    if (off < 0) off = el.nameRange?.start.offset ?? el.range.start.offset;
    const p = lineCol(doc.text, off);
    out.push({ uri, ...p, name, message: `Unresolved ${what} '${name}': no element with that name is visible here` });
  };

  const walk = (el: Element) => {
    if (el.kind === "unknown") return;
    const start = el.nameRange?.end.offset ?? el.range.start.offset;
    const end = el.bodyRange?.start.offset ?? el.range.end.offset;
    const scope = el.owner ?? el;
    if (el.kind === "import" && el.importInfo) {
      check(el, el.importInfo.target, "import target", scope, el.range.start.offset, el.range.end.offset);
    } else if (el.kind !== "expose" && el.kind !== "alias") {
      if (el.isUsage) for (const t of el.types) check(el, t, "type", scope, start, end);
      if (el.isDefinition) for (const s of el.specializes) check(el, s, "supertype", scope, start, end);
    }
    for (const m of el.members) walk(m);
  };
  for (const r of doc.model.roots) walk(r);
  return out;
}
