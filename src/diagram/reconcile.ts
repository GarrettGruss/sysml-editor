/**
 * Keeping a diagram in step with the model: unresolved entries, rename detection (design D3),
 * re-linking and removal. No `vscode` import. Documents are treated as immutable values.
 */
import type { Element, ModelIndex } from "../model/index.js";
import type { DiagramDocument, DiagramEdge, DiagramNode, ElementReference } from "./format.js";
import {
  makeSourceMapper, ownedCandidates, referenceFor, resolveDiagram, resolveReference,
  type Resolution, type ResolveOptions,
} from "./resolve.js";

/** What the caller stores between reconciliations. */
export interface Snapshot {
  items: Record<string, { ref: string; owner: string; kind: string; types: string[]; uri?: string; nameOffset?: number }>;
  /** Per owner qualified name: qualified names of its named members at snapshot time. */
  siblings: Record<string, string[]>;
}

export interface ReferenceUpdate {
  /** Item id, or `"$root"` for the document root. */
  itemId: string;
  from: ElementReference | string;
  to: ElementReference | string;
}

export interface ReconcileResult {
  /** After applying `updates`. */
  resolution: Resolution;
  /** Ids of items that remain unresolved (they stay in the document). */
  unresolved: string[];
  updates: ReferenceUpdate[];
  snapshot: Snapshot;
}

const ROOT = "$root";

function ownerOf(e: Element): Element | undefined {
  for (let o = e.owner; o; o = o.owner) if (o.qualifiedName !== undefined) return o;
  return undefined;
}

export function snapshotOf(doc: DiagramDocument, resolution: Resolution): Snapshot {
  const snap: Snapshot = { items: {}, siblings: {} };
  for (const item of [...doc.nodes, ...doc.edges]) {
    const el = resolution.get(item.id);
    if (!el || item.ref === undefined) continue;
    const owner = ownerOf(el);
    if (!owner || owner.qualifiedName === undefined) continue;
    snap.items[item.id] = { ref: item.ref, owner: owner.qualifiedName, kind: el.kind, types: [...el.types],
      ...(el.nameRange ? { uri: el.uri, nameOffset: el.nameRange.start.offset } : {}),
    };
    snap.siblings[owner.qualifiedName] ??= ownedCandidates(owner).flatMap((c) => (c.qualifiedName ? [c.qualifiedName] : [])).sort();
  }
  return snap;
}

const sameTypes = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

/** Replace `old` with `neu` when `qn` equals it or starts with `old::`. */
function rewritePrefix(qn: string, old: string, neu: string): string | undefined {
  if (qn === old) return neu;
  return qn.startsWith(old + "::") ? neu + qn.slice(old.length) : undefined;
}

export function reconcile(doc: DiagramDocument, index: ModelIndex, previous?: Snapshot, opts: ResolveOptions = {}): ReconcileResult {
  const sourceOf = opts.sourceOf ?? makeSourceMapper();
  const resolution = resolveDiagram(doc, index, opts);
  const updates: ReferenceUpdate[] = [];
  const items = [...doc.nodes, ...doc.edges];
  const depth = (qn: string) => qn.split("::").length;

  // 1. Renames of directly detected items.
  const renames = new Map<string, string>(); // old qualified name -> new qualified name
  if (previous) {
    const taken = new Set<string>();
    for (const el of resolution.values()) if (el?.qualifiedName) taken.add(el.qualifiedName);
    const claims = new Map<string, string[]>(); // candidate qn -> item ids
    const picked = new Map<string, Element>();
    const lost = items.filter((i) => i.ref !== undefined && !resolution.get(i.id) && previous.items[i.id]?.ref === i.ref);
    lost.sort((a, b) => depth(a.ref!) - depth(b.ref!));
    for (const item of lost) {
      const prev = previous.items[item.id]!;
      // A child of an already renamed element follows its parent (step 2) instead.
      if ([...renames.keys()].some((old) => rewritePrefix(item.ref!, old, "x") !== undefined)) continue;
      const owner = resolveReference({ ref: prev.owner }, doc, index, { sourceOf });
      if (!owner) continue;
      const known = new Set(previous.siblings[prev.owner] ?? []);
      const cands = ownedCandidates(owner).filter(
        (c) => c.qualifiedName !== undefined && c.kind === prev.kind && sameTypes(c.types, prev.types) &&
          !known.has(c.qualifiedName) && !taken.has(c.qualifiedName),
      );
      if (cands.length !== 1) continue;
      const cand = cands[0]!;
      // Only a rename in place: same document, name token starting where the old one did.
      if (!prev.uri || prev.nameOffset === undefined || !cand.nameRange || cand.uri !== prev.uri ||
        cand.nameRange.start.offset !== prev.nameOffset) continue;
      picked.set(item.id, cand);
      claims.set(cand.qualifiedName!, [...(claims.get(cand.qualifiedName!) ?? []), item.id]);
    }
    for (const [id, cand] of picked) {
      if (claims.get(cand.qualifiedName!)!.length !== 1) continue;
      const item = items.find((i) => i.id === id)!;
      renames.set(item.ref!, cand.qualifiedName!);
      updates.push({ itemId: id, from: { ref: item.ref! }, to: { ref: cand.qualifiedName! } });
      resolution.set(id, cand);
    }
  }

  // 2. Everything under a renamed element, and the root, follows the rename.
  if (renames.size) {
    for (const item of items) {
      if (resolution.get(item.id) || updates.some((u) => u.itemId === item.id)) continue;
      const ref = item.ref !== undefined ? { ref: item.ref } : { locator: item.locator! };
      let next: ElementReference | undefined;
      for (const [old, neu] of renames) {
        if (ref.ref !== undefined) {
          const r = rewritePrefix(ref.ref, old, neu);
          if (r !== undefined) next = { ref: r };
        } else {
          const r = rewritePrefix(ref.locator.owner, old, neu);
          if (r !== undefined) next = { locator: { ...ref.locator, owner: r } };
        }
      }
      if (!next) continue;
      const el = resolveReference(next, doc, index, { sourceOf });
      if (!el) continue;
      updates.push({ itemId: item.id, from: ref, to: next });
      resolution.set(item.id, el);
    }
    for (const [old, neu] of renames) {
      const r = rewritePrefix(doc.root, old, neu);
      if (r !== undefined && r !== doc.root) updates.push({ itemId: ROOT, from: doc.root, to: r });
    }
  }

  const applied = applyUpdates(doc, updates);
  return {
    resolution,
    unresolved: items.filter((i) => !resolution.get(i.id)).map((i) => i.id),
    updates,
    snapshot: snapshotOf(applied, resolution),
  };
}

/** The document with the proposed updates applied; everything else (positions, styles) untouched. */
export function applyUpdates(doc: DiagramDocument, updates: readonly ReferenceUpdate[]): DiagramDocument {
  const byId = new Map(updates.map((u) => [u.itemId, u]));
  const patch = <T extends DiagramNode | DiagramEdge>(item: T): T => {
    const u = byId.get(item.id);
    if (!u) return item;
    const { ref: _r, locator: _l, ...rest } = item;
    return { ...rest, ...(u.to as ElementReference) } as T;
  };
  const root = byId.get(ROOT);
  return { ...doc, root: root ? (root.to as string) : doc.root, nodes: doc.nodes.map(patch), edges: doc.edges.map(patch) };
}

function findItem(doc: DiagramDocument, itemId: string): DiagramNode | DiagramEdge | undefined {
  return doc.nodes.find((n) => n.id === itemId) ?? doc.edges.find((e) => e.id === itemId);
}

/** Re-link an item to an existing element ("Re-link…"); position and style are kept. */
export function relink(doc: DiagramDocument, itemId: string, element: Element): DiagramDocument {
  if (!findItem(doc, itemId)) throw new Error(`No item ${itemId} in the diagram`);
  const to = referenceFor(element);
  if (!to) throw new Error("That element cannot be referenced (it has no name and no named owner)");
  return applyUpdates(doc, [{ itemId, from: {}, to }]);
}

/** Remove a node together with its child nodes and attached edges, or remove a single edge. */
export function removeItem(doc: DiagramDocument, itemId: string): DiagramDocument {
  if (doc.edges.some((e) => e.id === itemId) && !doc.nodes.some((n) => n.id === itemId)) {
    return { ...doc, edges: doc.edges.filter((e) => e.id !== itemId) };
  }
  const gone = new Set<string>([itemId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of doc.nodes) if (n.parent !== undefined && gone.has(n.parent) && !gone.has(n.id)) { gone.add(n.id); grew = true; }
  }
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !gone.has(n.id)),
    edges: doc.edges.filter((e) => !gone.has(e.id) && !gone.has(e.source) && !gone.has(e.target)),
  };
}
