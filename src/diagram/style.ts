/**
 * Diagram style kept in the `.sysmld` file (D49): hidden compartments per node, the legend toggle and named aspects.
 * Pure edits of a document; layout only, so the model is never touched. No `vscode` import.
 */
import type { DiagramDocument, DiagramNode } from "./format.js";

export const showsLegend = (doc: Pick<DiagramDocument, "style">): boolean => doc.style?.legend === true;

/** The stored layout direction (D71); anything but `down` or `right` is ignored. */
export function layoutDirectionOf(doc: Pick<DiagramDocument, "style">): "down" | "right" | undefined {
  const d = doc.style?.layoutDirection;
  return d === "down" || d === "right" ? d : undefined;
}

/** Compartment titles hidden on a node. */
export function hiddenCompartments(n: Pick<DiagramNode, "style">): string[] {
  const h = n.style?.hiddenCompartments;
  return Array.isArray(h) ? h.filter((x): x is string => typeof x === "string") : [];
}

const without = (o: Record<string, unknown> | undefined, key: string): Record<string, unknown> => {
  const rest: Record<string, unknown> = { ...o };
  delete rest[key];
  return rest;
};

/** Replace the diagram style; an empty style is removed. */
function withStyle(doc: DiagramDocument, style: Record<string, unknown>): DiagramDocument {
  const { style: _old, ...rest } = doc;
  return Object.keys(style).length ? { ...rest, style } : (rest as DiagramDocument);
}

/**
 * Hide the compartments `hidden` (titles) of node `id`. The node's stored height is dropped so it takes the size of what it shows
 * (a hidden compartment shrinks it). Undefined when nothing changes.
 */
export function applyCompartments(doc: DiagramDocument, id: string, hidden: readonly unknown[]): DiagramDocument | undefined {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node || !Array.isArray(hidden)) return undefined;
  const next = [...new Set(hidden.filter((h): h is string => typeof h === "string" && h !== ""))].sort();
  const cur = [...hiddenCompartments(node)].sort();
  if (next.length === cur.length && next.every((h, i) => h === cur[i])) return undefined;
  const style = next.length ? { ...node.style, hiddenCompartments: next } : without(node.style, "hiddenCompartments");
  const { style: _s, h: _h, ...rest } = node;
  const updated: DiagramNode = { ...rest, ...(Object.keys(style).length ? { style } : {}) };
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? updated : n)) };
}

// ---- aspects --------------------------------------------------------------------------------

/** The saved aspects: name to the ids of the nodes they show. */
export function aspectsOf(doc: Pick<DiagramDocument, "style">): Record<string, string[]> {
  const a = doc.style?.aspects;
  const out: Record<string, string[]> = {};
  if (typeof a === "object" && a !== null && !Array.isArray(a)) {
    for (const [name, ids] of Object.entries(a)) if (Array.isArray(ids)) out[name] = ids.filter((i): i is string => typeof i === "string");
  }
  return out;
}

/** The name of the applied aspect, when it exists. */
export function activeAspect(doc: Pick<DiagramDocument, "style">): string | undefined {
  const n = doc.style?.activeAspect;
  return typeof n === "string" && aspectsOf(doc)[n] !== undefined ? n : undefined;
}

/** Save the nodes `ids` as aspect `name` (replacing one of that name). Undefined for an empty name or no nodes. */
export function saveAspect(doc: DiagramDocument, name: string, ids: readonly string[]): DiagramDocument | undefined {
  const clean = typeof name === "string" ? name.trim() : "";
  const known = new Set(doc.nodes.map((n) => n.id));
  const keep = ids.filter((i) => known.has(i));
  if (!clean || !keep.length) return undefined;
  const style = { ...doc.style, aspects: { ...aspectsOf(doc), [clean]: keep } };
  return withStyle(doc, style);
}

/** Apply aspect `name`, or clear the applied one (`undefined`). Undefined when nothing changes or the aspect does not exist. */
export function applyAspect(doc: DiagramDocument, name: string | undefined): DiagramDocument | undefined {
  if (name === undefined) return doc.style?.activeAspect === undefined ? undefined : withStyle(doc, without(doc.style, "activeAspect"));
  if (aspectsOf(doc)[name] === undefined || doc.style?.activeAspect === name) return undefined;
  return withStyle(doc, { ...doc.style, activeAspect: name });
}

/** Delete aspect `name`; when it is applied, every node shows again. */
export function deleteAspect(doc: DiagramDocument, name: string): DiagramDocument | undefined {
  const all = aspectsOf(doc);
  if (all[name] === undefined) return undefined;
  const { [name]: _gone, ...rest } = all;
  let style: Record<string, unknown> = Object.keys(rest).length ? { ...doc.style, aspects: rest } : without(doc.style, "aspects");
  if (doc.style?.activeAspect === name) style = without(style, "activeAspect");
  return withStyle(doc, style);
}

/**
 * A node added while an aspect is applied joins that aspect, so it stays visible (a node added to a diagram must not vanish).
 * `next` is returned as it is when no aspect is applied or no node is new. Nodes that merely come back (undo) are not new to `prev` only when
 * they were there, so they keep whatever the aspect said.
 */
export function keepNewNodesVisible(prev: DiagramDocument, next: DiagramDocument): DiagramDocument {
  const name = activeAspect(next);
  if (name === undefined) return next;
  const had = new Set(prev.nodes.map((n) => n.id));
  const byId = new Map(next.nodes.map((n) => [n.id, n] as const));
  const fresh: string[] = [];
  for (const n of next.nodes) {
    if (had.has(n.id)) continue;
    // The ancestors come too (outermost first), or a node whose parent is outside the aspect would stay hidden.
    const chain: string[] = [];
    for (let c: DiagramNode | undefined = n, i = 0; c && i < 100; c = c.parent !== undefined ? byId.get(c.parent) : undefined, i++) chain.unshift(c.id);
    fresh.push(...chain);
  }
  const listed = aspectsOf(next)[name]!;
  const add = [...new Set(fresh)].filter((id) => !listed.includes(id));
  if (!add.length) return next;
  return withStyle(next, { ...next.style, aspects: { ...aspectsOf(next), [name]: [...listed, ...add] } });
}

/**
 * The diagram as the applied aspect shows it: nodes not in the aspect (and nodes inside a hidden one) are left out, and so are the
 * lines that lose an end. Ids that no longer exist are ignored. The document itself is returned when no aspect is applied.
 */
export function visibleDocument(doc: DiagramDocument): DiagramDocument {
  const name = activeAspect(doc);
  if (name === undefined) return doc;
  const listed = new Set(aspectsOf(doc)[name]);
  const byId = new Map(doc.nodes.map((n) => [n.id, n] as const));
  const shown = (n: DiagramNode, depth = 0): boolean => listed.has(n.id) && (n.parent === undefined || (depth < 100 && byId.has(n.parent) && shown(byId.get(n.parent)!, depth + 1)));
  const nodes = doc.nodes.filter((n) => shown(n));
  const ids = new Set(nodes.map((n) => n.id));
  return { ...doc, nodes, edges: doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}
