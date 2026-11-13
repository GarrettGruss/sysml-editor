/** Pure edits of a diagram document made by the user's layout actions. No `vscode` import. */
import type { DiagramDocument } from "./format.js";
import type { BoxPatch, EdgePatch, EdgePoints, NodeBox } from "./protocol.js";
import type { ViewModel } from "./view-model.js";
import { adjustRoute } from "../webview/diagram/route-edit.js";
import type { Box } from "../webview/diagram/geometry.js";
import { MAX_COORD, validBox } from "./session.js";

const MAX_POINTS = 1000;
const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const finite = (v: unknown, max = MAX_COORD): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;

/** Ids of the nodes under `ids` (children, and ports attached to them), by the stored parents and the view model. */
export function withDescendants(doc: DiagramDocument, ids: Iterable<string>, vm?: ViewModel): Set<string> {
  const gone = new Set<string>(ids);
  const links: [string, string][] = [];
  for (const n of doc.nodes) if (n.parent !== undefined) links.push([n.id, n.parent]);
  for (const n of vm?.nodes ?? []) {
    if (n.parent !== undefined) links.push([n.id, n.parent]);
    if (n.attachedTo !== undefined) links.push([n.id, n.attachedTo]);
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const [child, parent] of links) if (gone.has(parent) && !gone.has(child)) { gone.add(child); grew = true; }
  }
  return gone;
}

/** Remove nodes with their child nodes and every edge attached to any of them. Nothing else changes. */
export function removeItems(doc: DiagramDocument, ids: readonly string[], vm?: ViewModel): DiagramDocument {
  const known = new Set([...doc.nodes, ...doc.edges].map((i) => i.id));
  const wanted = ids.filter((i) => known.has(i));
  if (!wanted.length) return doc;
  const gone = withDescendants(doc, wanted.filter((i) => doc.nodes.some((n) => n.id === i)), vm);
  const goneEdges = new Set(wanted.filter((i) => doc.edges.some((e) => e.id === i)));
  // Edges the view model draws between removed nodes also go (their stored ends may differ from the drawn ones).
  for (const e of vm?.edges ?? []) if (gone.has(e.source) || gone.has(e.target)) goneEdges.add(e.id);
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !gone.has(n.id)),
    edges: doc.edges.filter((e) => !goneEdges.has(e.id) && !gone.has(e.source) && !gone.has(e.target)),
  };
}

/** Absolute box of a node from the stored relative boxes (a port: relative to its owner). Undefined when a box on the way is not stored. */
function absBox(nodes: readonly DiagramDocument["nodes"][number][], id: string, vm?: ViewModel): Box | undefined {
  let x = 0, y = 0;
  let w: number | undefined, h: number | undefined;
  for (let cur: string | undefined = id, i = 0; cur !== undefined; i++) {
    const n = nodes.find((m) => m.id === cur);
    if (!n || i > 100 || n.x === undefined || n.y === undefined) return undefined;
    x += n.x; y += n.y;
    if (i === 0) { w = n.w; h = n.h; }
    cur = n.parent ?? vm?.nodes.find((m) => m.id === cur)?.attachedTo;
  }
  return w !== undefined && h !== undefined ? { x, y, w, h } : undefined;
}

/** Write moved or resized boxes; the stored route of an edge whose two ends moved together moves with them. Undefined when nothing changes. */
export function applyBoxPatches(doc: DiagramDocument, patches: readonly BoxPatch[], extra?: { routes?: readonly EdgePoints[]; drop?: readonly string[] }, vm?: ViewModel): DiagramDocument | undefined {
  const byId = new Map<string, BoxPatch>();
  for (const p of patches) {
    if (!p || typeof p.id !== "string" || !finite(p.x) || !finite(p.y)) continue;
    if (p.w !== undefined && !(finite(p.w) && p.w > 0)) continue;
    if (p.h !== undefined && !(finite(p.h) && p.h > 0)) continue;
    byId.set(p.id, p);
  }
  const changed = new Set<string>();
  const nodes = doc.nodes.map((n) => {
    const p = byId.get(n.id);
    if (!p) return n;
    // A lifeline's `y` and `h` are computed from the messages (design D17): only the column order (`x`) and width are stored.
    const next = doc.kind === "sequence" ? { ...n, x: p.x, ...(p.w !== undefined ? { w: p.w } : {}) } : { ...n, x: p.x, y: p.y, ...(p.w !== undefined ? { w: p.w } : {}), ...(p.h !== undefined ? { h: p.h } : {}) };
    if (next.x === n.x && next.y === n.y && next.w === n.w && next.h === n.h) return n;
    changed.add(n.id);
    return next;
  });
  if (!changed.size) return undefined;
  // Stored routes of edges whose ends changed: the webview sends the routes it adjusted (`routes`) or the ids to drop. For callers
  // that send neither, a route moves with its ends when both moved by the same absolute amount, and is dropped when it no longer fits.
  const sent = new Map((extra?.routes ?? []).filter((r) => Array.isArray(r?.points) && r.points.length >= 2 && r.points.length <= MAX_POINTS && r.points.every((q) => finite(q?.x) && finite(q?.y))).map((r) => [r.id, r.points] as const));
  const dropped = new Set(extra?.drop ?? []);
  const edges = doc.edges.map((e) => {
    if (!e.points) return e;
    if (dropped.has(e.id)) { const { points: _p, ...rest } = e; return rest as typeof e; }
    const p = sent.get(e.id);
    if (p) return { ...e, points: p.map((q) => ({ x: q.x, y: q.y })) };
    const os = absBox(doc.nodes, e.source, vm), ot = absBox(doc.nodes, e.target, vm), ns = absBox(nodes, e.source, vm), nt = absBox(nodes, e.target, vm);
    if (!os || !ot || !ns || !nt || (sameBox(os, ns) && sameBox(ot, nt))) return e;
    const r = adjustRoute(e.points, os, ot, ns, nt);
    if (r) return r.every((q, i) => q.x === e.points![i]?.x && q.y === e.points![i]?.y) && r.length === e.points.length ? e : { ...e, points: r };
    const { points: _p, ...rest } = e;
    return rest as typeof e;
  });
  return { ...doc, nodes, edges };
}

/** Auto-layout: every node gets a new box and every listed edge a new route; routes of other edges are dropped. */
export function applyAutoLayout(doc: DiagramDocument, boxes: readonly NodeBox[], routes: readonly EdgePoints[]): DiagramDocument | undefined {
  const byId = new Map(boxes.filter(validBox).map((b) => [b.id, b] as const));
  const pts = new Map(routes.filter((r) => Array.isArray(r.points) && r.points.length >= 2 && r.points.every((p) => finite(p?.x) && finite(p?.y))).map((r) => [r.id, r.points] as const));
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    const b = byId.get(n.id);
    if (!b) return n;
    if (doc.kind === "sequence") {
      if (n.x !== b.x || n.w !== b.w || n.y !== undefined || n.h !== undefined) changed = true;
      const { y: _y, h: _h, ...rest } = n;
      return { ...rest, x: b.x, w: b.w };
    }
    if (n.x !== b.x || n.y !== b.y || n.w !== b.w || n.h !== b.h) changed = true;
    return { ...n, x: b.x, y: b.y, w: b.w, h: b.h };
  });
  const edges = doc.edges.map((e) => {
    const p = doc.kind === "sequence" ? undefined : pts.get(e.id);
    if (!p) {
      if (e.points === undefined) return e;
      changed = true;
      const { points: _p, ...rest } = e;
      return rest as typeof e;
    }
    if (JSON.stringify(e.points) !== JSON.stringify(p)) changed = true;
    return { ...e, points: p.map((q) => ({ x: q.x, y: q.y })) };
  });
  return changed ? { ...doc, nodes, edges } : undefined;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const validLabel = (l: unknown): l is NonNullable<EdgePatch["label"]> => {
  if (typeof l !== "object" || l === null) return false;
  const o = l as Record<string, unknown>;
  return finite(o.dx) && finite(o.dy) && (o.w === undefined || (finite(o.w) && o.w > 0)) && (o.h === undefined || (finite(o.h) && o.h > 0)) && (o.wrap === undefined || typeof o.wrap === "boolean");
};

/**
 * Hand-edited routes and label layouts of lines; layout only, so the edges' model references are untouched. Edges the model derives
 * and sequence messages are not adjustable (their patches are ignored). Undefined when nothing changes.
 */
export function applyEdgeLayout(doc: DiagramDocument, patches: readonly EdgePatch[], vm?: ViewModel): DiagramDocument | undefined {
  const byId = new Map(patches.filter((p) => p && typeof p.id === "string").map((p) => [p.id, p] as const));
  let changed = false;
  const edges = doc.edges.map((e) => {
    const p = byId.get(e.id);
    if (!p) return e;
    const v = vm?.edges.find((x) => x.id === e.id);
    if (doc.kind === "sequence" || v?.derived || v?.fixed || e.locator?.kind === "message") return e;
    let next = e;
    if (p.points !== undefined && Array.isArray(p.points) && p.points.length >= 2 && p.points.length <= MAX_POINTS && p.points.every((q) => finite(q?.x) && finite(q?.y))) {
      const pts = p.points.map((q) => ({ x: r2(q.x), y: r2(q.y) }));
      if (JSON.stringify(pts) !== JSON.stringify(e.points?.map((q) => ({ x: r2(q.x), y: r2(q.y) })))) next = { ...next, points: pts };
    }
    if (p.label === null) {
      if (next.label !== undefined) { const { label: _l, ...rest } = next; next = rest as typeof e; }
    } else if (validLabel(p.label)) {
      const l = { dx: r2(p.label.dx), dy: r2(p.label.dy), ...(p.label.w !== undefined ? { w: r2(p.label.w) } : {}), ...(p.label.h !== undefined ? { h: r2(p.label.h) } : {}), ...(p.label.wrap === false ? { wrap: false } : {}) };
      const cur = next.label && { ...next.label, dx: r2(next.label.dx), dy: r2(next.label.dy) };
      if (JSON.stringify(l) !== JSON.stringify(cur)) next = { ...next, label: l };
    }
    if (next !== e) changed = true;
    return next;
  });
  return changed ? { ...doc, edges } : undefined;
}
