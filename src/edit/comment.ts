/**
 * Comment bodies (`doc`, `comment`): writing in the style of the existing comment, and the star-backslash-slash convention
 * of this extension. SysML v2 comments cannot contain `*` followed by `/` and define no escape, so such text is
 * stored as `*\/` and shown as `*` `/`. Reading strips the comment delimiters and ` * ` margins (`processDocComment`).
 */
import { processDocComment, type Element, type ModelIndex } from "../model/index.js";
import { checkElement, describeElement } from "./guard.js";
import { declStart } from "./decl.js";
import { deleteEdit } from "./delete.js";
import { detectEol, isBlockComment, lineIndent, tokenize } from "./text.js";
import { fail, type PlanResult } from "./types.js";
import { validatePlan } from "./validate.js";

/**
 * Text as it is stored in a comment. A bijection on runs of backslashes between `*` and `/`: each such run gets one more
 * backslash (`*` `/` becomes `*\/`, `*\/` becomes `*\\/`), so that reading (which removes one) restores the original.
 */
export const escapeTerminator = (s: string): string => s.replace(/\*(\\*)\//g, "*\\$1/");
/** Text as it is shown: one backslash is removed from each run of backslashes between `*` and `/`. */
export const unescapeTerminator = (s: string): string => s.replace(/\*\\(\\*)\//g, "*$1/");

/** The shown text of a raw comment token (`/* ... *\/`): margins stripped, `*\/` unescaped. */
export function commentBodyText(raw: string): string {
  return unescapeTerminator(processDocComment(raw));
}

export interface CommentStyle {
  multi: boolean;
  margin: boolean;
  tight: boolean;
}

export function commentStyle(raw: string): CommentStyle {
  const multi = raw.includes("\n");
  const lines = raw.split(/\r?\n/).slice(1);
  const margin = multi && lines.length > 0 && lines.slice(0, -1).every((l) => /^\s*\*/.test(l)) && lines.slice(0, -1).length > 0;
  return { multi, margin, tight: /^\/\*[^\s*]/.test(raw) };
}

/** A block comment with `body` (already escaped) in the given style. */
export function buildComment(body: string, eol: string, indent: string, style: CommentStyle, keyword: string): string {
  const lines = body.split("\n");
  if (!style.multi && lines.length === 1) return style.tight ? `${keyword}/*${body}*/` : `${keyword}/* ${body} */`;
  // Without margins a line that starts with `*` or whitespace would not survive `processDocComment`: use margins.
  const needsMargin = lines.some((l) => /^[\s*]/.test(l));
  if (style.multi && !style.margin && !needsMargin) return [`${keyword}/*`, ...lines.map((l) => (l === "" ? "" : indent + l)), `${indent}*/`].join(eol);
  return [`${keyword}/*`, ...lines.map((l) => (l === "" ? `${indent} *` : `${indent} * ${l}`)), `${indent} */`].join(eol);
}

/** `body` with LF line ends, without blank lines at the start and without trailing whitespace; the first line's indentation stays. */
export const trimBlankLines = (body: string): string => body.replace(/\r\n/g, "\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();

const SHORT = 72;

/** A new `doc` or `comment` declaration (without indentation): single line when short, else multi-line with margins. */
export function newCommentDecl(keyword: "doc" | "comment", escapedBody: string, eol: string, indent: string): string {
  const multi = escapedBody.includes("\n") || escapedBody.length > SHORT;
  return buildComment(escapedBody, eol, indent, { multi, margin: true, tight: false }, keyword + " ");
}

/** Replace the body of an existing `doc` or `comment` element, keeping its style and indentation; an empty body removes it. */
export function planSetCommentBody(index: ModelIndex, comment: Element, body: string): PlanResult {
  const c = checkElement(index, comment);
  if (!c.ok) return c;
  if (comment.kind !== "doc" && comment.kind !== "comment") return fail(`${describeElement(comment)} is not a doc or comment element.`);
  const text = c.state.text;
  const label = comment.kind === "doc" ? "documentation" : "comment";
  const clean = trimBlankLines(body);
  if (clean.trim() === "") {
    const r = deleteEdit(index, comment);
    if (!r.ok) return r;
    return validatePlan(index, { ok: true, edits: [r.edit], description: `Remove a ${label} paragraph` });
  }
  const tok = tokenize(text).find((t) => isBlockComment(t) && t.start >= comment.range.start.offset && t.end <= comment.range.end.offset);
  if (!tok) return fail(`Could not find the text of the ${label}.`);
  const style = commentStyle(tok.text);
  const eol = detectEol(text);
  const indent = lineIndent(text, declStart(text, comment));
  const multi = style.multi || clean.includes("\n");
  const newText = buildComment(escapeTerminator(clean), eol, indent, { ...style, multi, margin: style.multi ? style.margin : true }, "");
  if (newText === tok.text) return fail("The text is unchanged.");
  return validatePlan(index, { ok: true, edits: [{ uri: comment.uri, range: { start: tok.start, end: tok.end }, newText }], description: `Change a ${label} paragraph` });
}
