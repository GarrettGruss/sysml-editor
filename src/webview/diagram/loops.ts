/**
 * Self-transitions (design D24): each one gets its own loop outside the node, on the right, left, bottom and top
 * border in turn; several loops on one side nest and grow outward. The labels of a side are wrapped and stacked
 * beyond its outermost loop, so no two labels overlap. No DOM: the same plan sizes the space the layout reserves.
 */
import { wrapText, type Box, type Measure, type Pt } from "./geometry.js";
import { LABEL_LINE } from "./labels.js";

/** Default label width; a label is wrapped to it. */
export const LABEL_WRAP_W = 200;
/** First loop's distance from the border, and the growth for each further loop on the same side. */
const LOOP_D0 = 24;
const LOOP_STEP = 14;
const LABEL_GAP = 6;
const STACK_GAP = 3;

export interface SelfLoop {
  pts: Pt[];
  /** The label's box (when the edge has a label) and its wrapped lines. */
  label?: Box;
  lines: string[];
}

export interface LoopExtent { l: number; r: number; t: number; b: number }

/** The lines of an automatically placed label and the box size they need. */
export function labelSize(text: string, measure: Measure): { lines: string[]; w: number; h: number } {
  const lines = wrapText(text, LABEL_WRAP_W, measure, "small");
  return { lines, w: Math.ceil(Math.max(...lines.map((l) => measure(l, "small")))) + 4, h: Math.max(13, lines.length * LABEL_LINE + 1) };
}

const SIDES = ["R", "L", "B", "T"] as const;
type LoopSide = (typeof SIDES)[number];

/** Loops and labels for the self-transitions of one node, in order (`labels[i]` is the label of loop i, if any). */
export function planSelfLoops(box: Box, labels: readonly (string | undefined)[], measure: Measure): SelfLoop[] {
  const out: SelfLoop[] = labels.map(() => ({ pts: [], lines: [] }));
  const bySide = new Map<LoopSide, number[]>();
  labels.forEach((_, i) => {
    const s = SIDES[i % 4]!;
    bySide.set(s, [...(bySide.get(s) ?? []), i]);
  });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  for (const [side, ids] of bySide) {
    const n = ids.length;
    const horizontal = side === "R" || side === "L";
    const half = Math.max(3, (horizontal ? box.h : box.w) / 2 - 6);
    const dir = side === "R" || side === "B" ? 1 : -1;
    const edge = side === "R" ? box.x + box.w : side === "L" ? box.x : side === "B" ? box.y + box.h : box.y;
    const reach = (j: number) => LOOP_D0 + LOOP_STEP * j;
    ids.forEach((id, j) => {
      const hs = (half * (j + 1)) / n;
      const d = dir * reach(j);
      out[id]!.pts = horizontal
        ? [{ x: edge, y: cy - hs }, { x: edge + d, y: cy - hs }, { x: edge + d, y: cy + hs }, { x: edge, y: cy + hs }]
        : [{ x: cx - hs, y: edge }, { x: cx - hs, y: edge + d }, { x: cx + hs, y: edge + d }, { x: cx + hs, y: edge }];
    });
    // The labels of the side, stacked beyond the outermost loop (outermost loop first: its upper attachment is the highest).
    const sized = ids.map((id) => (labels[id] !== undefined && labels[id] !== "" ? labelSize(labels[id]!, measure) : undefined));
    const beyond = edge + dir * (reach(n - 1) + LABEL_GAP);
    const order = [...ids.keys()].reverse();
    const total = order.reduce((h, j) => h + (sized[j] ? sized[j]!.h + STACK_GAP : 0), 0) - STACK_GAP;
    let pos = horizontal ? cy - total / 2 : side === "B" ? beyond : beyond - total;
    for (const j of order) {
      const s = sized[j];
      if (!s) continue;
      const item = out[ids[j]!]!;
      item.lines = s.lines;
      if (horizontal) item.label = { x: side === "R" ? beyond : beyond - s.w, y: pos, w: s.w, h: s.h };
      else item.label = { x: cx - s.w / 2, y: pos, w: s.w, h: s.h };
      pos += s.h + STACK_GAP;
    }
  }
  return out;
}

/** How far the loops and labels of a node reach beyond its box on each side. */
export function loopExtent(w: number, h: number, labels: readonly (string | undefined)[], measure: Measure): LoopExtent {
  const box = { x: 0, y: 0, w, h };
  const ext = { l: 0, r: 0, t: 0, b: 0 };
  const grow = (b: Box) => {
    ext.l = Math.max(ext.l, -b.x);
    ext.t = Math.max(ext.t, -b.y);
    ext.r = Math.max(ext.r, b.x + b.w - w);
    ext.b = Math.max(ext.b, b.y + b.h - h);
  };
  for (const lp of planSelfLoops(box, labels, measure)) {
    for (const p of lp.pts) grow({ x: p.x, y: p.y, w: 0, h: 0 });
    if (lp.label) grow(lp.label);
  }
  return { l: Math.ceil(ext.l), r: Math.ceil(ext.r), t: Math.ceil(ext.t), b: Math.ceil(ext.b) };
}
