/** Orthogonal edge routes and label placement. No DOM, so it is unit tested. */
import type { Box, Pt } from "./geometry.js";

export type Side = "L" | "R" | "U" | "D";

const STUB = 16;
/** Distance of a route's middle segment from a box it passes (the obstacles are already inflated by a margin). */
const LANE = 4;
const horiz = (d: Side) => d === "L" || d === "R";
const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Drop repeated points and middle points of straight runs. */
function clean(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && eq(last.x, p.x) && eq(last.y, p.y)) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1]!, b = out[i]!, c = out[i + 1]!;
    if ((eq(a.x, b.x) && eq(b.x, c.x)) || (eq(a.y, b.y) && eq(b.y, c.y))) out.splice(i, 1);
  }
  return out;
}

const step = (p: Pt, d: Side, n: number): Pt => ({ x: p.x + (d === "R" ? n : d === "L" ? -n : 0), y: p.y + (d === "D" ? n : d === "U" ? -n : 0) });

/** Path from `a` leaving in direction `da` to `b`, which is entered from the side its outward normal `db` faces. */
function path(a: Pt, da: Side, b: Pt, db: Side, mid?: number): Pt[] {
  if (horiz(da) && horiz(db)) {
    const facing = da === "R" && db === "L" ? a.x <= b.x : da === "L" && db === "R" ? a.x >= b.x : false;
    if (facing) {
      if (eq(a.y, b.y)) return [a, b];
      const mx = mid ?? (a.x + b.x) / 2;
      return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
    }
    if (da === db) {
      const x = mid ?? (da === "R" ? Math.max(a.x, b.x) + STUB : Math.min(a.x, b.x) - STUB);
      return [a, { x, y: a.y }, { x, y: b.y }, b];
    }
    const sa = step(a, da, STUB), sb = step(b, db, STUB);
    const my = mid ?? (a.y + b.y) / 2 + (eq(a.y, b.y) ? STUB * 2 : 0);
    return [a, sa, { x: sa.x, y: my }, { x: sb.x, y: my }, sb, b];
  }
  if (!horiz(da) && !horiz(db)) {
    const facing = da === "D" && db === "U" ? a.y <= b.y : da === "U" && db === "D" ? a.y >= b.y : false;
    if (facing) {
      if (eq(a.x, b.x)) return [a, b];
      const my = mid ?? (a.y + b.y) / 2;
      return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
    }
    if (da === db) {
      const y = mid ?? (da === "D" ? Math.max(a.y, b.y) + STUB : Math.min(a.y, b.y) - STUB);
      return [a, { x: a.x, y }, { x: b.x, y }, b];
    }
    const sa = step(a, da, STUB), sb = step(b, db, STUB);
    const mx = mid ?? (a.x + b.x) / 2 + (eq(a.x, b.x) ? STUB * 2 : 0);
    return [a, sa, { x: mx, y: sa.y }, { x: mx, y: sb.y }, sb, b];
  }
  // One horizontal, one vertical: a single bend when both directions agree with where the other end is.
  if (horiz(da)) {
    const ok = (da === "R" ? b.x > a.x : b.x < a.x) && (db === "U" ? a.y < b.y : a.y > b.y);
    if (ok) return [a, { x: b.x, y: a.y }, b];
    const sa = step(a, da, STUB), sb = step(b, db, STUB);
    return [a, sa, { x: sa.x, y: sb.y }, sb, b];
  }
  const ok = (da === "D" ? b.y > a.y : b.y < a.y) && (db === "L" ? a.x < b.x : a.x > b.x);
  if (ok) return [a, { x: a.x, y: b.y }, b];
  const sa = step(a, da, STUB), sb = step(b, db, STUB);
  return [a, sa, { x: sb.x, y: sa.y }, sb, b];
}

const anchor = (b: Box, s: Side, along?: number): Pt =>
  s === "R" ? { x: b.x + b.w, y: along ?? b.y + b.h / 2 }
    : s === "L" ? { x: b.x, y: along ?? b.y + b.h / 2 }
      : s === "D" ? { x: along ?? b.x + b.w / 2, y: b.y + b.h }
        : { x: along ?? b.x + b.w / 2, y: b.y };

const opposite: Record<Side, Side> = { L: "R", R: "L", U: "D", D: "U" };

/** Whether `inner` lies inside `outer`. */
export const contains = (outer: Box, inner: Box, tol = 0.5): boolean =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;

/** The side of `owner` a box (a port) sits on, as the direction pointing away from the owner. */
export function outwardSide(port: Box, owner: Box): Side {
  const cx = port.x + port.w / 2, cy = port.y + port.h / 2;
  const d: [Side, number][] = [["L", Math.abs(cx - owner.x)], ["R", Math.abs(cx - owner.x - owner.w)], ["U", Math.abs(cy - owner.y)], ["D", Math.abs(cy - owner.y - owner.h)]];
  return d.sort((p, q) => p[1] - q[1])[0]![0];
}

/** Collinear overlap of two axis-aligned segments, in px (0 when they are not on one line or only touch). */
export function collinearOverlap(p: Pt, q: Pt, r: Pt, t: Pt, tol = 1): number {
  if (Math.abs(p.y - q.y) < 0.01 && Math.abs(r.y - t.y) < 0.01 && Math.abs(p.y - r.y) < tol)
    return Math.max(0, Math.min(Math.max(p.x, q.x), Math.max(r.x, t.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, t.x)));
  if (Math.abs(p.x - q.x) < 0.01 && Math.abs(r.x - t.x) < 0.01 && Math.abs(p.x - r.x) < tol)
    return Math.max(0, Math.min(Math.max(p.y, q.y), Math.max(r.y, t.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, t.y)));
  return 0;
}

/** Overlaps beyond this many px count as running on top of another edge. */
export const OVERLAP_MIN = 4;
/** End points closer than this are "the same attachment point". */
const SHARED_POINT = 6;

/** How many segments of `r` run on top of a segment of another route, plus how many of its ends share a point with another route's end. */
export function overlapsWith(r: readonly Pt[], others: readonly (readonly Pt[])[]): number {
  let n = 0;
  for (const o of others) {
    for (let i = 1; i < r.length; i++) for (let j = 1; j < o.length; j++) if (collinearOverlap(r[i - 1]!, r[i]!, o[j - 1]!, o[j]!) > OVERLAP_MIN) n++;
    for (const e of [r[0]!, r[r.length - 1]!]) for (const f of [o[0]!, o[o.length - 1]!]) if (Math.abs(e.x - f.x) < SHARED_POINT && Math.abs(e.y - f.y) < SHARED_POINT) n++;
  }
  return n;
}

/** Where along a side an end may attach: the middle first, then spread to the quarters. */
const ALONG = [0.5, 0.25, 0.75];

/**
 * An orthogonal route with one or two bends (more only when a port faces away from its target):
 * it leaves each end on the side facing the other (or on the given side) and stays outside both boxes.
 * Preference: no collisions with nodes, no overlap with the `others` (routes already drawn) and no shared attachment
 * point, then the fewest bends, then the shortest.
 */
export function routeOrthogonal(a: Box, b: Box, aSide?: Side, bSide?: Side, obstacles: readonly Box[] = [], others: readonly (readonly Pt[])[] = []): Pt[] {
  const first = routeFacing(a, b, aSide, bSide);
  if (!obstacles.length && !others.length) return first;
  // Keep clear of other nodes by a margin, so a route does not run along a border.
  obstacles = obstacles.map((o) => ({ x: o.x - 8, y: o.y - 8, w: o.w + 16, h: o.h + 16 }));
  const nested = contains(a, b) || contains(b, a);
  const collisions = (r: Pt[]) => obstacles.filter((o) => routeThroughBox(r, o)).length + (nested ? 0 : Number(routeThroughBox(r, a) || routeThroughBox(r, b)));
  const length = (r: Pt[]) => r.reduce((n, p, i) => (i ? n + Math.abs(p.x - r[i - 1]!.x) + Math.abs(p.y - r[i - 1]!.y) : 0), 0);
  // An end away from the middle of its side only wins over a middle one when nothing else differs but the length.
  const offCentre = (p: Pt, box: Box) => Number(Math.abs(p.x - (box.x + box.w / 2)) > 1 && Math.abs(p.y - (box.y + box.h / 2)) > 1);
  const cost = (r: Pt[]): number[] => [collisions(r), overlapsWith(r, others), r.length, offCentre(r[0]!, a) + offCentre(r[r.length - 1]!, b), length(r)];
  const better = (c: number[], than: number[]) => {
    for (let i = 0; i < 4; i++) if (c[i] !== than[i]) return c[i]! < than[i]!;
    return c[4]! < than[4]! - 0.01;
  };
  let bestCost = cost(first);
  if (bestCost[0] === 0 && bestCost[1] === 0) return first;
  // Candidate lanes for the middle segment: halfway, and just outside every box that could be in the way.
  // Only boxes near the two ends matter, which keeps the search small in large diagrams.
  const area = { x: Math.min(a.x, b.x) - 40, y: Math.min(a.y, b.y) - 40, w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x) + 80, h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) + 80 };
  const boxes = [a, b, ...obstacles.filter((o) => rectsOverlap(o, area))];
  const lanesX = new Set<number>(), lanesY = new Set<number>();
  for (const o of boxes) { lanesX.add(o.x - LANE); lanesX.add(o.x + o.w + LANE); lanesY.add(o.y - LANE); lanesY.add(o.y + o.h + LANE); }
  let best = first;
  const sides: Side[] = ["L", "R", "U", "D"];
  const along = (box: Box, s: Side, f: number) => (horiz(s) ? box.y + box.h * f : box.x + box.w * f);
  // A given side (a port) keeps its fixed anchor; a free side may attach at several places along it.
  const fracs = (given: Side | undefined) => (given ? [undefined] : ALONG);
  for (const sa of aSide ? [aSide] : sides) for (const sb of bSide ? [bSide] : sides) for (const fa of fracs(aSide)) for (const fb of fracs(bSide)) {
    const pa = anchor(a, sa, fa === undefined ? undefined : along(a, sa, fa)), pb = anchor(b, sb, fb === undefined ? undefined : along(b, sb, fb));
    // Only routes with both ends horizontal or both vertical have a middle segment to move onto a lane.
    const mids: (number | undefined)[] = horiz(sa) === horiz(sb) ? [undefined, ...lanesX, ...lanesY] : [undefined];
    for (const m of mids) {
      const r = clean(path(pa, sa, pb, sb, m));
      const c = cost(r);
      if (better(c, bestCost)) { best = r; bestCost = c; }
    }
  }
  return best;
}

function routeFacing(a: Box, b: Box, aSide?: Side, bSide?: Side): Pt[] {
  const gapX = b.x - (a.x + a.w) > 0 ? b.x - (a.x + a.w) : a.x - (b.x + b.w) > 0 ? a.x - (b.x + b.w) : 0;
  const gapY = b.y - (a.y + a.h) > 0 ? b.y - (a.y + a.h) : a.y - (b.y + b.h) > 0 ? a.y - (b.y + b.h) : 0;
  const bRight = b.x > a.x + a.w - 0.01 && gapX > 0;
  const bBelow = b.y > a.y + a.h - 0.01 && gapY > 0;
  let sa = aSide, sb = bSide;
  if (!sa || !sb) {
    if (gapX > 0 && gapY > 0 && !aSide && !bSide) {
      sa = bRight ? "R" : "L";
      sb = bBelow ? "U" : "D";
    } else if (gapX > 0 && (gapY === 0 || gapX >= gapY || aSide || bSide)) {
      sa ??= bRight ? "R" : "L";
      sb ??= bRight ? "L" : "R";
    } else if (gapY > 0) {
      sa ??= bBelow ? "D" : "U";
      sb ??= bBelow ? "U" : "D";
    } else {
      // Touching or overlapping boxes: face each other along the longer distance between centres.
      const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
      if (Math.abs(dx) >= Math.abs(dy)) { sa ??= dx >= 0 ? "R" : "L"; sb ??= dx >= 0 ? "L" : "R"; }
      else { sa ??= dy >= 0 ? "D" : "U"; sb ??= dy >= 0 ? "U" : "D"; }
    }
  }
  // Without a given side on both ends and a clear gap on an axis, align to the common range for a straight line.
  let ya: number | undefined, yb: number | undefined;
  if (!aSide && !bSide) {
    if (horiz(sa) && horiz(sb)) {
      const lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.h, b.y + b.h);
      if (hi - lo >= 4) ya = yb = (lo + hi) / 2;
    } else if (!horiz(sa) && !horiz(sb)) {
      const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w);
      if (hi - lo >= 4) ya = yb = (lo + hi) / 2;
    }
  }
  return clean(path(anchor(a, sa, ya), sa, anchor(b, sb, yb), sb));
}

export const isOrthogonal = (pts: readonly Pt[]): boolean => pts.every((p, i) => i === 0 || eq(p.x, pts[i - 1]!.x) || eq(p.y, pts[i - 1]!.y));

/** Whether an axis-aligned segment passes through the interior of a box (a 1 px rim does not count). */
export function segmentThroughBox(p: Pt, q: Pt, box: Box, rim = 1): boolean {
  const x0 = box.x + rim, y0 = box.y + rim, x1 = box.x + box.w - rim, y1 = box.y + box.h - rim;
  if (x1 <= x0 || y1 <= y0) return false;
  const lx = Math.min(p.x, q.x), hx = Math.max(p.x, q.x), ly = Math.min(p.y, q.y), hy = Math.max(p.y, q.y);
  return hx > x0 && lx < x1 && hy > y0 && ly < y1;
}

export const routeThroughBox = (pts: readonly Pt[], box: Box): boolean => pts.some((p, i) => i > 0 && segmentThroughBox(pts[i - 1]!, p, box));

const onBorder = (p: Pt, b: Box, tol: number): boolean => {
  const inX = p.x >= b.x - tol && p.x <= b.x + b.w + tol;
  const inY = p.y >= b.y - tol && p.y <= b.y + b.h + tol;
  return inX && inY && (Math.abs(p.x - b.x) <= tol || Math.abs(p.x - b.x - b.w) <= tol || Math.abs(p.y - b.y) <= tol || Math.abs(p.y - b.y - b.h) <= tol);
};

/** A stored or computed route is kept only while it still joins the borders of the two end boxes. */
export function routeFits(pts: readonly Pt[] | undefined, src: Box, tgt: Box, tol = 1.5): pts is Pt[] {
  if (!pts || pts.length < 2 || !pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  if (!isOrthogonal(pts)) return false;
  if (!onBorder(pts[0]!, src, tol) || !onBorder(pts[pts.length - 1]!, tgt, tol)) return false;
  const nested = contains(src, tgt) || contains(tgt, src);
  return nested || (!routeThroughBox(pts, src) && !routeThroughBox(pts, tgt));
}

export interface EdgeEnd { box: Box; /** For a port: its owner's box. */ owner?: Box }

/** The route to draw: the stored (or ELK) one while it fits, otherwise a computed orthogonal one. */
export function edgeRoute(src: EdgeEnd, tgt: EdgeEnd, stored?: readonly Pt[], obstacles: readonly Box[] = [], others: readonly (readonly Pt[])[] = []): Pt[] {
  if (routeFits(stored as Pt[] | undefined, src.box, tgt.box)) return clean(stored!.map((p) => ({ x: p.x, y: p.y })));
  const sa = src.owner ? outwardSide(src.box, src.owner) : undefined;
  const sb = tgt.owner ? outwardSide(tgt.box, tgt.owner) : undefined;
  return routeOrthogonal(src.box, tgt.box, sa, sb, obstacles, others);
}

export interface Rect extends Box {}
const hit = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const rectsOverlap = hit;

/** Whether a label box is crossed by any segment of the route (a 1 px rim does not count). */
export function labelOnRoute(label: Box, pts: readonly Pt[]): boolean {
  return pts.some((p, i) => i > 0 && segmentThroughBox(pts[i - 1]!, p, label));
}

export interface LabelContext {
  /** Every node box: a label keeps off all of them. */
  nodes?: readonly Box[];
  /** Boxes of containers (nodes with children): a label inside one is fine, it only keeps off the container's border. */
  containers?: readonly Box[];
  /** The routes of the other edges. */
  routes?: readonly (readonly Pt[])[];
  /** Labels already placed. */
  labels?: readonly Box[];
}

const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });

/**
 * A box of `w` x `h` beside the edge: every segment is tried (the longest first), at several places along it and on
 * both sides. The first spot that is off the edge's own line, at least 4 px from every node (a container that holds the
 * label only counts by its border), off other edges' lines and off other labels wins. When every spot touches something, the
 * least bad one: first without the other labels and edges, then with a 2 px node margin, then merely off the nodes.
 * `avoid` are boxes (the end nodes) always kept clear of, on top of `ctx.nodes`.
 */
export function placeLabel(pts: readonly Pt[], w: number, h: number, avoid: readonly Box[], ctx: LabelContext = {}): Rect {
  const segs = pts.slice(1).map((q, i) => ({ p: pts[i]!, q, len: Math.abs(q.x - pts[i]!.x) + Math.abs(q.y - pts[i]!.y) })).sort((s, t) => t.len - s.len);
  const cands: Rect[] = [];
  for (const s of segs) {
    for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const mx = s.p.x + (s.q.x - s.p.x) * t, my = s.p.y + (s.q.y - s.p.y) * t;
      if (eq(s.p.y, s.q.y)) cands.push({ x: mx - w / 2, y: my - h - 3, w, h }, { x: mx - w / 2, y: my + 3, w, h });
      else cands.push({ x: mx + 4, y: my - h / 2, w, h }, { x: mx - w - 4, y: my - h / 2, w, h });
    }
  }
  const off = cands.filter((c) => !labelOnRoute(c, pts));
  const holds = new Set(ctx.containers ?? []);
  const nodeFree = (c: Rect, margin: number) =>
    !avoid.some((n) => hit(c, grow(n, margin))) && !(ctx.nodes ?? []).some((n) => hit(c, grow(n, margin)) && !(holds.has(n) && contains(n, c)));
  const othersFree = (c: Rect) => !(ctx.routes ?? []).some((r) => labelOnRoute(grow(c, 1), r)) && !(ctx.labels ?? []).some((l) => hit(c, grow(l, 1)));
  return (
    off.find((c) => nodeFree(c, 4) && othersFree(c)) ??
    off.find((c) => nodeFree(c, 4)) ??
    off.find((c) => nodeFree(c, 2)) ??
    off.find((c) => nodeFree(c, 0)) ??
    off[0] ?? cands[0] ?? { x: 0, y: 0, w, h }
  );
}
