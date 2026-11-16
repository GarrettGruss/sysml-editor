import type { Element, ModelIndex } from "../model/index.js";
import { declarationTokens, findRuns } from "./decl.js";
import { checkElement, describeElement } from "./guard.js";
import { importEdits, referenceText } from "./refs.js";
import { fail, type PlanResult, type TextEdit } from "./types.js";
import { validatePlan } from "./validate.js";

/** Whether `start` already specializes `goal`, directly or through other definitions (a cycle check). */
function reaches(index: ModelIndex, start: Element, goal: Element): boolean {
  const seen = new Set<Element>();
  const walk = (e: Element): boolean => {
    if (e === goal) return true;
    if (seen.has(e)) return false;
    seen.add(e);
    return e.specializes.some((s) => {
      const t = index.resolve(s, e);
      return t !== undefined && walk(t);
    });
  };
  return walk(start);
}

/**
 * `:> Target` on the declaration of definition `source` (a comma-separated entry when it already specializes something).
 * Refused: a source that is not a definition, a target of another kind, itself, an existing specialization, a cycle.
 */
export function planSpecialize(index: ModelIndex, source: Element, target: Element): PlanResult {
  const c = checkElement(index, source);
  if (!c.ok) return c;
  if (!source.isDefinition) return fail(`${describeElement(source)} is a ${source.kind}; only definitions can be specialized with this tool.`);
  if (!target.isDefinition || target.kind !== source.kind) return fail(`${describeElement(source)} is a ${source.kind} and can only specialize another ${source.kind}, not ${describeElement(target)} (a ${target.kind}).`);
  if (source === target) return fail(`${describeElement(source)} cannot specialize itself.`);
  if (reaches(index, source, target)) return fail(`${describeElement(source)} already specializes ${describeElement(target)}.`);
  if (reaches(index, target, source)) return fail(`${describeElement(target)} already specializes ${describeElement(source)}; the reverse would be a cycle.`);
  const r = referenceText(index, target, source.owner ?? source);
  if (!r.ok) return r;
  const toks = declarationTokens(c.state.text, source);
  while (toks.length && (toks[toks.length - 1]!.text === ";" || toks[toks.length - 1]!.text === "{")) toks.pop();
  if (!toks.length) return fail(`Could not find the declaration of ${describeElement(source)}.`);
  let edit: TextEdit;
  if (source.specializes.length > 0) {
    const last = source.specializes[source.specializes.length - 1]!;
    const run = findRuns(toks, last).pop();
    if (!run) return fail(`Could not find the current specialization '${last}' in the declaration of ${describeElement(source)}.`);
    const at = run.toks[run.toks.length - 1]!.end;
    edit = { uri: source.uri, range: { start: at, end: at }, newText: `, ${r.text}` };
  } else {
    const at = toks[toks.length - 1]!.end;
    edit = { uri: source.uri, range: { start: at, end: at }, newText: ` :> ${r.text}` };
  }
  const imp = importEdits(index, r.need ? [r.need] : []);
  if (!imp.ok) return imp;
  return validatePlan(index, { ok: true, edits: [...imp.edits, edit], description: `${describeElement(source)} specializes ${describeElement(target)}` });
}
