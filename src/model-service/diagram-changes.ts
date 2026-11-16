/**
 * Changes a model edit forces on diagram documents (a node for the element just created, entries
 * removed on delete), as pure functions of a document. `vscode`-free. A change is applied to the
 * last SAVED state of every diagram file on disk and to the in-memory document (without dirtying
 * it); its `revert` undoes it, so a combined undo can reverse the diagram part as well.
 */
import type { Element, ModelIndex } from "../model/index.js";
import { addElement } from "../diagram/create.js";
import { removeItems } from "../diagram/edits.js";
import type { DiagramDocument, DiagramEdge, DiagramNode } from "../diagram/format.js";
import { referenceFor, referenceKey, type SourceMapper } from "../diagram/resolve.js";
import type { ElementLocator, ElementReference } from "../diagram/format.js";
import { quoteName, splitQualified } from "../model/index.js";

export interface ChangeContext {
  uri: string;
  sourceOf: SourceMapper;
}

export interface DiagramChange {
  /** One diagram, or every diagram file. */
  target: { uri: string } | "all";
  /** Short text for the undo label. */
  label: string;
  /** A new document, or the same one when nothing changes. Idempotent. */
  apply(doc: DiagramDocument, ctx: ChangeContext): DiagramDocument;
  revert(doc: DiagramDocument, ctx: ChangeContext): DiagramDocument;
  /** Reference keys of items this change created (for session tracking). */
  createdKeys?(): string[];
  /** Declaring document of each created item (reference key to URI). */
  createdIn?(): Map<string, string>;
  /** The items this change removed from the diagram file `uri` (to see whether they can come back). */
  removedItems?(uri: string): { nodes: DiagramNode[]; edges: DiagramEdge[] } | undefined;
}

export interface Placement {
  /** URI of the diagram document. */
  diagram: string;
  /** Node id of the container the element was created in; absent for the diagram root. */
  parentNode?: string;
  /** Position relative to the parent node (or the canvas). */
  x?: number;
  y?: number;
}

/** Add the element's node (and the relationship edges both of whose ends are shown) at the placement. */
export function placeElementChange(index: ModelIndex, element: () => Element | undefined, placement: Placement, label: string): DiagramChange {
  const added = new Map<string, string[]>();
  const keys: string[] = [];
  const declared = new Map<string, string>();
  return {
    target: { uri: placement.diagram },
    label,
    apply(doc, ctx) {
      const el = element();
      if (!el) return doc;
      const parent = placement.parentNode !== undefined && doc.nodes.some((n) => n.id === placement.parentNode) ? placement.parentNode : undefined;
      const r = addElement(doc, index, el, parent, { sourceOf: ctx.sourceOf });
      if (!r.added || !r.id) return r.doc;
      const ref = referenceFor(el, index);
      if (ref) {
        keys.push(referenceKey(ref));
        declared.set(referenceKey(ref), el.uri);
      }
      added.set(ctx.uri, [r.id]);
      let next = r.doc;
      const isNode = next.nodes.some((n) => n.id === r.id);
      if (isNode && el.kind !== "port" && placement.x !== undefined && placement.y !== undefined) {
        next = { ...next, nodes: next.nodes.map((n): DiagramNode => (n.id === r.id ? { ...n, x: placement.x!, y: placement.y! } : n)) };
      }
      return next;
    },
    revert(doc, ctx) {
      const ids = added.get(ctx.uri) ?? [];
      return ids.length ? removeItems(doc, ids) : doc;
    },
    createdKeys: () => keys,
    createdIn: () => declared,
  };
}

function under(ref: string, qn: string): boolean {
  return ref === qn || ref.startsWith(qn + "::");
}

/** Remove every node and edge that refers to one of the qualified names or to something below it. */
export function removeReferencesTo(doc: DiagramDocument, qns: readonly string[]): { doc: DiagramDocument; removed: { nodes: DiagramNode[]; edges: DiagramEdge[] } } {
  const hit = (i: { ref?: string; locator?: { owner: string } }) => qns.some((q) => (i.ref !== undefined && under(i.ref, q)) || (i.locator !== undefined && under(i.locator.owner, q)));
  const ids = [...doc.nodes, ...doc.edges].filter(hit).map((i) => i.id);
  if (!ids.length) return { doc, removed: { nodes: [], edges: [] } };
  const next = removeItems(doc, ids);
  const kept = new Set([...next.nodes, ...next.edges].map((i) => i.id));
  return { doc: next, removed: { nodes: doc.nodes.filter((n) => !kept.has(n.id)), edges: doc.edges.filter((e) => !kept.has(e.id)) } };
}

/** Put removed items back (those whose id is free and whose parent node exists). */
export function restoreItems(doc: DiagramDocument, items: { nodes: DiagramNode[]; edges: DiagramEdge[] }): DiagramDocument {
  const have = new Set([...doc.nodes, ...doc.edges].map((i) => i.id));
  const nodes = [...doc.nodes, ...items.nodes.filter((n) => !have.has(n.id))];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = [...doc.edges, ...items.edges.filter((e) => !have.has(e.id) && nodeIds.has(e.source) && nodeIds.has(e.target))];
  return nodes.length === doc.nodes.length && edges.length === doc.edges.length ? doc : { ...doc, nodes, edges };
}

/**
 * Identical statements are told apart by their index. When some of them are deleted, the entries of the survivors move
 * down to their new index (the same kind, owner and ends), so they keep resolving to the statement they were drawn for.
 */
function reindexTwins(doc: DiagramDocument, deletedKeys: readonly string[], remember: (id: string, loc: ElementLocator) => void): DiagramDocument {
  const groups = new Map<string, number[]>();
  for (const k of deletedKeys) {
    if (!k.startsWith("loc:")) continue;
    const cut = k.lastIndexOf("\u0000");
    const g = k.slice(0, cut);
    groups.set(g, [...(groups.get(g) ?? []), Number(k.slice(cut + 1))]);
  }
  if (!groups.size) return doc;
  let changed = false;
  const fix = <T extends DiagramNode | DiagramEdge>(i: T): T => {
    const l = i.locator;
    if (!l) return i;
    const gone = groups.get(referenceKey({ locator: { ...l, index: 0 } }).replace(/\u00000$/, ""));
    if (!gone) return i;
    const at = l.index ?? 0;
    const next = at - gone.filter((d) => d < at).length;
    if (next === at && (l.index !== undefined || next === 0)) return i;
    changed = true;
    remember(i.id, l);
    return { ...i, locator: { ...l, index: next } };
  };
  const nodes = doc.nodes.map(fix), edges = doc.edges.map(fix);
  return changed ? { ...doc, nodes, edges } : doc;
}

/**
 * A statement identical to an existing one (same kind, owner and ends) turns the existing entries' locators ambiguous
 * (they were saved without an index). In the same change, entries of the twins that follow the new statement move up, and
 * entries without an index get their explicit one. Wraps `place` (which may be absent) so it is one undoable change.
 */
export function addStatementChange(index: ModelIndex, created: () => Element | undefined, place: DiagramChange | undefined, label: string): DiagramChange {
  const was = new Map<string, ElementLocator>();
  const done = new Set<string>();
  return {
    ...(place ?? {}),
    target: "all",
    label,
    apply(doc, ctx) {
      let d = doc;
      const el = created();
      const ref = el ? referenceFor(el, index) : undefined;
      const k = ref?.locator?.index;
      if (k !== undefined && !done.has(ctx.uri)) {
        done.add(ctx.uri);
        const group = referenceKey({ locator: { ...ref!.locator!, index: 0 } });
        const fix = <T extends DiagramNode | DiagramEdge>(i: T): T => {
          const l = i.locator;
          if (!l || referenceKey({ locator: { ...l, index: 0 } }) !== group) return i;
          const at = l.index ?? 0;
          if (at < k) return l.index === undefined ? (was.set(ctx.uri + "\0" + i.id, l), { ...i, locator: { ...l, index: at } }) : i;
          was.set(ctx.uri + "\0" + i.id, l);
          return { ...i, locator: { ...l, index: at + 1 } };
        };
        d = { ...d, nodes: d.nodes.map(fix), edges: d.edges.map(fix) };
      }
      return place && (place.target === "all" || place.target.uri === ctx.uri) ? place.apply(d, ctx) : d;
    },
    revert(doc, ctx) {
      let d = place && (place.target === "all" || place.target.uri === ctx.uri) ? place.revert(doc, ctx) : doc;
      const fix = <T extends DiagramNode | DiagramEdge>(i: T): T => {
        const old = was.get(ctx.uri + "\0" + i.id);
        return old ? { ...i, locator: old } : i;
      };
      d = { ...d, nodes: d.nodes.map(fix), edges: d.edges.map(fix) };
      done.delete(ctx.uri);
      return d;
    },
  };
}

/** Delete from Model: the entries for the deleted element and everything below it go from every diagram. */
export function removeEntriesChange(qns: string[], label: string, keys: readonly string[] = []): DiagramChange {
  const removed = new Map<string, { nodes: DiagramNode[]; edges: DiagramEdge[] }>();
  const was = new Map<string, ElementLocator>();
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      // Unnamed statements (and what was drawn for them) are found by their structural references.
      const byKey = keys.length ? [...doc.nodes, ...doc.edges].filter((i) => keys.includes(referenceKey(i))).map((i) => i.id) : [];
      const r = removeReferencesTo(byKey.length ? removeItems(doc, byKey) : doc, qns);
      if (byKey.length) {
        const kept = new Set([...r.doc.nodes, ...r.doc.edges].map((i) => i.id));
        const extra = { nodes: doc.nodes.filter((n) => !kept.has(n.id) && !r.removed.nodes.some((x) => x.id === n.id)), edges: doc.edges.filter((e) => !kept.has(e.id) && !r.removed.edges.some((x) => x.id === e.id)) };
        r.removed = { nodes: [...r.removed.nodes, ...extra.nodes], edges: [...r.removed.edges, ...extra.edges] };
      }
      if (r.removed.nodes.length || r.removed.edges.length) removed.set(ctx.uri, r.removed);
      return reindexTwins(r.doc, keys, (id, loc) => was.set(ctx.uri + "\0" + id, loc));
    },
    revert(doc, ctx) {
      const items = removed.get(ctx.uri);
      const back = items ? restoreItems(doc, items) : doc;
      const fix = <T extends DiagramNode | DiagramEdge>(i: T): T => {
        const old = was.get(ctx.uri + "\0" + i.id);
        return old ? { ...i, locator: old } : i;
      };
      return { ...back, nodes: back.nodes.map(fix), edges: back.edges.map(fix) };
    },
  };
}

/**
 * Entries of items this session created whose element vanished from a clean model (design D6): an ordinary forced
 * change, so it can be reverted when the element comes back at the same qualified name.
 */
export function dropEntriesChange(keys: readonly string[], label: string): DiagramChange {
  const set = new Set(keys);
  const removed = new Map<string, { nodes: DiagramNode[]; edges: DiagramEdge[] }>();
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      const ids = [...doc.nodes, ...doc.edges].filter((i) => set.has(referenceKey(i))).map((i) => i.id);
      if (!ids.length) return doc;
      const next = removeItems(doc, ids);
      const kept = new Set([...next.nodes, ...next.edges].map((i) => i.id));
      removed.set(ctx.uri, { nodes: doc.nodes.filter((n) => !kept.has(n.id)), edges: doc.edges.filter((e) => !kept.has(e.id)) });
      return next;
    },
    revert(doc, ctx) {
      const items = removed.get(ctx.uri);
      return items ? restoreItems(doc, items) : doc;
    },
    removedItems: (uri) => removed.get(uri),
  };
}

/**
 * An edge whose statement was rewritten (a transition changed from the shorthand to the explicit form) keeps its place on the
 * diagram: its locator is replaced by the one of the new statement. Applies to the saved state of every diagram file.
 */
export function retargetChange(oldKey: string | undefined, next: () => ElementReference | undefined, label: string): DiagramChange {
  const was = new Map<string, ElementReference>();
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      const to = next();
      if (!oldKey || !to || referenceKey(to) === oldKey) return doc;
      let changed = false;
      const edges = doc.edges.map((e) => {
        if (referenceKey(e) !== oldKey) return e;
        changed = true;
        was.set(ctx.uri + "\0" + e.id, e.locator ? { locator: e.locator } : { ref: e.ref! });
        const { ref: _r, locator: _l, ...rest } = e;
        return { ...rest, ...to } as DiagramEdge;
      });
      return changed ? { ...doc, edges } : doc;
    },
    revert(doc, ctx) {
      let changed = false;
      const edges = doc.edges.map((e) => {
        const old = was.get(ctx.uri + "\0" + e.id);
        if (!old) return e;
        changed = true;
        const { ref: _r, locator: _l, ...rest } = e;
        return { ...rest, ...old } as DiagramEdge;
      });
      return changed ? { ...doc, edges } : doc;
    },
  };
}

/**
 * Unnamed control nodes that a statement named (`fork;` to `fork fork1;`): their diagram nodes change from a locator to the
 * new reference, and the entries of the later unnamed twins move up by one. Applies to the saved state of every diagram file.
 */
export function nameNodesChange(named: readonly { oldKey: string | undefined; ref: string }[], label: string): DiagramChange {
  const was = new Map<string, DiagramNode>();
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      // Every old key is resolved against the unchanged nodes first, so naming one node never disturbs finding the next.
      const hits = new Map<string, { ref: string; group: string; k: number }>();
      const renamed: { group: string; k: number }[] = [];
      for (const n of named) {
        if (!n.oldKey || doc.nodes.some((x) => x.ref === n.ref)) continue; // nothing to name, or already applied to this document
        const old = doc.nodes.find((x) => referenceKey(x) === n.oldKey);
        if (!old?.locator) continue;
        const group = referenceKey({ locator: { ...old.locator, index: 0 } });
        const k = old.locator.index ?? 0;
        hits.set(old.id, { ref: n.ref, group, k });
        renamed.push({ group, k });
      }
      if (!hits.size) return doc;
      const nodes = doc.nodes.map((x) => {
        const hit = hits.get(x.id);
        if (hit) {
          if (!was.has(ctx.uri + "\0" + x.id)) was.set(ctx.uri + "\0" + x.id, x);
          const { locator: _l, ...rest } = x;
          return { ...rest, ref: hit.ref } as DiagramNode;
        }
        const xl = x.locator;
        if (!xl) return x;
        const group = referenceKey({ locator: { ...xl, index: 0 } });
        const at = xl.index ?? 0;
        const shift = renamed.filter((r) => r.group === group && r.k < at).length;
        if (!shift) return x;
        if (!was.has(ctx.uri + "\0" + x.id)) was.set(ctx.uri + "\0" + x.id, x);
        const { index: _i, ...restL } = xl;
        return { ...x, locator: at - shift > 0 ? { ...restL, index: at - shift } : restL } as DiagramNode;
      });
      return { ...doc, nodes };
    },
    revert(doc, ctx) {
      let changed = false;
      const nodes = doc.nodes.map((x) => {
        const old = was.get(ctx.uri + "\0" + x.id);
        if (!old) return x;
        changed = true;
        return old;
      });
      return changed ? { ...doc, nodes } : doc;
    },
  };
}

/** Two changes as one: `first` is applied before `second`, and reverted after it. */
export function composeChanges(first: DiagramChange, second: DiagramChange, label: string): DiagramChange {
  return {
    ...second,
    target: "all",
    label,
    apply: (doc, ctx) => second.apply(first.apply(doc, ctx), ctx),
    revert: (doc, ctx) => first.revert(second.revert(doc, ctx), ctx),
  };
}

const joinSegs = (segs: readonly string[]) => segs.map(quoteName).join("::");

/** `s` with the prefix `old` (unquoted segments) replaced by `next`; undefined when `s` does not start with it. */
function mapPrefix(old: readonly string[], next: readonly string[], s: string): string | undefined {
  const segs = splitQualified(s);
  if (segs.length < old.length || !old.every((o, i) => segs[i] === o)) return undefined;
  return joinSegs([...next, ...segs.slice(old.length)]);
}

/**
 * Nesting moved an element (design D33): every reference to it and to what it owns follows the new qualified name, the ends of
 * lines written with the old text follow, and its node moves into the node of its new owner (when that is on the diagram; the
 * position is dropped so the webview places it). Applies to the saved state of every diagram file and to open documents.
 */
export function nestChange(oldQn: string, newQn: string, ownerQn: string, endsChanges: readonly { ownerQn: string | undefined; kind: string; oldEnds: string[]; newEnds: string[] }[], label: string): DiagramChange {
  const was = new Map<string, DiagramNode>();
  const key = (e: readonly string[]) => e.map((x) => splitQualified(x).join("\0")).join("\u0001");
  const remap = (doc: DiagramDocument, from: string, to: string, ends: typeof endsChanges, fwd: boolean): DiagramDocument => {
    const oldS = splitQualified(from), newS = splitQualified(to);
    const fixRef = <T extends { ref?: string; locator?: ElementLocator }>(i: T): T => {
      let out = i;
      if (i.ref !== undefined) {
        const n = mapPrefix(oldS, newS, i.ref);
        if (n !== undefined) out = { ...out, ref: n };
      }
      if (i.locator) {
        let l: ElementLocator = { ...i.locator, ends: [...i.locator.ends] };
        for (const c of ends) {
          const a = fwd ? c.oldEnds : c.newEnds, b = fwd ? c.newEnds : c.oldEnds;
          if (c.kind === l.kind && c.ownerQn !== undefined && key([c.ownerQn]) === key([l.owner]) && key(a) === key(l.ends)) {
            l = { ...l, ends: [...b] };
            break;
          }
        }
        const o = mapPrefix(oldS, newS, l.owner);
        if (o !== undefined) l = { ...l, owner: o };
        out = { ...out, locator: l };
      }
      return out;
    };
    const root = mapPrefix(oldS, newS, doc.root) ?? doc.root;
    return { ...doc, root, nodes: doc.nodes.map(fixRef), edges: doc.edges.map(fixRef) };
  };
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      let next = remap(doc, oldQn, newQn, endsChanges, true);
      if (JSON.stringify(next) === JSON.stringify(doc)) return doc;
      const moved = next.nodes.find((n) => n.ref === newQn);
      if (moved) {
        const ownerNode = next.nodes.find((n) => n.ref === ownerQn);
        was.set(ctx.uri + "\0" + moved.id, doc.nodes.find((n) => n.id === moved.id)!);
        const { x: _x, y: _y, parent: _p, ...rest } = moved;
        const fresh: DiagramNode = { ...rest, ...(ownerNode ? { parent: ownerNode.id } : {}) } as DiagramNode;
        next = { ...next, nodes: next.nodes.map((n) => (n.id === moved.id ? fresh : n)) };
      }
      return next;
    },
    revert(doc, ctx) {
      let next = remap(doc, newQn, oldQn, endsChanges, false);
      const nodes = next.nodes.map((n) => {
        const old = was.get(ctx.uri + "\0" + n.id);
        return old ? { ...old, ref: oldQn } as DiagramNode : n;
      });
      next = { ...next, nodes };
      return next;
    },
  };
}

/** A node and the line to it, placed on one diagram together: the node first, so the line finds both of its ends. Reverts in the opposite order. */
export function placeNodeAndLineChange(node: DiagramChange, line: DiagramChange, label: string): DiagramChange {
  const same = (c: DiagramChange, uri: string) => c.target === "all" || c.target.uri === uri;
  return {
    target: node.target,
    label,
    apply: (doc, ctx) => (same(line, ctx.uri) ? line.apply(same(node, ctx.uri) ? node.apply(doc, ctx) : doc, ctx) : doc),
    revert: (doc, ctx) => (same(node, ctx.uri) ? node.revert(same(line, ctx.uri) ? line.revert(doc, ctx) : doc, ctx) : doc),
    createdKeys: () => [...(node.createdKeys?.() ?? []), ...(line.createdKeys?.() ?? [])],
    createdIn: () => new Map([...(node.createdIn?.() ?? []), ...(line.createdIn?.() ?? [])]),
  };
}

/**
 * A line whose end was rewritten: its entry follows the rewritten statement (a new locator) and, when the new end node is
 * on the diagram, points at it; the stored route no longer fits the new end and is dropped. Applies to every diagram file.
 */
export function reconnectChange(oldKey: string | undefined, next: () => ElementReference | undefined, end: "source" | "target", endKey: () => string | undefined, label: string): DiagramChange {
  const was = new Map<string, DiagramEdge>();
  return {
    target: "all",
    label,
    apply(doc, ctx) {
      const to = next();
      if (!oldKey || !to) return doc;
      let changed = false;
      const edges = doc.edges.map((e) => {
        if (referenceKey(e) !== oldKey) return e;
        changed = true;
        was.set(ctx.uri + "\0" + e.id, e);
        const { ref: _r, locator: _l, points: _p, ...rest } = e;
        const k = endKey();
        const node = k !== undefined ? doc.nodes.find((n) => referenceKey(n) === k) : undefined;
        return { ...rest, ...to, ...(node ? { [end]: node.id } : {}) } as DiagramEdge;
      });
      return changed ? { ...doc, edges } : doc;
    },
    revert(doc, ctx) {
      let changed = false;
      const edges = doc.edges.map((e) => {
        const old = was.get(ctx.uri + "\0" + e.id);
        if (!old) return e;
        changed = true;
        return old;
      });
      return changed ? { ...doc, edges } : doc;
    },
  };
}
