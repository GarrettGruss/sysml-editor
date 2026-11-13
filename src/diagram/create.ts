/** Creating diagrams from the model and adding elements to them. No `vscode` import. */
import { analyze, interactionOf, isActionNode, isActionLike, isStateKind, isStateNode, isLibraryUri, ownsMessages, syntheticMembers, isVirtualKind, type Element, type ModelIndex } from "../model/index.js";
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


/** The kinds of diagram a root can have. A general view fits everything; the behaviour views need a matching element. */
export function diagramKindsFor(element: Element): DiagramKind[] {
  const kinds: DiagramKind[] = ["general"];
  if (isStructure(element)) kinds.push("interconnection");
  kinds.push("requirements");
  if (isActionLike(element) && element.qualifiedName !== undefined) kinds.push("actionFlow");
  if (isStateKind(element.kind) && element.qualifiedName !== undefined) kinds.push("stateTransition");
  if (ownsMessages(element)) kinds.push("sequence");
  return kinds;
}

const STRUCTURE_KEYWORDS = new Set(["part", "item", "interface", "connection"]);

/** Whether the element is a part, item, interface or connection definition or usage (an Interconnection View shows what it owns). */
export function isStructure(e: Element): boolean {
  const words = e.kind.split(" ");
  const base = words[words.length - 1] === "def" ? words[words.length - 2] : words[words.length - 1];
  return base !== undefined && STRUCTURE_KEYWORDS.has(base);
}

/** Why `element` cannot be the root of a diagram of this kind, or undefined. */
export function rootProblem(kind: DiagramKind, element: Element): string | undefined {
  const what = `${element.kind}${element.name !== undefined ? ` '${element.name}'` : ""}`;
  if (kind === "interconnection" && !isStructure(element)) return `An Interconnection View needs a part, item, interface or connection definition or usage as its root; ${what} is none of these.`;
  if (kind === "actionFlow" && !isActionLike(element)) return `An Action Flow View needs an action or an action definition as its root; ${what} is neither.`;
  if (kind === "stateTransition" && !isStateKind(element.kind)) return `A State Transition View needs a state or a state definition as its root; ${what} is neither.`;
  if (kind === "sequence" && !ownsMessages(element)) return `A Sequence View needs an occurrence, part or interaction that owns messages as its root; ${what} owns no \`message\`.`;
  return undefined;
}

/** Behaviour views: the root and what it owns, recursively, as nested nodes, then the successions, flows, transitions or messages. */
function createBehavior(doc0: DiagramDocument, index: ModelIndex, root: Element, kind: DiagramKind, sourceOf: SourceMapper): DiagramDocument {
  let doc = doc0;
  const rootId = doc.nodes[0]!.id;
  const containers: Element[] = [];
  const shown = (m: Element) => (kind === "stateTransition" ? isStateNode(m) : isActionNode(m));
  const addTree = (el: Element, id: string, depth: number): void => {
    containers.push(el);
    for (const m of el.members.filter(shown)) {
      const r = addElement(doc, index, m, id, { sourceOf });
      doc = r.doc;
      if (r.id && depth < 8 && m.members.some(shown)) addTree(m, r.id, depth + 1);
      else if (r.id) containers.push(m);
    }
    for (const v of syntheticMembers(index, el).filter((x) => isVirtualKind(x.kind))) doc = addElement(doc, index, v, id, { sourceOf }).doc;
  };
  addTree(root, rootId, 0);
  const resolution = resolveDiagram(doc, index, { sourceOf });
  for (const c of containers) {
    for (const cand of ownedCandidates(c, index)) {
      if (!relationOf(cand, index)) continue;
      doc = addElement(doc, index, cand, undefined, { sourceOf, resolution }).doc;
    }
  }
  return doc;
}

/** A Sequence View: the participants as lifelines and the messages between them. */
function createSequence(doc0: DiagramDocument, index: ModelIndex, root: Element, sourceOf: SourceMapper): DiagramDocument {
  let doc = doc0;
  const inter = interactionOf(index, root);
  for (const p of inter.participants) if (p.element) doc = addElement(doc, index, p.element, undefined, { sourceOf }).doc;
  const resolution = resolveDiagram(doc, index, { sourceOf });
  for (const m of inter.messages) doc = addElement(doc, index, m.statement, undefined, { sourceOf, resolution }).doc;
  return doc;
}

/** Pre-populate a diagram with the root and its visible direct members; no positions are written. */
export function createDiagram(index: ModelIndex, rootQualifiedName: string, kind: DiagramKind, options: CreateOptions = {}): DiagramDocument {
  const sourceOf = options.sourceOf ?? makeSourceMapper();
  const root = index.findByQualifiedName(rootQualifiedName).length
    ? resolveReference({ ref: rootQualifiedName }, { sources: [] }, index, { sourceOf })
    : undefined;
  if (!root) throw new Error(`No element named ${rootQualifiedName}`);
  const problem = rootProblem(kind, root);
  if (problem) throw new Error(problem);
  const isRelationship = (e: Element) => relationOf(e, index) !== undefined;
  const allow = options.elements ? new Set(options.elements) : undefined;
  let members = root.members.filter(isVisible).filter((m) => !allow || (m.qualifiedName !== undefined && allow.has(m.qualifiedName)) || (allow && m.qualifiedName === undefined && isRelationship(m)));
  if (kind === "requirements" && !allow) members = requirementsMembers(members, index);

  let doc: DiagramDocument = { version: 1, kind, root: rootQualifiedName, sources: [sourceOf(root.uri)], nodes: [], edges: [] };
  doc = addElement(doc, index, root, undefined, { sourceOf }).doc;
  if (kind === "actionFlow" || kind === "stateTransition") return createBehavior(doc, index, root, kind, sourceOf);
  if (kind === "sequence") return createSequence(doc, index, root, sourceOf);
  const rootId = doc.nodes[0]!.id;
  // A use case is an oval: its subject, actors and included use cases stand beside it, connected by lines, not inside it.
  const beside = kind === "general" && (root.kind === "use case" || root.kind === "use case def") ? undefined : rootId;
  for (const m of members.filter((m) => !isRelationship(m))) doc = addElement(doc, index, m, beside, { sourceOf }).doc;
  if (kind === "requirements") {
    // Requirements the root's relationships refer to, wherever they are declared.
    for (const m of members.filter(isRelationship)) {
      const r = relationOf(m, index)!;
      for (const end of [r.source, r.target]) {
        const el = endElement(index, end, (x) => x.kind.includes("requirement") && !x.kind.includes("satisfy") && !isRelationship(x));
        if (el && !isLibraryUri(el.uri)) doc = addElement(doc, index, el, rootId, { sourceOf }).doc;
      }
    }
  }
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
  const ref = referenceFor(element, index);
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
 * Add elements the way the user does (drop, "Add to Diagram"): a node inside
 * the node of its owner when that is on an Interconnection View, otherwise at top level, plus the
 * relationship statements around it whose ends are both on the diagram. Touches only the diagram.
 */
export function addElements(doc: DiagramDocument, index: ModelIndex, elements: readonly Element[], opts: ResolveOptions & { at?: { x: number; y: number } } = {}): AddedElements {
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
          return !!el && el.typeNames.some((t) => index.resolve(t, el) === element.owner);
        })?.id;
      }
    }
    const r = addElement(out.doc, index, element, parent, opts);
    out.doc = r.doc;
    if (!r.id) continue;
    out.ids.push(r.id);
    if (!r.added) continue;
    out.added.push(r.id);
    // A drop puts a top-level node at the pointer (several are staggered); the layout keeps a stored position.
    if (opts.at && parent === undefined) {
      const k = out.added.filter((i) => i.startsWith("n")).length - 1;
      out.doc = { ...out.doc, nodes: out.doc.nodes.map((n) => (n.id === r.id ? { ...n, x: Math.round(opts.at!.x + 24 * k), y: Math.round(opts.at!.y + 24 * k) } : n)) };
    }
    const rootEl = resolveReference({ ref: out.doc.root }, out.doc, index, opts);
    const parentEl = parent !== undefined ? res0.get(parent) : undefined;
    const owners = [...new Set([element, element.owner, parentEl, rootEl].filter((o): o is Element => !!o))];
    for (const owner of owners) {
      for (const cand of ownedCandidates(owner, index)) {
        if (!relationOf(cand, index)) continue;
        const e = addElement(out.doc, index, cand, undefined, opts);
        out.doc = e.doc;
        if (e.added && e.id) out.added.push(e.id);
      }
    }
  }
  return out;
}
