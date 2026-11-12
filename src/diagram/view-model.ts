/**
 * What the diagram webview draws (design D7): a plain-JSON view model computed from a diagram
 * document, its resolution and the model. No `vscode` import and no DOM.
 */
import { inheritedFrom, inheritedMembers, isLibraryUri, type Element, type ModelIndex } from "../model/index.js";
import type { DiagramDocument, DiagramKind, DiagramNode, ElementReference, Point } from "./format.js";
import type { Resolution } from "./resolve.js";
import { endElement, relationOf } from "./relations.js";

export type ShapeKind = "definition" | "usage" | "package" | "requirement" | "port" | "unresolved";
export type EdgeStyle = "composition" | "specialization" | "typing" | "connection" | "satisfy" | "verify" | "derivation" | "generic";

export interface Compartment {
  title: string;
  lines: string[];
  /** Line index to the qualified name of the element that declares the inherited feature on that line. */
  inherited?: Record<number, string>;
}

export interface VmNode {
  id: string;
  shape: ShapeKind;
  /** Keyword in guillemets, e.g. `«part def»`. */
  keyword?: string;
  label: string;
  compartments?: Compartment[];
  /** Documentation text (requirements). */
  doc?: string;
  /** Containing node; absent for ports (they use `attachedTo`). */
  parent?: string;
  /** For ports: the owner node whose border they sit on. */
  attachedTo?: string;
  /** Stored geometry, relative to the parent node (or the canvas for top-level nodes). */
  geometry?: { x?: number; y?: number; w?: number; h?: number };
  resolved: boolean;
  /** For unresolved nodes: the stored reference text. */
  unresolvedRef?: string;
  /** The feature is shown inside a usage that inherits it; `from` is the qualified name of the declaring element. Read-only from that usage. */
  inherited?: { from: string };
  /** What the properties panel shows for a resolved node. `locked` explains why it cannot be edited. */
  props?: NodeProps;
}

export interface NodeProps {
  kind: string;
  qualifiedName?: string;
  name?: string;
  shortName?: string;
  type?: string;
  multiplicity?: string;
  documentation?: string;
  /** The feature is inherited, the element is library content, or the element is a definition-less statement with no name. */
  locked?: "inherited" | "library" | "readonly";
  /** Why a `readonly` element cannot be edited (outside the workspace, excluded, not a file). */
  lockedReason?: string;
  /** Whether the element can have a type and a multiplicity (usages). */
  isUsage: boolean;
}

export interface VmEdge {
  id: string;
  source: string;
  target: string;
  style: EdgeStyle;
  label?: string;
  /** True for edges derived from the model; they are not stored in the file. */
  derived: boolean;
  resolved: boolean;
  unresolvedRef?: string;
  points?: Point[];
}

export interface ViewModel {
  kind: DiagramKind;
  root: string;
  nodes: VmNode[];
  edges: VmEdge[];
}

/** Human-readable form of a stored reference. */
export function referenceText(r: ElementReference): string {
  if (r.ref !== undefined) return r.ref;
  const l = r.locator;
  return l ? `${l.owner}: ${l.kind} ${l.ends.join(" to ")}`.trim() : "(unknown)";
}

function isPackage(e: Element): boolean {
  return e.kind === "package" || e.kind.endsWith(" package");
}

function shapeOf(e: Element, kind: DiagramKind): ShapeKind {
  if (isPackage(e)) return "package";
  if (e.kind.includes("requirement")) return "requirement";
  if (kind === "interconnection" && e.kind === "port") return "port";
  return e.isDefinition ? "definition" : "usage";
}

function typed(e: Element): string {
  return (e.types.length ? ` : ${e.types.join(", ")}` : "") + (e.multiplicity ? ` ${e.multiplicity}` : "");
}

function labelOf(e: Element, shape: ShapeKind): string {
  const name = e.name ?? "(unnamed)";
  if (shape === "requirement") return e.shortName ? `<${e.shortName}> ${name}` : name;
  if (shape === "usage" || shape === "port") return name + typed(e);
  return name;
}

/** Direct members that are not shown as their own nodes, grouped by kind. */
function compartmentsOf(e: Element, shown: Set<Element>, index: ModelIndex, withOwn: boolean, inheritedOwner?: string): Compartment[] {
  const groups = new Map<string, { lines: string[]; inherited: Record<number, string> }>();
  const group = (kind: string) => groups.get(kind) ?? groups.set(kind, { lines: [], inherited: {} }).get(kind)!;
  if (withOwn) {
    for (const m of e.members) {
      if (shown.has(m) || m.name === undefined || !m.isUsage || m.ends.length >= 2) continue;
      const g = group(m.kind);
      // Lines of a node that is itself inherited (or lies beneath an inherited feature) are inherited too.
      if (inheritedOwner !== undefined) g.inherited[g.lines.length] = inheritedOwner;
      g.lines.push(m.name + typed(m));
    }
  }
  // Features inherited through typing and specialization, after the own ones.
  for (const { member, declaredIn } of inheritedMembers(index, e)) {
    if (shown.has(member)) continue;
    const g = group(member.kind);
    g.inherited[g.lines.length] = declaredIn.qualifiedName ?? declaredIn.name ?? "";
    g.lines.push(member.name + typed(member));
  }
  return [...groups].map(([kind, g]) => ({ title: kind.endsWith("s") ? kind : kind + "s", lines: g.lines, ...(Object.keys(g.inherited).length ? { inherited: g.inherited } : {}) }));
}

const EDGE_STYLES: Record<string, EdgeStyle> = {
  connect: "connection", connection: "connection", satisfy: "satisfy", "satisfy requirement": "satisfy",
  verify: "verify", "verify requirement": "verify",
};

function edgeStyleOf(kind: string): EdgeStyle {
  return EDGE_STYLES[kind] ?? (kind.includes("connection") ? "connection" : "generic");
}

/** `readOnly` tells why an element's document must not be edited (see `ModelService.blockedReason`). */
export function buildViewModel(doc: DiagramDocument, resolution: Resolution, index: ModelIndex, readOnly?: (uri: string) => string | undefined): ViewModel {
  const nodeOfElement = new Map<Element, string>();
  for (const n of doc.nodes) {
    const el = resolution.get(n.id);
    if (el && !nodeOfElement.has(el)) nodeOfElement.set(el, n.id);
  }
  const shown = new Set(nodeOfElement.keys());
  const general = doc.kind === "general";

  /** Per node id: the declaring element when the node's feature is inherited by its container, or lies beneath such a node. */
  const inheritedBy = new Map<string, string | undefined>();
  const byNodeId = new Map(doc.nodes.map((x) => [x.id, x] as const));
  const inheritedOf = (n: DiagramNode, depth = 0): string | undefined => {
    if (inheritedBy.has(n.id)) return inheritedBy.get(n.id);
    inheritedBy.set(n.id, undefined);
    const el = resolution.get(n.id);
    if (!el || depth > 50) return undefined;
    const containerId = n.parent ?? (el.owner ? nodeOfElement.get(el.owner) : undefined);
    const containerEl = containerId !== undefined ? resolution.get(containerId) : undefined;
    const direct = containerEl ? inheritedFrom(index, el, containerEl) : undefined;
    const container = containerId !== undefined ? byNodeId.get(containerId) : undefined;
    const from = direct ? (direct.qualifiedName ?? direct.name ?? "") : container ? inheritedOf(container, depth + 1) : undefined;
    inheritedBy.set(n.id, from);
    return from;
  };

  const nodes: VmNode[] = doc.nodes.map((n) => {
    const el = resolution.get(n.id);
    const geometry: NonNullable<VmNode["geometry"]> = {};
    for (const k of ["x", "y", "w", "h"] as const) if (typeof n[k] === "number") geometry[k] = n[k];
    const out: VmNode = { id: n.id, shape: "unresolved", label: "", resolved: !!el };
    if (Object.keys(geometry).length) out.geometry = geometry;
    if (!el) {
      out.unresolvedRef = referenceText(n);
      out.label = n.ref !== undefined ? (n.ref.split("::").pop() ?? n.ref) : (n.locator?.kind ?? "?");
      if (n.parent !== undefined) out.parent = n.parent;
      return out;
    }
    let shape = shapeOf(el, doc.kind);
    // A port whose owner is not on the diagram has nothing to sit on: draw a small labelled box instead.
    const portOwner = n.parent ?? (el.owner ? nodeOfElement.get(el.owner) : undefined);
    if (shape === "port" && (portOwner === undefined || !doc.nodes.some((x) => x.id === portOwner))) shape = "usage";
    out.shape = shape;
    out.label = labelOf(el, shape);
    if (!isPackage(el)) out.keyword = `«${el.kind}»`;
    if (shape === "requirement" && el.documentation) out.doc = el.documentation;
    const fromName = inheritedOf(n);
    if (general && (shape === "definition" || shape === "usage")) {
      const c = compartmentsOf(el, shown, index, shape === "definition", fromName);
      if (c.length) out.compartments = c;
    }
    // A feature shown inside a usage that only inherits it (an Interconnection View of a usage shows its inherited parts and ports).
    const from = fromName;
    if (from !== undefined) out.inherited = { from };
    const blocked = readOnly?.(el.uri);
    out.props = {
      kind: el.kind,
      isUsage: el.isUsage,
      ...(el.qualifiedName !== undefined ? { qualifiedName: el.qualifiedName } : {}),
      ...(el.name !== undefined ? { name: el.name } : {}),
      ...(el.shortName !== undefined ? { shortName: el.shortName } : {}),
      ...(el.types.length ? { type: el.types.join(", ") } : {}),
      ...(el.multiplicity !== undefined ? { multiplicity: el.multiplicity } : {}),
      ...(el.documentation !== undefined ? { documentation: el.documentation } : {}),
      ...(isLibraryUri(el.uri) ? { locked: "library" as const } : from ? { locked: "inherited" as const } : blocked ? { locked: "readonly" as const, lockedReason: blocked } : {}),
    };
    if (shape === "port") {
      if (portOwner !== undefined) out.attachedTo = portOwner;
    } else if (n.parent !== undefined) out.parent = n.parent;
    return out;
  });

  const edges: VmEdge[] = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n] as const));
  /** The node for an end of a relationship: the nearest shown element along the end's name (or owners). */
  const endNode = (end: Parameters<typeof endElement>[1]): string | undefined => {
    const el = endElement(index, end, (x) => nodeOfElement.has(x));
    return el ? nodeOfElement.get(el) : undefined;
  };

  for (const e of doc.edges) {
    const el = resolution.get(e.id);
    let source = e.source;
    let target = e.target;
    let style: EdgeStyle = el ? edgeStyleOf(el.kind) : "generic";
    let label: string | undefined;
    if (el) {
      const rel = relationOf(el, index);
      if (rel) {
        source = endNode(rel.source) ?? source;
        target = endNode(rel.target) ?? target;
        if (rel.kind === "derivation") { style = "derivation"; label = "«derive»"; }
      }
      if (style === "satisfy" || style === "verify") label = `«${style}»`;
      else if (style === "generic" && el.name) label = el.name;
    }
    const out: VmEdge = { id: e.id, source, target, style, derived: false, resolved: !!el };
    if (label) out.label = label;
    if (!el) {
      out.unresolvedRef = referenceText(e);
      out.label = out.unresolvedRef;
    }
    if (e.points?.length) out.points = e.points;
    edges.push(out);
  }

  if (general) {
    const have = new Set(edges.map((e) => `${e.style}\u0000${e.source}\u0000${e.target}`));
    const add = (style: EdgeStyle, source: string, target: string, label?: string) => {
      const key = `${style}\u0000${source}\u0000${target}`;
      if (source === target || have.has(key)) return;
      have.add(key);
      edges.push({ id: `d:${style}:${source}:${target}`, source, target, style, derived: true, resolved: true, ...(label ? { label } : {}) });
    };
    for (const [el, id] of nodeOfElement) {
      const nodeParent = byId.get(id)?.parent;
      if (el.isUsage && el.owner?.isDefinition) {
        const owner = nodeOfElement.get(el.owner);
        if (owner !== undefined && nodeParent !== owner) add("composition", owner, id, el.name ? el.name + (el.multiplicity ? ` ${el.multiplicity}` : "") : undefined);
      }
      if (el.isDefinition) {
        for (const s of el.specializes) {
          const t = index.resolve(s, el);
          const tid = t ? nodeOfElement.get(t) : undefined;
          if (tid !== undefined) add("specialization", id, tid);
        }
      } else if (el.isUsage) {
        for (const ty of el.typeNames) {
          const t = index.resolve(ty, el);
          const tid = t ? nodeOfElement.get(t) : undefined;
          if (tid !== undefined) add("typing", id, tid);
        }
      }
    }
  }
  return { kind: doc.kind, root: doc.root, nodes, edges };
}
