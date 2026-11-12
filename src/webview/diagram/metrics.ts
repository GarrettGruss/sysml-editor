/** Geometric checks on a drawn diagram, for the test API. No DOM. */
import type { ViewModel } from "../../diagram/view-model.js";
import type { Box, Pt } from "./geometry.js";
import { contains, isOrthogonal, rectsOverlap, routeThroughBox } from "./routing.js";

export interface EdgeChecks {
  diagonalSegments: number;
  edgesThroughEndNodes: number;
  labelsOverEndNodes: number;
  portsOffBorder: number;
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
  let diagonalSegments = 0, edgesThroughEndNodes = 0, labelsOverEndNodes = 0, portsOffBorder = 0;
  for (const e of vm.edges) {
    const pts = routes.get(e.id);
    const s = abs.get(e.source), t = abs.get(e.target);
    if (!pts || !s || !t) continue;
    for (let i = 1; i < pts.length; i++) if (!isOrthogonal([pts[i - 1]!, pts[i]!])) diagonalSegments++;
    // An end that contains the other (an edge to an enclosing node) necessarily runs through it.
    if (!contains(s, t) && !contains(t, s) && (routeThroughBox(pts, s) || routeThroughBox(pts, t))) edgesThroughEndNodes++;
    const l = labels.get(e.id);
    if (l && (rectsOverlap(l, s) || rectsOverlap(l, t))) labelsOverEndNodes++;
  }
  for (const n of vm.nodes) {
    if (n.attachedTo === undefined) continue;
    const p = abs.get(n.id), o = abs.get(n.attachedTo);
    if (p && o && distToBorder(p, o) > 2) portsOffBorder++;
  }
  return { diagonalSegments, edgesThroughEndNodes, labelsOverEndNodes, portsOffBorder };
}
