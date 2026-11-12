/** A bounded plain-JSON description of a diagram for agents. No `vscode` import. */
import { analyze, interactionOf, isSynthetic, type Element, type ModelIndex } from "../model/index.js";
import type { DiagramDocument, ElementLocator, Point } from "./format.js";
import { referenceFor, resolveDiagram, type Resolution, type ResolveOptions } from "./resolve.js";

export const MAX_DESCRIBED_NODES = 500;
export const MAX_DESCRIBED_EDGES = 1000;
export const MAX_DESCRIBED_UNRESOLVED = 500;

export interface DescribedElement {
  name?: string;
  qualifiedName?: string;
  kind: string;
  types: string[];
  ends?: string[];
  /** A `start` or `done` node, or a succession implied by `then`: not an element with a declaration of its own. */
  implied?: boolean;
  /** For unnamed elements: owner, kind and ends (and an index among twins) that identify it. */
  locator?: ElementLocator;
}

export interface DescribedItem {
  id: string;
  element?: DescribedElement;
  resolved: boolean;
}

/** What an agent needs to know about a behaviour statement drawn as an edge: guard, trigger, effect, order. */
export interface DescribedBehavior {
  /** `succession`, `flow`, `transition` or `message`. */
  type: string;
  /** Source text of a succession's guard (`else` for an else branch). */
  guard?: string;
  /** The succession is written as part of a node declaration (`then ...`). */
  implied?: boolean;
  /** Trigger, guard and effect of a transition, as source text. */
  trigger?: string;
  effect?: string;
  /** Flow: item type (`flow of T`) and the parameter ends as written. */
  item?: string;
  from?: string;
  to?: string;
  /** Message: item type, position in time order (from 0) and whether the model leaves its order against another message open. */
  itemType?: string;
  order?: number;
  unordered?: boolean;
}

export interface DiagramDescription {
  kind: string;
  root: string;
  sources: string[];
  nodes: (DescribedItem & { parent?: string; x?: number; y?: number; w?: number; h?: number; collapsed?: boolean })[];
  edges: (DescribedItem & { source: string; target: string; points?: Point[]; behavior?: DescribedBehavior })[];
  /** Sequence views: the messages in time order, with the lifelines they run between. Vertical positions are computed, never stored. */
  messages?: { id?: string; name?: string; itemType?: string; from: string; to: string; order: number; unordered: boolean }[];
  unresolved: { id: string; ref?: string; locator?: ElementLocator }[];
  note?: string;
}

function behaviorOf(index: ModelIndex, el: Element): DescribedBehavior | undefined {
  const owner = el.owner;
  if (!owner) return undefined;
  if (el.kind === "succession") {
    const s = analyze(index, owner).successions.find((x) => x.statement === el);
    return s ? { type: "succession", ...(s.guard !== undefined ? { guard: s.guard } : {}), ...(s.implied ? { implied: true } : {}) } : undefined;
  }
  if (el.kind === "transition") {
    const t = analyze(index, owner).transitions.find((x) => x.statement === el);
    return t ? { type: "transition", ...(t.trigger !== undefined ? { trigger: t.trigger } : {}), ...(t.guard !== undefined ? { guard: t.guard } : {}), ...(t.effect !== undefined ? { effect: t.effect } : {}) } : undefined;
  }
  if (el.kind === "flow") {
    const f = analyze(index, owner).flows.find((x) => x.statement === el);
    return f ? { type: "flow", ...(f.item !== undefined ? { item: f.item } : {}), from: f.sourceText, to: f.targetText } : undefined;
  }
  if (el.kind === "message") {
    const m = interactionOf(index, owner).messages.find((x) => x.statement === el);
    return m ? { type: "message", ...(m.itemType !== undefined ? { itemType: m.itemType } : {}), from: m.fromParticipant ?? m.from, to: m.toParticipant ?? m.to, order: m.order, unordered: m.unordered } : undefined;
  }
  return undefined;
}

export function describeDiagram(doc: DiagramDocument, index: ModelIndex, opts: ResolveOptions & { resolution?: Resolution } = {}): DiagramDescription {
  const res = opts.resolution ?? resolveDiagram(doc, index, opts);
  const describe = (id: string): DescribedItem => {
    const el = res.get(id);
    if (!el) return { id, resolved: false };
    const element: DescribedElement = { kind: el.kind, types: [...el.types] };
    if (el.name !== undefined) element.name = el.name;
    if (el.qualifiedName !== undefined) element.qualifiedName = el.qualifiedName;
    if (el.ends.length) element.ends = [...el.ends];
    if (isSynthetic(el)) element.implied = true;
    // An unnamed statement (a succession, transition or message) is addressed by this locator, e.g. by sysml_delete_element.
    if (el.qualifiedName === undefined) {
      const loc = referenceFor(el, index)?.locator;
      if (loc) element.locator = loc;
    }
    return { id, element, resolved: true };
  };
  const nodes = doc.nodes.slice(0, MAX_DESCRIBED_NODES).map((n) => {
    const out: DiagramDescription["nodes"][number] = { ...describe(n.id) };
    if (n.parent !== undefined) out.parent = n.parent;
    for (const k of ["x", "y", "w", "h", "collapsed"] as const) if (n[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = n[k];
    return out;
  });
  const edges = doc.edges.slice(0, MAX_DESCRIBED_EDGES).map((e) => {
    const out: DiagramDescription["edges"][number] = { ...describe(e.id), source: e.source, target: e.target };
    if (e.points?.length) out.points = e.points;
    const el = res.get(e.id);
    const b = el ? behaviorOf(index, el) : undefined;
    if (b) out.behavior = b;
    return out;
  });
  const allUnresolved = [...doc.nodes, ...doc.edges].filter((i) => !res.get(i.id));
  const unresolved = allUnresolved.slice(0, MAX_DESCRIBED_UNRESOLVED).map((i) => ({
    id: i.id,
    ...(i.ref !== undefined ? { ref: i.ref } : {}),
    ...(i.locator !== undefined ? { locator: i.locator } : {}),
  }));
  const out: DiagramDescription = { kind: doc.kind, root: doc.root, sources: doc.sources, nodes, edges, unresolved };
  if (doc.kind === "sequence") {
    const rootEl = res.get(doc.nodes.find((n) => n.ref === doc.root)?.id ?? "") ?? index.findByQualifiedName(doc.root)[0];
    if (rootEl) {
      const idOf = new Map<Element, string>();
      for (const e of doc.edges) { const x = res.get(e.id); if (x) idOf.set(x, e.id); }
      out.messages = interactionOf(index, rootEl).messages.map((m) => ({ ...(idOf.get(m.statement) ? { id: idOf.get(m.statement)! } : {}), ...(m.name !== undefined ? { name: m.name } : {}), ...(m.itemType !== undefined ? { itemType: m.itemType } : {}), from: m.fromParticipant ?? m.from, to: m.toParticipant ?? m.to, order: m.order, unordered: m.unordered }));
    }
  }
  const cut: string[] = [];
  if (doc.nodes.length > nodes.length) cut.push(`${doc.nodes.length} nodes (showing the first ${nodes.length})`);
  if (doc.edges.length > edges.length) cut.push(`${doc.edges.length} edges (showing the first ${edges.length})`);
  if (allUnresolved.length > unresolved.length) cut.push(`${allUnresolved.length} unresolved items (listing the first ${unresolved.length})`);
  if (cut.length) out.note = `Truncated: the diagram has ${cut.join(" and ")}.`;
  return out;
}
