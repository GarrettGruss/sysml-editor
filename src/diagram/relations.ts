/**
 * Which model elements are drawn as edges, and between which ends. No `vscode` import.
 * Edges run from the source end to the target end as they are drawn: a satisfy or verify edge
 * runs from the satisfying element to the requirement, a derivation edge from the derived
 * requirement to the original one.
 */
import type { Element, ModelIndex } from "../model/index.js";

/** One end of a relationship: a name as written (resolved from `scope`), or the nearest shown owner of `scope`. */
export interface RelationEnd {
  scope: Element;
  text?: string;
}

export interface Relation {
  kind: "derivation" | "satisfy" | "verify" | "other";
  source: RelationEnd;
  target: RelationEnd;
}

function sourceText(index: ModelIndex, e: Element): string {
  const doc = index.getDocument(e.uri);
  return doc && "text" in doc && typeof doc.text === "string" ? doc.text.slice(e.range.start.offset, e.range.end.offset) : "";
}

/** The ends of `#derivation connection { end #original ::> a; end #derive ::> b; }` (binary: first derived end only). */
function derivation(index: ModelIndex, e: Element): Relation | undefined {
  if (e.kind !== "connection" || e.name !== undefined) return undefined;
  if (!/^\s*#\s*derivation\b/.test(sourceText(index, e))) return undefined;
  const ends = e.members.filter((m) => m.references.length > 0);
  const role = (m: Element) => (/#\s*original\b/.test(sourceText(index, m)) ? "original" : /#\s*derive\b/.test(sourceText(index, m)) ? "derive" : undefined);
  const original = ends.find((m) => role(m) === "original");
  const derived = ends.find((m) => role(m) === "derive");
  if (!original || !derived) return undefined;
  return { kind: "derivation", source: { scope: derived, text: derived.references[0]! }, target: { scope: original, text: original.references[0]! } };
}

/** The relationship an element expresses, or undefined when it is an ordinary node. */
export function relationOf(e: Element, index: ModelIndex): Relation | undefined {
  const d = derivation(index, e);
  if (d) return d;
  const scope = e.owner ?? e;
  if (e.ends.length >= 2) {
    const first = { scope, text: e.ends[0]! };
    const last = { scope, text: e.ends[e.ends.length - 1]! };
    if (e.kind === "satisfy" || e.kind === "verify") return { kind: e.kind, source: last, target: first };
    return { kind: "other", source: first, target: last };
  }
  // `verify R;` inside a verification case objective: the verifier is the owner.
  if (e.kind === "verify" && e.ends.length === 1 && e.owner) return { kind: "verify", source: { scope: e.owner }, target: { scope, text: e.ends[0]! } };
  return undefined;
}

export const isRelationship = (e: Element, index: ModelIndex): boolean => relationOf(e, index) !== undefined;

/** Resolve one end to the element it names, or (without text) to the nearest owner for which `has` is true. */
export function endElement(index: ModelIndex, end: RelationEnd, has: (e: Element) => boolean): Element | undefined {
  if (end.text === undefined) {
    for (let o: Element | undefined = end.scope; o; o = o.owner) if (has(o)) return o;
    return undefined;
  }
  const [first, ...rest] = end.text.replace(/\s+/g, "").split(/\.|::/);
  let el = first ? index.resolve(first, end.scope) : undefined;
  let hit = el && has(el) ? el : undefined;
  for (const seg of rest) {
    el = el && memberOf(index, el, seg);
    if (!el) break;
    if (has(el)) hit = el;
  }
  return hit;
}

function memberOf(index: ModelIndex, el: Element, name: string, depth = 0): Element | undefined {
  const own = el.members.find((m) => m.name === name);
  if (own || depth > 5) return own;
  for (const t of [...el.types, ...el.specializes]) {
    const def = index.resolve(t, el);
    const found = def && memberOf(index, def, name, depth + 1);
    if (found) return found;
  }
  return undefined;
}
