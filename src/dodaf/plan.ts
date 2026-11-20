/** Plans which DoDAF views to produce from a model (D80). Pure; no `vscode` import. */
import type { Element, ModelIndex } from "../model/index.js";
import type { DiagramKind } from "../diagram/format.js";
import { selectByMetadata } from "./library.js";
import { VIEWS, VIEW_IDS, type ViewForm, type ViewId, type ViewMapping } from "./mapping.js";

export interface ViewPlan {
  id: ViewId;
  title: string;
  form: ViewForm;
  diagramKind?: DiagramKind;
  /** Qualified name of the element the view is drawn from (the architecture root, or one root activity for OV-5b). */
  root: string;
  /** Diagram file name for `form: "diagram"` (D82), e.g. `Mission-OV-1.sysmld`. */
  fileName?: string;
  /** Metadata definitions that no element under the root uses (D79). */
  missing: string[];
  /** Nothing in the model feeds this view. */
  empty: boolean;
}

function within(root: Element, el: Element): boolean {
  const r = root.qualifiedName;
  const q = el.qualifiedName;
  return q !== undefined && r !== undefined && (q === r || q.startsWith(`${r}::`));
}

function allUnder(root: Element, pred: (e: Element) => boolean): Element[] {
  const out: Element[] = [];
  const visit = (e: Element): void => {
    if (e !== root && pred(e)) out.push(e);
    for (const m of e.members) visit(m);
  };
  visit(root);
  return out;
}

const baseName = (root: Element): string => (root.name ?? root.qualifiedName ?? "Architecture").replace(/[^\w.-]+/g, "_");

/** The plan for `views` (all 17 when omitted, in DoDAF order) under `root`. Unknown ids are ignored. */
export function planViews(index: ModelIndex, root: Element, views?: readonly string[]): ViewPlan[] {
  const wanted = views ? VIEW_IDS.filter((v) => views.includes(v)) : VIEW_IDS;
  const annotated = new Set<Element>();
  for (const v of VIEWS) for (const d of v.selects) for (const e of selectByMetadata(index, d)) if (within(root, e)) annotated.add(e);
  const out: ViewPlan[] = [];
  for (const id of wanted) {
    const m: ViewMapping = VIEWS.find((v) => v.id === id)!;
    const found = new Map<string, Element[]>();
    for (const def of m.selects) found.set(def, selectByMetadata(index, def).filter((e) => within(root, e)));
    const missing = m.selects.filter((d) => found.get(d)!.length === 0);
    const base = baseName(root);
    const common = { id, title: m.title, form: m.form, ...(m.diagramKind ? { diagramKind: m.diagramKind } : {}) };
    if (id === "OV-5b") {
      const acts = (found.get("OperationalActivity") ?? []).filter((a) => a.kind.startsWith("action"));
      if (acts.length === 0) out.push({ ...common, root: root.qualifiedName ?? "", fileName: `${base}-${id}.sysmld`, missing, empty: true });
      for (const a of acts) out.push({ ...common, root: a.qualifiedName ?? "", fileName: `${base}-${id}-${a.name ?? "activity"}.sysmld`, missing: [], empty: false });
      continue;
    }
    let empty = m.selects.length > 0 && missing.length === m.selects.length;
    if (id === "AV-2") empty = annotated.size === 0;
    if (id === "DIV-2") empty = allUnder(root, (e) => e.kind === "item def" || e.kind === "attribute def").length === 0;
    out.push({
      ...common,
      root: root.qualifiedName ?? "",
      ...(m.form === "diagram" ? { fileName: `${base}-${id}.sysmld` } : {}),
      missing,
      empty,
    });
  }
  return out;
}
