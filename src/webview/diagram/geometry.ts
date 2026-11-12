/** Pure geometry and text-fitting for the diagram renderer: no DOM, so it is unit tested. */
import type { VmNode, ViewModel } from "../../diagram/view-model.js";

export interface Box { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
/** Width in pixels of `text` in the diagram font. */
export type Measure = (text: string, style: TextStyle) => number;
export type TextStyle = "normal" | "bold" | "italic" | "small";

export const FONT_FAMILY = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const FONT_SIZE = 12;
export const SMALL_SIZE = 10;
export const PAD = 10;
export const PORT_SIZE = 14;
export const MIN_NODE_W = 90;
export const WRAP_W = 240;
const ROW = 16;
const TAB_H = 16;

export type RowKind = "keyword" | "label" | "doc" | "ctitle" | "cline" | "warn";
export interface Row { kind: RowKind; text: string; /** Baseline y within the node. */ y: number; style: TextStyle }
export interface BoxContent {
  /** Natural width and height to hold all text. */
  w: number;
  h: number;
  /** Height of the part above the area for nested nodes. */
  headerH: number;
  rows: Row[];
  /** Divider line y positions (before each compartment, below a requirement label). */
  dividers: number[];
}

/** Break text into lines no wider than `max`, at spaces; a single long word is split by characters. */
export function wrapText(text: string, max: number, measure: Measure, style: TextStyle = "normal"): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (measure(w, style) > max && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && measure(w.slice(0, n), style) > max) n--;
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (line && measure(next, style) > max) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

/** Rows, dividers and natural size of a node box, from its text only. */
export function describeBox(n: VmNode, measure: Measure): BoxContent {
  const rows: Row[] = [];
  const dividers: number[] = [];
  let y = n.shape === "package" ? TAB_H : 0;
  let w = 0;
  const push = (kind: RowKind, text: string, style: TextStyle, height = ROW) => {
    y += height;
    rows.push({ kind, text, y: y - 4, style });
    w = Math.max(w, measure(text, style));
  };
  y += 4;
  if (n.keyword) push("keyword", n.keyword, "italic");
  push("label", n.label, "bold", 18);
  if (n.shape === "unresolved") {
    push("warn", "unresolved", "italic");
    for (const l of wrapText(n.unresolvedRef ?? "", WRAP_W, measure, "small")) push("warn", l, "small", 14);
  }
  let headerH = y + 4;
  if (n.doc) {
    y += 4;
    dividers.push(y);
    y += 2;
    for (const l of wrapText(n.doc, WRAP_W, measure)) push("doc", l, "normal");
    headerH = y + 4;
  }
  for (const c of n.compartments ?? []) {
    y += 4;
    dividers.push(y);
    y += 2;
    push("ctitle", c.title, "italic");
    for (const l of c.lines) push("cline", l, "normal");
  }
  return { w: Math.max(MIN_NODE_W, Math.ceil(w) + 2 * PAD), h: y + 8, headerH, rows, dividers };
}

/** Where on the box border the line from the centre towards `to` leaves it. */
export function clipToBox(b: Box, to: Pt): Pt {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Polyline from the source border to the target border through optional bend points. */
export function routeEdge(src: Box, tgt: Box, bends: readonly Pt[] = []): Pt[] {
  const first = bends[0] ?? centre(tgt);
  const last = bends[bends.length - 1] ?? centre(src);
  return [clipToBox(src, first), ...bends, clipToBox(tgt, last)];
}

/** Three points of an arrow head: the tip, and the two wings behind it (towards `from`). */
export function headPoints(tip: Pt, from: Pt, len: number, half: number): [Pt, Pt, Pt] {
  const dx = from.x - tip.x;
  const dy = from.y - tip.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const bx = tip.x + ux * len;
  const by = tip.y + uy * len;
  return [tip, { x: bx - uy * half, y: by + ux * half }, { x: bx + uy * half, y: by - ux * half }];
}

/** Four points of a diamond at `tip` pointing along the line away from `from`. */
export function diamondPoints(tip: Pt, from: Pt, len: number, half: number): [Pt, Pt, Pt, Pt] {
  const [t, a, b] = headPoints(tip, from, len / 2, half);
  const dx = from.x - tip.x;
  const dy = from.y - tip.y;
  const d = Math.hypot(dx, dy) || 1;
  return [t, a, { x: tip.x + (dx / d) * len, y: tip.y + (dy / d) * len }, b];
}

/** Absolute boxes: stored/laid-out boxes are relative to the parent (ports: to their owner). */
export function absoluteBoxes(vm: ViewModel, rel: ReadonlyMap<string, Box>): Map<string, Box> {
  const byId = new Map(vm.nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, Box>();
  const visit = (id: string, guard = 0): Box | undefined => {
    const done = out.get(id);
    if (done) return done;
    const n = byId.get(id);
    const r = rel.get(id);
    if (!n || !r || guard > 100) return undefined;
    const pid = n.attachedTo ?? n.parent;
    const p = pid !== undefined ? visit(pid, guard + 1) : undefined;
    const b = { x: r.x + (p?.x ?? 0), y: r.y + (p?.y ?? 0), w: r.w, h: r.h };
    out.set(id, b);
    return b;
  };
  for (const n of vm.nodes) visit(n.id);
  return out;
}

const area = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Number of overlapping pairs among siblings (same parent; ports compared with ports of the same owner). */
export function countOverlaps(vm: ViewModel, abs: ReadonlyMap<string, Box>): number {
  const groups = new Map<string, Box[]>();
  for (const n of vm.nodes) {
    const b = abs.get(n.id);
    if (!b) continue;
    const key = n.attachedTo !== undefined ? `port:${n.attachedTo}` : `node:${n.parent ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  let count = 0;
  for (const list of groups.values())
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (area(list[i]!, list[j]!) > 0.5) count++;
  return count;
}

export function boundsOf(boxes: Iterable<Box>, margin = 0): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: x0 - margin, y: y0 - margin, w: x1 - x0 + 2 * margin, h: y1 - y0 + 2 * margin };
}
