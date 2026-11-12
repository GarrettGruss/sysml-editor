import type { Element, ModelIndex } from "../model/index.js";
import { attachedStart, declStart } from "./decl.js";
import { checkElement, describeElement } from "./guard.js";
import { isBlockComment, isCode, isLineComment, isWs, lineBreakAt, lineStart, positionOf, startsOwnLine, tokenize } from "./text.js";
import { scanReferences } from "./refscan.js";
import { fail, type PlanFailure, type PlanOk, type PlanResult, type RemainingReferences, type SourceLocation, type TextEdit } from "./types.js";
import { validatePlan } from "./validate.js";

const blank = (s: string) => /^[ \t\r]*$/.test(s);

/** The edit that removes an element's whole declaration (see `planDeleteElement`). */
export function deleteEdit(index: ModelIndex, el: Element): { ok: true; edit: TextEdit } | PlanFailure {
  const c = checkElement(index, el);
  if (!c.ok) return c;
  const text = c.state.text;
  const toks = tokenize(text);
  const ds = declStart(text, el);
  const de = el.range.end.offset;
  const nl = lineBreakAt(text, de);
  const lineEnd = nl === -1 ? text.length : nl;
  const sameLine = toks.filter((t) => t.start >= de && t.start < lineEnd && !isWs(t));
  const trailingCode = sameLine.some((t) => isCode(t) || isBlockComment(t));
  const uri = el.uri;

  if (startsOwnLine(text, ds) && !trailingCode) {
    // Whole lines: attached leading comments, the declaration, a trailing `//` note, one line break.
    let start = attachedStart(index, text, el);
    let end = nl === -1 ? text.length : nl + 1;
    if (nl === -1 && start > 0) start = text[start - 2] === "\r" ? start - 2 : start - 1; // no final newline: take the previous break instead
    // Blank-line seam: never leave two blank lines (or a blank line right after `{` or at the top).
    const above = (() => {
      if (start === 0) return true;
      const pe = text[start - 1] === "\n" ? start - 1 : start;
      const ps = lineStart(text, pe);
      const line = text.slice(ps, pe);
      return blank(line) || line.trimEnd().endsWith("{");
    })();
    if (above) {
      for (;;) {
        const e2 = lineBreakAt(text, end);
        if (e2 === -1 || !blank(text.slice(end, e2))) break;
        end = e2 + 1;
      }
    }
    return { ok: true, edit: { uri, range: { start, end }, newText: "" } };
  }
  // Inline: other declarations share the line.
  const next = toks.find((t) => t.start >= de && t.start < lineEnd && (isCode(t) || isBlockComment(t)));
  if (next) return { ok: true, edit: { uri, range: { start: ds, end: next.start }, newText: "" } };
  let prev = -1;
  for (let i = 0; i < toks.length && toks[i]!.end <= ds; i++) if (!isWs(toks[i]!)) prev = i;
  const p = prev >= 0 ? toks[prev]! : undefined;
  if (p && !text.slice(p.end, ds).includes("\n")) {
    // Skip a line comment that is not on this line (cannot be: same line) and cut from the previous token.
    if (isLineComment(p)) return fail("The declaration follows a comment on the same line and cannot be removed safely.");
    return { ok: true, edit: { uri, range: { start: p.end, end: de }, newText: "" } };
  }
  return { ok: true, edit: { uri, range: { start: ds, end: de }, newText: "" } };
}

function within(e: Element, root: Element): boolean {
  for (let x: Element | undefined = e; x; x = x.owner) if (x === root) return true;
  return false;
}

/** The element and everything it owns that has a name. */
function namedWithin(el: Element): Element[] {
  const out: Element[] = [];
  const walk = (e: Element) => {
    if (e.name !== undefined) out.push(e);
    e.members.forEach(walk);
  };
  walk(el);
  return out;
}

/**
 * References, outside the element, to it or to anything it owns (found with the reference
 * scanner; references through short names count). They are not changed by a delete and will no
 * longer resolve, so callers warn about them.
 */
export function referencesAfterDelete(index: ModelIndex, el: Element): RemainingReferences {
  const targets = namedWithin(el);
  if (!targets.length) return { count: 0, locations: [], unjudged: 0 };
  const scan = scanReferences(index, targets, { includeShortNames: true });
  // One reference per declaration part: `P::E::inner` mentions both E and inner but is one reference.
  const seen = new Set<number>();
  const outside = scan.replacements.filter((r) => {
    if (within(r.holder, el) || seen.has(r.runStart)) return false;
    seen.add(r.runStart);
    return true;
  });
  const locations: SourceLocation[] = outside.slice(0, 5).map((r) => ({ uri: r.uri, ...positionOf(index.getDocument(r.uri)!.text, r.tok.start) }));
  // Mentions of the names that could not be judged (references inside expressions, ...), outside the deleted element.
  const before = (a: { line: number; column: number }, b: { line: number; column: number }) => a.line < b.line || (a.line === b.line && a.column < b.column);
  const inside = (l: SourceLocation) => l.uri === el.uri && !before(l, el.range.start) && before(l, el.range.end);
  const unjudged = scan.unjudged.filter((l) => !inside(l)).length;
  return { count: outside.length, locations, unjudged };
}

/**
 * Remove the whole declaration of `element`: its body (including a `doc` inside it), the `//`
 * notes and bare block comments directly above it (no blank line between), its indentation and
 * one line break. An empty body left in the owner stays as `{ }`. The result lists the references
 * to it that remain elsewhere (`remainingReferences`).
 */
export function planDeleteElement(index: ModelIndex, element: Element): PlanResult {
  const r = deleteEdit(index, element);
  if (!r.ok) return r;
  if (!element.owner && element.range.start.offset === element.range.end.offset) return fail("Nothing to delete.");
  const plan: PlanOk = { ok: true, edits: [r.edit], description: `Delete ${describeElement(element)}`, reads: index.uris().filter((u) => !index.isReadOnly(u)) };
  const remaining = referencesAfterDelete(index, element);
  if (remaining.count > 0 || (remaining.unjudged ?? 0) > 0) plan.remainingReferences = remaining;
  return validatePlan(index, plan);
}
