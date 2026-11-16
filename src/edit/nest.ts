/**
 * Nesting by drop (design D33): move the declaration of a state, action or part into another owner, and rewrite
 * the references that would stop resolving to it, or refuse with a reason. Nothing here imports `vscode`.
 */
import { isLibraryUri, quoteName, splitQualified, type Element, type ModelIndex } from "../model/index.js";
import { describeElement } from "./guard.js";
import { namedOwnerQn } from "./rename.js";
import { declsOf, resolutionKey, scanReferences, snapshotResolutions, walkReferences } from "./refscan.js";
import { planMoveMember } from "./requirements.js";
import { applyEdits, groupByUri } from "./text.js";
import { fail, type PlanOk, type PlanResult, type TextEdit } from "./types.js";
import { checkResolutionPreserved, mapOffset, validatePlan } from "./validate.js";

type Family = "state" | "action" | "part";

/** The family of declarations that nest into each other, or undefined for kinds that do not nest by dropping. */
export function nestFamily(kind: string): Family | undefined {
  if (kind === "state" || kind === "state def" || kind.endsWith(" state")) return "state";
  if (kind === "action" || kind === "action def" || kind.endsWith(" action")) return "action";
  if (kind === "part" || kind === "part def") return "part";
  return undefined;
}

const isPackage = (e: Element) => e.kind === "package" || e.kind.endsWith(" package");

/** Why `element` cannot be dropped into `target`, or undefined when it can (the kinds only; the text is checked by the plan). */
export function nestProblem(element: Element, target: Element): string | undefined {
  const fam = nestFamily(element.kind);
  if (!fam || !element.isUsage) return "Only states, actions and parts can be moved by dropping.";
  if (isPackage(target)) return undefined;
  const tf = nestFamily(target.kind);
  if (tf !== fam) return `A ${target.kind} cannot own a ${element.kind}.`;
  return undefined;
}

const inside = (e: Element, root: Element): boolean => {
  for (let x: Element | undefined = e; x; x = x.owner) if (x === root) return true;
  return false;
};

const minKey = (ds: { uri: string; off: number }[]) => ds.map((d) => `${d.uri}\0${String(d.off).padStart(10, "0")}`).sort()[0]!;

const swap = (qn: string, oldSegs: readonly string[], newSegs: readonly string[]): string => {
  const segs = splitQualified(qn);
  if (segs.length < oldSegs.length || !oldSegs.every((o, i) => segs[i] === o)) return qn;
  return [...newSegs, ...segs.slice(oldSegs.length)].join("::");
};

/**
 * Move `element` into `owner` (the end of its body). References from elsewhere are rewritten with qualified names where the
 * short name no longer resolves; the plan is refused when a reference cannot be kept or anything would resolve differently.
 */
export function planNest(index: ModelIndex, element: Element, owner: Element): PlanResult {
  const problem = nestProblem(element, owner);
  if (problem) return fail(problem);
  for (const e of [element, owner]) if (isLibraryUri(e.uri) || index.isReadOnly(e.uri)) return fail(`${describeElement(e)} is standard library or read-only content, so it cannot be moved.`);
  if (element.name === undefined || element.qualifiedName === undefined) return fail(`${describeElement(element)} has no name, so it cannot be moved by dropping.`);
  if (element.owner === owner) return fail("The element is already there.");
  if (owner.qualifiedName === undefined) return fail(`${describeElement(owner)} has no name, so the moved element could not be referred to afterwards.`);
  const base = planMoveMember(index, element, { owner, position: "end" }, { skipResolutionCheck: true });
  if (!base.ok) return base;
  const oldQn = element.qualifiedName;
  const newQn = owner.qualifiedName !== undefined ? `${owner.qualifiedName}::${quoteName(element.name)}` : undefined;
  const moveEdits = base.edits;

  // Scratch index with the move alone: which outside references still resolve to the element?
  const texts = new Map<string, string>();
  for (const [uri, edits] of groupByUri(moveEdits)) texts.set(uri, applyEdits(index.getDocument(uri)!.text, edits));
  const scratch1 = index.withTexts(texts);
  const found1 = newQn !== undefined ? scratch1.findByQualifiedName(newQn).find((x) => x.kind === element.kind) : undefined;
  const scan = scanReferences(index, element);
  const outside = scan.replacements.filter((r) => !inside(r.holder, element));
  const rewrites = new Map<string, TextEdit>();
  const rewrittenRuns = new Set<string>();
  if (outside.length) {
    const after1 = found1 ? snapshotResolutions(scratch1) : undefined;
    const expected = found1 ? minKey(declsOf(scratch1, found1)) : undefined;
    for (const r of outside) {
      const at = mapOffset(moveEdits.filter((e) => e.uri === r.uri), r.tok.start);
      const a = at === undefined ? undefined : after1?.get(resolutionKey(r.uri, at, r.segIndex));
      if (a && expected !== undefined && minKey(a.decls) === expected) continue;
      if (newQn === undefined) return fail(`${describeElement(owner)} has no name, so ${element.name} could not be referred to from ${r.uri.split("/").pop()} after the move; nothing was changed.`);
      rewrites.set(`${r.uri}\0${r.runStart}`, { uri: r.uri, range: { start: r.runStart, end: r.tok.end }, newText: newQn });
      rewrittenRuns.add(`${r.uri}\0${r.runStart}`);
    }
  }
  const edits = [...moveEdits, ...rewrites.values()];
  const plan: PlanOk = { ...base, edits, description: `${base.description} (${rewrites.size} reference${rewrites.size === 1 ? "" : "s"} rewritten)` };
  const valid = validatePlan(index, plan);
  if (!valid.ok) return valid;

  // The semantic check: nothing else changes meaning, and every reference to the element still reaches it.
  const checked = checkResolutionPreserved(index, valid);
  if (!checked.ok) return checked;
  const texts2 = new Map<string, string>();
  for (const [uri, es] of groupByUri(edits)) texts2.set(uri, applyEdits(index.getDocument(uri)!.text, es));
  const scratch2 = index.withTexts(texts2);
  const moved2 = newQn !== undefined ? scratch2.findByQualifiedName(newQn).find((x) => x.kind === element.kind) : undefined;
  if (!moved2) return fail("The move could not be checked; nothing was changed.");
  const after2 = snapshotResolutions(scratch2);
  const expected2 = minKey(declsOf(scratch2, moved2));
  const newSegs = splitQualified(newQn!);
  for (const r of outside) {
    const wasRewritten = rewrittenRuns.has(`${r.uri}\0${r.runStart}`);
    const mapped = mapOffset(edits.filter((e) => e.uri === r.uri), wasRewritten ? r.runStart : r.tok.start);
    // The name token of the last written segment: after the qualified prefix of a rewritten run.
    const at = mapped === undefined ? undefined : wasRewritten ? mapped + newQn!.length - quoteName(element.name).length : mapped;
    const a = at === undefined ? undefined : after2.get(resolutionKey(r.uri, at, wasRewritten ? newSegs.length - 1 : r.segIndex));
    if (!a || minKey(a.decls) !== expected2) return fail(`A reference to ${element.name} in ${r.uri.split("/").pop()} could not be kept: ${newQn} does not resolve from there. Nothing was changed.`);
  }
  // References written inside the moved declaration keep their meaning.
  const before: (string | undefined)[][] = [];
  walkReferences(index, (v) => { if (inside(v.holder, element)) before.push(v.resolved.map((x) => x?.qualifiedName)); });
  const oldSegs = splitQualified(oldQn);
  const after: (string | undefined)[][] = [];
  walkReferences(scratch2, (v) => { if (inside(v.holder, moved2)) after.push(v.resolved.map((x) => x?.qualifiedName)); });
  if (before.length !== after.length) return fail("The references inside the moved declaration could not be checked; nothing was changed.");
  for (let i = 0; i < before.length; i++) {
    for (let k = 0; k < before[i]!.length; k++) {
      const b = before[i]![k];
      if (b === undefined) continue;
      const want = swap(b, oldSegs, newSegs);
      if (after[i]![k] !== want) return fail(`A name inside ${element.name} would refer to something else in ${describeElement(owner)} (${b} would become ${after[i]![k] ?? "unresolved"}). Nothing was changed.`);
    }
  }

  const endsChanges = scan.endsChanges
    .filter((ch) => rewrittenRuns.has(`${ch.holder.uri}\0${ch.tokens[0]!.start}`))
    .map((ch) => {
      const k = ch.tokens.findIndex((t) => ch.replaced.has(t.start));
      const text = newQn! + ch.tokens.slice(k + 1).map((t) => t.text).join("");
      return { ownerQn: namedOwnerQn(ch.holder), kind: ch.holder.kind, oldEnds: [...ch.holder.ends], newEnds: ch.holder.ends.map((end) => (end === ch.oldText ? text : end)) };
    });
  const result: PlanOk = { ...valid, description: owner === element.owner?.owner ? `Move ${describeElement(element)} out to ${describeElement(owner)}` : `Move ${describeElement(element)} into ${describeElement(owner)} (${rewrites.size} reference${rewrites.size === 1 ? "" : "s"} rewritten)`, nest: { oldQn, newQn, endsChanges } };
  return result;
}
