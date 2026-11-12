/** Orthogonal edge routes and label placement. No DOM, so it is unit tested. */
import type { Box, Pt } from "./geometry.js";

export type Side = "L" | "R" | "U" | "D";

const STUB = 16;
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
function path(a: Pt, da: Side, b: Pt, db: Side): Pt[] {
  if (horiz(da) && horiz(db)) {
    const facing = da === "R" && db === "L" ? a.x <= b.x : da === "L" && db === "R" ? a.x >= b.x : false;
    if (facing) {
      if (eq(a.y, b.y)) return [a, b];
      const mx = (a.x + b.x) / 2;
      return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
    }
    if (da === db) {
      const x = da === "R" ? Math.max(a.x, b.x) + STUB : Math.min(a.x, b.x) - STUB;
      return [a, { x, y: a.y }, { x, y: b.y }, b];
    }
    const sa = step(a, da, STUB), sb = step(b, db, STUB);
    const my = (a.y + b.y) / 2 + (eq(a.y, b.y) ? STUB * 2 : 0);
    return [a, sa, { x: sa.x, y: my }, { x: sb.x, y: my }, sb, b];
  }
  if (!horiz(da) && !horiz(db)) {
    const facing = da === "D" && db === "U" ? a.y <= b.y : da === "U" && db === "D" ? a.y >= b.y : false;
    if (facing) {
      if (eq(a.x, b.x)) return [a, b];
      const my = (a.y + b.y) / 2;
      return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
    }
    if (da === db) {
      const y = da === "D" ? Math.max(a.y, b.y) + STUB : Math.min(a.y, b.y) - STUB;
      return [a, { x: a.x, y }, { x: b.x, y }, b];
    }
    const sa = step(a, da, STUB), sb = step(b, db, STUB);
    const mx = (a.x + b.x) / 2 + (eq(a.x, b.x) ? STUB * 2 : 0);
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

/**
 * An orthogonal route with one or two bends (more only when a port faces away from its target):
 * it leaves each end on the side facing the other (or on the given side) and stays outside both boxes.
 */
export function routeOrthogonal(a: Box, b: Box, aSide?: Side, bSide?: Side, obstacles: readonly Box[] = []): Pt[] {
  const first = routeFacing(a, b, aSide, bSide);
  if (!obstacles.length) return first;
  // Keep clear of other nodes by a margin, so a route does not run along a border.
  obstacles = obstacles.map((o) => ({ x: o.x - 8, y: o.y - 8, w: o.w + 16, h: o.h + 16 }));
  const nested = contains(a, b) || contains(b, a);
  const cost = (r: Pt[]) =>
    1000 * obstacles.filter((o) => routeThroughBox(r, o)).length + (nested ? 0 : 1000 * Number(routeThroughBox(r, a) || routeThroughBox(r, b))) +
    r.reduce((n, p, i) => (i ? n + Math.abs(p.x - r[i - 1]!.x) + Math.abs(p.y - r[i - 1]!.y) : 0), 0) + 15 * (r.length - 2);
  let best = first, bestCost = cost(first);
  if (bestCost < 1000) return first;
  const sides: Side[] = ["L", "R", "U", "D"];
  for (const sa of aSide ? [aSide] : sides) for (const sb of bSide ? [bSide] : sides) {
    const r = clean(path(anchor(a, sa), sa, anchor(b, sb), sb));
    const c = cost(r);
    if (c < bestCost) { best = r; bestCost = c; }
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
export function edgeRoute(src: EdgeEnd, tgt: EdgeEnd, stored?: readonly Pt[], obstacles: readonly Box[] = []): Pt[] {
  if (routeFits(stored as Pt[] | undefined, src.box, tgt.box)) return clean(stored!.map((p) => ({ x: p.x, y: p.y })));
  const sa = src.owner ? outwardSide(src.box, src.owner) : undefined;
  const sb = tgt.owner ? outwardSide(tgt.box, tgt.owner) : undefined;
  return routeOrthogonal(src.box, tgt.box, sa, sb, obstacles);
}

export interface Rect extends Box {}
const hit = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const rectsOverlap = hit;

/** A box of `w` x `h` beside the longest segment that does not overlap `avoid`; the first candidate when none is free. */
export function placeLabel(pts: readonly Pt[], w: number, h: number, avoid: readonly Box[]): Rect {
  const segs = pts.slice(1).map((q, i) => ({ p: pts[i]!, q, len: Math.abs(q.x - pts[i]!.x) + Math.abs(q.y - pts[i]!.y) })).sort((s, t) => t.len - s.len);
  const cands: Rect[] = [];
  for (const s of segs) {
    const mx = (s.p.x + s.q.x) / 2, my = (s.p.y + s.q.y) / 2;
    if (eq(s.p.y, s.q.y)) cands.push({ x: mx - w / 2, y: my - h - 3, w, h }, { x: mx - w / 2, y: my + 3, w, h });
    else cands.push({ x: mx + 4, y: my - h / 2, w, h }, { x: mx - w - 4, y: my - h / 2, w, h });
  }
  return cands.find((c) => !avoid.some((a) => hit(c, a))) ?? cands[0] ?? { x: 0, y: 0, w, h };
}
