/**
 * Changes a model edit forces on diagram documents (a node for the element just created, entries
 * removed on delete), as pure functions of a document. `vscode`-free. A change is applied to the
 * last SAVED state of every diagram file on disk and to the in-memory document (without dirtying
 * it); its `revert` undoes it, so a combined undo can reverse the diagram part as well.
 */
import type { Element, ModelIndex } from "../model/index.js";
import { addElement } from "../diagram/create.js";
import { removeItems } from "../diagram/edits.js";
import type { DiagramDocument, DiagramEdge, DiagramNode } from "../diagram/format.js";
import { referenceFor, referenceKey, type SourceMapper } from "../diagram/resolve.js";

export interface ChangeContext {
  uri: string;
  sourceOf: SourceMapper;
}

export interface DiagramChange {
  /** One diagram, or every diagram file. */
  target: { uri: string } | "all";
  /** Short text for the undo label. */
  label: string;
  /** A new document, or the same one when nothing changes. Idempotent. */
  apply(doc: DiagramDocument, ctx: ChangeContext): DiagramDocument;
  revert(doc: DiagramDocument, ctx: ChangeContext): DiagramDocument;
  /** Reference keys of items this change created (for session tracking). */
  createdKeys?(): string[];
  /** Declaring document of each created item (reference key to URI). */
  createdIn?(): Map<string, string>;
  /** The items this change removed from the diagram file `uri` (to see whether they can come back). */
  removedItems?(uri: string): { nodes: DiagramNode[]; edges: DiagramEdge[] } | undefined;
}

export interface Placement {
  /** URI of the diagram document. */
  diagram: string;
  /** Node id of the container the element was created in; absent for the diagram root. */
  parentNode?: string;
  /** Position relative to the parent node (or the canvas). */
  x?: number;
  y?: number;
}

/** Add the element's node (and the relationship edges both of whose ends are shown) at the placement. */
export function placeElementChange(index: ModelIndex, element: () => Element | undefined, placement: Placement, label: string): DiagramChange {
  const added = new Map<string, string[]>();
  const keys: string[] = [];
  const declared = new Map<string, string>();
  return {
    target: { uri: placement.diagram },
    label,
    apply(doc, ctx) {
      const el = element();
      if (!el) return doc;
      const parent = placement.parentNode !== undefined && doc.nodes.some((n) => n.id === placement.parentNode) ? placement.parentNode : undefined;
      const r = addElement(doc, index, el, parent, { sourceOf: ctx.sourceOf });
      if (!r.added || !r.id) return r.doc;
      const ref = referenceFor(el, index);
      if (ref) {
        keys.push(referenceKey(ref));
        declared.set(referenceKey(ref), el.uri);
      }
      added.set(ctx.uri, [r.id]);
      let next = r.doc;
      const isNode = next.nodes.some((n) => n.id === r.id);
      if (isNode && el.kind !== "port" && placement.x !== undefined && placement.y !== undefined) {
        next = { ...next, nodes: next.nodes.map((n): DiagramNode => (n.id === r.id ? { ...n, x: placement.x!, y: placement.y! } : n)) };
      }
      return next;
    },
    revert(doc, ctx) {
      const ids = added.get(ctx.uri) ?? [];
      return ids.length ? removeItems(doc, ids) : doc;
    },
    createdKeys: () => keys,
    createdIn: () => declared,
  };
}

function under(ref: string, qn: string): boolean {
  return ref === qn || ref.startsWith(qn + "::");
}

/** Remove every node and edge that refers to one of the qualified names or to something below it. */
export function removeReferencesTo(doc: DiagramDocument, qns: readonly string[]): { doc: DiagramDocument; removed: { nodes: DiagramNode[]; edges: DiagramEdge[] } } {
  const hit = (i: { ref?: string; locator?: { owner: string } }) => qns.some((q) => (i.ref !== undefined && under(i.ref, q)) || (i.locator !== undefined && under(i.locator.owner, q)));
  const ids = [...doc.nodes, ...doc.edges].filter(hit).map((i) => i.id);
  if (!ids.length) return { doc, removed: { nodes: [], edges: [] } };
  const next = removeItems(doc, ids);
  const kept = new Set([...next.nodes, ...next.edges].map((i) => i.id));
  return { doc: next, removed: { nodes: doc.nodes.filter((n) => !kept.has(n.id)), edges: doc.edges.filter((e) => !kept.has(e.id)) } };
}

/** Put removed items back (those whose id is free and whose parent node exists). */
export function restoreItems(doc: DiagramDocument, items: { nodes: DiagramNode[]; edges: DiagramEdge[] }): DiagramDocument {
  const have = new Set([...doc.nodes, ...doc.edges].map((i) => i.id));
  const nodes = [...doc.nodes, ...items.nodes.filter((n) => !have.has(n.id))];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = [...doc.edges, ...items.edges.filter((e) => !have.has(e.id) && nodeIds.has(e.source) && nodeIds.has(e.target))];
  return nodes.length === doc.nodes.length && edges.length === doc.edges.length ? doc : { ...doc, nodes, edges };
}

/** Delete from Model: the entries for the deleted element and everything below it go from every diagram. */
export function removeEntriesChange(qns: string[], label: string): DiagramChange {
  const removed = new Map<string, { nodes: DiagramNode[]; edges: DiagramEdge[] }>();
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      const r = removeReferencesTo(doc, qns);
      if (r.removed.nodes.length || r.removed.edges.length) removed.set(ctx.uri, r.removed);
      return r.doc;
    },
    revert(doc, ctx) {
      const items = removed.get(ctx.uri);
      return items ? restoreItems(doc, items) : doc;
    },
  };
}

/**
 * Entries of items this session created whose element vanished from a clean model (design D6): an ordinary forced
 * change, so it can be reverted when the element comes back at the same qualified name.
 */
export function dropEntriesChange(keys: readonly string[], label: string): DiagramChange {
  const set = new Set(keys);
  const removed = new Map<string, { nodes: DiagramNode[]; edges: DiagramEdge[] }>();
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      const ids = [...doc.nodes, ...doc.edges].filter((i) => set.has(referenceKey(i))).map((i) => i.id);
      if (!ids.length) return doc;
      const next = removeItems(doc, ids);
      const kept = new Set([...next.nodes, ...next.edges].map((i) => i.id));
      removed.set(ctx.uri, { nodes: doc.nodes.filter((n) => !kept.has(n.id)), edges: doc.edges.filter((e) => !kept.has(e.id)) });
      return next;
    },
    revert(doc, ctx) {
      const items = removed.get(ctx.uri);
      return items ? restoreItems(doc, items) : doc;
    },
    removedItems: (uri) => removed.get(uri),
  };
}
