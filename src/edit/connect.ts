import { quoteName, type Element, type ModelIndex } from "../model/index.js";
import { checkElement, describeElement } from "./guard.js";
import { insertWithImports } from "./insert.js";
import { enclosingPackage, referenceText, type ImportNeed } from "./refs.js";
import { fail, type PlanFailure, type PlanResult } from "./types.js";
import { validatePlan } from "./validate.js";

type EndText = { ok: true; text: string; need?: ImportNeed } | PlanFailure;

/**
 * An end written relative to `owner` as a feature chain (`a.x`) when the element is nested in
 * the owner and the chain resolves to it; otherwise through the reference writer.
 */
function endText(index: ModelIndex, owner: Element, end: Element | string): EndText {
  if (typeof end === "string") {
    const t = end.trim();
    return t === "" || /[;{}\n]/.test(t) ? fail("The connection end is not a valid reference.") : { ok: true, text: t };
  }
  const names: string[] = [];
  let e: Element | undefined = end;
  for (; e && e !== owner; e = e.owner) {
    if (e.name === undefined) {
      names.length = 0;
      e = undefined;
      break;
    }
    names.unshift(quoteName(e.name));
  }
  if (e === owner && names.length > 0) {
    const chain = names.join(".");
    if (index.resolve(chain, owner) === end) return { ok: true, text: chain };
  }
  return referenceText(index, end, owner);
}

function plan(index: ModelIndex, owner: Element, decl: string, needs: ImportNeed[], description: string): PlanResult {
  const r = insertWithImports(index, owner, [decl], needs, "end");
  if (!r.ok) return r;
  return validatePlan(index, { ok: true, edits: r.edits, description });
}

/** `connect a.x to b.y;` in `owner`; ends are written as feature chains relative to the owner. */
export function planConnect(index: ModelIndex, owner: Element, endA: Element | string, endB: Element | string): PlanResult {
  const c = checkElement(index, owner);
  if (!c.ok) return c;
  const a = endText(index, owner, endA);
  if (!a.ok) return a;
  const b = endText(index, owner, endB);
  if (!b.ok) return b;
  const needs = [a.need, b.need].filter((x): x is ImportNeed => !!x);
  return plan(index, owner, `connect ${a.text} to ${b.text};`, needs, `Connect ${a.text} to ${b.text} in ${describeElement(owner)}`);
}

/** `satisfy <requirement> by <element>;` in `owner` (default: the package owning the satisfying element). */
export function planSatisfy(index: ModelIndex, requirement: Element, by: Element, owner?: Element): PlanResult {
  const target = owner ?? enclosingPackage(by.owner ?? by);
  if (!target) return fail(`${describeElement(by)} is not inside a package; choose where the satisfy statement goes.`);
  const c = checkElement(index, target);
  if (!c.ok) return c;
  if (!requirement.kind.includes("requirement")) return fail(`${describeElement(requirement)} is a ${requirement.kind}, not a requirement.`);
  const r = referenceText(index, requirement, target);
  if (!r.ok) return r;
  const b = endText(index, target, by);
  if (!b.ok) return b;
  const needs = [r.need, b.need].filter((x): x is ImportNeed => !!x);
  return plan(index, target, `satisfy ${r.text} by ${b.text};`, needs, `${describeElement(by)} satisfies ${describeElement(requirement)}`);
}

/** `flow from a.x to b.y;` in `owner`; the ends are paths to features, written as given (`detectThreat.scanReport`). */
export function planFlow(index: ModelIndex, owner: Element, from: string, to: string): PlanResult {
  const c = checkElement(index, owner);
  if (!c.ok) return c;
  for (const t of [from, to]) if (t.trim() === "" || /[;{}\n]/.test(t)) return fail("A flow end must be a path to a feature, such as detectThreat.scanReport.");
  return plan(index, owner, `flow from ${from.trim()} to ${to.trim()};`, [], `Flow from ${from.trim()} to ${to.trim()} in ${describeElement(owner)}`);
}
