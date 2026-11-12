/** Geometric checks on a drawn diagram, for the test API. No DOM. */
import type { ViewModel } from "../../diagram/view-model.js";
import type { Box, Pt } from "./geometry.js";
import { collinearOverlap, contains, isOrthogonal, labelOnRoute, OVERLAP_MIN, rectsOverlap, routeThroughBox } from "./routing.js";

export interface EdgeChecks {
  diagonalSegments: number;
  edgesThroughEndNodes: number;
  labelsOverEndNodes: number;
  /** Edge labels crossed by their own edge's line. */
  labelsOnOwnEdge: number;
  portsOffBorder: number;
  /** Edge labels that intersect any node box grown by 2 px (a container that holds the label does not count). */
  labelsOverNodes: number;
  /** Pairs of edge labels that intersect. */
  labelsOverLabels: number;
  /** Pairs of segments of different edges that are collinear and overlap by more than 4 px. */
  edgeOverlaps: number;
}

/** Distance from the centre of `b` to the outline of `o`. */
export function distToBorder(b: Box, o: Box): number {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dx = Math.max(o.x - cx, 0, cx - (o.x + o.w));
  const dy = Math.max(o.y - cy, 0, cy - (o.y + o.h));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(cx - o.x, o.x + o.w - cx, cy - o.y, o.y + o.h - cy);
}

export function checkEdges(vm: ViewModel, abs: ReadonlyMap<string, Box>, routes: ReadonlyMap<string, readonly Pt[]>, labels: ReadonlyMap<string, Box>): EdgeChecks {
  let diagonalSegments = 0, edgesThroughEndNodes = 0, labelsOverEndNodes = 0, labelsOnOwnEdge = 0, portsOffBorder = 0, labelsOverNodes = 0, labelsOverLabels = 0, edgeOverlaps = 0;
  const parents = new Set(vm.nodes.map((n) => n.parent).filter((x): x is string => x !== undefined));
  const placed: Box[] = [];
  const done: (readonly Pt[])[] = [];
  for (const e of vm.edges) {
    const pts = routes.get(e.id);
    const s = abs.get(e.source), t = abs.get(e.target);
    if (!pts || !s || !t) continue;
    for (let i = 1; i < pts.length; i++) if (!isOrthogonal([pts[i - 1]!, pts[i]!])) diagonalSegments++;
    // An end that contains the other (an edge to an enclosing node) necessarily runs through it.
    if (!contains(s, t) && !contains(t, s) && (routeThroughBox(pts, s) || routeThroughBox(pts, t))) edgesThroughEndNodes++;
    const l = labels.get(e.id);
    if (l && (rectsOverlap(l, s) || rectsOverlap(l, t))) labelsOverEndNodes++;
    if (l && labelOnRoute(l, pts)) labelsOnOwnEdge++;
    if (l) {
      const g = (b: Box): Box => ({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 });
      if (vm.nodes.some((n) => { const b = abs.get(n.id); return b !== undefined && rectsOverlap(l, g(b)) && !(parents.has(n.id) && contains(b, l)); })) labelsOverNodes++;
      labelsOverLabels += placed.filter((o) => rectsOverlap(l, o)).length;
      placed.push(l);
    }
    for (const o of done) for (let i = 1; i < pts.length; i++) for (let j = 1; j < o.length; j++) if (collinearOverlap(pts[i - 1]!, pts[i]!, o[j - 1]!, o[j]!) > OVERLAP_MIN) edgeOverlaps++;
    done.push(pts);
  }
  for (const n of vm.nodes) {
    if (n.attachedTo === undefined) continue;
    const p = abs.get(n.id), o = abs.get(n.attachedTo);
    if (p && o && distToBorder(p, o) > 2) portsOffBorder++;
  }
  return { diagonalSegments, edgesThroughEndNodes, labelsOverEndNodes, labelsOnOwnEdge, portsOffBorder, labelsOverNodes, labelsOverLabels, edgeOverlaps };
}
