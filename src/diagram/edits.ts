/** Pure edits of a diagram document made by the user's layout actions. No `vscode` import. */
import type { DiagramDocument } from "./format.js";
import type { BoxPatch, EdgePoints, NodeBox } from "./protocol.js";
import type { ViewModel } from "./view-model.js";
import { validBox } from "./session.js";

const finite = (v: unknown, max = 1_000_000): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;

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

/** Write moved or resized boxes; edges attached to a changed node lose their stored route. Undefined when nothing changes. */
export function applyBoxPatches(doc: DiagramDocument, patches: readonly BoxPatch[]): DiagramDocument | undefined {
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
    const next = { ...n, x: p.x, y: p.y, ...(p.w !== undefined ? { w: p.w } : {}), ...(p.h !== undefined ? { h: p.h } : {}) };
    if (next.x === n.x && next.y === n.y && next.w === n.w && next.h === n.h) return n;
    changed.add(n.id);
    return next;
  });
  if (!changed.size) return undefined;
  const touched = withDescendants({ ...doc, nodes }, changed);
  const edges = doc.edges.map((e) => {
    if (!e.points || !(touched.has(e.source) || touched.has(e.target))) return e;
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
    if (n.x !== b.x || n.y !== b.y || n.w !== b.w || n.h !== b.h) changed = true;
    return { ...n, x: b.x, y: b.y, w: b.w, h: b.h };
  });
  const edges = doc.edges.map((e) => {
    const p = pts.get(e.id);
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
