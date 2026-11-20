/** SV-5a traceability matrix (D78). No `vscode` import. */
import type { Element, ModelIndex } from "../../model/index.js";
import type { Gap, Table } from "../render.js";
import { annotated, descendants, label } from "./common.js";

export const MARK = "X";

/** Rows are operational activities, columns system functions; a cell is marked per `allocate` or `satisfy`. */
export function buildSv5a(index: ModelIndex, root: Element): Table {
  const acts = annotated(index, root, "OperationalActivity");
  const fns = annotated(index, root, "SystemFunction");
  const marks = new Set<string>();
  for (const e of descendants(root)) {
    if (!["allocation", "allocate", "satisfy", "satisfaction"].includes(e.kind)) continue;
    const ends = e.ends.map((n) => index.resolve(n, e)).filter((r): r is Element => !!r);
    for (const a of ends) for (const b of ends) if (acts.includes(a) && fns.includes(b)) marks.add(`${label(a)}\0${label(b)}`);
  }
  const gaps: Gap[] = [];
  const rows = acts.map((a) => {
    const cells = fns.map((f) => (marks.has(`${label(a)}\0${label(f)}`) ? MARK : ""));
    if (!cells.includes(MARK)) gaps.push({ view: "SV-5a", element: label(a), message: "operational activity is not allocated to any system function" });
    return [a.name ?? "", ...cells];
  });
  fns.forEach((f, i) => {
    if (!rows.some((r) => r[i + 1] === MARK)) gaps.push({ view: "SV-5a", element: label(f), message: "system function is not allocated to any operational activity" });
  });
  return { columns: ["Activity \\ Function", ...fns.map((f) => f.name ?? "")], rows, gaps };
}
