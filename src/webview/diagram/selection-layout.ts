/**
 * Auto-layout of the selection: only the selected nodes (with what is nested in them and their ports) and the lines among
 * them are laid out again; the group keeps the top-left of its previous bounding box unless that would overlap an
 * unselected node, in which case it moves right. No DOM: ELK and text measuring are injected.
 */
import type { EdgePoints, NodeBox } from "../../diagram/protocol.js";
import type { ViewModel, VmNode } from "../../diagram/view-model.js";
import { PAD, absoluteBoxes, type Box, type Measure, type Pt } from "./geometry.js";
import { layoutDiagram, type ElkLike } from "./layout.js";

/** Space kept between the laid-out group and an unselected node. */
export const GROUP_GAP = 16;

const overlaps = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Where to put a group of boxes so that the bounding box's top-left is `want`; moved right while a box would come within
 * `gap` of an obstacle. With `maxRight`, a group that would then reach past it goes back to the left edge and is moved
 * below the obstacle instead. Returns the translation to add to the boxes. The search is bounded.
 */
export function placeGroup(boxes: readonly Box[], want: Pt, obstacles: readonly Box[], gap = GROUP_GAP, maxRight?: number): Pt {
  if (!boxes.length) return { x: 0, y: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const base = { x: want.x - left, y: want.y - top };
  const shift = { ...base };
  for (let i = 0; i < 500; i++) {
    let hit: { b: Box; o: Box } | undefined;
    for (const b of boxes) {
      const sb = { x: b.x + shift.x, y: b.y + shift.y, w: b.w, h: b.h };
      const o = obstacles.find((x) => overlaps(sb, x, gap));
      if (o) { hit = { b: sb, o }; break; }
    }
    if (!hit) break;
    const dx = hit.o.x + hit.o.w + gap - hit.b.x;
    if (maxRight === undefined || right + shift.x + dx <= maxRight) shift.x += dx;
    else {
      shift.x = base.x;
      shift.y += hit.o.y + hit.o.h + gap - hit.b.y;
    }
  }
  return shift;
}

const segmentHitsBox = (p: Pt, q: Pt, b: Box): boolean => {
  // Liang-Barsky clipping of the segment against the box.
  let t0 = 0, t1 = 1;
  const d = { x: q.x - p.x, y: q.y - p.y };
  for (const [pp, qq] of [[-d.x, p.x - b.x], [d.x, b.x + b.w - p.x], [-d.y, p.y - b.y], [d.y, b.y + b.h - p.y]] as const) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
};
/** A polyline crosses or lies in a box. */
export const routeHitsBox = (pts: readonly Pt[], b: Box): boolean => pts.some((p, i) => i > 0 && segmentHitsBox(pts[i - 1]!, p, b));

export interface SelectionLayout {
  boxes: NodeBox[];
  /** Routes to store: the group's inner lines, plus every stored route that stays. Lines joining the group and the rest are left out, so they are computed again. */
  edges: EdgePoints[];
}

/**
 * Lay out `selected` only. `rel` holds the boxes as drawn now (relative to the parent). Undefined when there is nothing
 * to lay out separately (no selected node, or a sequence diagram): the caller lays out the whole diagram.
 * Selected nodes are grouped by parent; each group is laid out and placed inside its own parent (which grows when it must).
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
  const tops = [...chosen].filter((id) => !chain(id).slice(1).some((a) => chosen.has(a)));
  if (!tops.length) return undefined;
  const topOf = new Map<string, string>();
  for (const n of vm.nodes) {
    const t = chain(n.id).find((a) => tops.includes(a));
    if (t !== undefined) topOf.set(n.id, t);
  }
  const inGroup = (id: string) => topOf.has(id);
  const abs = absoluteBoxes(vm, rel);
  const parentOf = (id: string) => byId.get(id)?.parent;
  const groups = new Map<string | undefined, string[]>();
  for (const t of tops) groups.set(parentOf(t), [...(groups.get(parentOf(t)) ?? []), t]);

  const boxes = new Map<string, NodeBox>();
  const placedBoxes: Box[] = [];
  const edges = new Map<string, EdgePoints>();
  const grown = new Map<string, Box>();
  const ancestorsOfTops = new Set(tops.flatMap((t) => chain(t).slice(1)));

  for (const [pid, gTops] of groups) {
    const memberOf = (id: string) => { const t = topOf.get(id); return t !== undefined && gTops.includes(t); };
    const sub: ViewModel = {
      ...vm,
      nodes: vm.nodes.filter((n) => memberOf(n.id)).map((n) => {
        const { geometry: _g, parent, ...rest } = n;
        return gTops.includes(n.id) ? rest : { ...rest, ...(parent !== undefined ? { parent } : {}) };
      }),
      edges: vm.edges.filter((e) => memberOf(e.source) && memberOf(e.target)).map(({ points: _p, ...e }) => e),
    };
    const layout = await layoutDiagram(sub, elk, measure);
    const subAbs = absoluteBoxes(sub, layout.boxes);
    const topBoxes = gTops.map((t) => subAbs.get(t)!);
    const prev = gTops.map((t) => abs.get(t)).filter((b): b is Box => b !== undefined);
    const want = prev.length ? { x: Math.min(...prev.map((b) => b.x)), y: Math.min(...prev.map((b) => b.y)) } : { x: Math.min(...topBoxes.map((b) => b.x)), y: Math.min(...topBoxes.map((b) => b.y)) };
    const obstacles = [
      ...vm.nodes.filter((n) => !inGroup(n.id) && n.attachedTo === undefined && !ancestorsOfTops.has(n.id)).flatMap((n) => abs.get(n.id) ?? []),
      ...placedBoxes,
    ];
    const pa = pid !== undefined ? abs.get(pid) : undefined;
    const shift = placeGroup(topBoxes, want, obstacles, GROUP_GAP, pa ? pa.x + pa.w - PAD : undefined);
    const po = pa ?? { x: 0, y: 0 };
    for (const n of sub.nodes) {
      const b = layout.boxes.get(n.id);
      if (!b) continue;
      boxes.set(n.id, gTops.includes(n.id) ? { id: n.id, x: Math.round(b.x + shift.x - po.x), y: Math.round(b.y + shift.y - po.y), w: b.w, h: b.h } : { id: n.id, ...b });
    }
    const placed = topBoxes.map((b) => ({ x: b.x + shift.x, y: b.y + shift.y, w: b.w, h: b.h }));
    placedBoxes.push(...placed);
    // Containers grow to hold the group, all the way up.
    let need = { r: Math.max(...placed.map((b) => b.x + b.w)) + PAD, b: Math.max(...placed.map((b) => b.y + b.h)) + PAD };
    for (const a of pid !== undefined ? chain(pid) : []) {
      const ab = abs.get(a), rb = rel.get(a);
      if (!ab || !rb) break;
      const prevGrown = grown.get(a) ?? rb;
      const w = Math.max(prevGrown.w, Math.ceil(need.r - ab.x)), h = Math.max(prevGrown.h, Math.ceil(need.b - ab.y));
      if (w !== rb.w || h !== rb.h) grown.set(a, { x: rb.x, y: rb.y, w, h });
      need = { r: ab.x + w + PAD, b: ab.y + h + PAD };
    }
    const inner = new Set(sub.edges.map((e) => e.id));
    for (const e of vm.edges) {
      if (e.derived || !inner.has(e.id)) continue;
      const pts = layout.routes.get(e.id);
      if (pts) edges.set(e.id, { id: e.id, points: pts.map((p) => ({ x: Math.round(p.x + shift.x), y: Math.round(p.y + shift.y) })) });
    }
  }
  for (const [id, b] of grown) if (!boxes.has(id)) boxes.set(id, { id, ...b });
  // Routes that stay: between two unselected nodes, unless the group now lies on them.
  for (const e of vm.edges) {
    if (e.derived || edges.has(e.id) || inGroup(e.source) || inGroup(e.target) || !e.points?.length) continue;
    if (placedBoxes.some((b) => routeHitsBox(e.points!, b))) continue;
    edges.set(e.id, { id: e.id, points: e.points.map((p) => ({ x: p.x, y: p.y })) });
  }
  return { boxes: [...boxes.values()], edges: [...edges.values()] };
}
