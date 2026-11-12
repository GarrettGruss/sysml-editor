/**
 * Edit plans of the requirements editor: verify, derivation (and their removal), moving members, document
 * sections and paragraphs. Nothing here imports `vscode`.
 */
import { quoteName, type Element, type ModelIndex } from "../model/index.js";
import { derivationForm, derivationOf, isRequirement, isVerificationCase, isVerifyStatement, verifiedRequirement } from "../requirements/relations.js";
import { insertDecls, type InsertPosition } from "./body.js";
import { escapeTerminator, newCommentDecl, trimBlankLines } from "./comment.js";
import { attachedStart, declStart } from "./decl.js";
import { deleteEdit } from "./delete.js";
import { checkElement, describeElement } from "./guard.js";
import { insertWithImports, nameClash } from "./insert.js";
import { enclosingPackage, referenceText, type ImportNeed, type ReferenceText } from "./refs.js";
import { detectEol, detectIndentUnit, groupByUri, isBlockComment, isCode, isWs, lineBreakAt, lineIndent, lineStart, positionOf, startsOwnLine, tokenize, applyEdits } from "./text.js";
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

/** Names of features that verification cases and derivation connections inherit from the library: a bare reference with such a name would resolve to the inherited feature. */
const INHERITED_NAMES = new Set([
  "subject", "objective", "verdict", "actors", "stakeholders", "assumedConstraints", "requiredConstraints", "constraintChecks",
  "text", "result", "original", "derive", "derived", "source", "target", "ends", "self", "this", "that", "verifiedRequirements",
]);

/** A reference to `target` for use inside a verification case or derivation connection; qualified when its simple name collides with an inherited feature. */
function innerReference(index: ModelIndex, target: Element, owner: Element): ReferenceText {
  const r = referenceText(index, target, owner);
  if (!r.ok) return r;
  if (!INHERITED_NAMES.has(r.text.replace(/^'|'$/g, ""))) return r;
  const qn = target.qualifiedName;
  if (qn === undefined) return fail(`${describeElement(target)} has a name that collides with a feature inherited by verification cases and derivations, and it cannot be qualified.`);
  for (const t of [qn, "$::" + qn]) if (index.resolve(t, owner) === target) return { ok: true, text: t };
  return fail(`${describeElement(target)} has a name that collides with a feature inherited by verification cases and derivations, and it cannot be referred to by a qualified name from here.`);
}

/** What a plan writes: the text of a reference and where (a scope located in the edited model) it must resolve to `target`. */
interface WrittenRef {
  text: string;
  target: Element;
  /** Finds the scope the reference is resolved from, in the edited model. */
  scope: (edited: ModelIndex) => Element | undefined;
}

/** Every reference written by the plan resolves, in the edited model, to the intended element. */
function checkWritten(index: ModelIndex, plan: PlanResult, written: readonly WrittenRef[]): PlanResult {
  if (!plan.ok) return plan;
  const texts = new Map<string, string>();
  for (const [uri, edits] of groupByUri(plan.edits)) {
    const st = index.getDocument(uri);
    if (!st) return fail("A file of the edit is not loaded, so it cannot be checked.");
    try {
      texts.set(uri, applyEdits(st.text, edits));
    } catch (e) {
      return fail(`The planned edits conflict (${(e as Error).message}); nothing was changed.`);
    }
  }
  const edited = index.withTexts(texts);
  for (const w of written) {
    const scope = w.scope(edited);
    if (!scope) return fail("The written reference could not be located after the edit, so it cannot be checked; nothing was changed.");
    const got = edited.resolve(w.text, scope);
    if (!got || got.qualifiedName !== w.target.qualifiedName) {
      return fail(`The reference '${w.text}' would not resolve to ${describeElement(w.target)} (it resolves to ${got ? describeElement(got) : "nothing"}); nothing was changed.`);
    }
  }
  return plan;
}

/** The edited-model counterpart of `el` (same qualified name and kind, in the same file). */
function editedCounterpart(edited: ModelIndex, el: Element): Element | undefined {
  const cands = el.qualifiedName !== undefined ? edited.findByQualifiedName(el.qualifiedName) : [];
  return cands.find((x) => x.uri === el.uri && x.kind === el.kind) ?? cands.find((x) => x.kind === el.kind);
}

function finish(index: ModelIndex, edits: TextEdit[], description: string, needs: readonly ImportNeed[], written: readonly WrittenRef[] = []): PlanResult {
  const plan = validatePlan(index, { ok: true, edits, description });
  if (!plan.ok) return plan;
  // An added import may capture or hide names (of any package that receives one, or of the one that receives the new
  // declaration); the check refuses such a plan. It always runs, over every document.
  void needs;
  const checked = checkResolutionPreserved(index, plan);
  if (!checked.ok) return checked;
  return checkWritten(index, checked, written);
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

/** The statement that verifies `requirement`: `verify r;` for a usage, `verify requirement : R;` (an anonymous usage typed by it) for a definition. */
function verifyStatement(requirement: Element, ref: string): string {
  return requirement.kind === "requirement def" ? `verify requirement : ${ref};` : `verify ${ref};`;
}

/**
 * `verify <requirement>;` inside the objective of a verification case (SysML v2 allows `verify` only there), or a new
 * `verification <name> { objective { verify <requirement>; } }` in `to.owner` (default: the package owning the requirement).
 * A requirement definition is verified through `verify requirement : R;`.
 */
export function planVerify(index: ModelIndex, requirement: Element, to: Element | { create: string; owner?: Element }): PlanResult {
  if (!isRequirement(requirement)) return fail(`${describeElement(requirement)} is a ${requirement.kind}, not a requirement.`);
  const c0 = checkElement(index, requirement);
  if (!c0.ok) return c0;
  const eol = detectEol(c0.state.text);
  const unit = detectIndentUnit(c0.state.text);
  if ("create" in to) {
    const name = to.create.trim();
    if (name === "" || /[\r\n]/.test(name)) return fail("Name the new verification case with a single line of text.");
    const owner = to.owner ?? enclosingPackage(requirement);
    if (!owner) return fail("The requirement is not inside a package; choose where the verification case goes.");
    const clash = nameClash(index, owner, [name]);
    if (clash) return fail(clash);
    const r = innerReference(index, requirement, owner);
    if (!r.ok) return r;
    const decl = [`verification ${quoteName(name)} {`, `${unit}objective {`, `${unit}${unit}${verifyStatement(requirement, r.text)}`, `${unit}}`, `}`].join(eol);
    const ins = insertWithImports(index, owner, [decl], r.need ? [r.need] : [], "end");
    if (!ins.ok) return ins;
    const caseQn = owner.qualifiedName !== undefined ? `${owner.qualifiedName}::${quoteName(name)}` : undefined;
    const written: WrittenRef[] = [{
      text: r.text, target: requirement,
      scope: (ed) => {
        const cs = caseQn !== undefined ? ed.findByQualifiedName(caseQn).find((x) => x.kind === "verification") : undefined;
        return cs?.members.find((m) => m.kind === "objective");
      },
    }];
    return finish(index, ins.edits, `Verify ${describeElement(requirement)} in a new verification case ${name}`, r.need ? [r.need] : [], caseQn ? written : []);
  }
  if (!isVerificationCase(to)) return fail(`${describeElement(to)} is a ${to.kind}, not a verification case.`);
  const c = checkElement(index, to);
  if (!c.ok) return c;
  const objective = to.members.find((m) => m.kind === "objective");
  const scope = objective ?? to;
  const existing = objective?.members.some((m) => isVerifyStatement(m) && verifiedRequirement(index, m) === requirement);
  if (existing) return fail(`${describeElement(to)} already verifies ${describeElement(requirement)}.`);
  const r = innerReference(index, requirement, scope);
  if (!r.ok) return r;
  const needs = r.need ? [r.need] : [];
  const stmt = verifyStatement(requirement, r.text);
  const ins = objective
    ? insertWithImports(index, objective, [stmt], needs, "end")
    : insertWithImports(index, to, [[`objective {`, `${unit}${stmt}`, `}`].join(eol)], needs, "end");
  if (!ins.ok) return ins;
  const written: WrittenRef[] = [{
    text: r.text, target: requirement,
    scope: (ed) => {
      const cs = editedCounterpart(ed, to);
      return cs?.members.find((m) => m.kind === "objective") ?? cs;
    },
  }];
  return finish(index, ins.edits, `${describeElement(to)} verifies ${describeElement(requirement)}`, needs, written);
}

export function planRemoveVerify(index: ModelIndex, verify: Element): PlanResult {
  if (!isVerifyStatement(verify)) return fail(`${describeElement(verify)} is not a verify statement.`);
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
 * `private import RequirementDerivation::*;` when those names are not visible there. When the owner already has a
 * derivation connection from the same original, the derived requirements are added to it as `end #derive` members.
 * Derivation connects requirement usages: a requirement definition is refused.
 */
export function planDerivation(index: ModelIndex, original: Element, derived: readonly Element[], owner?: Element): PlanResult {
  if (derived.length === 0) return fail("Choose at least one derived requirement.");
  for (const r of [original, ...derived]) {
    if (!isRequirement(r)) return fail(`${describeElement(r)} is a ${r.kind}, not a requirement.`);
    if (r.kind === "requirement def") return fail(`${describeElement(r)} is a requirement definition. A derivation connects requirement usages; derive between usages of the definitions instead.`);
  }
  if (derived.includes(original)) return fail("A requirement cannot be derived from itself.");
  if (new Set(derived).size !== derived.length) return fail("A requirement is listed twice as derived.");
  const target = owner ?? enclosingPackage(derived[0]!);
  if (!target) return fail("The derived requirement is not inside a package; choose where the derivation goes.");
  const c = checkElement(index, target);
  if (!c.ok) return c;
  const text = c.state.text;
  const eol = detectEol(text);
  const unit = detectIndentUnit(text);
  const refs: string[] = [];
  const needs: ImportNeed[] = [];
  const written: WrittenRef[] = [];
  const reference = (r: Element, scopeEl: Element): ReferenceText => innerReference(index, r, scopeEl);

  // An existing `#derivation connection` from the same original in the chosen owner takes more derived ends.
  const existing = target.members.find((m) => {
    if (derivationForm(index, m) !== "hash") return false;
    const d = derivationOf(index, m);
    return d?.original?.target === original;
  });
  if (existing) {
    const d = derivationOf(index, existing)!;
    const dup = derived.find((x) => d.derived.some((e) => e.target === x));
    if (dup) return fail(`${describeElement(dup)} is already derived from ${describeElement(original)} by a derivation in ${describeElement(target)}.`);
    const lines: string[] = [];
    for (const r of derived) {
      const t = reference(r, existing);
      if (!t.ok) return t;
      if (t.need) needs.push(t.need);
      refs.push(t.text);
      lines.push(`end #derive ::> ${t.text};`);
    }
    const ins = insertWithImports(index, existing, lines, needs, "end");
    if (!ins.ok) return ins;
    const connIdx = target.members.filter((m) => m.kind === "connection").indexOf(existing);
    refs.forEach((t, i) => written.push({ text: t, target: derived[i]!, scope: (ed) => editedCounterpart(ed, target)?.members.filter((m) => m.kind === "connection")[connIdx] }));
    return finish(index, ins.edits, `${derived.map(describeElement).join(", ")} derived from ${describeElement(original)}`, needs, written);
  }

  for (const r of [original, ...derived]) {
    const t = reference(r, target);
    if (!t.ok) return t;
    if (t.need) needs.push(t.need);
    refs.push(t.text);
  }
  const pkg = enclosingPackage(target);
  if (pkg && !visibleFrom(index, target, "RequirementDerivation", "derivation")) needs.push({ pkg, text: DERIVATION_IMPORT });
  const decl = ["#derivation connection {", `${unit}end #original ::> ${refs[0]};`, ...refs.slice(1).map((x) => `${unit}end #derive ::> ${x};`), "}"].join(eol);
  const ins = insertWithImports(index, target, [decl], needs, "end");
  if (!ins.ok) return ins;
  const before = target.members.filter((m) => m.kind === "connection").length;
  [original, ...derived].forEach((r, i) => written.push({
    text: refs[i]!, target: r,
    scope: (ed) => { const tg = editedCounterpart(ed, target); return tg?.members.filter((m) => m.kind === "connection")[before]; },
  }));
  return finish(index, ins.edits, `${derived.map(describeElement).join(", ")} derived from ${describeElement(original)}`, needs, written);
}

/**
 * Remove a derived requirement from a derivation connection (the whole connection when it is the last one, or when `derived` is omitted).
 * Removing one end of a hand-written form (metadata or a typed connection) is refused: its ends are required by the definition.
 */
export function planRemoveDerivation(index: ModelIndex, connection: Element, derived?: Element): PlanResult {
  const d = derivationOf(index, connection);
  if (!d) return fail(`${describeElement(connection)} is not a derivation connection.`);
  const end = derived === undefined ? undefined : d.derived.find((x) => x.target === derived);
  if (derived !== undefined && !end) return fail(`${describeElement(derived)} is not derived by this connection.`);
  if (derived === undefined || d.derived.length <= 1) return deleteStatement(index, connection, undefined, "Remove a derivation");
  if (d.form !== "hash") return fail("This derivation is written by hand (metadata or a typed connection), so one derived requirement cannot be removed safely; remove the whole derivation or edit the text.");
  return deleteStatement(index, end!.end, undefined, `Remove ${describeElement(derived)} from a derivation`);
}

// ---------------------------------------------------------------------------- moving members

export type MoveTarget = { owner?: Element; position?: "start" | "end"; after?: Element; before?: Element };

/** The start of the run of blank lines directly above the line that starts at `at` (`at` itself when there is none). Blank lines belong to the declaration below them. */
function blankRunStart(text: string, at: number): number {
  let start = at;
  while (start > 0 && text[start - 1] === "\n") {
    const prevEnd = text[start - 2] === "\r" ? start - 2 : start - 1;
    const prevStart = lineStart(text, prevEnd);
    if (!/^[ \t]*$/.test(text.slice(prevStart, prevEnd))) break;
    start = prevStart;
  }
  return start;
}

/** The whole lines of a declaration, the comments attached to it and the blank lines above it (they travel with it), or why they cannot be cut out. */
function blockOf(index: ModelIndex, text: string, el: Element): { start: number; end: number; text: string } | PlanFailure {
  const ds = declStart(text, el);
  if (!startsOwnLine(text, ds)) return fail(`${describeElement(el)} shares its line with other declarations and cannot be moved.`);
  const de = el.range.end.offset;
  const nl = lineBreakAt(text, de);
  const lineEnd = nl === -1 ? text.length : nl;
  const rest = tokenize(text).filter((t) => t.start >= de && t.start < lineEnd && !isWs(t));
  if (rest.some((t) => isCode(t) || isBlockComment(t))) return fail(`${describeElement(el)} shares its line with other declarations and cannot be moved.`);
  const declLineStart = attachedStart(index, text, el);
  const start = blankRunStart(text, declLineStart);
  const indent = lineIndent(text, declLineStart);
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
    // The member before the reference's attached comments (a comment right above it travels with it, so go above it).
    const refText = index.getDocument(to.before.uri)?.text ?? "";
    const at = attachedStart(index, refText, to.before);
    const prev = sibs.slice(0, i).reverse().find((m) => m !== element && m.range.end.offset <= at);
    position = prev ? { after: prev } : "start";
  } else position = to.position ?? "end";
  const ins = insertDecls(index, owner, [block.text], position);
  if (!ins.ok) return ins;
  // The block (with its blank lines) is cut out whole, so that moving it back restores the text.
  const del: { ok: true; edit: TextEdit } = { ok: true, edit: { uri: element.uri, range: { start: block.start, end: block.end }, newText: "" } };
  // An insertion before a member goes above the blank lines that belong to that member.
  const otext = oc.state.text;
  const insEdits = ins.edits.map((e) => {
    if (e.uri !== owner.uri || e.range.start !== e.range.end || otext[e.range.start - 1] !== "\n") return e;
    const at = blankRunStart(otext, e.range.start);
    return at === e.range.start ? e : { ...e, range: { start: at, end: at } };
  });
  const edits = [del.edit, ...insEdits];
  let result: string;
  try {
    result = applyEdits(text, edits.filter((e) => e.uri === element.uri));
  } catch (e) {
    return fail(`The move could not be planned (${(e as Error).message}); nothing was changed.`);
  }
  if (result === text && insEdits.every((e) => e.uri === element.uri)) return fail("The declaration is already there.");
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
  const eol = detectEol(c.state.text);
  const needs: ImportNeed[] = [];
  let decl = `package ${quoteName(n)};`;
  if (opts.appendix) {
    decl = [`package ${quoteName(n)} {`, `${unit}@Appendix;`, "}"].join(eol);
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
  const clean = trimBlankLines(body);
  if (clean.trim() === "") return fail("The paragraph is empty.");
  const hasDoc = pkg.members.some((m) => m.kind === "doc");
  const eol = detectEol(c.state.text);
  const kw = hasDoc ? "comment" : "doc";
  const decl = newCommentDecl(kw, escapeTerminator(clean), eol, "");
  const paras = pkg.members.filter((m) => m.kind === "doc" || m.kind === "comment");
  // The first doc goes at the start of the body (after imports), before any comments; later paragraphs follow the last one.
  const imports = pkg.members.filter((m) => m.kind === "import");
  const last = after ?? (hasDoc ? paras[paras.length - 1] : imports[imports.length - 1]);
  const ins = insertWithImports(index, pkg, [decl], [], last ? { after: last } : "start");
  if (!ins.ok) return ins;
  return validatePlan(index, { ok: true, edits: ins.edits, description: `Add a paragraph to ${describeElement(pkg)}` });
}
