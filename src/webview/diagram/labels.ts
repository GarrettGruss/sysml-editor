/** Layout of the labels drawn on lines: a stored offset from the route's anchor, an optional size, wrapping. No DOM. */
import type { LabelLayout } from "../../diagram/format.js";
import { wrapText, type Box, type Measure, type Pt } from "./geometry.js";

export type { LabelLayout };

export const LABEL_LINE = 12;
export const LABEL_H = 13;
export const MIN_LABEL_W = 24;
export const LABEL_HANDLE = 8;

/** The middle of the route's longest segment (the first one when several tie): the label follows it when the route changes. */
export function labelAnchor(pts: readonly Pt[]): Pt {
  let best = 0, bestLen = -1;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.abs(pts[i]!.x - pts[i - 1]!.x) + Math.abs(pts[i]!.y - pts[i - 1]!.y);
    if (len > bestLen + 0.01) { best = i - 1; bestLen = len; }
  }
  const a = pts[best] ?? { x: 0, y: 0 }, b = pts[best + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The lines of the label text: wrapped within the box width unless wrapping is off or no width is stored. */
export function labelLines(text: string, layout: LabelLayout | undefined, measure: Measure): string[] {
  if (!layout || layout.w === undefined || layout.wrap === false) return [text];
  return wrapText(text, Math.max(layout.w - 4, 1), measure, "small");
}

/** The box of a label with a stored layout. */
export function laidOutLabel(pts: readonly Pt[], text: string, layout: LabelLayout, measure: Measure): { box: Box; lines: string[] } {
  const lines = labelLines(text, layout, measure);
  const w = layout.w ?? Math.max(...lines.map((l) => measure(l, "small"))) + 4;
  const h = layout.h ?? Math.max(LABEL_H, lines.length * LABEL_LINE + 1);
  const a = labelAnchor(pts);
  return { box: { x: a.x + layout.dx, y: a.y + layout.dy, w, h }, lines };
}

/** The layout that puts a label at `box`; the size is kept only when `sized`. */
export function layoutAt(box: Box, pts: readonly Pt[], sized: boolean, wrap?: boolean): LabelLayout {
  const a = labelAnchor(pts);
  const out: LabelLayout = { dx: round(box.x - a.x), dy: round(box.y - a.y) };
  if (sized) { out.w = round(box.w); out.h = round(box.h); }
  if (wrap === false) out.wrap = false;
  return out;
}

export const moveBox = (box: Box, dx: number, dy: number): Box => ({ ...box, x: box.x + dx, y: box.y + dy });

/** Resize from the bottom-right corner. */
export const resizeBox = (box: Box, dx: number, dy: number): Box => ({ ...box, w: Math.max(MIN_LABEL_W, box.w + dx), h: Math.max(LABEL_H, box.h + dy) });

const round = (n: number): number => Math.round(n * 100) / 100;

/** The two handles of a label: move at the top-left corner, resize at the bottom-right. */
export function labelHandleBoxes(b: Box, size = LABEL_HANDLE): { move: Box; resize: Box } {
  const at = (cx: number, cy: number): Box => ({ x: cx - size / 2, y: cy - size / 2, w: size, h: size });
  return { move: at(b.x, b.y), resize: at(b.x + b.w, b.y + b.h) };
}

const inside = (b: Box, p: Pt, slop: number) => p.x >= b.x - slop && p.x <= b.x + b.w + slop && p.y >= b.y - slop && p.y <= b.y + b.h + slop;

/** What of a label lies under `p`: a handle, or its body (which moves it). */
export function labelHit(b: Box, p: Pt, zoom = 1): "resize" | "move" | "body" | undefined {
  const h = labelHandleBoxes(b, LABEL_HANDLE / Math.max(zoom, 0.1) + 4);
  if (inside(h.resize, p, 0)) return "resize";
  if (inside(h.move, p, 0)) return "move";
  return inside(b, p, 0) ? "body" : undefined;
}

/** The layout after toggling wrapping (a layout is created from the current box when there is none). */
export function toggleWrap(cur: LabelLayout | undefined, box: Box, pts: readonly Pt[]): LabelLayout {
  const base = cur ?? layoutAt(box, pts, false);
  const { wrap: _w, ...rest } = base;
  return base.wrap === false ? rest : { ...rest, wrap: false };
}
