/**
 * What the diagram webview draws (design D7): a plain-JSON view model computed from a diagram
 * document, its resolution and the model. No `vscode` import and no DOM.
 */
import { analyze, inheritedFrom, inheritedMembers, interactionOf, isLibraryUri, isSynthetic, stateActions, isStateKind, type Element, type ModelIndex } from "../model/index.js";
import type { DiagramDocument, DiagramKind, DiagramNode, ElementReference, LabelLayout, Point } from "./format.js";
import type { Resolution } from "./resolve.js";
import { endElement, relationOf } from "./relations.js";
import { nestFamily } from "../edit/nest.js";

export type ShapeKind =
  | "definition" | "usage" | "package" | "requirement" | "port" | "unresolved"
  /** Action Flow and State Transition views (design D15). */
  | "action" | "state" | "start" | "done" | "fork" | "decision"
  /** An oval (General View) and a lifeline column (Sequence View). */
  | "usecase" | "lifeline";
export type EdgeStyle = "composition" | "specialization" | "typing" | "connection" | "satisfy" | "verify" | "derivation" | "generic" | "succession" | "flow" | "transition" | "message" | "include" | "association";

export interface Compartment {
  /** Empty: no title row (state actions). */
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
  /** Nesting by dropping (D33): the family of declarations that nest into each other (`state`, `action`, `part`, or `package`), and whether this node can be dragged into another. */
  nest?: { family: string; movable: boolean };
  /** A parameter pin of an Action Flow action (D36): a directed feature drawn on its owner's border (shape `port`, `attachedTo` the action). `id` of a pin the diagram does not store starts with `pin:`. */
  pin?: { direction: string; qualifiedName?: string; type?: string };
  /** Tooltip text (a pin's type). */
  tooltip?: string;
  /** The control node kind (`fork`, `join`, `decide`, `merge`) or pseudostate (`start`, `done`). */
  variant?: string;
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
  /** Stored layout of the label (offset from the route's anchor, size, wrapping). */
  labelLayout?: LabelLayout;
  /** Sequence views: the route is computed from time order and is never routed around nodes. */
  fixed?: boolean;
  /** Messages: position in time order, and whether the model leaves the order against another message open. */
  order?: number;
  unordered?: boolean;
  /** What the properties panel edits for a selected transition, as source text. */
  transition?: TransitionProps;
  /** The edge's element cannot be edited (library, inherited, implied by the language, read-only file). */
  locked?: string;
  /** The statement is written as part of another declaration and has no statement of its own. */
  implied?: boolean;
  /** The edge's element kind (`succession`, `transition`, `message`, `flow`, ...). */
  elementKind?: string;
}

/** Trigger, guard and effect of a transition, as source text. */
export interface TransitionProps {
  trigger: string;
  guard: string;
  effect: string;
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

const USE_CASE_KINDS = new Set(["use case", "use case def", "include use case"]);

function shapeOf(e: Element, kind: DiagramKind): ShapeKind {
  if (isPackage(e)) return "package";
  if (kind === "actionFlow" || kind === "stateTransition") {
    if (e.kind === "start" || e.kind === "done") return e.kind;
    if (e.kind === "fork" || e.kind === "join") return "fork";
    if (e.kind === "decide" || e.kind === "merge") return "decision";
    if (kind === "stateTransition") return isStateKind(e.kind) ? "state" : "usage";
    return isStateKind(e.kind) ? "usage" : "action";
  }
  if (kind === "sequence" && e.isUsage && e.kind !== "message") return "lifeline";
  if (kind === "general" && USE_CASE_KINDS.has(e.kind)) return "usecase";
  if (e.kind.includes("requirement")) return "requirement";
  if (kind === "interconnection" && e.kind === "port") return "port";
  return e.isDefinition ? "definition" : "usage";
}

function typed(e: Element): string {
  return (e.types.length ? ` : ${e.types.join(", ")}` : "") + (e.multiplicity ? ` ${e.multiplicity}` : "");
}

/** A lifeline for an unnamed part that redefines another (`ref part :>> driver`) is labelled with that name. */
function participantLabel(e: Element): string {
  const r = e.redefines[0] ?? e.subsets[0];
  return (r !== undefined ? r.split(/::|\./).pop() : undefined) ?? "(unnamed)";
}

function labelOf(e: Element, shape: ShapeKind): string {
  const name = e.name ?? "(unnamed)";
  if (shape === "requirement") return e.shortName ? `<${e.shortName}> ${name}` : name;
  if (shape === "usage" || shape === "port" || shape === "lifeline" || shape === "action") return name + typed(e);
  if (shape === "start" || shape === "done" || shape === "fork" || shape === "decision") return e.name ?? "";
  return name;
}

/** `in `, `out ` or `inout ` before a directed feature's name. */
function directed(e: Element): string {
  return e.direction ? `${e.direction} ` : "";
}

/** Direct members that are not shown as their own nodes, grouped by kind. */
function compartmentsOf(e: Element, shown: Set<Element>, index: ModelIndex, withOwn: boolean, inheritedOwner?: string): Compartment[] {
  const groups = new Map<string, { lines: string[]; inherited: Record<number, string> }>();
  const group = (kind: string) => groups.get(kind) ?? groups.set(kind, { lines: [], inherited: {} }).get(kind)!;
  if (withOwn) {
    for (const m of e.members) {
      if (shown.has(m) || m.name === undefined || !m.isUsage || m.ends.length >= 2) continue;
      const g = group(m.direction ? "parameter" : m.kind);
      // Lines of a node that is itself inherited (or lies beneath an inherited feature) are inherited too.
      if (inheritedOwner !== undefined) g.inherited[g.lines.length] = inheritedOwner;
      g.lines.push(directed(m) + m.name + typed(m));
    }
  }
  // Features inherited through typing and specialization, after the own ones.
  for (const { member, declaredIn } of inheritedMembers(index, e)) {
    if (shown.has(member)) continue;
    const g = group(member.direction ? "parameter" : member.kind);
    g.inherited[g.lines.length] = declaredIn.qualifiedName ?? declaredIn.name ?? "";
    g.lines.push(directed(member) + member.name + typed(member));
  }
  return [...groups].map(([kind, g]) => ({ title: kind.endsWith("s") ? kind : kind + "s", lines: g.lines, ...(Object.keys(g.inherited).length ? { inherited: g.inherited } : {}) }));
}

const EDGE_STYLES: Record<string, EdgeStyle> = {
  succession: "succession", transition: "transition", flow: "flow", message: "message",
  connect: "connection", connection: "connection", satisfy: "satisfy", "satisfy requirement": "satisfy",
  verify: "verify", "verify requirement": "verify",
};

function edgeStyleOf(kind: string): EdgeStyle {
  return EDGE_STYLES[kind] ?? (kind.includes("connection") ? "connection" : "generic");
}

/** Label and details of a succession, flow, transition or message edge, read from the statement's source text. */
function behaviorEdge(index: ModelIndex, el: Element): Partial<VmEdge> {
  const owner = el.owner;
  if (!owner) return {};
  if (el.kind === "succession") {
    const s = analyze(index, owner).successions.find((x) => x.statement === el);
    if (!s) return {};
    return { ...(s.guard !== undefined ? { label: `[${s.guard}]` } : {}), ...(s.implied ? { implied: true } : {}) };
  }
  if (el.kind === "flow") {
    const f = analyze(index, owner).flows.find((x) => x.statement === el);
    if (!f) return {};
    const lbl = f.item ?? `${f.sourceText} \u2192 ${f.targetText}`;
    return { label: lbl };
  }
  if (el.kind === "transition") {
    const t = analyze(index, owner).transitions.find((x) => x.statement === el);
    if (!t) return {};
    const text = [t.trigger, t.guard !== undefined ? `[${t.guard}]` : undefined, t.effect !== undefined ? `/ ${t.effect}` : undefined].filter((x) => x !== undefined && x !== "").join(" ");
    return { ...(text ? { label: text.replace(/\s+/g, " ") } : {}), transition: { trigger: t.trigger ?? "", guard: t.guard ?? "", effect: t.effect ?? "" } };
  }
  if (el.kind === "message") {
    const m = interactionOf(index, owner).messages.find((x) => x.statement === el);
    if (!m) return {};
    const name = [m.name, m.itemType].filter((x) => x !== undefined).join(" : ");
    return { fixed: true, order: m.order, unordered: m.unordered, label: name || "message" };
  }
  return {};
}

/**
 * Parameter pins (D36): the directed features of every action node, own and inherited. One the diagram stores (a node of the
 * feature under the action) becomes the pin; the others are drawn from the model with ids that start with `pin:`.
 */
function addPins(nodes: VmNode[], resolution: Resolution, index: ModelIndex, nodeOfElement: Map<Element, string>): void {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  for (const n of [...nodes]) {
    if (n.shape !== "action" || !n.resolved) continue;
    const el = resolution.get(n.id);
    if (!el) continue;
    const directed: { member: Element; from?: Element }[] = [
      ...el.members.filter((m) => m.direction && m.isUsage && m.name !== undefined).map((member) => ({ member })),
      ...inheritedMembers(index, el).filter((m) => m.member.direction && m.member.name !== undefined).map((m) => ({ member: m.member, from: m.declaredIn })),
    ];
    for (const { member, from } of directed) {
      const type = member.types.join(", ");
      const pin = { direction: member.direction!, ...(member.qualifiedName !== undefined ? { qualifiedName: member.qualifiedName } : {}), ...(type ? { type } : {}) };
      const tooltip = `${member.direction} ${member.name}${type ? ` : ${type}` : ""}${from ? ` (inherited from ${from.name ?? from.kind})` : ""}`;
      const stored = nodeOfElement.get(member);
      const existing = stored !== undefined ? byId.get(stored) : undefined;
      if (existing) {
        if (existing.parent !== undefined && existing.parent !== n.id) continue;
        existing.shape = "port";
        existing.attachedTo = n.id;
        delete existing.parent;
        existing.label = member.name!;
        existing.pin = pin;
        existing.tooltip = tooltip;
        delete existing.keyword;
        continue;
      }
      const vm: VmNode = { id: `pin:${n.id}:${member.name}`, shape: "port", label: member.name!, resolved: true, attachedTo: n.id, pin, tooltip, ...(from ? { inherited: { from: from.qualifiedName ?? from.name ?? "" } } : {}) };
      nodes.push(vm);
      byId.set(vm.id, vm);
      if (!nodeOfElement.has(member)) nodeOfElement.set(member, vm.id);
    }
  }
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

  const hiddenRoot = doc.kind === "sequence" ? doc.nodes.find((n) => n.ref === doc.root)?.id : undefined;
  const nodes: VmNode[] = doc.nodes.filter((n) => n.id !== hiddenRoot).map((n) => {
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
    if (shape === "lifeline" && out.label === "(unnamed)") out.label = participantLabel(el);
    if (!isPackage(el)) out.keyword = `«${el.kind}»`;
    if (shape === "start" || shape === "done" || shape === "fork" || shape === "decision") { out.variant = el.kind; delete out.keyword; }
    if (shape === "lifeline") delete out.keyword;
    if (shape === "state") {
      const lines = stateActions(index, el).map((a) => `${a.kind} / ${a.text}`);
      if (lines.length) out.compartments = [{ title: "", lines }];
    }
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
    {
      const fam = isPackage(el) ? "package" : nestFamily(el.kind);
      if (fam && (shape !== "port")) out.nest = { family: fam, movable: el.isUsage && fam !== "package" && !isLibraryUri(el.uri) && !isSynthetic(el) && !blocked && el.name !== undefined };
    }
    out.props = {
      kind: el.kind,
      isUsage: el.isUsage,
      ...(el.qualifiedName !== undefined ? { qualifiedName: el.qualifiedName } : {}),
      ...(el.name !== undefined ? { name: el.name } : {}),
      ...(el.shortName !== undefined ? { shortName: el.shortName } : {}),
      ...(el.types.length ? { type: el.types.join(", ") } : {}),
      ...(el.multiplicity !== undefined ? { multiplicity: el.multiplicity } : {}),
      ...(el.documentation !== undefined ? { documentation: el.documentation } : {}),
      ...(isLibraryUri(el.uri) ? { locked: "library" as const } : from ? { locked: "inherited" as const } : isSynthetic(el) ? { locked: "readonly" as const, lockedReason: `The ${el.kind} node is implied by the language and has no declaration of its own.` } : blocked ? { locked: "readonly" as const, lockedReason: blocked } : {}),
    };
    if (shape === "port") {
      if (portOwner !== undefined) out.attachedTo = portOwner;
    } else if (n.parent !== undefined && doc.kind !== "sequence") out.parent = n.parent;
    return out;
  });

  if (doc.kind === "actionFlow") addPins(nodes, resolution, index, nodeOfElement);

  const edges: VmEdge[] = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n] as const));
  /** The node for an end of a relationship: the nearest shown element along the end's name (or owners). */
  const endNode = (end: Parameters<typeof endElement>[1]): string | undefined => {
    const el = endElement(index, end, (x) => nodeOfElement.has(x));
    return el ? nodeOfElement.get(el) : undefined;
  };

  for (const e of doc.edges) {
    if (e.source === hiddenRoot || e.target === hiddenRoot) continue;
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
        if (rel.kind === "flow" && el.owner) {
          // A flow runs from pin to pin: the ends are written as paths to features (`a.x`).
          const f = analyze(index, el.owner).flows.find((x) => x.statement === el);
          if (f) {
            source = endNode({ scope: el.owner, text: f.sourceText }) ?? source;
            target = endNode({ scope: el.owner, text: f.targetText }) ?? target;
          }
        }
        if (rel.kind === "derivation") { style = "derivation"; label = "«derive»"; }
      }
      if (style === "satisfy" || style === "verify") label = `«${style}»`;
      else if (style === "generic" && el.name) label = el.name;
    }
    const out: VmEdge = { id: e.id, source, target, style, derived: false, resolved: !!el };
    if (el) {
      out.elementKind = el.kind;
      Object.assign(out, behaviorEdge(index, el));
      label = out.label ?? label;
      const blocked = isLibraryUri(el.uri) ? "Standard library content is read-only." : readOnly?.(el.uri);
      if (blocked) out.locked = blocked;
    }
    if (label) out.label = label;
    if (!el) {
      out.unresolvedRef = referenceText(e);
      out.label = out.unresolvedRef;
    }
    if (e.points?.length) out.points = e.points;
    if (e.label !== undefined) out.labelLayout = e.label;
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
        const useCase = USE_CASE_KINDS.has(el.owner.kind) || el.owner.kind === "use case";
        if (owner !== undefined && nodeParent !== owner && el.kind !== "include use case") {
          if (useCase && (el.kind === "actor" || el.kind === "subject")) add("association", owner, id, el.kind === "subject" ? "«subject»" : undefined);
          else add("composition", owner, id, el.name ? el.name + (el.multiplicity ? ` ${el.multiplicity}` : "") : undefined);
        }
      }
      if (el.isUsage && !el.owner?.isDefinition && el.owner && USE_CASE_KINDS.has(el.owner.kind) && (el.kind === "actor" || el.kind === "subject")) {
        const owner = nodeOfElement.get(el.owner);
        if (owner !== undefined && nodeParent !== owner) add("association", owner, id, el.kind === "subject" ? "«subject»" : undefined);
      }
      if (USE_CASE_KINDS.has(el.kind) || el.kind === "use case") {
        // `include use case x : X;`, `include x;`: the included use case is the typed definition, or the usage named.
        for (const inc of el.members.filter((m) => m.kind === "include use case" || m.kind === "include")) {
          const targets = [...inc.typeNames.map((t) => index.resolve(t, inc)), ...inc.ends.map((t) => index.resolve(t.replace(/\s+/g, "").split(".")[0]!, inc)), nodeOfElement.has(inc) ? inc : undefined];
          for (const t of targets) {
            const tid = t ? nodeOfElement.get(t) : undefined;
            if (tid !== undefined) add("include", id, tid, "«include»");
          }
        }
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
