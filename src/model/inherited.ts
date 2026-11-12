/**
 * Features a usage or definition inherits through typing and specialization (design D18).
 * `vscode`-free, uses only the resolver of the model index.
 */
import { splitQualified } from "./names.js";
import type { Element } from "./types.js";
import type { ModelIndex } from "./index.js";

export interface InheritedMember {
  /** The inherited feature, as declared. */
  member: Element;
  /** The element that declares it (a definition or supertype), the target of "Go to Definition". */
  declaredIn: Element;
}

const MAX_DEPTH = 32;

/** The elements `el` is typed by or specializes (resolved from `el`), without duplicates. */
export function supertypesOf(index: ModelIndex, el: Element): Element[] {
  const out: Element[] = [];
  for (const text of [...el.typeNames, ...el.specializes, ...el.subsets]) {
    const t = index.resolve(text, el);
    if (t && t !== el && !out.includes(t)) out.push(t);
  }
  return out;
}

function isFeature(m: Element): boolean {
  return m.isUsage && m.name !== undefined && m.kind !== "import" && m.kind !== "expose" && m.ends.length < 2;
}

/** Names `el` redefines or declares itself: an inherited member of one of these names is not inherited. */
function ownNames(index: ModelIndex, el: Element): Set<string> {
  const names = new Set<string>();
  for (const m of el.members) {
    if (m.name !== undefined) names.add(m.name);
    if (m.shortName !== undefined) names.add(m.shortName);
    for (const r of m.redefines) {
      const parts = splitQualified(r);
      const last = parts[parts.length - 1];
      if (last !== undefined) names.add(last);
    }
  }
  return names;
}

/**
 * Members `element` inherits, nearest declaration first (breadth first over the declared types and
 * supertypes, with cycle protection). A member that `element` itself declares or redefines, or that
 * a nearer supertype already provides under the same name, is not listed.
 */
export function inheritedMembers(index: ModelIndex, element: Element): InheritedMember[] {
  const taken = ownNames(index, element);
  const seen = new Set<Element>([element]);
  const out: InheritedMember[] = [];
  let level = supertypesOf(index, element);
  for (let depth = 0; level.length && depth < MAX_DEPTH; depth++) {
    const next: Element[] = [];
    const levelNames = new Set<string>();
    for (const t of level) {
      if (seen.has(t)) continue;
      seen.add(t);
      for (const m of t.members) {
        if (!isFeature(m) || taken.has(m.name!)) continue;
        out.push({ member: m, declaredIn: t });
        levelNames.add(m.name!);
        // A subsetting or redefining member in the supertype also hides what it redefines further up.
        for (const r of m.redefines) {
          const last = splitQualified(r).pop();
          if (last !== undefined) levelNames.add(last);
        }
      }
      for (const n of ownNames(index, t)) levelNames.add(n);
      next.push(...supertypesOf(index, t));
    }
    for (const n of levelNames) taken.add(n);
    level = next;
  }
  return out;
}

/** The declaring element when `element` reaches `context` by inheritance (and is not owned by it), else undefined. */
export function inheritedFrom(index: ModelIndex, element: Element, context: Element): Element | undefined {
  if (element.owner === context) return undefined;
  return inheritedMembers(index, context).find((i) => i.member === element)?.declaredIn;
}

export function isInheritedIn(index: ModelIndex, element: Element, context: Element): boolean {
  return inheritedFrom(index, element, context) !== undefined;
}

export interface Located {
  element: Element;
  /** Set when the path went through an inherited member: the element it was reached from. */
  context?: Element;
}

/**
 * Find an element by qualified name, also through inheritance: `Model::vehicle1::engine` finds the
 * `engine` declared in `Vehicle` with `vehicle1` as its context.
 */
export function locate(index: ModelIndex, qualifiedName: string): Located | undefined {
  const direct = index.findByQualifiedName(qualifiedName)[0];
  if (direct) return { element: direct };
  const segs = splitQualified(qualifiedName);
  for (let n = segs.length - 1; n >= 1; n--) {
    const prefix = segs.slice(0, n).map((s) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `'${s.replace(/[\\']/g, (c) => "\\" + c)}'`)).join("::");
    const start = index.findByQualifiedName(prefix)[0];
    if (!start) continue;
    let cur: Element = start;
    let context: Element | undefined;
    for (const name of segs.slice(n)) {
      const own: Element | undefined = cur.members.find((m) => m.name === name);
      if (own) {
        cur = own;
        context = undefined;
        continue;
      }
      const inh = inheritedMembers(index, cur).find((i) => i.member.name === name);
      if (!inh) return undefined;
      context = cur;
      cur = inh.member;
    }
    return context ? { element: cur, context } : { element: cur };
  }
  return undefined;
}
