/** Editing an orthogonal route by hand (draw.io conventions): segment and bend drags, new bends. No DOM, so it is unit tested. */
import type { Box, Pt } from "./geometry.js";
import { clean, onBorder, routeFits } from "./routing.js";

/** Longest stub left at a node when an end segment is dragged past the node's edge. */
export const STUB_MAX = 20;
/** Size of the step a double-click adds to a straight segment. */
export const JOG = 16;

const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
export const isHorizontal = (a: Pt, b: Pt): boolean => eq(a.y, b.y);

/** Segment `i` (from point `i` to `i + 1`) moved by `d` perpendicular to its direction, before the route is simplified. `inserted` points were added before it. */
function dragRaw(pts: readonly Pt[], i: number, d: number, src: Box, tgt: Box): { pts: Pt[]; inserted: number } {
  const n = pts.length;
  const horiz = isHorizontal(pts[i]!, pts[i + 1]!);
  const shift = (p: Pt): Pt => (horiz ? { x: p.x, y: p.y + d } : { x: p.x + d, y: p.y });
  // An end of the route stays on its node's border. When the moved segment would leave the border, the route keeps its end
  // and a stub leads out of the node first, so the segment goes around the node and meets the border orthogonally.
  const end = (p: Pt, q: Pt, box: Box): Pt[] => {
    const moved = shift(p);
    if (onBorder(moved, box, 1.5)) return [moved];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1) return [moved];
    const k = Math.min(STUB_MAX, len / 2);
    const s = { x: p.x + ((q.x - p.x) / len) * k, y: p.y + ((q.y - p.y) / len) * k };
    return [p, s, shift(s)];
  };
  const head = i === 0 ? end(pts[0]!, pts[1]!, src) : [shift(pts[i]!)];
  const tail = i === n - 2 ? end(pts[n - 1]!, pts[n - 2]!, tgt).reverse() : [shift(pts[i + 1]!)];
  const out = [...pts.slice(0, i).map((p) => ({ ...p })), ...head, ...tail, ...pts.slice(i + 2).map((p) => ({ ...p }))];
  return { pts: out, inserted: head.length - 1 };
}

/** Move segment `i` by `d` perpendicular to its direction; the neighbours stretch, collinear bends are removed. */
export function dragSegment(pts: readonly Pt[], i: number, d: number, src: Box, tgt: Box): Pt[] {
  if (i < 0 || i >= pts.length - 1) return pts.map((p) => ({ ...p }));
  return clean(dragRaw(pts, i, d, src, tgt).pts);
}

/** Move the bend point `k` (an inner point) by (dx, dy): the two segments meeting there stretch. */
export function dragBend(pts: readonly Pt[], k: number, dx: number, dy: number, src: Box, tgt: Box): Pt[] {
  if (k < 1 || k > pts.length - 2) return pts.map((p) => ({ ...p }));
  const first = isHorizontal(pts[k - 1]!, pts[k]!);
  const a = dragRaw(pts, k - 1, first ? dy : dx, src, tgt);
  const b = dragRaw(a.pts, k + a.inserted, first ? dx : dy, src, tgt);
  return clean(b.pts);
}

/** Distance from `p` to the segment `a`-`b`, and the nearest point on it. */
export function nearestOnSegment(p: Pt, a: Pt, b: Pt): { d: number; at: Pt; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const at = { x: a.x + t * dx, y: a.y + t * dy };
  return { d: Math.hypot(p.x - at.x, p.y - at.y), at, t };
}

/** The segment nearest to `p`, within `reach`. */
export function segmentAt(pts: readonly Pt[], p: Pt, reach: number): { index: number; at: Pt } | undefined {
  let best: { index: number; at: Pt; d: number } | undefined;
  for (let i = 1; i < pts.length; i++) {
    const r = nearestOnSegment(p, pts[i - 1]!, pts[i]!);
    if (r.d <= reach && (!best || r.d < best.d)) best = { index: i - 1, at: r.at, d: r.d };
  }
  return best && { index: best.index, at: best.at };
}

/** A bend point added at `at` (on the segment nearest to it): the rest of the segment steps aside by `jog`, the route stays orthogonal. Undefined when no valid route results. */
export function addBend(pts: readonly Pt[], at: Pt, src: Box, tgt: Box, jog = JOG): Pt[] | undefined {
  const s = segmentAt(pts, at, Infinity);
  if (!s) return undefined;
  const a = pts[s.index]!, b = pts[s.index + 1]!;
  if (Math.hypot(b.x - a.x, b.y - a.y) < 2 * 4) return undefined;
  // `at` twice: the first stays, the second steps aside with the rest of the segment, which leaves the jog between them.
  const split = [...pts.slice(0, s.index + 1), s.at, s.at, ...pts.slice(s.index + 1)];
  for (const d of [jog, -jog]) {
    const r = clean(dragRaw(split, s.index + 2, d, src, tgt).pts);
    if (routeFits(r, src, tgt)) return r;
  }
  return undefined;
}

export type RouteHandle = { kind: "bend"; index: number; at: Pt } | { kind: "segment"; index: number; at: Pt };

/** Handles of a selected route: a bend handle on every inner point, a handle in the middle of every segment. */
export function routeHandles(pts: readonly Pt[]): RouteHandle[] {
  const out: RouteHandle[] = [];
  for (let k = 1; k < pts.length - 1; k++) out.push({ kind: "bend", index: k, at: pts[k]! });
  for (let i = 0; i < pts.length - 1; i++) out.push({ kind: "segment", index: i, at: { x: (pts[i]!.x + pts[i + 1]!.x) / 2, y: (pts[i]!.y + pts[i + 1]!.y) / 2 } });
  return out;
}

/** The handle under `p` (bend handles win over segment handles). */
export function routeHandleAt(pts: readonly Pt[], p: Pt, reach: number): RouteHandle | undefined {
  const all = routeHandles(pts);
  const near = (h: RouteHandle) => Math.abs(h.at.x - p.x) <= reach && Math.abs(h.at.y - p.y) <= reach;
  return all.find((h) => h.kind === "bend" && near(h)) ?? all.find((h) => h.kind === "segment" && near(h));
}
