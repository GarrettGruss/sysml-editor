/**
 * Edit plans of the requirements editor: verify, derivation (and their removal), moving members, document
 * sections and paragraphs. Nothing here imports `vscode`.
 */
import { quoteName, type Element, type ModelIndex } from "../model/index.js";
import { derivationOf, isRequirement, isVerificationCase } from "../requirements/relations.js";
import { insertDecls, type InsertPosition } from "./body.js";
import { escapeTerminator, newCommentDecl } from "./comment.js";
import { attachedStart, declStart } from "./decl.js";
import { deleteEdit } from "./delete.js";
import { checkElement, describeElement } from "./guard.js";
import { insertWithImports, nameClash } from "./insert.js";
import { enclosingPackage, referenceText, type ImportNeed } from "./refs.js";
import { detectEol, detectIndentUnit, isBlockComment, isCode, isWs, lineBreakAt, lineIndent, lineStart, positionOf, startsOwnLine, tokenize, applyEdits } from "./text.js";
import { fail, type PlanFailure, type PlanOk, type PlanResult, type TextEdit } from "./types.js";
import { checkResolutionPreserved, validatePlan } from "./validate.js";

const DERIVATION_IMPORT = "private import RequirementDerivation::*;";
const ANNOTATIONS_IMPORT = "private import DocumentAnnotations::*;";

/** Whether names of the library package `lib` (an element named `probe`) are visible from `owner` through an import. */
function visibleFrom(index: ModelIndex, owner: Element, lib: string, probe: string): boolean {
  if (index.resolveAll(probe, owner).some((e) => e.qualifiedName?.startsWith(lib + "::"))) return true;
  for (let o: Element | undefined = owner; o; o = o.owner) {
    if (o.members.some((m) => m.kind === "import" && m.importInfo?.wildcard && m.importInfo.target.replace(/\s+/g, "") === lib)) return true;
  }
  return false;
}

function finish(index: ModelIndex, edits: TextEdit[], description: string, needs: readonly ImportNeed[]): PlanResult {
  const plan = validatePlan(index, { ok: true, edits, description });
  // An added import may capture or hide names of its package; the check refuses such a plan.
  return needs.length ? checkResolutionPreserved(index, plan, { within: needs[0]!.pkg }) : plan;
}

/** `el` with its range starting at `start` (the model's range of some statements leaves out the leading keyword). */
function withStart(index: ModelIndex, el: Element, start: number): Element {
  const text = index.getDocument(el.uri)!.text;
  return { ...el, range: { start: { offset: start, ...positionOf(text, start) }, end: el.range.end } };
}

/** The start of the keyword (`verify`, `objective`) that introduces `el`; the model's range begins after it. */
function keywordStart(index: ModelIndex, el: Element, kw: string): number {
  const text = index.getDocument(el.uri)!.text;
  const toks = tokenize(text).filter((t) => isCode(t) && t.end <= el.range.start.offset);
  for (let i = toks.length - 1, n = 0; i >= 0 && n < 8; i--, n++) if (toks[i]!.text === kw) return toks[i]!.start;
  return el.range.start.offset;
}

function deleteStatement(index: ModelIndex, el: Element, kw: string | undefined, description: string): PlanResult {
  const c = checkElement(index, el);
  if (!c.ok) return c;
  const shim = kw ? withStart(index, el, keywordStart(index, el, kw)) : el;
  const r = deleteEdit(index, shim);
  if (!r.ok) return r;
  return validatePlan(index, { ok: true, edits: [r.edit], description });
}

// ---------------------------------------------------------------------------- verify

/**
 * `verify <requirement>;` inside the objective of a verification case (SysML v2 allows `verify` only there), or a new
 * `verification <name> { objective { verify <requirement>; } }` in `to.owner` (default: the package owning the requirement).
 */
export function planVerify(index: ModelIndex, requirement: Element, to: Element | { create: string; owner?: Element }): PlanResult {
  if (!isRequirement(requirement)) return fail(`${describeElement(requirement)} is a ${requirement.kind}, not a requirement.`);
  const c0 = checkElement(index, requirement);
  if (!c0.ok) return c0;
  const eol = "\n";
  const unit = detectIndentUnit(c0.state.text);
  if ("create" in to) {
    const name = to.create.trim();
    if (name === "" || /[\r\n]/.test(name)) return fail("Name the new verification case with a single line of text.");
    const owner = to.owner ?? enclosingPackage(requirement);
    if (!owner) return fail("The requirement is not inside a package; choose where the verification case goes.");
    const clash = nameClash(index, owner, [name]);
    if (clash) return fail(clash);
    const r = referenceText(index, requirement, owner);
    if (!r.ok) return r;
    const decl = [`verification ${quoteName(name)} {`, `${unit}objective {`, `${unit}${unit}verify ${r.text};`, `${unit}}`, `}`].join(eol);
    const ins = insertWithImports(index, owner, [decl], r.need ? [r.need] : [], "end");
    if (!ins.ok) return ins;
    return finish(index, ins.edits, `Verify ${describeElement(requirement)} in a new verification case ${name}`, r.need ? [r.need] : []);
  }
  if (!isVerificationCase(to)) return fail(`${describeElement(to)} is a ${to.kind}, not a verification case.`);
  const c = checkElement(index, to);
  if (!c.ok) return c;
  const objective = to.members.find((m) => m.kind === "objective");
  const scope = objective ?? to;
  const existing = objective?.members.some((m) => m.kind === "verify" && m.ends[0] !== undefined && index.resolve(m.ends[0], objective) === requirement);
  if (existing) return fail(`${describeElement(to)} already verifies ${describeElement(requirement)}.`);
  const r = referenceText(index, requirement, scope);
  if (!r.ok) return r;
  const needs = r.need ? [r.need] : [];
  const ins = objective
    ? insertWithImports(index, objective, [`verify ${r.text};`], needs, "end")
    : insertWithImports(index, to, [[`objective {`, `${unit}verify ${r.text};`, `}`].join(eol)], needs, "end");
  if (!ins.ok) return ins;
  return finish(index, ins.edits, `${describeElement(to)} verifies ${describeElement(requirement)}`, needs);
}

export function planRemoveVerify(index: ModelIndex, verify: Element): PlanResult {
  if (verify.kind !== "verify") return fail(`${describeElement(verify)} is not a verify statement.`);
  return deleteStatement(index, verify, "verify", `Remove verification of ${verify.ends[0] ?? "a requirement"}`);
}

export function planRemoveSatisfy(index: ModelIndex, satisfy: Element): PlanResult {
  if (satisfy.kind !== "satisfy") return fail(`${describeElement(satisfy)} is not a satisfy statement.`);
  return deleteStatement(index, satisfy, undefined, `Remove satisfy ${satisfy.ends.join(" by ")}`);
}

// ---------------------------------------------------------------------------- derivation

/**
 * `#derivation connection { end #original ::> <original>; end #derive ::> <derived>; }` (one `end #derive` per
 * derived requirement) in `owner` (default: the package owning the first derived requirement), plus
 * `private import RequirementDerivation::*;` when those names are not visible there.
 */
export function planDerivation(index: ModelIndex, original: Element, derived: readonly Element[], owner?: Element): PlanResult {
  if (derived.length === 0) return fail("Choose at least one derived requirement.");
  for (const r of [original, ...derived]) if (!isRequirement(r)) return fail(`${describeElement(r)} is a ${r.kind}, not a requirement.`);
  if (derived.includes(original)) return fail("A requirement cannot be derived from itself.");
  const target = owner ?? enclosingPackage(derived[0]!);
  if (!target) return fail("The derived requirement is not inside a package; choose where the derivation goes.");
  const c = checkElement(index, target);
  if (!c.ok) return c;
  const unit = detectIndentUnit(c.state.text);
  const needs: ImportNeed[] = [];
  const refs: string[] = [];
  for (const r of [original, ...derived]) {
    const t = referenceText(index, r, target);
    if (!t.ok) return t;
    if (t.need) needs.push(t.need);
    refs.push(t.text);
  }
  const pkg = enclosingPackage(target);
  if (pkg && !visibleFrom(index, target, "RequirementDerivation", "derivation")) needs.push({ pkg, text: DERIVATION_IMPORT });
  const decl = ["#derivation connection {", `${unit}end #original ::> ${refs[0]};`, ...refs.slice(1).map((x) => `${unit}end #derive ::> ${x};`), "}"].join("\n");
  const ins = insertWithImports(index, target, [decl], needs, "end");
  if (!ins.ok) return ins;
  return finish(index, ins.edits, `${derived.map(describeElement).join(", ")} derived from ${describeElement(original)}`, needs);
}

/** Remove a derived requirement from a derivation connection (the whole connection when it is the last one, or when `derived` is omitted). */
export function planRemoveDerivation(index: ModelIndex, connection: Element, derived?: Element): PlanResult {
  const d = derivationOf(index, connection);
  if (!d) return fail(`${describeElement(connection)} is not a derivation connection.`);
  if (derived === undefined || d.derived.length <= 1) return deleteStatement(index, connection, undefined, "Remove a derivation");
  const end = d.derived.find((x) => x.target === derived);
  if (!end) return fail(`${describeElement(derived)} is not derived by this connection.`);
  return deleteStatement(index, end.end, undefined, `Remove ${describeElement(derived)} from a derivation`);
}

// ---------------------------------------------------------------------------- moving members

export type MoveTarget = { owner?: Element; position?: "start" | "end"; after?: Element; before?: Element };

/** The whole lines of a declaration and the comments attached to it, or why they cannot be cut out. */
function blockOf(index: ModelIndex, text: string, el: Element): { start: number; end: number; text: string } | PlanFailure {
  const ds = declStart(text, el);
  if (!startsOwnLine(text, ds)) return fail(`${describeElement(el)} shares its line with other declarations and cannot be moved.`);
  const de = el.range.end.offset;
  const nl = lineBreakAt(text, de);
  const lineEnd = nl === -1 ? text.length : nl;
  const rest = tokenize(text).filter((t) => t.start >= de && t.start < lineEnd && !isWs(t));
  if (rest.some((t) => isCode(t) || isBlockComment(t))) return fail(`${describeElement(el)} shares its line with other declarations and cannot be moved.`);
  const start = attachedStart(index, text, el);
  const indent = lineIndent(text, start);
  const raw = text.slice(start, lineEnd).replace(/\r$/, "");
  const dedent = raw.split(/\r?\n/).map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.trimStart())).join("\n");
  return { start, end: nl === -1 ? text.length : nl + 1, text: dedent };
}

/**
 * Cut the declaration of `element` with its attached leading comments and reinsert it at the target with the
 * target's indentation. Within the same owner this is a reorder. Moving to another owner changes the
 * qualified name, so the plan is refused when any reference would stop resolving to the same element
 * (references and diagram files are not rewritten; use rename for that).
 */
export function planMoveMember(index: ModelIndex, element: Element, to: MoveTarget): PlanResult {
  const c = checkElement(index, element);
  if (!c.ok) return c;
  const text = c.state.text;
  const owner = to.owner ?? to.after?.owner ?? to.before?.owner ?? element.owner;
  if (!owner) return fail(`${describeElement(element)} is a top-level declaration; choose a package to move it into.`);
  const oc = checkElement(index, owner);
  if (!oc.ok) return oc;
  for (let o: Element | undefined = owner; o; o = o.owner) if (o === element) return fail("An element cannot be moved into itself.");
  const sameOwner = owner === element.owner || (owner.qualifiedName !== undefined && owner.qualifiedName === element.owner?.qualifiedName && owner.uri === element.uri);
  if (!sameOwner) {
    const clash = nameClash(index, owner, [element.name, element.shortName], element);
    if (clash) return fail(clash);
  }
  const block = blockOf(index, text, element);
  if ("ok" in block) return block;
  let position: InsertPosition;
  if (to.after) {
    if (to.after === element || (sameOwner && owner.members[owner.members.indexOf(to.after) + 1] === element)) return fail("The declaration is already there.");
    position = { after: to.after };
  } else if (to.before) {
    if (to.before === element) return fail("The declaration is already there.");
    const sibs = owner.members;
    const i = sibs.indexOf(to.before);
    if (i < 0) return fail("The reference declaration is not a member of the target.");
    if (sameOwner && sibs[i - 1] === element) return fail("The declaration is already there.");
    const prev = sibs.slice(0, i).reverse().find((m) => m !== element);
    position = prev ? { after: prev } : "start";
  } else position = to.position ?? "end";
  const ins = insertDecls(index, owner, [block.text], position);
  if (!ins.ok) return ins;
  const del = deleteEdit(index, element);
  if (!del.ok) return del;
  const edits = [del.edit, ...ins.edits];
  let result: string;
  try {
    result = applyEdits(text, edits.filter((e) => e.uri === element.uri));
  } catch (e) {
    return fail(`The move could not be planned (${(e as Error).message}); nothing was changed.`);
  }
  if (result === text && ins.edits.every((e) => e.uri === element.uri)) return fail("The declaration is already there.");
  const plan: PlanOk = { ok: true, edits, description: `Move ${describeElement(element)}${sameOwner ? "" : ` to ${describeElement(owner)}`}` };
  return checkResolutionPreserved(index, validatePlan(index, plan));
}

// ---------------------------------------------------------------------------- document sections and paragraphs

/** Add a package that renders as a section, or (with `appendix`) as an appendix annotated `@Appendix`, after a sibling or at the end. */
export function planAddSection(index: ModelIndex, parent: Element, name: string, opts: { appendix?: boolean; after?: Element } = {}): PlanResult {
  const c = checkElement(index, parent);
  if (!c.ok) return c;
  const n = name.trim();
  if (n === "" || /[\r\n]/.test(n)) return fail("The heading must be a single line of text and not empty.");
  const clash = nameClash(index, parent, [n]);
  if (clash) return fail(clash);
  const unit = detectIndentUnit(c.state.text);
  const needs: ImportNeed[] = [];
  let decl = `package ${quoteName(n)};`;
  if (opts.appendix) {
    decl = [`package ${quoteName(n)} {`, `${unit}@Appendix;`, "}"].join("\n");
    const pkg = enclosingPackage(parent);
    if (pkg && !visibleFrom(index, parent, "DocumentAnnotations", "Appendix")) needs.push({ pkg, text: ANNOTATIONS_IMPORT });
  }
  const ins = insertWithImports(index, parent, [decl], needs, opts.after ? { after: opts.after } : "end");
  if (!ins.ok) return ins;
  return finish(index, ins.edits, `Add ${opts.appendix ? "appendix" : "section"} ${n} to ${describeElement(parent)}`, needs);
}

/** Add a paragraph: a `doc` when the package has none (documentation comes first), else a `comment`. */
export function planAddParagraph(index: ModelIndex, pkg: Element, body: string, after?: Element): PlanResult {
  const c = checkElement(index, pkg);
  if (!c.ok) return c;
  const clean = body.replace(/\r\n/g, "\n").trim();
  if (clean === "") return fail("The paragraph is empty.");
  const hasDoc = pkg.members.some((m) => m.kind === "doc");
  const eol = detectEol(c.state.text);
  const kw = hasDoc ? "comment" : "doc";
  const decl = newCommentDecl(kw, escapeTerminator(clean), eol, "");
  const paras = pkg.members.filter((m) => m.kind === "doc" || m.kind === "comment");
  const last = after ?? paras[paras.length - 1];
  const ins = insertWithImports(index, pkg, [decl], [], last ? { after: last } : "start");
  if (!ins.ok) return ins;
  return validatePlan(index, { ok: true, edits: ins.edits, description: `Add a paragraph to ${describeElement(pkg)}` });
}
