/** Creating diagrams from the model and adding elements to them. No `vscode` import. */
import type { Element, ModelIndex } from "../model/index.js";
import { isVisible } from "../tree/tree-model.js";
import type { DiagramDocument, DiagramEdge, DiagramKind, DiagramNode } from "./format.js";
import { makeSourceMapper, resolveReference, referenceFor, referenceKey, resolveDiagram, type Resolution, type ResolveOptions, type SourceMapper } from "./resolve.js";

export interface CreateOptions {
  /** Restrict the members shown to these qualified names (the root is always shown). */
  elements?: string[];
  /** Maps document URIs to the workspace-relative paths stored in `sources`. */
  sourceOf?: SourceMapper;
}

/** Next unused id with the given prefix (`n` for nodes, `e` for edges): `n1`, `n2`, ... */
export function nextId(doc: Pick<DiagramDocument, "nodes" | "edges">, prefix: "n" | "e"): string {
  let max = 0;
  for (const item of [...doc.nodes, ...doc.edges]) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(item.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

const isRelationship = (e: Element) => e.ends.length >= 2;

/** Pre-populate a diagram with the root and its visible direct members; no positions are written. */
export function createDiagram(index: ModelIndex, rootQualifiedName: string, kind: DiagramKind, options: CreateOptions = {}): DiagramDocument {
  const sourceOf = options.sourceOf ?? makeSourceMapper();
  const root = index.findByQualifiedName(rootQualifiedName).length
    ? resolveReference({ ref: rootQualifiedName }, { sources: [] }, index, { sourceOf })
    : undefined;
  if (!root) throw new Error(`No element named ${rootQualifiedName}`);
  const allow = options.elements ? new Set(options.elements) : undefined;
  const members = root.members.filter(isVisible).filter((m) => !allow || (m.qualifiedName !== undefined && allow.has(m.qualifiedName)) || (allow && m.qualifiedName === undefined && isRelationship(m)));

  let doc: DiagramDocument = { version: 1, kind, root: rootQualifiedName, sources: [sourceOf(root.uri)], nodes: [], edges: [] };
  doc = addElement(doc, index, root, undefined, { sourceOf }).doc;
  const rootId = doc.nodes[0]!.id;
  for (const m of members.filter((m) => !isRelationship(m))) doc = addElement(doc, index, m, rootId, { sourceOf }).doc;
  // Edges do not change which nodes exist, so resolve once for all relationship ends.
  const resolution = resolveDiagram(doc, index, { sourceOf });
  for (const m of members.filter(isRelationship)) doc = addElement(doc, index, m, undefined, { sourceOf, resolution }).doc;
  return doc;
}

export interface AddResult {
  doc: DiagramDocument;
  /** The node (or edge) id for the element; undefined when it cannot be placed. */
  id?: string;
  added: boolean;
}

/** Node id whose element is the one an end text such as `engine.drive` starts with, among shown nodes. */
function endNode(doc: DiagramDocument, index: ModelIndex, owner: Element, end: string, opts: ResolveOptions & { resolution?: Resolution }): string | undefined {
  const res = opts.resolution ?? resolveDiagram(doc, index, opts);
  const segs = end.replace(/\s+/g, "").split(/\.|::/);
  for (let n = segs.length; n >= 1; n--) {
    const name = segs.slice(0, n).join("::");
    const target = index.resolve(name, owner);
    if (!target) continue;
    const hit = doc.nodes.find((nd) => res.get(nd.id) === target);
    if (hit) return hit.id;
  }
  return undefined;
}

/**
 * Add an element as a node (relationship statements become edges when both ends are shown).
 * Adding an element that is already on the diagram is a no-op returning the existing item.
 */
export function addElement(doc: DiagramDocument, index: ModelIndex, element: Element, parentNodeId?: string, opts: ResolveOptions & { resolution?: Resolution } = {}): AddResult {
  const ref = referenceFor(element);
  if (!ref) return { doc, added: false };
  const key = referenceKey(ref);
  const existing = [...doc.nodes, ...doc.edges].find((i) => referenceKey(i) === key);
  if (existing) return { doc, id: existing.id, added: false };
  if (parentNodeId !== undefined && !doc.nodes.some((n) => n.id === parentNodeId)) throw new Error(`No node ${parentNodeId}`);

  const sourceOf = opts.sourceOf ?? makeSourceMapper();
  const src = sourceOf(element.uri);
  const sources = doc.sources.includes(src) ? doc.sources : [...doc.sources, src].sort();

  if (isRelationship(element)) {
    const from = endNode(doc, index, element.owner ?? element, element.ends[0]!, opts);
    const to = endNode(doc, index, element.owner ?? element, element.ends[element.ends.length - 1]!, opts);
    if (!from || !to) return { doc, added: false };
    const edge: DiagramEdge = { id: nextId(doc, "e"), ...ref, source: from, target: to };
    return { doc: { ...doc, sources, edges: [...doc.edges, edge] }, id: edge.id, added: true };
  }
  const node: DiagramNode = { id: nextId(doc, "n"), ...ref, ...(parentNodeId !== undefined ? { parent: parentNodeId } : {}) };
  return { doc: { ...doc, sources, nodes: [...doc.nodes, node] }, id: node.id, added: true };
}
