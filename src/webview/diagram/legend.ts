/** What the legend lists (D49): the node kinds and line kinds drawn now, once each. No DOM. */
import type { EdgeStyle, ViewModel, VmNode } from "../../diagram/view-model.js";

export interface LegendNode { label: string; shape: VmNode["shape"]; definition: boolean }
export interface LegendEdge { label: string; style: EdgeStyle }
export interface LegendEntries { nodes: LegendNode[]; edges: LegendEdge[] }

const SHAPE_LABELS: Record<string, string> = {
  package: "Package", start: "Start", done: "Done", fork: "Fork or join", decision: "Decision", usecase: "Use case", lifeline: "Lifeline", requirement: "Requirement", port: "Port",
};
const EDGE_LABELS: Record<EdgeStyle, string> = {
  composition: "Composition", specialization: "Specialization", typing: "Typing", connection: "Connection", satisfy: "Satisfy", verify: "Verify", derivation: "Derivation",
  generic: "Relationship", succession: "Succession", flow: "Flow", transition: "Transition", message: "Message", include: "Include", association: "Association", dependency: "Dependency",
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The kind of a node as the legend names it: its keyword (`«part def»` is "Part def"), else its shape. */
export function nodeKindLabel(n: VmNode): string | undefined {
  if (n.shape === "unresolved") return undefined;
  if (n.shape === "package" || n.shape === "port") return SHAPE_LABELS[n.shape];
  const kw = n.keyword?.replace(/[«»]/g, "").trim();
  return kw ? capital(kw) : SHAPE_LABELS[n.shape];
}

/** Node kinds and line kinds in the order first drawn. */
export function legendEntries(vm: Pick<ViewModel, "nodes" | "edges">): LegendEntries {
  const nodes = new Map<string, LegendNode>();
  for (const n of vm.nodes) {
    const label = nodeKindLabel(n);
    if (label !== undefined && !nodes.has(label)) nodes.set(label, { label, shape: n.shape, definition: / def$/.test(label) });
  }
  const edges = new Map<EdgeStyle, LegendEdge>();
  for (const e of vm.edges) if (!edges.has(e.style)) edges.set(e.style, { label: EDGE_LABELS[e.style], style: e.style });
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
