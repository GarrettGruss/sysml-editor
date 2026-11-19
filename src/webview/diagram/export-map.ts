import { calloutPosition } from "../shared/highlight.js";
import type { Box } from "./geometry.js";

/** A node's box in diagram coordinates, mapped into the window export: the drawing sits at (left, top) scaled by k from its viewBox origin. */
export function exportBox(node: Box, viewBox: { x: number; y: number }, left: number, top: number, k: number): Box {
  return { x: left + (node.x - viewBox.x) * k, y: top + (node.y - viewBox.y) * k, w: node.w * k, h: node.h * k };
}

/** Where the tutor frame (a few pixels around the node) and the callout go in the export window. */
export function exportHighlight(box: Box, view: { width: number; height: number }): { frame: Box; callout: { left: number; top: number } } {
  const frame = { x: box.x - 6, y: box.y - 6, w: box.w + 12, h: box.h + 12 };
  const callout = calloutPosition({ left: box.x, top: box.y, width: box.w, height: box.h }, view);
  return { frame, callout };
}
