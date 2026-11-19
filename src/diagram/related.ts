/**
 * Showing and hiding the parts and ports of a node, and pulling in related elements (D46). Layout edits only:
 * they add or remove nodes and lines of the diagram and never touch the model. No `vscode` import.
 */
import { inheritedMembers, isActionNode, isLibraryUri, isStateNode, type Element, type ModelIndex } from "../model/index.js";
import type { DiagramDocument, DiagramNode } from "./format.js";
import { addElement } from "./create.js";
import { removeItems } from "./edits.js";
import { endElement, relationOf } from "./relations.js";
import { ownedCandidates, referenceFor, referenceKey, resolveDiagram, resolveReference, type ResolveOptions } from "./resolve.js";
import type { ViewModel } from "./view-model.js";

/** Diagram kinds whose nodes are chosen by the user (the behaviour views draw what the behaviour owns). */
export const FREE_KINDS: readonly DiagramDocument["kind"][] = ["general", "interconnection", "requirements"];

// ---- parts and ports ------------------------------------------------------------------------

export interface MemberChoice {
  /** `referenceKey` of the member. */
  key: string;
  element: Element;
  label: string;
  kind: "part" | "port";
  /** Name of the element that declares it, when the selected element only inherits it. */
  inheritedFrom?: string;
  /** Whether a node for it is on the diagram now. */
  drawn: boolean;
}

const lastWord = (e: Element) => e.kind.split(" ").pop();
const memberKind = (m: Element): "part" | "port" | undefined => {
  if (!m.isUsage || m.name === undefined || m.qualifiedName === undefined) return undefined;
  const w = lastWord(m);
  return w === "part" || w === "port" ? w : undefined;
};

function elementOfNode(doc: DiagramDocument, index: ModelIndex, nodeId: string, opts: ResolveOptions): Element | undefined {
  const n = doc.nodes.find((x) => x.id === nodeId);
  return n ? resolveReference(n, doc, index, opts) : undefined;
}

/** The direct parts and ports of the element of node `nodeId`, own first and then inherited, each marked as drawn or not. */
export function memberChoices(doc: DiagramDocument, index: ModelIndex, nodeId: string, opts: ResolveOptions = {}): MemberChoice[] {
  const el = elementOfNode(doc, index, nodeId, opts);
  if (!el) return [];
  const drawn = new Set(doc.nodes.map((n) => referenceKey(n)));
  const out: MemberChoice[] = [];
  const add = (m: Element, from?: Element) => {
    const kind = memberKind(m);
    if (!kind) return;
    const key = referenceKey({ ref: m.qualifiedName! });
    if (out.some((c) => c.key === key)) return;
    out.push({ key, element: m, label: m.name!, kind, ...(from ? { inheritedFrom: from.name ?? from.kind } : {}), drawn: drawn.has(key) });
  };
  for (const m of el.members) add(m);
  for (const i of inheritedMembers(index, el)) add(i.member, i.declaredIn);
  return out;
}

/** Relationship statements around `owners` whose ends are both drawn become lines. */
function addLinesAround(doc: DiagramDocument, index: ModelIndex, owners: readonly (Element | undefined)[], opts: ResolveOptions): { doc: DiagramDocument; added: string[] } {
  let cur = doc;
  const added: string[] = [];
  for (const owner of new Set(owners.filter((o): o is Element => !!o))) {
    for (const cand of ownedCandidates(owner, index)) {
      if (!relationOf(cand, index)) continue;
      const r = addElement(cur, index, cand, undefined, opts);
      cur = r.doc;
      if (r.added && r.id) added.push(r.id);
    }
  }
  return { doc: cur, added };
}

export interface MembersResult { doc: DiagramDocument; added: number; removed: number }

/**
 * Make exactly the members in `wanted` (keys of `memberChoices`) drawn: tick adds the node (a port on the border of the
 * node, a part inside it on an Interconnection View) and its lines; untick removes only that node and its lines.
 */
export function setMembers(doc: DiagramDocument, index: ModelIndex, nodeId: string, wanted: ReadonlySet<string>, opts: ResolveOptions = {}, vm?: ViewModel): MembersResult {
  const sel = elementOfNode(doc, index, nodeId, opts);
  let cur = doc;
  let added = 0;
  let removed = 0;
  if (!sel) return { doc, added, removed };
  const choices = memberChoices(doc, index, nodeId, opts);
  const justAdded: string[] = [];
  for (const c of choices) {
    const node = cur.nodes.find((n) => referenceKey(n) === c.key);
    if (wanted.has(c.key) && !node) {
      // On an Interconnection View parts sit inside the node and ports on its border; elsewhere they are nodes of their own.
      const parent = cur.kind === "interconnection" ? nodeId : undefined;
      const r = addElement(cur, index, c.element, parent, opts);
      cur = r.doc;
      if (r.added) { added++; if (r.id) justAdded.push(r.id); }
    } else if (!wanted.has(c.key) && node) {
      const vmNow = vm && cur === doc ? vm : undefined;
      cur = removeItems(cur, [node.id], vmNow);
      removed++;
    }
  }
  if (added) cur = addLinesAround(cur, index, [sel, ...choices.filter((c) => wanted.has(c.key)).map((c) => c.element.owner)], opts).doc;
  return { doc: cur, added, removed };
}

// ---- related elements -----------------------------------------------------------------------

export type RelatedKind = "connection" | "flow" | "specialization" | "typing" | "satisfy" | "verify" | "derivation" | "ownership";

export const RELATED_LABELS: Record<RelatedKind, string> = {
  connection: "Connections",
  flow: "Flows",
  specialization: "Specialization",
  typing: "Typing",
  satisfy: "Satisfy",
  verify: "Verify",
  derivation: "Derivation",
  ownership: "Ownership",
};

export interface RelatedItem {
  kind: RelatedKind;
  /** The element to draw. */
  element: Element;
  /** The relationship statement that relates it, when it is one. */
  relation?: Element;
}

function* allElements(index: ModelIndex): Generator<Element> {
  const walk = function* (e: Element): Generator<Element> {
    yield e;
    for (const m of e.members) yield* walk(m);
  };
  for (const uri of index.uris()) {
    if (isLibraryUri(uri)) continue;
    for (const r of index.getDocument(uri)?.model.roots ?? []) yield* walk(r);
  }
}

const drawable = (e: Element | undefined): e is Element => !!e && e.qualifiedName !== undefined && !isLibraryUri(e.uri) && e.kind !== "import";

/** Climb from a port to the element that owns it: a line to a port is drawn to the owner's node. */
const nodeWorthy = (e: Element): Element => (lastWord(e) === "port" && e.owner ? e.owner : e);

/** What is related to `el`, by kind. A pure function of the model. */
export function relatedElements(index: ModelIndex, el: Element): RelatedItem[] {
  const out: RelatedItem[] = [];
  const push = (kind: RelatedKind, element: Element | undefined, relation?: Element) => {
    if (!drawable(element) || element === el) return;
    if (out.some((o) => o.kind === kind && o.element === element)) return;
    out.push({ kind, element, ...(relation ? { relation } : {}) });
  };
  for (const t of el.specializes) push("specialization", index.resolve(t, el));
  for (const t of el.typeNames) push("typing", index.resolve(t, el));
  if (el.owner) push("ownership", el.owner);
  for (const m of el.members) if (m.name !== undefined && !relationOf(m, index) && m.kind !== "import") push("ownership", m);
  for (const e of allElements(index)) {
    if (e === el) continue;
    if (el.isDefinition && e.specializes.some((t) => index.resolve(t, e) === el)) push("specialization", e);
    if (el.isDefinition && e.typeNames.some((t) => index.resolve(t, e) === el)) push("typing", e);
    const rel = relationOf(e, index);
    if (!rel) continue;
    const mine = (end: typeof rel.source) => endElement(index, end, (x) => x === el) === el;
    const from = mine(rel.source);
    const to = mine(rel.target);
    if (from === to) continue;
    const kind: RelatedKind | undefined = rel.kind === "other" ? "connection" : rel.kind === "flow" ? "flow" : rel.kind === "satisfy" || rel.kind === "verify" || rel.kind === "derivation" ? rel.kind : undefined;
    if (!kind) continue;
    const other = endElement(index, from ? rel.target : rel.source, () => true);
    if (other) push(kind, nodeWorthy(other), e);
  }
  return out;
}

/** Whether a diagram of `kind` can show `element` as a node. */
export function canShow(kind: DiagramDocument["kind"], element: Element): boolean {
  if (kind === "actionFlow") return isActionNode(element);
  if (kind === "stateTransition") return isStateNode(element);
  return kind !== "sequence";
}

function drawnKeys(doc: DiagramDocument): Set<string> {
  return new Set([...doc.nodes, ...doc.edges].map((i) => referenceKey(i)));
}

const itemKey = (i: RelatedItem) => referenceKey(referenceFor(i.element) ?? { ref: "" });

/** Related items, by kind, that are not drawn yet (the element or, for a bare line, the relationship). */
export function missingRelated(doc: DiagramDocument, index: ModelIndex, nodeId: string, opts: ResolveOptions = {}): RelatedItem[] {
  const el = elementOfNode(doc, index, nodeId, opts);
  if (!el || !FREE_KINDS.includes(doc.kind)) return [];
  const drawn = drawnKeys(doc);
  return relatedElements(index, el).filter((i) => !drawn.has(itemKey(i)));
}

export interface RelatedResult { doc: DiagramDocument; added: number }

/** Add the not yet drawn related elements of the chosen kinds, with their lines, to the right of the source when its box is stored. */
export function displayRelated(doc: DiagramDocument, index: ModelIndex, nodeId: string, kinds: ReadonlySet<RelatedKind>, opts: ResolveOptions = {}): RelatedResult {
  const el = elementOfNode(doc, index, nodeId, opts);
  const source = doc.nodes.find((n) => n.id === nodeId);
  if (!el || !source) return { doc, added: 0 };
  const items = missingRelated(doc, index, nodeId, opts).filter((i) => kinds.has(i.kind));
  let cur = doc;
  let added = 0;
  const placed: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = itemKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = addElement(cur, index, it.element, undefined, opts);
    cur = r.doc;
    if (r.added && r.id) { added++; placed.push(r.id); }
  }
  // Placed to the right of the source, one below the other, when the source has a stored box.
  if (source.x !== undefined && source.y !== undefined && source.parent === undefined) {
    const x0 = Math.round(source.x + (source.w ?? 160) + 60);
    placed.forEach((id, k) => {
      cur = { ...cur, nodes: cur.nodes.map((n): DiagramNode => (n.id === id ? { ...n, x: x0, y: Math.round(source.y! + k * 100) } : n)) };
    });
  }
  // The statements that relate them come with them, and the lines of what the new nodes own.
  for (const it of items) if (it.relation) cur = addElement(cur, index, it.relation, undefined, opts).doc;
  cur = addLinesAround(cur, index, [el, ...items.map((i) => i.element)], opts).doc;
  return { doc: cur, added };
}
