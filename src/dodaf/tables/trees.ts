/** OV-4 and OV-5a as indented trees (D78). No `vscode` import. */
import type { Element, ModelIndex } from "../../model/index.js";
import type { Gap, Table } from "../render.js";
import { annotated, doc, dodafNames, isElementLike, label } from "./common.js";

const INDENT = "  ";

/**
 * Walk containment from `tops`. `child` says which members belong in the tree. A usage's definition
 * is expanded once per path, so a definition that contains itself terminates.
 */
function walk(index: ModelIndex, tops: Element[], child: (e: Element) => boolean, view: string, gaps: Gap[]): string[][] {
  const rows: string[][] = [];
  const emit = (e: Element, depth: number, path: Set<Element>): void => {
    const d = doc(e);
    if (!d) gaps.push({ view, element: label(e), message: "element has no documentation" });
    rows.push([String(depth + 1), INDENT.repeat(depth) + (e.name ?? e.kind), d]);
    const next = new Set(path).add(e);
    const kids = [...e.members];
    for (const t of e.typeNames) {
      const def = index.resolve(t, e);
      if (def && !next.has(def)) kids.push(...def.members);
    }
    for (const k of kids) {
      if (!isElementLike(k) || !child(k) || next.has(k)) continue;
      emit(k, depth + 1, next);
    }
  };
  for (const t of tops) emit(t, 0, new Set());
  return rows;
}

function topsOf(index: ModelIndex, root: Element, names: string[]): Element[] {
  const all = [...new Set(names.flatMap((n) => annotated(index, root, n)))];
  const set = new Set(all);
  const nested = (e: Element): boolean => {
    for (let o = e.owner; o; o = o.owner) if (set.has(o)) return true;
    return false;
  };
  return all.filter((e) => !nested(e));
}

/** OV-4: `@Organization` elements and the organizations they contain. */
export function buildOv4(index: ModelIndex, root: Element): Table {
  const gaps: Gap[] = [];
  const rows = walk(index, topsOf(index, root, ["Organization"]), (e) => dodafNames(index, e).includes("Organization"), "OV-4", gaps);
  return { columns: ["Level", "Organization", "Description"], rows, gaps };
}

/** OV-5a: `@OperationalActivity` (and `@Capability`) trees; nested actions are children. */
export function buildOv5a(index: ModelIndex, root: Element): Table {
  const gaps: Gap[] = [];
  const rows = walk(index, topsOf(index, root, ["Capability", "OperationalActivity"]), (e) => e.kind.includes("action") || dodafNames(index, e).length > 0, "OV-5a", gaps);
  return { columns: ["Level", "Activity", "Description"], rows, gaps };
}
