import type { Element, ModelIndex } from "../model/index.js";
import {
  isBlockComment, isCode, isLineComment, isName, isWs, lineStart, startsOwnLine, tokenize, type Tok,
} from "./text.js";

const VISIBILITY = new Set(["public", "private", "protected"]);

/** The siblings of an element: its owner's members, or the document's top-level elements. */
export function siblingsOf(index: ModelIndex, el: Element): readonly Element[] {
  return el.owner ? el.owner.members : (index.getDocument(el.uri)?.model.roots ?? []);
}

/** Last token ending at or before `off` that is not whitespace (comments count). */
function prevSignificant(toks: Tok[], off: number): number {
  let lo = 0;
  let hi = toks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (toks[mid]!.end <= off) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  while (found >= 0 && isWs(toks[found]!)) found--;
  return found;
}

/** Start of the declaration including a visibility keyword the model range leaves out. */
export function declStart(text: string, el: Element): number {
  const s = el.range.start.offset;
  if (!el.visibility) return s;
  const toks = tokenize(text);
  const i = prevSignificant(toks, s);
  const t = i >= 0 ? toks[i]! : undefined;
  return t && VISIBILITY.has(t.text) && !t.hidden ? t.start : s;
}

/**
 * Start of the line where the element and the comments attached to it begin. Attached comments
 * are `//` notes and bare block comments on the lines directly above the element (no blank line
 * between, each starting its own line). `doc` and `comment` elements are not attached: they
 * document the owner. Returns the declaration start when the element does not start its line.
 */
export function attachedStart(index: ModelIndex, text: string, el: Element): number {
  const ds = declStart(text, el);
  if (!startsOwnLine(text, ds)) return ds;
  const toks = tokenize(text);
  const sibs = siblingsOf(index, el);
  let cur = ds;
  for (;;) {
    const i = prevSignificant(toks, cur);
    if (i < 0) break;
    const t = toks[i]!;
    const gap = text.slice(t.end, cur);
    if ((gap.match(/\n/g)?.length ?? 0) !== 1) break; // same line, or a blank line between
    let s: number;
    if (isLineComment(t)) s = t.start;
    else if (isBlockComment(t) && sibs.some((x) => x.kind === "comment" && x.range.start.offset === t.start && x.range.end.offset === t.end)) s = t.start;
    else break;
    if (!startsOwnLine(text, s)) break;
    cur = s;
  }
  return lineStart(text, cur);
}

/** Non-hidden code tokens of the declaration, without its body and nested members. */
export function declarationTokens(text: string, el: Element): Tok[] {
  const from = declStart(text, el);
  const to = el.bodyRange ? el.bodyRange.start.offset : el.range.end.offset;
  const all = tokenize(text);
  // Tokens are in source order: binary search for the first one at or after `from`.
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid]!.start < from) lo = mid + 1;
    else hi = mid;
  }
  const out: Tok[] = [];
  for (let i = lo; i < all.length && all[i]!.start < to; i++) {
    const t = all[i]!;
    if (t.end <= to && isCode(t)) out.push(t);
  }
  return out;
}

export interface Run {
  /** Indices into the token list given to `findRuns`. */
  at: number[];
  /** The tokens of the run. */
  toks: Tok[];
}

/**
 * Find a reference text, as the model stores it (token texts joined without whitespace), as a
 * run of whole qualified-name tokens in `toks`: not preceded by `::` or `.`, and not followed by
 * them either (unless `allowFollow`, for imports `A::B::*`). Never matches inside a longer name,
 * a comment or a string, because it works on lexer tokens.
 */
export function findRuns(toks: readonly Tok[], refText: string, allowFollow = false): Run[] {
  const want = tokenize(refText).filter(isCode);
  const k = want.length;
  const out: Run[] = [];
  if (k === 0) return out;
  for (let i = 0; i + k <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < k; j++) if (toks[i + j]!.text !== want[j]!.text) { ok = false; break; }
    if (!ok) continue;
    const before = toks[i - 1]?.text;
    const after = toks[i + k]?.text;
    if (before === "::" || before === ".") continue;
    if (!allowFollow && (after === "::" || after === ".")) continue;
    if (allowFollow && after === "." ) continue;
    const at = Array.from({ length: k }, (_v, j) => i + j);
    out.push({ at, toks: at.map((x) => toks[x]!) });
  }
  return out;
}

/** The name tokens of a run, in segment order. */
export function nameTokens(run: Run): Tok[] {
  return run.toks.filter(isName);
}
