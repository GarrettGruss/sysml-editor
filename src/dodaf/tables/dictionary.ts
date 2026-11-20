/** AV-1, AV-2 and CV-1 (D78). No `vscode` import. */
import type { Element, ModelIndex } from "../../model/index.js";
import type { Gap, Table } from "../render.js";
import { annotated, attributeValue, descendants, dodafKind, doc, dodafNames, isElementLike, label, metadataMember, sortByName } from "./common.js";

/** AV-1: field/value rows from the root's `@ArchitectureDescription` and documentation. */
export function buildAv1(index: ModelIndex, root: Element): Table {
  const gaps: Gap[] = [];
  const el = root.qualifiedName ?? root.name;
  const md = metadataMember(index, root, "ArchitectureDescription");
  const val = (attr: string): string => (md ? (attributeValue(index, md, attr) ?? "") : "");
  const fields: [string, string, boolean][] = [
    ["Architecture", root.name ?? "", false],
    ["Description", doc(root), false],
    ["Purpose", val("purpose"), true],
    ["Scope", val("scope"), true],
    ["Viewpoint", val("viewpointName"), false],
    ["Date created", val("dateCreated"), false],
    ["Date modified", val("dateModified"), false],
  ];
  if (!md) gaps.push({ view: "AV-1", element: el, message: "root has no @ArchitectureDescription" });
  else for (const [name, value, required] of fields) if (required && !value) gaps.push({ view: "AV-1", element: el, message: `@ArchitectureDescription has no ${name.toLowerCase()}` });
  return { columns: ["Field", "Value"], rows: fields.map(([n, v]) => [n, v]), gaps };
}

/** AV-2: every DoDAF-annotated element under `root`, sorted by qualified name. */
export function buildAv2(index: ModelIndex, root: Element): Table {
  const els = sortByName(descendants(root).filter((e) => isElementLike(e) && dodafNames(index, e).length > 0));
  const gaps: Gap[] = [];
  const rows = els.map((e) => {
    const d = doc(e);
    if (!d) gaps.push({ view: "AV-2", element: label(e), message: "annotated element has no documentation" });
    return [e.name ?? "", dodafKind(index, e), d];
  });
  return { columns: ["Name", "Kind", "Definition"], rows, gaps };
}

/** CV-1: each `@Capability` with its documentation and `@Vision` text. */
export function buildCv1(index: ModelIndex, root: Element): Table {
  const gaps: Gap[] = [];
  const rows = annotated(index, root, "Capability").map((c) => {
    const d = doc(c);
    const vm = metadataMember(index, c, "Vision");
    const vision = vm ? (attributeValue(index, vm, "text") ?? "") : "";
    if (!d) gaps.push({ view: "CV-1", element: label(c), message: "capability has no documentation" });
    if (!vision) gaps.push({ view: "CV-1", element: label(c), message: "capability has no @Vision text" });
    return [c.name ?? "", d, vision];
  });
  return { columns: ["Capability", "Description", "Vision"], rows, gaps };
}
