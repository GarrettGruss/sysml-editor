/** StdV-1 and DIV-2 (D78). No `vscode` import. */
import type { Element, ModelIndex } from "../../model/index.js";
import type { Gap, Table } from "../render.js";
import { annotated, attributeValue, cmp, descendants, doc, label, sortByName } from "./common.js";

function refs(e: Element): string[] {
  return [...e.typeNames, ...e.specializes, ...e.subsets, ...e.redefines, ...e.references, ...e.ends];
}

/** StdV-1: each `@Standard` with identifier, title and the elements that cite it. */
export function buildStdV1(index: ModelIndex, root: Element): Table {
  const gaps: Gap[] = [];
  const all = descendants(root);
  const rows = annotated(index, root, "Standard").map((s) => {
    const citing = all.filter((e) => e !== s && refs(e).some((n) => index.resolve(n, e) === s));
    const names = [...new Set(citing.map((c) => (c.kind === "ref" && c.owner ? label(c.owner) : label(c))))].sort(cmp);
    if (names.length === 0) gaps.push({ view: "StdV-1", element: label(s), message: "standard is not cited by any element" });
    const id = attributeValue(index, s, "id") ?? attributeValue(index, s, "identifier") ?? "";
    const title = attributeValue(index, s, "title") ?? doc(s);
    return [s.name ?? "", id, title, names.join(", ")];
  });
  return { columns: ["Standard", "Identifier", "Title", "Cited by"], rows, gaps };
}

/** DIV-2: entity, attribute, type and multiplicity for every `item def` and `attribute def` under `root`. */
export function buildDiv2(_index: ModelIndex, root: Element): Table {
  const gaps: Gap[] = [];
  const rows: string[][] = [];
  const entities = sortByName(descendants(root).filter((e) => e.isDefinition && (e.kind === "item def" || e.kind === "attribute def")));
  for (const ent of entities) {
    const attrs = ent.members.filter((m) => m.kind === "attribute" && m.name);
    if (attrs.length === 0) rows.push([ent.name ?? "", "", "", ""]);
    for (const a of attrs) {
      if (a.types.length === 0) gaps.push({ view: "DIV-2", element: label(a), message: "attribute has no type" });
      rows.push([ent.name ?? "", a.name ?? "", a.types.join(", "), a.multiplicity ?? ""]);
    }
  }
  return { columns: ["Entity", "Attribute", "Type", "Multiplicity"], rows, gaps };
}
