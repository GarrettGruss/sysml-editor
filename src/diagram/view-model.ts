/**
 * What the diagram webview draws (design D7): a plain-JSON view model computed from a diagram
 * document, its resolution and the model. No `vscode` import and no DOM.
 */
import type { Element, ModelIndex } from "../model/index.js";
import type { DiagramDocument, DiagramKind, ElementReference, Point } from "./format.js";
import type { Resolution } from "./resolve.js";

export type ShapeKind = "definition" | "usage" | "package" | "requirement" | "port" | "unresolved";
export type EdgeStyle = "composition" | "specialization" | "typing" | "connection" | "satisfy" | "verify" | "generic";

export interface Compartment {
  title: string;
  lines: string[];
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
function compartmentsOf(e: Element, shown: Set<Element>): Compartment[] {
  const groups = new Map<string, string[]>();
  for (const m of e.members) {
    if (shown.has(m) || m.name === undefined || !m.isUsage || m.ends.length >= 2) continue;
    const lines = groups.get(m.kind) ?? [];
    lines.push(m.name + typed(m));
    groups.set(m.kind, lines);
  }
  return [...groups].map(([kind, lines]) => ({ title: kind.endsWith("s") ? kind : kind + "s", lines }));
}

const EDGE_STYLES: Record<string, EdgeStyle> = {
  connect: "connection", connection: "connection", satisfy: "satisfy", "satisfy requirement": "satisfy",
  verify: "verify", "verify requirement": "verify",
};

function edgeStyleOf(kind: string): EdgeStyle {
  return EDGE_STYLES[kind] ?? (kind.includes("connection") ? "connection" : "generic");
}

export function buildViewModel(doc: DiagramDocument, resolution: Resolution, index: ModelIndex): ViewModel {
  const nodeOfElement = new Map<Element, string>();
  for (const n of doc.nodes) {
    const el = resolution.get(n.id);
    if (el && !nodeOfElement.has(el)) nodeOfElement.set(el, n.id);
  }
  const shown = new Set(nodeOfElement.keys());
  const general = doc.kind === "general";

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
    if (general && shape === "definition") {
      const c = compartmentsOf(el, shown);
      if (c.length) out.compartments = c;
    }
    if (shape === "port") {
      if (portOwner !== undefined) out.attachedTo = portOwner;
    } else if (n.parent !== undefined) out.parent = n.parent;
    return out;
  });

  const edges: VmEdge[] = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n] as const));
  const memberOf = (el: Element, name: string, depth = 0): Element | undefined => {
    const own = el.members.find((m) => m.name === name);
    if (own || depth > 5) return own;
    for (const t of [...el.types, ...el.specializes]) {
      const def = index.resolve(t, el);
      const found = def && memberOf(def, name, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  /** The node an end text such as `engine.drive` refers to: the port node if shown, else the nearest shown prefix. */
  const endNode = (owner: Element, end: string): string | undefined => {
    const [first, ...rest] = end.replace(/\s+/g, "").split(/\.|::/);
    let el = first ? index.resolve(first, owner) : undefined;
    let hit = el ? nodeOfElement.get(el) : undefined;
    for (const seg of rest) {
      el = el && memberOf(el, seg);
      if (!el) break;
      hit = nodeOfElement.get(el) ?? hit;
    }
    return hit;
  };

  for (const e of doc.edges) {
    const el = resolution.get(e.id);
    let source = e.source;
    let target = e.target;
    const style = el ? edgeStyleOf(el.kind) : "generic";
    let label: string | undefined;
    if (el) {
      if (el.ends.length >= 2) {
        const o = el.owner ?? el;
        source = endNode(o, el.ends[0]!) ?? source;
        target = endNode(o, el.ends[el.ends.length - 1]!) ?? target;
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
        for (const ty of el.types) {
          const t = index.resolve(ty, el);
          const tid = t ? nodeOfElement.get(t) : undefined;
          if (tid !== undefined) add("typing", id, tid);
        }
      }
    }
  }
  return { kind: doc.kind, root: doc.root, nodes, edges };
}
