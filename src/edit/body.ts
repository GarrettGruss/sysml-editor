import type { Element, ModelIndex } from "../model/index.js";
import { attachedStart, declStart } from "./decl.js";
import { checkElement } from "./guard.js";
import {
  detectEol, detectIndentUnit, indentLines, isCode, isBlockComment, lineBreakAt, lineIndent, lineStart, startsOwnLine, tokenize,
} from "./text.js";
import { fail, type PlanFailure, type TextEdit } from "./types.js";

export type InsertPosition = "end" | "start" | { after: Element };

export type EditsResult = { ok: true; edits: TextEdit[] } | PlanFailure;

/** The members that are written inside the owner's body braces. */
function bodyMembers(owner: Element): Element[] {
  const b = owner.bodyRange;
  if (!b) return [];
  return owner.members.filter((m) => m.range.start.offset >= b.start.offset && m.range.end.offset <= b.end.offset);
}

/**
 * Edits that insert declarations (each possibly several lines, without indentation) into the
 * body of `owner`, creating the body when the owner ends with `;`. Preserves the document's line
 * endings and indentation style; copies the indentation of the owner's existing members.
 */
export function insertDecls(index: ModelIndex, owner: Element, decls: readonly string[], position: InsertPosition = "end"): EditsResult {
  const c = checkElement(index, owner);
  if (!c.ok) return c;
  const text = c.state.text;
  const eol = detectEol(text);
  const unit = detectIndentUnit(text);
  const uri = owner.uri;
  const ownerIndent = lineIndent(text, declStart(text, owner));
  const os = owner.range.start.offset;
  const oe = owner.range.end.offset;
  const lines = (indent: string) => decls.map((d) => indentLines(d, indent, eol)).join(eol);
  const ed = (start: number, end: number, newText: string): EditsResult => ({ ok: true, edits: [{ uri, range: { start, end }, newText }] });

  const body = owner.bodyRange;
  if (!body) {
    if (text[oe - 1] !== ";") return fail(`A ${owner.kind} cannot have members, so nothing was inserted into it.`);
    let ws = oe - 1;
    while (ws > os && (text[ws - 1] === " " || text[ws - 1] === "\t")) ws--;
    const inner = ownerIndent + unit;
    return ed(ws, oe, ` {${eol}${lines(inner)}${eol}${ownerIndent}}`);
  }

  const open = body.start.offset;
  const close = body.end.offset - 1;
  const members = bodyMembers(owner);
  const toks = tokenize(text);
  const ownLineMembers = members.filter((m) => startsOwnLine(text, declStart(text, m)));
  const indentOf = (m: Element | undefined) => (m && startsOwnLine(text, declStart(text, m)) ? lineIndent(text, declStart(text, m)) : undefined);
  const fallbackIndent = () => indentOf(ownLineMembers[ownLineMembers.length - 1]) ?? ownerIndent + unit;

  const after = (a: Element): EditsResult => {
    const ae = a.range.end.offset;
    const nl = lineBreakAt(text, ae);
    const next = toks.find((t) => t.start >= ae && (isCode(t) || isBlockComment(t)));
    const inline = !next ? false : nl === -1 || next.start < nl;
    if (inline) return ed(ae, ae, " " + decls.map((d) => d.replace(/\s*\r?\n\s*/g, " ")).join(" "));
    if (nl === -1) return ed(ae, ae, eol + lines(indentOf(a) ?? fallbackIndent()));
    return ed(nl + 1, nl + 1, lines(indentOf(a) ?? fallbackIndent()) + eol);
  };
  const before = (f: Element): EditsResult => {
    const ds = declStart(text, f);
    if (startsOwnLine(text, ds)) {
      const at = attachedStart(index, text, f);
      return ed(at, at, lines(indentOf(f) ?? fallbackIndent()) + eol);
    }
    return ed(ds, ds, decls.map((d) => d.replace(/\s*\r?\n\s*/g, " ")).join(" ") + " ");
  };
  const empty = (): EditsResult => {
    const inner = text.slice(open + 1, close);
    const closeOwnLine = startsOwnLine(text, close) && lineStart(text, close) > lineStart(text, open);
    if (closeOwnLine) {
      const at = lineStart(text, close);
      return ed(at, at, lines(ownerIndent + unit) + eol);
    }
    if (inner.trim() === "") return ed(open + 1, close, eol + lines(ownerIndent + unit) + eol + ownerIndent);
    const flat = decls.map((d) => d.replace(/\s*\r?\n\s*/g, " ")).join(" ");
    return ed(close, close, (/\s$/.test(inner) ? "" : " ") + flat + " ");
  };

  if (position === "end") return members.length ? after(members[members.length - 1]!) : empty();
  if (position === "start") return members.length ? before(members[0]!) : empty();
  const anchor = members.find((m) => m === position.after || (m.range.start.offset === position.after.range.start.offset && m.uri === position.after.uri));
  if (!anchor) return fail("The element to insert after is not a member of the target owner.");
  return after(anchor);
}
