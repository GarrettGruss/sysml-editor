/** Pure edits of a diagram document made by the user's layout actions. No `vscode` import. */
import type { DiagramDocument } from "./format.js";
import type { BoxPatch, EdgePatch, EdgePoints, NodeBox } from "./protocol.js";
import type { ViewModel } from "./view-model.js";
import { MAX_COORD, validBox } from "./session.js";

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

/** Write moved or resized boxes; the stored route of an edge whose two ends moved together moves with them. Undefined when nothing changes. */
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
    // A lifeline's `y` and `h` are computed from the messages (design D17): only the column order (`x`) and width are stored.
    const next = doc.kind === "sequence" ? { ...n, x: p.x, ...(p.w !== undefined ? { w: p.w } : {}) } : { ...n, x: p.x, y: p.y, ...(p.w !== undefined ? { w: p.w } : {}), ...(p.h !== undefined ? { h: p.h } : {}) };
    if (next.x === n.x && next.y === n.y && next.w === n.w && next.h === n.h) return n;
    changed.add(n.id);
    return next;
  });
  if (!changed.size) return undefined;
  // A stored route stays: the editor re-attaches its end segments to the moved or resized nodes when it draws it, and draws a
  // computed route when that is impossible. Only when both ends are moved by the same amount does the route move with them.
  const shift = (id: string): { dx: number; dy: number } | undefined => {
    const before = doc.nodes.find((n) => n.id === id), after = nodes.find((n) => n.id === id);
    if (!before || !after || before === after || before.w !== after.w || before.h !== after.h) return undefined;
    return { dx: (after.x ?? 0) - (before.x ?? 0), dy: (after.y ?? 0) - (before.y ?? 0) };
  };
  const edges = doc.edges.map((e) => {
    if (!e.points) return e;
    const a = shift(e.source), b = shift(e.target);
    if (!a || !b || a.dx !== b.dx || a.dy !== b.dy || doc.nodes.find((n) => n.id === e.source)?.parent !== doc.nodes.find((n) => n.id === e.target)?.parent) return e;
    return { ...e, points: e.points.map((p) => ({ x: p.x + a.dx, y: p.y + a.dy })) };
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

const validLabel = (l: unknown): l is NonNullable<EdgePatch["label"]> => {
  if (typeof l !== "object" || l === null) return false;
  const o = l as Record<string, unknown>;
  return finite(o.dx) && finite(o.dy) && (o.w === undefined || (finite(o.w) && o.w > 0)) && (o.h === undefined || (finite(o.h) && o.h > 0)) && (o.wrap === undefined || typeof o.wrap === "boolean");
};

/** Hand-edited routes and label layouts of lines; layout only, so the edges' model references are untouched. Undefined when nothing changes. */
export function applyEdgeLayout(doc: DiagramDocument, patches: readonly EdgePatch[]): DiagramDocument | undefined {
  const byId = new Map(patches.filter((p) => p && typeof p.id === "string").map((p) => [p.id, p] as const));
  let changed = false;
  const edges = doc.edges.map((e) => {
    const p = byId.get(e.id);
    if (!p) return e;
    let next = e;
    if (p.points !== undefined && doc.kind !== "sequence" && Array.isArray(p.points) && p.points.length >= 2 && p.points.every((q) => finite(q?.x) && finite(q?.y))) {
      const pts = p.points.map((q) => ({ x: q.x, y: q.y }));
      if (JSON.stringify(pts) !== JSON.stringify(e.points)) next = { ...next, points: pts };
    }
    if (p.label === null) {
      if (next.label !== undefined) { const { label: _l, ...rest } = next; next = rest as typeof e; }
    } else if (validLabel(p.label)) {
      const l = { dx: p.label.dx, dy: p.label.dy, ...(p.label.w !== undefined ? { w: p.label.w } : {}), ...(p.label.h !== undefined ? { h: p.label.h } : {}), ...(p.label.wrap === false ? { wrap: false } : {}) };
      if (JSON.stringify(l) !== JSON.stringify(next.label)) next = { ...next, label: l };
    }
    if (next !== e) changed = true;
    return next;
  });
  return changed ? { ...doc, edges } : undefined;
}
