/**
 * Pure mapping from the ModelIndex to tree nodes. No `vscode` import: the VS Code adapter in
 * tree-provider.ts only renders what this module computes.
 */
import { isLibraryUri, type Element, type ModelIndex } from "../model/index.js";

/** A lightweight handle: the element is looked up again from the index, so nodes survive re-parses. */
export interface ModelNode {
  /** Stable across re-parses: document URI plus a path of kind/name/occurrence segments. Folder and file nodes use their URI. */
  id: string;
  uri: string;
  /** Absent for element nodes (the Packages layout and everything below a file in the Folders layout). */
  kind?: "folder" | "file";
}

export interface NodeInfo {
  label: string;
  description?: string;
  /** Key into the icon table in tree-provider.ts. */
  icon: string;
  isRoot: boolean;
  hasChildren: boolean;
}

/** The directory listing and exclusion rules the Folders layout needs; the VS Code adapter supplies them. */
export interface FolderEnv {
  /** Workspace folders as index keys (URI strings). */
  roots: readonly { name: string; uri: string }[];
  /** Entries of a folder, unsorted. */
  list(folderUri: string): Promise<readonly { name: string; isDir: boolean }[]>;
  /** URI string of the entry `name` inside the folder. */
  child(folderUri: string, name: string): string;
  /** True when the path (relative to its workspace folder, `/` separated) is excluded. */
  excluded(relPath: string): boolean;
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

/** The tree node for an element, or undefined when it is not shown in the tree (library, hidden kinds, gone). */
export function nodeForElement(index: ModelIndex, el: Element): ModelNode | undefined {
  const doc = index.getDocument(el.uri);
  if (!doc || isLibraryUri(el.uri)) return undefined;
  const chain: Element[] = [];
  for (let e: Element | undefined = el; e; e = e.owner) chain.unshift(e);
  let siblings: readonly Element[] = doc.model.roots.filter(isVisible);
  const path: string[] = [];
  for (const e of chain) {
    const seg = segments(siblings).get(e);
    if (seg === undefined) return undefined;
    path.push(seg);
    siblings = visibleChildren(e);
  }
  return { uri: el.uri, id: makeId(el.uri, path) };
}

/** Qualified names of the elements the tree nodes stand for, for dragging them. */
export function elementNames(index: ModelIndex, nodes: readonly ModelNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const qn = resolveNode(index, n)?.qualifiedName;
    if (qn !== undefined && !out.includes(qn)) out.push(qn);
  }
  return out;
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

// ---- Folders layout: workspace folder -> folder -> file -> elements ----

export function isFolderNode(n: ModelNode): boolean {
  return n.kind === "folder";
}

export function isFileNode(n: ModelNode): boolean {
  return n.kind === "file";
}

export function folderNode(uri: string): ModelNode {
  return { id: uri, uri, kind: "folder" };
}

export function fileNode(uri: string): ModelNode {
  return { id: uri, uri, kind: "file" };
}

/** True when an indexed workspace `.sysml` file lives at any depth below the folder. */
export function hasSysmlBelow(index: ModelIndex, folderUri: string): boolean {
  const prefix = folderUri + "/";
  return workspaceUris(index).some((u) => u.startsWith(prefix));
}

function rootOf(env: FolderEnv, uri: string): { name: string; uri: string } | undefined {
  let best: { name: string; uri: string } | undefined;
  for (const r of env.roots) if ((uri === r.uri || uri.startsWith(r.uri + "/")) && (!best || r.uri.length > best.uri.length)) best = r;
  return best;
}

function relPath(root: string, uri: string): string {
  return uri
    .slice(root.length + 1)
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join("/");
}

/**
 * The roots of the Folders layout: one per workspace folder. Empty while the workspace has no `.sysml`
 * file at all, so the view's welcome message (with its New SysML File action) shows.
 */
export function folderRoots(index: ModelIndex, env: FolderEnv): ModelNode[] {
  if (workspaceUris(index).length === 0) return [];
  return env.roots.map((r) => folderNode(r.uri));
}

/** Folders (by name), then files (by name), of a folder. Empty folders have no children. */
export async function folderChildren(index: ModelIndex, env: FolderEnv, node: ModelNode): Promise<ModelNode[]> {
  if (!hasSysmlBelow(index, node.uri)) return [];
  const root = rootOf(env, node.uri);
  if (!root) return [];
  let entries: readonly { name: string; isDir: boolean }[];
  try {
    entries = await env.list(node.uri);
  } catch {
    return [];
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const shown = entries.filter((e) => {
    const rel = relPath(root.uri, env.child(node.uri, e.name));
    // `dir/**` patterns match what is inside a folder, not the folder itself: probe with a child path too.
    return !(env.excluded(rel) || (e.isDir && env.excluded(rel + "/_")));
  });
  const folders = shown.filter((e) => e.isDir).sort(byName).map((e) => folderNode(env.child(node.uri, e.name)));
  const indexed = new Set(workspaceUris(index));
  const files = shown
    .filter((e) => !e.isDir && e.name.toLowerCase().endsWith(".sysml"))
    .sort(byName)
    .map((e) => env.child(node.uri, e.name))
    .filter((u) => indexed.has(u))
    .map(fileNode);
  return [...folders, ...files];
}

/** The elements shown below a file: its top-level elements, or the error placeholder. */
export function fileChildren(index: ModelIndex, node: ModelNode): ModelNode[] {
  return rootNodes(index).filter((n) => n.uri === node.uri);
}

export function folderInfo(index: ModelIndex, env: FolderEnv, node: ModelNode): { label: string; description?: string; empty: boolean } {
  const root = env.roots.find((r) => r.uri === node.uri);
  const empty = !hasSysmlBelow(index, node.uri);
  return { label: root?.name ?? fileName(node.uri), description: empty ? "no SysML files" : undefined, empty };
}

/** Parent in the Folders layout: element -> file -> folders -> workspace folder. */
export function folderParent(env: FolderEnv, node: ModelNode): ModelNode | undefined {
  if (isFolderNode(node)) {
    if (env.roots.some((r) => r.uri === node.uri)) return undefined;
    return folderNode(node.uri.slice(0, node.uri.lastIndexOf("/")));
  }
  if (isFileNode(node)) return folderNode(node.uri.slice(0, node.uri.lastIndexOf("/")));
  return parentNode(node) ?? fileNode(node.uri);
}

/** Folder nodes from the workspace folder down to the one containing `uri`. */
export function folderChain(env: FolderEnv, uri: string): ModelNode[] {
  const root = rootOf(env, uri);
  if (!root) return [];
  const out: ModelNode[] = [];
  for (let u = uri.slice(0, uri.lastIndexOf("/")); u.length >= root.uri.length; u = u.slice(0, u.lastIndexOf("/"))) {
    out.unshift(folderNode(u));
    if (u === root.uri) break;
  }
  return out;
}

/**
 * Nodes to refresh in the Folders layout when `uris` changed: when the set of workspace files changed,
 * the folders from the workspace folder down to the changed files (children lists and empty markers);
 * otherwise only the changed files themselves.
 */
export function affectedFolderNodes(index: ModelIndex, env: FolderEnv, previousFiles: ReadonlySet<string>, uris: readonly string[]): ModelNode[] {
  const current = new Set(workspaceUris(index));
  const out = new Map<string, ModelNode>();
  for (const u of uris) {
    if (isLibraryUri(u)) continue;
    if (current.has(u) !== previousFiles.has(u)) for (const f of folderChain(env, u)) out.set(f.id, f);
    else if (current.has(u)) out.set(u, fileNode(u));
  }
  return [...out.values()];
}
