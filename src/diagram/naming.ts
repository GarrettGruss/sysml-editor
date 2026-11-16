/** Default names for elements created from the palette and the quick bar. No `vscode` import, no DOM. */
import { inheritedMembers, type Element, type ModelIndex } from "../model/index.js";

export { defaultStem, nextFreeName } from "./authoring.js";
import { defaultStem, nextFreeName } from "./authoring.js";

/** Every name and short name of the members of `owner`, counting inherited ones. */
export function takenNames(index: ModelIndex, owner: Element): Set<string> {
  return new Set([...owner.members, ...inheritedMembers(index, owner).map((i) => i.member)].flatMap((m) => [m.name, m.shortName].filter((x): x is string => x !== undefined)));
}

/** The default name of a new element of `kind` in `owner`. */
export function defaultNameFor(index: ModelIndex, owner: Element, kind: string): string {
  return nextFreeName(defaultStem(kind), takenNames(index, owner));
}
