import { quoteName, type Element, type ModelIndex } from "../model/index.js";
import { deleteEdit } from "./delete.js";
import { declarationTokens, findRuns } from "./decl.js";
import { checkElement, describeElement } from "./guard.js";
import { importEdits, referenceText } from "./refs.js";
import { insertWithImports, nameClash, normalizeMultiplicity, shortNameText } from "./insert.js";
import { detectEol, isBlockComment, lineIndent, tokenize, type Tok } from "./text.js";
import { fail, type PlanResult, type TextEdit } from "./types.js";
import { validatePlan } from "./validate.js";
import { declStart } from "./decl.js";
import { buildComment, commentStyle, escapeTerminator, newCommentDecl, trimBlankLines } from "./comment.js";

function ownNameTokens(el: Element): Set<number> {
  const s = new Set<number>();
  if (el.nameRange) s.add(el.nameRange.start.offset);
  if (el.shortNameRange) s.add(el.shortNameRange.start.offset);
  return s;
}

/** Position right after the name (or short name) of an element, for inserting a type or multiplicity. */
function afterName(el: Element): number | undefined {
  const ends = [el.nameRange?.end.offset, el.shortNameRange ? el.shortNameRange.end.offset + 1 : undefined].filter((x): x is number => x !== undefined);
  return ends.length ? Math.max(...ends) : undefined;
}

/** Where the type runs of a usage are, or why not. */
function typeRuns(toks: Tok[], el: Element): { first: number; last: number; firstIdx: number } | string {
  const own = ownNameTokens(el);
  let first = Infinity;
  let last = -1;
  let firstIdx = -1;
  for (const t of el.typeNames) {
    const run = findRuns(toks, t).find((r) => !r.toks.some((x) => own.has(x.start)));
    if (!run) return `Could not find the current type '${t}' in the declaration of ${describeElement(el)}.`;
    if (run.toks[0]!.start < first) {
      first = run.toks[0]!.start;
      firstIdx = run.at[0]!;
    }
    last = Math.max(last, run.toks[run.toks.length - 1]!.end);
  }
  return { first, last, firstIdx };
}

/**
 * Set (replace) or remove (`undefined`) the type of a usage. A type given as an element is
 * written through the reference writer, which may add an import. A conjugated port type
 * (`port p : ~P;`) keeps its `~` unless `opts.conjugated` says otherwise. A usage with several
 * types is refused: which of them to change is not defined.
 */
export function planSetType(index: ModelIndex, element: Element, type: Element | string | undefined, opts: { conjugated?: boolean } = {}): PlanResult {
  const c = checkElement(index, element);
  if (!c.ok) return c;
  if (!element.isUsage) return fail(`${describeElement(element)} is a ${element.kind}; only usages have a type.`);
  if (element.types.length > 1) return fail(`${describeElement(element)} has several types (${element.types.join(", ")}); changing them is not supported. Edit the declaration in the source.`);
  const text = c.state.text;
  const toks = declarationTokens(text, element);
  const uri = element.uri;
  let written: string | undefined;
  const needs = [];
  const wasConjugated = element.typeConjugated[0] === true;
  const conjugated = opts.conjugated ?? wasConjugated;
  if (type !== undefined) {
    if (typeof type === "string") written = type.trim();
    else {
      const r = referenceText(index, type, element.owner ?? element);
      if (!r.ok) return r;
      written = r.text;
      if (r.need) needs.push(r.need);
    }
    if (written === "" || /[;{}\n]/.test(written)) return fail("The type is not a valid reference.");
    if (conjugated && element.kind !== "port") return fail("Only a port can have a conjugated type.");
  }
  let edit: TextEdit;
  if (element.types.length > 0) {
    const runs = typeRuns(toks, element);
    if (typeof runs === "string") return fail(runs);
    const tilde = toks[runs.firstIdx - 1]?.text === "~" ? toks[runs.firstIdx - 1]! : undefined;
    if (written !== undefined) {
      // The `~` stays in front of the name unless the caller changes the conjugation.
      if (tilde && !conjugated) edit = { uri, range: { start: tilde.start, end: runs.last }, newText: written };
      else if (!tilde && conjugated) edit = { uri, range: { start: runs.first, end: runs.last }, newText: "~" + written };
      else edit = { uri, range: { start: runs.first, end: runs.last }, newText: written };
    } else {
      const introIdx = tilde ? runs.firstIdx - 2 : runs.firstIdx - 1;
      const intro = toks[introIdx];
      const startTok = intro?.text === ":" ? intro : intro?.text === "by" && ["defined", "typed"].includes(toks[introIdx - 1]?.text ?? "") ? toks[introIdx - 1] : undefined;
      const before = startTok ? toks[toks.indexOf(startTok) - 1] : undefined;
      if (!startTok || !before) return fail(`Could not find where the type of ${describeElement(element)} begins.`);
      edit = { uri, range: { start: before.end, end: runs.last }, newText: "" };
    }
  } else {
    if (written === undefined) return fail(`${describeElement(element)} has no type to remove.`);
    const at = afterName(element);
    if (at === undefined) return fail(`${describeElement(element)} has no name; give it a name before setting its type.`);
    edit = { uri, range: { start: at, end: at }, newText: ` : ${opts.conjugated ? "~" : ""}${written}` };
  }
  const imp = importEdits(index, needs);
  if (!imp.ok) return imp;
  return validatePlan(index, { ok: true, edits: [...imp.edits, edit], description: `Set the type of ${describeElement(element)}${written !== undefined ? " to " + written : " (removed)"}` });
}

/** Set, replace or remove (`undefined`) the multiplicity of a usage. */
export function planSetMultiplicity(index: ModelIndex, element: Element, multiplicity: string | undefined): PlanResult {
  const c = checkElement(index, element);
  if (!c.ok) return c;
  if (!element.isUsage) return fail(`${describeElement(element)} is a ${element.kind}; only usages have a multiplicity.`);
  const norm = multiplicity === undefined ? undefined : normalizeMultiplicity(multiplicity);
  if (multiplicity !== undefined && !norm) return fail(`'${multiplicity}' is not a valid multiplicity.`);
  const text = c.state.text;
  const toks = declarationTokens(text, element);
  const uri = element.uri;
  let open = -1;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!.text;
    if (t === "=" || t === ":=" || t === "default") break;
    if (t === "[") {
      open = i;
      break;
    }
  }
  let close = -1;
  if (open >= 0) for (let i = open + 1, d = 1; i < toks.length; i++) {
    if (toks[i]!.text === "[") d++;
    else if (toks[i]!.text === "]" && --d === 0) { close = i; break; }
  }
  let edit: TextEdit;
  if (open >= 0 && close > open) {
    const cur = toks.slice(open, close + 1).map((t) => t.text).join("");
    if (element.multiplicity !== undefined && cur !== element.multiplicity) return fail(`Could not locate the multiplicity of ${describeElement(element)} in its declaration.`);
    if (norm === undefined) {
      const before = toks[open - 1];
      edit = { uri, range: { start: before ? before.end : toks[open]!.start, end: toks[close]!.end }, newText: "" };
    } else edit = { uri, range: { start: toks[open]!.start, end: toks[close]!.end }, newText: norm };
  } else {
    if (norm === undefined) return fail(`${describeElement(element)} has no multiplicity to remove.`);
    let at: number | undefined;
    if (element.types.length) {
      const runs = typeRuns(toks, element);
      if (typeof runs === "string") return fail(runs);
      at = runs.last;
    } else at = afterName(element);
    if (at === undefined) return fail(`${describeElement(element)} has no name; give it a name before setting its multiplicity.`);
    edit = { uri, range: { start: at, end: at }, newText: norm };
  }
  return validatePlan(index, { ok: true, edits: [edit], description: `Set the multiplicity of ${describeElement(element)}${norm ? " to " + norm : " (removed)"}` });
}

/** Set, replace or remove (`undefined`) the short name `<x>` of an element. */
export function planSetShortName(index: ModelIndex, element: Element, shortName: string | undefined): PlanResult {
  const c = checkElement(index, element);
  if (!c.ok) return c;
  if (shortName !== undefined && (shortName === "" || /[\r\n]/.test(shortName))) return fail("The short name must be a single line of text and not empty.");
  const uri = element.uri;
  const text = c.state.text;
  const q = shortName === undefined ? undefined : shortNameText(element.kind.split(" "), shortName);
  if (shortName !== undefined) {
    const reason = nameClash(index, element.owner, [shortName], element);
    if (reason) return fail(reason);
  }
  let edit: TextEdit;
  if (element.shortNameRange) {
    const toks = tokenize(text);
    const s = element.shortNameRange.start.offset;
    const i = toks.findIndex((t) => t.start === s);
    const lt = toks[i - 1];
    const gt = toks[i + 1];
    const lti = lt && lt.text === "<" ? lt : toks.slice(0, i).reverse().find((t) => !t.hidden && t.text === "<");
    const gti = gt && gt.text === ">" ? gt : toks.slice(i + 1).find((t) => !t.hidden && t.text === ">");
    if (q !== undefined) edit = { uri, range: { start: s, end: element.shortNameRange.end.offset }, newText: q };
    else {
      if (!lti || !gti) return fail("Could not locate the short name in the declaration.");
      let end = gti.end;
      while (text[end] === " " || text[end] === "\t") end++;
      if (end === gti.end || text[end] === ";") end = gti.end;
      edit = { uri, range: { start: lti.start, end }, newText: "" };
      if (end === gti.end && text[lti.start - 1] === " " && !element.nameRange) edit.range.start = lti.start - 1;
    }
  } else {
    if (q === undefined) return fail(`${describeElement(element)} has no short name to remove.`);
    if (!element.nameRange) return fail(`${describeElement(element)} has no name; give it a name before adding a short name.`);
    const at = element.nameRange.start.offset;
    edit = { uri, range: { start: at, end: at }, newText: `<${q}> ` };
  }
  return validatePlan(index, { ok: true, edits: [edit], description: `Set the short name of ${describeElement(element)}${q ? " to <" + q + ">" : " (removed)"}` });
}

/**
 * Create, replace or remove (`undefined` or empty text) the owned `doc` comment of an element,
 * keeping the existing comment style (single-line versus multi-line with margins). Text containing a comment
 * terminator is stored with a backslash before the slash (see comment.ts).
 */
export function planSetDocumentation(index: ModelIndex, element: Element, documentation: string | undefined): PlanResult {
  const c = checkElement(index, element);
  if (!c.ok) return c;
  const body = documentation === undefined ? undefined : escapeTerminator(trimBlankLines(documentation));
  const text = c.state.text;
  const doc = element.members.find((m) => m.kind === "doc" && m.range.start.offset >= (element.bodyRange?.start.offset ?? Infinity));
  const label = describeElement(element);
  if (doc) {
    if (body === undefined || body === "") {
      const r = deleteEdit(index, doc);
      if (!r.ok) return r;
      return validatePlan(index, { ok: true, edits: [r.edit], description: `Remove the documentation of ${label}` });
    }
    const tok = tokenize(text).find((t) => isBlockComment(t) && t.start >= doc.range.start.offset && t.end <= doc.range.end.offset);
    if (!tok) return fail(`Could not find the documentation comment of ${label}.`);
    const style = commentStyle(tok.text);
    const eol = detectEol(text);
    const indent = lineIndent(text, declStart(text, doc));
    const newText = buildComment(body, eol, indent, style, "");
    if (newText === tok.text) return fail("The documentation is unchanged.");
    return validatePlan(index, { ok: true, edits: [{ uri: element.uri, range: { start: tok.start, end: tok.end }, newText }], description: `Change the documentation of ${label}` });
  }
  if (body === undefined || body === "") return fail(`${label} has no documentation to remove.`);
  const decl = newCommentDecl("doc", body, "\n", "");
  const r = insertWithImports(index, element, [decl], [], "start");
  if (!r.ok) return r;
  return validatePlan(index, { ok: true, edits: r.edits, description: `Add documentation to ${label}` });
}

