/**
 * Pure mapping from the ModelIndex to tree nodes. No `vscode` import: the VS Code adapter in
 * tree-provider.ts only renders what this module computes.
 */
import { isLibraryUri, type Element, type ModelIndex } from "../model/index.js";

/** A lightweight handle: the element is looked up again from the index, so nodes survive re-parses. */
export interface ModelNode {
  /** Stable across re-parses: document URI plus a path of kind/name/occurrence segments. */
  id: string;
  uri: string;
}

export interface NodeInfo {
  label: string;
  description?: string;
  /** Key into the icon table in tree-provider.ts. */
  icon: string;
  isRoot: boolean;
  hasChildren: boolean;
}

/** Element kinds that are not shown in the tree. */
const HIDDEN_KINDS = new Set(["import", "expose", "comment", "doc"]);

const ID_SEP = "|";

export function isVisible(e: Element): boolean {
  return !HIDDEN_KINDS.has(e.kind);
}

export function visibleChildren(e: Element): Element[] {
  return e.members.filter(isVisible);
}

function segmentKey(e: Element): string {
  return `${encodeURIComponent(e.kind)}:${encodeURIComponent(e.name ?? e.shortName ?? "")}`;
}

/** Segments for a list of siblings: key plus the occurrence number among siblings with the same key. */
function segments(siblings: readonly Element[]): Map<Element, string> {
  const counts = new Map<string, number>();
  const out = new Map<Element, string>();
  for (const s of siblings) {
    const key = segmentKey(s);
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    out.set(s, `${key}:${n}`);
  }
  return out;
}

function makeId(uri: string, path: string[]): string {
  return uri + ID_SEP + path.join("/");
}

export function workspaceUris(index: ModelIndex): string[] {
  return index.uris().filter((u) => !isLibraryUri(u)).sort();
}

/** Path segment of the placeholder root for a file that never parsed cleanly. */
const ERROR_SEGMENT = "!syntax-error";

export function isErrorNode(node: ModelNode): boolean {
  return node.id === makeId(node.uri, [ERROR_SEGMENT]);
}

/** Zero-based position of the first syntax error of the document. */
export function firstErrorPosition(index: ModelIndex, uri: string): { line: number; column: number } | undefined {
  const err = index.getDocument(uri)?.errors[0];
  return err ? { line: err.line, column: err.column } : undefined;
}

export function rootNodes(index: ModelIndex): ModelNode[] {
  const out: ModelNode[] = [];
  for (const uri of workspaceUris(index)) {
    const doc = index.getDocument(uri);
    if (!doc) continue;
    if (!doc.everParsedCleanly && doc.errors.length > 0) {
      out.push({ id: makeId(uri, [ERROR_SEGMENT]), uri });
      continue;
    }
    const roots = doc.model.roots.filter(isVisible);
    const segs = segments(roots);
    for (const r of roots) out.push({ id: makeId(uri, [segs.get(r)!]), uri });
  }
  return out;
}

export function childNodes(index: ModelIndex, node: ModelNode): ModelNode[] {
  if (isErrorNode(node)) return [];
  const el = resolveNode(index, node);
  if (!el) return [];
  const kids = visibleChildren(el);
  const segs = segments(kids);
  return kids.map((k) => ({ id: node.id + "/" + segs.get(k)!, uri: node.uri }));
}

/** Find the element a node id refers to in the current model, if it still exists. */
export function resolveNode(index: ModelIndex, node: ModelNode): Element | undefined {
  if (isErrorNode(node)) return undefined;
  const doc = index.getDocument(node.uri);
  if (!doc || !node.id.startsWith(node.uri + ID_SEP)) return undefined;
  const path = node.id.slice(node.uri.length + 1).split("/");
  let siblings: readonly Element[] = doc.model.roots.filter(isVisible);
  let found: Element | undefined;
  for (const seg of path) {
    const segs = segments(siblings);
    found = siblings.find((s) => segs.get(s) === seg);
    if (!found) return undefined;
    siblings = visibleChildren(found);
  }
  return found;
}

export function nodeOf(uri: string, id: string): ModelNode {
  return { uri, id };
}

export function parentNode(node: ModelNode): ModelNode | undefined {
  const i = node.id.lastIndexOf("/");
  return i < node.uri.length ? undefined : { uri: node.uri, id: node.id.slice(0, i) };
}

export function fileName(uri: string): string {
  const path = uri.split(/[?#]/, 1)[0]!;
  const last = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function labelOf(e: Element): string {
  return e.name ?? e.shortName ?? "<unnamed>";
}

export function descriptionOf(e: Element): string | undefined {
  if (e.isDefinition) return e.kind;
  if (e.types.length > 0) {
    return `: ${e.types.join(", ")}` + (e.multiplicity ? ` ${e.multiplicity}` : "");
  }
  if (e.ends.length > 0) return e.ends.join(" → ");
  if (e.multiplicity) return e.multiplicity;
  return undefined;
}

const ICON_BASES = ["part", "port", "attribute", "item", "action", "state", "requirement", "connection"];

export function iconKeyOf(e: Element): string {
  if (e.kind === "package" || e.kind === "library package" || e.kind === "namespace") return "package";
  if (e.kind === "connect") return "connection-usage";
  const words = e.kind.split(" ");
  const base = ICON_BASES.find((b) => words.includes(b));
  if (!base) return "element";
  return `${base}-${e.isDefinition ? "def" : "usage"}`;
}

/** The first syntax error of a document as `line:column message`, 1-based for display. */
export function firstErrorText(index: ModelIndex, uri: string): string | undefined {
  const err = index.getDocument(uri)?.errors[0];
  return err ? `line ${err.line + 1}, column ${err.column + 1}: ${err.message}` : undefined;
}

export function nodeInfo(index: ModelIndex, node: ModelNode): NodeInfo | undefined {
  if (isErrorNode(node)) {
    if (!firstErrorText(index, node.uri)) return undefined;
    return { label: fileName(node.uri), description: "syntax error", icon: "error", isRoot: true, hasChildren: false };
  }
  const e = resolveNode(index, node);
  if (!e) return undefined;
  const isRoot = !node.id.slice(node.uri.length).includes("/");
  let description = descriptionOf(e);
  if (isRoot) {
    const errors = index.getDocument(node.uri)?.errors.length ?? 0;
    description = fileName(node.uri) + (errors ? ` (${errors} syntax error${errors === 1 ? "" : "s"})` : "");
  }
  return { label: labelOf(e), description, icon: iconKeyOf(e), isRoot, hasChildren: visibleChildren(e).length > 0 };
}

/** True when the document of this root node currently has syntax errors. */
export function hasErrors(index: ModelIndex, uri: string): boolean {
  return (index.getDocument(uri)?.errors.length ?? 0) > 0;
}

/** The deepest visible element whose range contains `offset`. */
export function nodeAtOffset(index: ModelIndex, uri: string, offset: number): ModelNode | undefined {
  const doc = index.getDocument(uri);
  if (!doc || doc.stale || isLibraryUri(uri)) return undefined;
  const contains = (e: Element) => e.range.start.offset <= offset && offset <= e.range.end.offset;
  let siblings: readonly Element[] = doc.model.roots.filter(isVisible);
  const path: string[] = [];
  for (;;) {
    const segs = segments(siblings);
    const hit = siblings.find(contains);
    if (!hit) break;
    path.push(segs.get(hit)!);
    siblings = visibleChildren(hit);
  }
  return path.length ? { uri, id: makeId(uri, path) } : undefined;
}

export interface Refresh {
  /** True when the set of root nodes changed: refresh the whole tree. */
  full: boolean;
  /** Root node ids to refresh (their expanded descendants keep their ids). */
  ids: string[];
}

/**
 * Which nodes are affected by a change to `uris`. Library documents never matter. If the roots
 * differ from `previousRootIds` the whole tree is refreshed, otherwise only the roots of the
 * changed documents (children are fetched lazily and ids are stable, so expansion is kept).
 */
export function affectedNodes(index: ModelIndex, previousRootIds: readonly string[], uris: readonly string[]): Refresh {
  const rel = new Set(uris.filter((u) => !isLibraryUri(u)));
  if (rel.size === 0) return { full: false, ids: [] };
  const current = rootNodes(index);
  const prev = new Set(previousRootIds);
  const same = current.length === prev.size && current.every((n) => prev.has(n.id));
  if (!same) return { full: true, ids: [] };
  return { full: false, ids: current.filter((n) => rel.has(n.uri)).map((n) => n.id) };
}
