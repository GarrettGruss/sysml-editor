/**
 * Auto-layout of the selection: only the selected nodes (with what is nested in them and their ports) and the lines among
 * them are laid out again; the group keeps the top-left of its previous bounding box unless that would overlap an
 * unselected node, in which case it moves right. No DOM: ELK and text measuring are injected.
 */
import type { EdgePoints, NodeBox } from "../../diagram/protocol.js";
import type { ViewModel, VmNode } from "../../diagram/view-model.js";
import { absoluteBoxes, type Box, type Measure, type Pt } from "./geometry.js";
import { layoutDiagram, type ElkLike } from "./layout.js";

/** Space kept between the laid-out group and an unselected node. */
export const GROUP_GAP = 16;

const overlaps = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Where to put a group of boxes (given relative to the group's own origin, `boxes[i]` at its `at`) so that the
 * bounding box's top-left is `want`; moved right while a box would come within `gap` of an obstacle.
 * Returns the translation to add to the boxes.
 */
export function placeGroup(boxes: readonly Box[], want: Pt, obstacles: readonly Box[], gap = GROUP_GAP): Pt {
  if (!boxes.length) return { x: 0, y: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const shift = { x: want.x - left, y: want.y - top };
  for (let i = 0; i < 500; i++) {
    let moved = false;
    for (const b of boxes) {
      const s = { x: b.x + shift.x, y: b.y + shift.y, w: b.w, h: b.h };
      const o = obstacles.find((x) => overlaps(s, x, gap));
      if (o) {
        shift.x += o.x + o.w + gap - s.x;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return shift;
}

export interface SelectionLayout {
  boxes: NodeBox[];
  /** Routes to store: the group's inner lines, plus every stored route that stays. Lines joining the group and the rest are left out, so they are computed again. */
  edges: EdgePoints[];
}

/**
 * Lay out `selected` only. `rel` holds the boxes as drawn now (relative to the parent). Undefined when there is nothing
 * to lay out separately (no selected node, or a sequence diagram): the caller lays out the whole diagram.
 */
export async function layoutSelection(vm: ViewModel, selected: readonly string[], rel: ReadonlyMap<string, Box>, elk: ElkLike, measure: Measure): Promise<SelectionLayout | undefined> {
  if (vm.kind === "sequence") return undefined;
  const byId = new Map(vm.nodes.map((n) => [n.id, n] as const));
  const up = (n: VmNode) => n.attachedTo ?? n.parent;
  const chain = (id: string): string[] => {
    const out: string[] = [];
    for (let cur: string | undefined = id, i = 0; cur !== undefined && byId.has(cur) && i < 100; i++) {
      out.push(cur);
      cur = up(byId.get(cur)!);
    }
    return out;
  };
  const chosen = new Set(selected.filter((id) => byId.has(id) && byId.get(id)!.attachedTo === undefined));
  // The top of the group: selected nodes with no selected ancestor.
  const tops = [...chosen].filter((id) => !chain(id).slice(1).some((a) => chosen.has(a)));
  if (!tops.length) return undefined;
  const topOf = new Map<string, string>();
  for (const n of vm.nodes) {
    const t = chain(n.id).find((a) => tops.includes(a));
    if (t !== undefined) topOf.set(n.id, t);
  }
  const inGroup = (id: string) => topOf.has(id);
  const sub: ViewModel = {
    ...vm,
    nodes: vm.nodes.filter((n) => inGroup(n.id)).map((n) => {
      const { geometry: _g, parent, ...rest } = n;
      return tops.includes(n.id) ? rest : { ...rest, ...(parent !== undefined ? { parent } : {}) };
    }),
    edges: vm.edges.filter((e) => inGroup(e.source) && inGroup(e.target)).map(({ points: _p, ...e }) => e),
  };
  const layout = await layoutDiagram(sub, elk, measure);
  const abs = absoluteBoxes(vm, rel);
  const subAbs = absoluteBoxes(sub, layout.boxes);
  const topBoxes = tops.map((t) => subAbs.get(t)!);
  const prev = tops.map((t) => abs.get(t)).filter((b): b is Box => b !== undefined);
  const want = prev.length ? { x: Math.min(...prev.map((b) => b.x)), y: Math.min(...prev.map((b) => b.y)) } : { x: Math.min(...topBoxes.map((b) => b.x)), y: Math.min(...topBoxes.map((b) => b.y)) };
  const ancestors = new Set(tops.flatMap((t) => chain(t).slice(1)));
  const obstacles = vm.nodes.filter((n) => !inGroup(n.id) && n.attachedTo === undefined && !ancestors.has(n.id)).flatMap((n) => abs.get(n.id) ?? []);
  const shift = placeGroup(topBoxes, want, obstacles);
  const boxes: NodeBox[] = [];
  for (const n of sub.nodes) {
    const b = layout.boxes.get(n.id);
    if (!b) continue;
    if (tops.includes(n.id)) {
      const parent = byId.get(n.id)?.parent;
      const po = parent !== undefined ? abs.get(parent) : undefined;
      boxes.push({ id: n.id, x: Math.round(b.x + shift.x - (po?.x ?? 0)), y: Math.round(b.y + shift.y - (po?.y ?? 0)), w: b.w, h: b.h });
    } else boxes.push({ id: n.id, ...b });
  }
  const edges: EdgePoints[] = [];
  const inner = new Set(sub.edges.map((e) => e.id));
  for (const e of vm.edges) {
    if (e.derived) continue;
    if (inner.has(e.id)) {
      const pts = layout.routes.get(e.id);
      if (pts) edges.push({ id: e.id, points: pts.map((p) => ({ x: Math.round(p.x + shift.x), y: Math.round(p.y + shift.y) })) });
    } else if (!inGroup(e.source) && !inGroup(e.target) && e.points?.length) edges.push({ id: e.id, points: e.points.map((p) => ({ x: p.x, y: p.y })) });
  }
  return { boxes, edges };
}
