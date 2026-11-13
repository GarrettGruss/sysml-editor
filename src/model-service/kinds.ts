/**
 * The declaration kinds that can be added to the model, and where. The single source for the tree's Add Child
 * list, the diagram palette, the agent tool's enum and the check in `ModelService.addElement`. No `vscode`
 * import, no DOM.
 */
import type { Element } from "../model/types.js";

export const DEFINITION_KINDS = ["package", "part def", "port def", "attribute def", "item def", "action def", "state def", "requirement def", "verification def"];
export const USAGE_KINDS = ["part", "port", "attribute", "item", "action", "state", "requirement", "verification"];
/** Control nodes of an action: they are only offered inside an action or an action definition (design D20). */
export const CONTROL_KINDS = ["fork", "join", "decide", "merge"];
/** Every kind that can be added somewhere. */
export const ALL_KINDS: readonly string[] = [...DEFINITION_KINDS, ...USAGE_KINDS];

/** Every kind an agent can create (the control nodes only inside actions). */
export const CREATABLE_KINDS: readonly string[] = [...ALL_KINDS, ...CONTROL_KINDS];

const isActionOwner = (e: Element): boolean => e.kind === "action" || e.kind === "action def";

/** Declaration kinds that may be added under an element. */
export function allowedChildKinds(owner: Element): string[] {
  const isPackage = owner.kind === "package" || owner.kind.endsWith(" package");
  if (isPackage) return [...ALL_KINDS];
  if (!(owner.isDefinition || owner.isUsage)) return [];
  return isActionOwner(owner) ? [...USAGE_KINDS, ...CONTROL_KINDS] : [...USAGE_KINDS];
}

/** Why `kind` cannot be added to `owner`, or undefined when it can. The only check of a kind that comes from outside. */
export function kindProblem(owner: Element, kind: unknown): string | undefined {
  if (typeof kind !== "string" || kind.trim() === "") return "Choose what to add.";
  const allowed = allowedChildKinds(owner);
  if (allowed.includes(kind)) return undefined;
  const where = `${owner.kind}${owner.name !== undefined ? ` '${owner.name}'` : ""}`;
  return allowed.length ? `A ${kind.length > 40 ? "kind of element" : `'${kind}'`} cannot be added to ${where}. Allowed: ${allowed.join(", ")}.` : `A ${owner.kind} cannot have members.`;
}
