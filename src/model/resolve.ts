import { splitQualified } from "./names.js";
import type { DocumentModel, Element } from "./types.js";

/** What the resolver needs from the index. */
export interface ResolveContext {
  /** The model of the document an element belongs to. */
  modelOf(uri: string): DocumentModel | undefined;
  /** Root elements, across all documents, with this name or short name. */
  rootsNamed(name: string): readonly Element[];
  /** Elements with this qualified name across all documents (merged declarations of a package). */
  withQualifiedName(qn: string): readonly Element[];
}

/**
 * SysML name lookup for typing and navigation.
 *
 * Covered: lexical scopes outward from the element (its own members, then each owner), then the
 * document's top level, then root packages of all documents; in each namespace, direct members
 * by name or short name, aliases, and imports (`import A::B;`, `import A::*;`, `import A::**;`,
 * `::*::**`); qualified names (`A::B::c`, also `.` chains) resolved segment by segment; a
 * namespace declared in several documents is merged; `public import` re-exports are followed
 * transitively (cycles are cut). Only `public` imports are visible from outside a namespace
 * (an import without a visibility keyword is private by default); private members are not
 * visible through imports or qualified access.
 *
 * Not covered (out of scope for now): members inherited through specialization or typing (so
 * `a::x` where `x` is declared in the type of `a` does not resolve), feature chains through typed
 * usages, redefinition-based scoping, import filters, and `$::` beyond "start from the roots".
 */
export class Resolver {
  /** Resolved import targets; must be cleared whenever the index changes. */
  private readonly targetMemo = new Map<Element, Element[]>();
  /** Bumped whenever a cycle guard cuts a path; results computed across a cut are not memoized. */
  private cuts = 0;

  constructor(private readonly ctx: ResolveContext) {}

  /** Drop memoized import targets (call when documents change). */
  clear(): void {
    this.targetMemo.clear();
  }

  /** The first candidate of `resolveAll`. */
  resolve(nameText: string, from: Element): Element | undefined {
    return this.resolveAll(nameText, from)[0];
  }

  /**
   * All candidates for a name, in priority order: the innermost lexical scope that yields any
   * match wins (own members, then aliases, in source order; then the matches of each import of
   * that scope in source order; then enclosing scopes, the document top level, and finally root
   * packages of all documents). More than one result means the name is ambiguous.
   */
  resolveAll(nameText: string, from: Element): Element[] {
    const segs = splitQualified(nameText);
    if (segs.length === 0) return [];
    let cands: Element[];
    if (segs[0] === "$") {
      segs.shift();
      if (segs.length === 0) return [];
      cands = [...this.ctx.rootsNamed(segs[0]!)];
    } else {
      cands = this.lexical(segs[0]!, from, new Set());
    }
    for (let i = 1; i < segs.length && cands.length > 0; i++) {
      const seg = segs[i]!;
      const next: Element[] = [];
      for (const c of cands) for (const m of this.exported(c, seg, new Set())) pushUnique(next, m);
      cands = next;
    }
    return cands;
  }

  // ---- lookups

  /** `noImportsAt`: a scope whose own imports must not be consulted (used to resolve its imports' targets). */
  private lexical(seg: string, from: Element, guard: Set<Element>, noImportsAt?: Element): Element[] {
    for (let scope: Element | undefined = from; scope; scope = scope.owner) {
      const r = this.inScope(this.equivalents(scope).flatMap((s) => s.members), seg, guard, scope === noImportsAt);
      if (r.length) return r;
    }
    const doc = this.ctx.modelOf(from.uri);
    if (doc) {
      const r = this.inScope(doc.roots, seg, guard, from === noImportsAt);
      if (r.length) return r;
    }
    return [...this.ctx.rootsNamed(seg)];
  }

  /** Members visible by simple name inside a namespace: own members, aliases, then all imports. */
  private inScope(members: readonly Element[], seg: string, guard: Set<Element>, skipImports = false): Element[] {
    const out: Element[] = [];
    for (const m of members) {
      if (m.kind === "import" || m.kind === "expose") continue;
      if (m.name !== seg && m.shortName !== seg) continue;
      if (m.kind === "alias") {
        const t = this.aliasTarget(m, guard);
        if (t) pushUnique(out, t);
      } else pushUnique(out, m);
    }
    if (out.length || skipImports) return out;
    for (const imp of members) {
      if (imp.kind !== "import" || !imp.importInfo) continue;
      for (const r of this.viaImport(imp, seg, guard)) pushUnique(out, r);
    }
    return out;
  }

  /** What `seg` means inside `ns` when reached from outside: public members, aliases, public imports. */
  private exported(ns: Element, seg: string, guard: Set<Element>, all = false): Element[] {
    const out: Element[] = [];
    const key = ns;
    if (guard.has(key)) {
      this.cuts++;
      return out;
    }
    const g2 = new Set(guard).add(key);
    const members = this.equivalents(ns).flatMap((s) => s.members);
    for (const m of members) {
      if (m.kind === "import" || m.kind === "expose" || (!all && m.visibility === "private")) continue;
      if (m.name !== seg && m.shortName !== seg) continue;
      if (m.kind === "alias") {
        const t = this.aliasTarget(m, guard);
        if (t) pushUnique(out, t);
      } else pushUnique(out, m);
    }
    if (out.length) return out;
    for (const imp of members) {
      if (imp.kind !== "import" || !imp.importInfo || (!all && imp.visibility !== "public")) continue;
      for (const r of this.viaImport(imp, seg, g2)) pushUnique(out, r);
    }
    return out;
  }

  private viaImport(imp: Element, seg: string, guard: Set<Element>): Element[] {
    if (guard.has(imp)) {
      this.cuts++;
      return [];
    }
    const g2 = new Set(guard).add(imp);
    const info = imp.importInfo!;
    const targets = this.importTarget(imp, g2);
    const out: Element[] = [];
    for (const t of targets) {
      if (!info.wildcard) {
        // An imported alias is named by the import (the target resolves through the alias).
        if (t.name === seg || t.shortName === seg || splitQualified(info.target).at(-1) === seg) pushUnique(out, t);
        if (info.recursive) for (const d of this.descendants(t, seg)) pushUnique(out, d);
      } else {
        for (const m of this.exported(t, seg, g2, info.all)) pushUnique(out, m);
        if (info.recursive) for (const d of this.descendants(t, seg)) pushUnique(out, d);
      }
    }
    return out;
  }

  /**
   * The namespaces an import names. The first segment is looked up among the importing
   * namespace's own members (imports at that level are not consulted), then in enclosing
   * scopes, then root packages. Memoized unless a cycle cut influenced the result.
   */
  private importTarget(imp: Element, guard: Set<Element>): Element[] {
    const hit = this.targetMemo.get(imp);
    if (hit) return hit;
    const before = this.cuts;
    const r = this.qualified(imp.importInfo!.target, (first) => this.lexicalNoOwnImports(first, imp, guard), guard);
    if (this.cuts === before) this.targetMemo.set(imp, r);
    return r;
  }

  private lexicalNoOwnImports(first: string, imp: Element, guard: Set<Element>): Element[] {
    const scope = imp.owner;
    if (scope) return this.lexical(first, scope, guard, scope);
    const doc = this.ctx.modelOf(imp.uri);
    const r = doc ? this.inScope(doc.roots, first, guard, true) : [];
    return r.length ? r : [...this.ctx.rootsNamed(first)];
  }

  private lexicalRootOf(first: string, el: Element, guard: Set<Element>): Element[] {
    const doc = this.ctx.modelOf(el.uri);
    const r = doc ? this.inScope(doc.roots, first, guard) : [];
    return r.length ? r : [...this.ctx.rootsNamed(first)];
  }

  private aliasTarget(alias: Element, guard: Set<Element>): Element | undefined {
    if (!alias.aliasFor || guard.has(alias)) return undefined;
    const g2 = new Set(guard).add(alias);
    const scope = alias.owner;
    const r = scope
      ? this.qualified(alias.aliasFor, (first) => this.lexical(first, scope, g2), g2)
      : this.qualified(alias.aliasFor, (first) => this.lexicalRootOf(first, alias, g2), g2);
    return r[0];
  }

  private qualified(text: string, first: (seg: string) => Element[], guard: Set<Element>): Element[] {
    const segs = splitQualified(text);
    if (segs.length === 0) return [];
    let cands: Element[];
    if (segs[0] === "$") {
      segs.shift();
      if (segs.length === 0) return [];
      cands = [...this.ctx.rootsNamed(segs[0]!)];
    } else cands = first(segs[0]!);
    for (let i = 1; i < segs.length && cands.length; i++) {
      const next: Element[] = [];
      for (const c of cands) for (const m of this.exported(c, segs[i]!, guard)) pushUnique(next, m);
      cands = next;
    }
    return cands;
  }

  private descendants(ns: Element, seg: string): Element[] {
    const out: Element[] = [];
    const seen = new Set<Element>();
    const walk = (e: Element) => {
      for (const s of this.equivalents(e)) {
        if (seen.has(s)) continue;
        seen.add(s);
        for (const m of s.members) {
          if (m.kind === "import" || m.visibility === "private") continue;
          if ((m.name === seg || m.shortName === seg) && m.kind !== "alias") pushUnique(out, m);
          walk(m);
        }
      }
    };
    walk(ns);
    return out;
  }

  private equivalents(e: Element): readonly Element[] {
    if (e.qualifiedName === undefined || e.owner === undefined && e.kind !== "package" && e.kind !== "library package")
      return [e];
    const all = this.ctx.withQualifiedName(e.qualifiedName);
    return all.length > 1 && all.includes(e) ? all : [e];
  }
}

function pushUnique(arr: Element[], e: Element): void {
  if (!arr.includes(e)) arr.push(e);
}
