/** Creating diagrams from the model and adding elements to them. No `vscode` import. */
import type { Element, ModelIndex } from "../model/index.js";
import { isVisible } from "../tree/tree-model.js";
import type { DiagramDocument, DiagramEdge, DiagramKind, DiagramNode } from "./format.js";
import { endElement, relationOf } from "./relations.js";
import { makeSourceMapper, ownedCandidates, resolveReference, referenceFor, referenceKey, resolveDiagram, type Resolution, type ResolveOptions, type SourceMapper } from "./resolve.js";

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


/** Pre-populate a diagram with the root and its visible direct members; no positions are written. */
export function createDiagram(index: ModelIndex, rootQualifiedName: string, kind: DiagramKind, options: CreateOptions = {}): DiagramDocument {
  const sourceOf = options.sourceOf ?? makeSourceMapper();
  const root = index.findByQualifiedName(rootQualifiedName).length
    ? resolveReference({ ref: rootQualifiedName }, { sources: [] }, index, { sourceOf })
    : undefined;
  if (!root) throw new Error(`No element named ${rootQualifiedName}`);
  const isRelationship = (e: Element) => relationOf(e, index) !== undefined;
  const allow = options.elements ? new Set(options.elements) : undefined;
  let members = root.members.filter(isVisible).filter((m) => !allow || (m.qualifiedName !== undefined && allow.has(m.qualifiedName)) || (allow && m.qualifiedName === undefined && isRelationship(m)));
  if (kind === "requirements" && !allow) members = requirementsMembers(members, index);

  let doc: DiagramDocument = { version: 1, kind, root: rootQualifiedName, sources: [sourceOf(root.uri)], nodes: [], edges: [] };
  doc = addElement(doc, index, root, undefined, { sourceOf }).doc;
  const rootId = doc.nodes[0]!.id;
  for (const m of members.filter((m) => !isRelationship(m))) doc = addElement(doc, index, m, rootId, { sourceOf }).doc;
  // Edges do not change which nodes exist, so resolve once for all relationship ends.
  const resolution = resolveDiagram(doc, index, { sourceOf });
  for (const m of members.filter(isRelationship)) doc = addElement(doc, index, m, undefined, { sourceOf, resolution }).doc;
  return doc;
}

/** A Requirements View shows the requirements and the elements that relationships tie them to. */
function requirementsMembers(members: Element[], index: ModelIndex): Element[] {
  const related = new Set<Element>();
  for (const m of members) {
    const r = relationOf(m, index);
    if (!r) continue;
    for (const end of [r.source, r.target]) {
      const el = endElement(index, end, (x) => members.includes(x));
      if (el) related.add(el);
    }
  }
  return members.filter((m) => m.kind.includes("requirement") || related.has(m) || relationOf(m, index) !== undefined);
}

export interface AddResult {
  doc: DiagramDocument;
  /** The node (or edge) id for the element; undefined when it cannot be placed. */
  id?: string;
  added: boolean;
}

/** Node id of the element an end of a relationship names (or, without text, its nearest shown owner). */
function endNode(doc: DiagramDocument, index: ModelIndex, end: Parameters<typeof endElement>[1], opts: ResolveOptions & { resolution?: Resolution }): string | undefined {
  const res = opts.resolution ?? resolveDiagram(doc, index, opts);
  const shown = new Set<Element>();
  for (const nd of doc.nodes) { const el = res.get(nd.id); if (el) shown.add(el); }
  const target = endElement(index, end, (x) => shown.has(x));
  return target ? doc.nodes.find((nd) => res.get(nd.id) === target)?.id : undefined;
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

  const rel = relationOf(element, index);
  if (rel) {
    const from = endNode(doc, index, rel.source, opts);
    const to = endNode(doc, index, rel.target, opts);
    if (!from || !to) return { doc, added: false };
    const edge: DiagramEdge = { id: nextId(doc, "e"), ...ref, source: from, target: to };
    return { doc: { ...doc, sources, edges: [...doc.edges, edge] }, id: edge.id, added: true };
  }
  const node: DiagramNode = { id: nextId(doc, "n"), ...ref, ...(parentNodeId !== undefined ? { parent: parentNodeId } : {}) };
  return { doc: { ...doc, sources, nodes: [...doc.nodes, node] }, id: node.id, added: true };
}

export interface AddedElements {
  doc: DiagramDocument;
  /** Node id for each element that is now on the diagram (added or already there). */
  ids: string[];
  /** Ids of nodes and edges that were new. */
  added: string[];
}

/**
 * Add elements the way the user does (drop, "Add to Active Diagram", "Show Element"): a node inside
 * the node of its owner when that is on an Interconnection View, otherwise at top level, plus the
 * relationship statements around it whose ends are both on the diagram. Touches only the diagram.
 */
export function addElements(doc: DiagramDocument, index: ModelIndex, elements: readonly Element[], opts: ResolveOptions = {}): AddedElements {
  const out: AddedElements = { doc, ids: [], added: [] };
  for (const element of elements) {
    if (relationOf(element, index)) {
      const r = addElement(out.doc, index, element, undefined, opts);
      out.doc = r.doc;
      if (r.id) out.ids.push(r.id);
      if (r.added && r.id) out.added.push(r.id);
      continue;
    }
    let parent: string | undefined;
    const res0 = resolveDiagram(out.doc, index, opts);
    if (out.doc.kind === "interconnection" && element.owner) {
      parent = out.doc.nodes.find((n) => res0.get(n.id) === element.owner)?.id;
      // A port of a definition sits on the shown usage that is typed by that definition.
      if (parent === undefined && element.kind === "port") {
        parent = out.doc.nodes.find((n) => {
          const el = res0.get(n.id);
          return !!el && el.types.some((t) => index.resolve(t, el) === element.owner);
        })?.id;
      }
    }
    const r = addElement(out.doc, index, element, parent, opts);
    out.doc = r.doc;
    if (!r.id) continue;
    out.ids.push(r.id);
    if (!r.added) continue;
    out.added.push(r.id);
    const rootEl = resolveReference({ ref: out.doc.root }, out.doc, index, opts);
    const parentEl = parent !== undefined ? res0.get(parent) : undefined;
    const owners = [...new Set([element, element.owner, parentEl, rootEl].filter((o): o is Element => !!o))];
    for (const owner of owners) {
      for (const cand of ownedCandidates(owner)) {
        if (!relationOf(cand, index)) continue;
        const e = addElement(out.doc, index, cand, undefined, opts);
        out.doc = e.doc;
        if (e.added && e.id) out.added.push(e.id);
      }
    }
  }
  return out;
}
