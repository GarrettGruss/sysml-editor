/**
 * Layout of a Sequence View (design D17): lifelines are columns whose order and widths are the stored
 * node `x` and `w`; the vertical position of every message is computed here from its time order
 * and is never stored. No DOM: text measuring is injected. A dedicated function rather than the layered
 * graph layout, because a sequence diagram has no graph structure to lay out: only an order of columns
 * and an order of rows (see design.md, "Sequence layout: decision").
 */
import type { ViewModel } from "../../diagram/view-model.js";
import { describeBox, type Box, type Measure, type Pt } from "./geometry.js";
import type { LayoutResult } from "./layout.js";

export const SEQ_GAP = 70;
export const SEQ_MIN_GAP = 24;
/** Space between the lifeline heads and the first message, and between messages. */
export const SEQ_FIRST = 38;
export const SEQ_ROW = 50;
export const SEQ_TAIL = 28;
export const SEQ_SELF_W = 38;
export const SEQ_SELF_H = 20;

/** The messages of the view in time order. Edges without an order (not messages) are not routed. */
export function messageRows(vm: ViewModel): ViewModel["edges"] {
  return vm.edges.filter((e) => e.order !== undefined).sort((a, b) => a.order! - b.order! || (a.id < b.id ? -1 : 1));
}

export function layoutSequence(vm: ViewModel, measure: Measure): LayoutResult {
  const boxes = new Map<string, Box>();
  const placed = new Set<string>();
  const mins = new Map<string, { w: number; h: number }>();
  const routes = new Map<string, Pt[]>();
  const natural = new Map(vm.nodes.map((n) => [n.id, describeBox(n, measure)] as const));
  const stored = vm.nodes.filter((n) => n.geometry?.x !== undefined).sort((a, b) => a.geometry!.x! - b.geometry!.x! || (a.id < b.id ? -1 : 1));
  const loose = vm.nodes.filter((n) => n.geometry?.x === undefined);
  const looseW = Math.ceil(Math.max(0, ...loose.map((n) => natural.get(n.id)!.w)));
  const headH = Math.max(40, ...vm.nodes.map((n) => natural.get(n.id)!.headerH));
  const rows = messageRows(vm);
  const lastRowY = headH + SEQ_FIRST + Math.max(0, rows.length - 1) * SEQ_ROW;
  const height = rows.length ? lastRowY + SEQ_SELF_H + SEQ_TAIL : headH + 80;

  let right = -Infinity;
  const put = (id: string, x: number, w: number) => {
    boxes.set(id, { x, y: 0, w, h: height });
    right = x + w;
  };
  for (const n of stored) {
    const w = Math.ceil(Math.max(n.geometry?.w ?? 0, natural.get(n.id)!.w));
    // Columns never overlap, whatever was stored: a stored position that would overlap moves right.
    put(n.id, Math.round(Math.max(n.geometry!.x!, right === -Infinity ? -Infinity : right + SEQ_MIN_GAP)), w);
  }
  // Unplaced lifelines follow in model order, evenly spaced by one common width.
  const sameW = looseW || 120;
  loose.forEach((n) => {
    const w = Math.max(sameW, Math.ceil(natural.get(n.id)!.w));
    placed.add(n.id);
    put(n.id, right === -Infinity ? 20 : right + SEQ_GAP, w);
  });
  for (const n of vm.nodes) mins.set(n.id, { w: Math.ceil(natural.get(n.id)!.w), h: height });

  rows.forEach((e, i) => {
    const s = boxes.get(e.source), t = boxes.get(e.target);
    if (!s || !t) return;
    const y = Math.round(headH + SEQ_FIRST + i * SEQ_ROW);
    const sx = Math.round(s.x + s.w / 2), tx = Math.round(t.x + t.w / 2);
    routes.set(e.id, e.source === e.target
      ? [{ x: sx, y }, { x: sx + SEQ_SELF_W, y }, { x: sx + SEQ_SELF_W, y: y + SEQ_SELF_H }, { x: sx, y: y + SEQ_SELF_H }]
      : [{ x: sx, y }, { x: tx, y }]);
  });
  return { boxes, placed, mins, routes };
}
