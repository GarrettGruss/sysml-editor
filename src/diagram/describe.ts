/** A bounded plain-JSON description of a diagram for agents. No `vscode` import. */
import type { ModelIndex } from "../model/index.js";
import type { DiagramDocument, ElementLocator, Point } from "./format.js";
import { resolveDiagram, type Resolution, type ResolveOptions } from "./resolve.js";

export const MAX_DESCRIBED_NODES = 500;
export const MAX_DESCRIBED_EDGES = 1000;
export const MAX_DESCRIBED_UNRESOLVED = 500;

export interface DescribedElement {
  name?: string;
  qualifiedName?: string;
  kind: string;
  types: string[];
  ends?: string[];
}

export interface DescribedItem {
  id: string;
  element?: DescribedElement;
  resolved: boolean;
}

export interface DiagramDescription {
  kind: string;
  root: string;
  sources: string[];
  nodes: (DescribedItem & { parent?: string; x?: number; y?: number; w?: number; h?: number; collapsed?: boolean })[];
  edges: (DescribedItem & { source: string; target: string; points?: Point[] })[];
  unresolved: { id: string; ref?: string; locator?: ElementLocator }[];
  note?: string;
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
    return out;
  });
  const allUnresolved = [...doc.nodes, ...doc.edges].filter((i) => !res.get(i.id));
  const unresolved = allUnresolved.slice(0, MAX_DESCRIBED_UNRESOLVED).map((i) => ({
    id: i.id,
    ...(i.ref !== undefined ? { ref: i.ref } : {}),
    ...(i.locator !== undefined ? { locator: i.locator } : {}),
  }));
  const out: DiagramDescription = { kind: doc.kind, root: doc.root, sources: doc.sources, nodes, edges, unresolved };
  const cut: string[] = [];
  if (doc.nodes.length > nodes.length) cut.push(`${doc.nodes.length} nodes (showing the first ${nodes.length})`);
  if (doc.edges.length > edges.length) cut.push(`${doc.edges.length} edges (showing the first ${edges.length})`);
  if (allUnresolved.length > unresolved.length) cut.push(`${allUnresolved.length} unresolved items (listing the first ${unresolved.length})`);
  if (cut.length) out.note = `Truncated: the diagram has ${cut.join(" and ")}.`;
  return out;
}
