/** Resolving diagram references to model elements and back (design D3). No `vscode` import. */
import { cachedSynthetic, syntheticMembers, type Element, type ModelIndex } from "../model/index.js";
import type { DiagramDocument, ElementLocator, ElementReference } from "./format.js";

export type SourceMapper = (uri: string) => string;

/** Maps document URIs to workspace-relative paths (when `rootUri` is given and contains the file). */
export function makeSourceMapper(rootUri?: string): SourceMapper {
  const root = rootUri ? rootUri.replace(/\/+$/, "") + "/" : undefined;
  return (uri) => {
    const s = root && uri.startsWith(root) ? uri.slice(root.length) : uri.replace(/^file:\/\//, "");
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
}

export interface ResolveOptions {
  /** Defaults to `makeSourceMapper()`. */
  sourceOf?: SourceMapper;
}

/** Item id (node or edge) to its element, or undefined when unresolved. */
export type Resolution = Map<string, Element | undefined>;

export function normalizeEnd(s: string): string {
  return s.replace(/\s+/g, "");
}

function endsKey(ends: readonly string[]): string {
  return ends.map(normalizeEnd).join("\u0000");
}

/** Named elements first-found in a preferred source file, declaration order otherwise. */
function preferSources(cands: readonly Element[], sources: readonly string[], sourceOf: SourceMapper): Element[] {
  const inSources = (e: Element) => sources.includes(sourceOf(e.uri));
  return [...cands.filter(inSources), ...cands.filter((e) => !inSources(e))];
}

/**
 * Elements a locator can match under an owner: its members, looking through unnamed members
 * (which cannot be an owner in a locator, so their children count as owned by the nearest named one).
 */
export function ownedCandidates(owner: Element, index?: ModelIndex): Element[] {
  // `start`, `done` and the successions implied by `then` are not in the parse tree (see model/behavior.ts).
  const out: Element[] = [...(index ? syntheticMembers(index, owner) : cachedSynthetic(owner))];
  const walk = (e: Element) => {
    for (const m of e.members) {
      out.push(m);
      if (m.qualifiedName === undefined) walk(m);
    }
  };
  walk(owner);
  return out;
}

/** The nearest named ancestor, which is the locator owner. */
function namedOwner(e: Element): Element | undefined {
  for (let o = e.owner; o; o = o.owner) if (o.qualifiedName !== undefined) return o;
  return undefined;
}

export function resolveReference(
  ref: ElementReference,
  doc: Pick<DiagramDocument, "sources">,
  index: ModelIndex,
  opts: ResolveOptions = {},
): Element | undefined {
  const sourceOf = opts.sourceOf ?? makeSourceMapper();
  if (ref.ref !== undefined) return preferSources(index.findByQualifiedName(ref.ref), doc.sources, sourceOf)[0];
  const loc = ref.locator;
  if (!loc) return undefined;
  const key = endsKey(loc.ends);
  for (const owner of preferSources(index.findByQualifiedName(loc.owner), doc.sources, sourceOf)) {
    const matches = ownedCandidates(owner, index).filter((c) => c.qualifiedName === undefined && c.kind === loc.kind && endsKey(c.ends) === key);
    if (matches.length) {
      if (loc.index === undefined) return matches.length === 1 ? matches[0] : undefined; // ambiguous without an index
      return matches[loc.index];
    }
  }
  return undefined;
}

/** Resolve every node and edge; unresolved items map to `undefined`. */
export function resolveDiagram(doc: DiagramDocument, index: ModelIndex, opts: ResolveOptions = {}): Resolution {
  const out: Resolution = new Map();
  for (const item of [...doc.nodes, ...doc.edges]) out.set(item.id, resolveReference(item, doc, index, opts));
  return out;
}

/** The reference for an element: `ref` when named, a locator otherwise (undefined if there is no named owner). */
export function referenceFor(element: Element, index?: ModelIndex): ElementReference | undefined {
  if (element.qualifiedName !== undefined) return { ref: element.qualifiedName };
  const owner = namedOwner(element);
  if (!owner || owner.qualifiedName === undefined) return undefined;
  const key = endsKey(element.ends);
  const twins = ownedCandidates(owner, index).filter((c) => c.qualifiedName === undefined && c.kind === element.kind && endsKey(c.ends) === key);
  const locator: ElementLocator = { owner: owner.qualifiedName, kind: element.kind, ends: [...element.ends] };
  if (twins.length > 1) locator.index = twins.indexOf(element);
  return { locator };
}

/** Stable text key for a reference, for equality checks. */
export function referenceKey(r: ElementReference): string {
  if (r.ref !== undefined) return "ref:" + r.ref;
  const l = r.locator!;
  return `loc:${l.owner}\u0000${l.kind}\u0000${endsKey(l.ends)}\u0000${l.index ?? 0}`;
}
