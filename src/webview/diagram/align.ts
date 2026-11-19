/**
 * Align and distribute the selected nodes (D48): a layout-only plan over the scene's boxes. No DOM.
 * Ports slide on their owner's border and nodes inside a selected parent move with it, so neither is moved on its own.
 */
import { Scene, type Plan } from "./interaction.js";

export const ALIGN_MODES = ["left", "right", "top", "bottom", "center", "middle"] as const;
export type AlignMode = (typeof ALIGN_MODES)[number];
export type DistributeMode = "horizontal" | "vertical";

/** The selected nodes that can move on their own: not ports, and not inside another selected node. */
function movable(scene: Scene, ids: Iterable<string>) {
  const set = new Set(ids);
  return [...set].flatMap((id) => {
    const it = scene.get(id);
    return it && it.owner === undefined && !scene.hasAncestorIn(id, set) ? [it] : [];
  });
}

/** Align to the bounding box of the selection; needs two nodes. The plan holds the new box position relative to the parent. */
export function planAlign(scene: Scene, ids: Iterable<string>, mode: AlignMode): Plan {
  const items = movable(scene, ids);
  const plan: Plan = new Map();
  if (items.length < 2) return plan;
  const left = Math.min(...items.map((i) => i.abs.x));
  const right = Math.max(...items.map((i) => i.abs.x + i.abs.w));
  const top = Math.min(...items.map((i) => i.abs.y));
  const bottom = Math.max(...items.map((i) => i.abs.y + i.abs.h));
  for (const it of items) {
    let dx = 0, dy = 0;
    if (mode === "left") dx = left - it.abs.x;
    else if (mode === "right") dx = right - it.abs.w - it.abs.x;
    else if (mode === "center") dx = (left + right) / 2 - it.abs.w / 2 - it.abs.x;
    else if (mode === "top") dy = top - it.abs.y;
    else if (mode === "bottom") dy = bottom - it.abs.h - it.abs.y;
    else dy = (top + bottom) / 2 - it.abs.h / 2 - it.abs.y;
    plan.set(it.id, { x: it.rel.x + dx, y: it.rel.y + dy });
  }
  return plan;
}

/** Equal gaps between neighbours, the outermost two staying put; needs three nodes. */
export function planDistribute(scene: Scene, ids: Iterable<string>, mode: DistributeMode): Plan {
  const items = movable(scene, ids);
  const plan: Plan = new Map();
  if (items.length < 3) return plan;
  const h = mode === "horizontal";
  const pos = (i: (typeof items)[number]) => (h ? i.abs.x : i.abs.y);
  const size = (i: (typeof items)[number]) => (h ? i.abs.w : i.abs.h);
  const sorted = [...items].sort((a, b) => pos(a) - pos(b));
  const start = pos(sorted[0]!);
  const end = Math.max(...sorted.map((i) => pos(i) + size(i)));
  const gap = (end - start - sorted.reduce((s, i) => s + size(i), 0)) / (sorted.length - 1);
  let at = start;
  for (const it of sorted) {
    const d = at - pos(it);
    plan.set(it.id, { x: it.rel.x + (h ? d : 0), y: it.rel.y + (h ? 0 : d) });
    at += size(it) + gap;
  }
  return plan;
}
