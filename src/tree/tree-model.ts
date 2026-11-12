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
  /** Absent for element nodes (everything below a file in the Elements view). */
  kind?: "folder" | "file" | "diagram" | "message";
}

/** A path created or deleted in the workspace: `parent` is the folder URI key above `path`. */
export interface FolderChange {
  parent: string;
  path: string;
  deleted: boolean;
  /** The URI the file system event carried (a `vscode.Uri`, opaque here), so it need not be rebuilt from `path`. */
  uri?: unknown;
}

export interface NodeInfo {
  label: string;
  description?: string;
  /** Key into the icon table in tree-provider.ts. */
  icon: string;
  isRoot: boolean;
  hasChildren: boolean;
}

/** The directory listing and exclusion rules the folder structure needs; the VS Code adapter supplies them. */
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

// ---- Elements view: workspace folder -> folder -> file -> elements ----

export function isFolderNode(n: ModelNode): boolean {
  return n.kind === "folder";
}

export function isDiagramNode(n: ModelNode): boolean {
  return n.kind === "diagram";
}

export function isMessageNode(n: ModelNode): boolean {
  return n.kind === "message";
}

/** The single item shown while a search matches nothing. */
export const NO_MATCHES_NODE: ModelNode = { id: "!no-matches", uri: "", kind: "message" };

/** Searches matching more than this many nodes show their paths collapsed. */
export const MAX_AUTO_EXPAND = 200;
/** Subfolders an empty folder lists before "...N more folders". */
export const MAX_EMPTY_FOLDER_LISTING = 200;

const TOO_MANY_PREFIX = "!too-many:";
const MORE_FOLDERS_PREFIX = "!more-folders:";

/** The item at the top of a search with too many matches to expand. */
export function tooManyMatchesNode(count: number): ModelNode {
  return { id: TOO_MANY_PREFIX + count, uri: "", kind: "message" };
}

export function moreFoldersNode(parentUri: string, count: number): ModelNode {
  return { id: MORE_FOLDERS_PREFIX + count + ":" + parentUri, uri: "", kind: "message" };
}

/** The text of a message node. */
export function messageText(node: ModelNode): string {
  if (node.id.startsWith(TOO_MANY_PREFIX)) return `${node.id.slice(TOO_MANY_PREFIX.length)} matches, refine the search to expand`;
  if (node.id.startsWith(MORE_FOLDERS_PREFIX)) return `\u2026${node.id.slice(MORE_FOLDERS_PREFIX.length).split(":")[0]} more folders`;
  return "No matches";
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
  return ancestorFolders(index).has(folderUri);
}

/** Every folder URI above one of `uris`. */
function ancestorsOf(uris: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const u of uris) {
    for (let i = u.lastIndexOf("/"); i > 0; i = u.lastIndexOf("/", i - 1)) {
      const a = u.slice(0, i);
      if (set.has(a)) break;
      set.add(a);
    }
  }
  return set;
}

const ancestorCache = new WeakMap<ModelIndex, Set<string> | undefined>();

/** Every folder URI above an indexed workspace `.sysml` file; rebuilt after the model changes. */
function ancestorFolders(index: ModelIndex): Set<string> {
  let set = ancestorCache.get(index);
  if (set) return set;
  if (!ancestorCache.has(index)) index.onDidChange(() => ancestorCache.set(index, undefined));
  set = ancestorsOf(workspaceUris(index));
  ancestorCache.set(index, set);
  return set;
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
 * The roots of the Elements view: one per workspace folder, also when no `.sysml` file exists (they are then
 * marked "no SysML files"). Empty only when no folder is open, so the view's welcome message shows.
 */
export function folderRoots(_index: ModelIndex, env: FolderEnv): ModelNode[] {
  return env.roots.map((r) => folderNode(r.uri));
}

/** The roots of the Diagrams view: the workspace folders. */
export function diagramRoots(env: FolderEnv, _diagrams: ReadonlySet<string>): ModelNode[] {
  return env.roots.map((r) => folderNode(r.uri));
}

/** The shown entries of a folder: non-excluded sub folders (by name) and the names of files passing `isFile`, sorted. */
async function shownEntries(env: FolderEnv, node: ModelNode, isFile: (name: string) => boolean): Promise<{ folders: string[]; files: string[] } | undefined> {
  const root = rootOf(env, node.uri);
  if (!root) return undefined;
  let entries: readonly { name: string; isDir: boolean }[];
  try {
    entries = await env.list(node.uri);
  } catch {
    return undefined;
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);
  const shown = entries.filter((e) => {
    const uri = env.child(node.uri, e.name);
    return !env.excluded(relPath(root.uri, uri)) && !(e.isDir && env.roots.some((r) => r.uri === uri));
  });
  return {
    folders: shown.filter((e) => e.isDir).map((e) => e.name).sort(byName),
    files: shown.filter((e) => !e.isDir && isFile(e.name)).map((e) => e.name).sort(byName),
  };
}

/** An empty folder lists at most MAX_EMPTY_FOLDER_LISTING subfolders, then a "more folders" item. */
function capFolders(node: ModelNode, folders: ModelNode[], empty: boolean): ModelNode[] {
  if (!empty || folders.length <= MAX_EMPTY_FOLDER_LISTING) return folders;
  return [...folders.slice(0, MAX_EMPTY_FOLDER_LISTING), moreFoldersNode(node.uri, folders.length - MAX_EMPTY_FOLDER_LISTING)];
}

/** Folders (by name), then files (by name), of a folder. Empty folders have no children. */
export async function folderChildren(index: ModelIndex, env: FolderEnv, node: ModelNode): Promise<ModelNode[]> {
  const empty = !hasSysmlBelow(index, node.uri);
  const indexed = new Set(workspaceUris(index));
  const e = await shownEntries(env, node, (n) => n.toLowerCase().endsWith(".sysml"));
  if (!e) return [];
  return [
    ...capFolders(node, e.folders.map((n) => folderNode(env.child(node.uri, n))), empty),
    ...(empty ? [] : e.files.map((n) => env.child(node.uri, n)).filter((u) => indexed.has(u)).map(fileNode)),
  ];
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

/** Parent in the Elements view: element -> file -> folders -> workspace folder. */
export function folderParent(env: FolderEnv, node: ModelNode): ModelNode | undefined {
  if (isMessageNode(node)) return undefined;
  if (isFolderNode(node)) {
    if (env.roots.some((r) => r.uri === node.uri) || !rootOf(env, node.uri)) return undefined;
    return folderNode(node.uri.slice(0, node.uri.lastIndexOf("/")));
  }
  if (isFileNode(node) || isDiagramNode(node)) return rootOf(env, node.uri) ? folderNode(node.uri.slice(0, node.uri.lastIndexOf("/"))) : undefined;
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
 * Nodes to refresh in the Elements view when `uris` changed: when the set of workspace files changed,
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

// ---- Diagrams view: the same folders, with `.sysmld` files as leaves ----

export const DIAGRAM_KIND_LABELS: Record<string, string> = {
  general: "General",
  interconnection: "Interconnection",
  actionFlow: "Action Flow",
  stateTransition: "State Transition",
  sequence: "Sequence",
  requirements: "Requirements",
};

export function diagramNode(uri: string): ModelNode {
  return { id: uri, uri, kind: "diagram" };
}

/** The display name of the kind of a `.sysmld` file, read from the start of its text (the field is written early); undefined when unknown. */
export function diagramKindLabel(text: string): string | undefined {
  const m = /"kind"\s*:\s*"([A-Za-z]+)"/.exec(text.slice(0, 4096));
  return m ? DIAGRAM_KIND_LABELS[m[1]!] : undefined;
}

/** True when the path, or any folder above it inside its workspace folder, is excluded. */
export function isExcludedPath(env: FolderEnv, uri: string): boolean {
  const root = rootOf(env, uri);
  if (!root) return true;
  const parts = relPath(root.uri, uri).split("/");
  for (let i = 1; i <= parts.length; i++) if (env.excluded(parts.slice(0, i).join("/"))) return true;
  return false;
}

/** The diagram files that count: inside a workspace folder and not excluded. */
export function visibleDiagrams(env: FolderEnv, uris: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const u of uris) if (!isExcludedPath(env, u)) out.add(u);
  return out;
}

const diagramAncestors = new WeakMap<ReadonlySet<string>, Set<string>>();

export function hasDiagramBelow(diagrams: ReadonlySet<string>, folderUri: string): boolean {
  let a = diagramAncestors.get(diagrams);
  if (!a) diagramAncestors.set(diagrams, (a = ancestorsOf(diagrams)));
  return a.has(folderUri);
}

/** Folders (by name), then diagram files (by name), of a folder. Folders without diagrams have no children. */
export async function diagramChildren(diagrams: ReadonlySet<string>, env: FolderEnv, node: ModelNode): Promise<ModelNode[]> {
  const empty = !hasDiagramBelow(diagrams, node.uri);
  const e = await shownEntries(env, node, (n) => n.toLowerCase().endsWith(".sysmld"));
  if (!e) return [];
  return [
    ...capFolders(node, e.folders.map((n) => folderNode(env.child(node.uri, n))), empty),
    ...(empty ? [] : e.files.map((n) => env.child(node.uri, n)).filter((u) => diagrams.has(u)).map(diagramNode)),
  ];
}

export function diagramFolderInfo(diagrams: ReadonlySet<string>, env: FolderEnv, node: ModelNode): { label: string; description?: string; empty: boolean } {
  const root = env.roots.find((r) => r.uri === node.uri);
  const empty = !hasDiagramBelow(diagrams, node.uri);
  return { label: root?.name ?? fileName(node.uri), description: empty ? "no diagrams" : undefined, empty };
}

/**
 * Nodes to refresh in the Diagrams view when the diagram set changed from `previous` to `current` and the
 * content of `changed` was rewritten: the folders above each added or removed file, and each rewritten file.
 */
export function affectedDiagramNodes(env: FolderEnv, previous: ReadonlySet<string>, current: ReadonlySet<string>, changed: Iterable<string> = []): ModelNode[] {
  const out = new Map<string, ModelNode>();
  for (const u of new Set([...previous, ...current])) {
    if (previous.has(u) !== current.has(u)) for (const f of folderChain(env, u)) out.set(f.id, f);
  }
  for (const u of changed) if (current.has(u) && !out.has(u)) out.set(u, diagramNode(u));
  return [...out.values()];
}

// ---- All view: the same folders, with `.sysml` files (and their elements), then `.sysmld` diagrams ----

/** True when a `.sysml` file or a diagram lies below the folder. */
export function hasAnythingBelow(index: ModelIndex, diagrams: ReadonlySet<string>, folderUri: string): boolean {
  return hasSysmlBelow(index, folderUri) || hasDiagramBelow(diagrams, folderUri);
}

/** Subfolders, then `.sysml` files, then diagram files (each by name) of a folder. Folders with neither below have only subfolders. */
export async function allChildren(index: ModelIndex, diagrams: ReadonlySet<string>, env: FolderEnv, node: ModelNode): Promise<ModelNode[]> {
  const empty = !hasAnythingBelow(index, diagrams, node.uri);
  const indexed = new Set(workspaceUris(index));
  const lower = (n: string) => n.toLowerCase();
  const e = await shownEntries(env, node, (n) => lower(n).endsWith(".sysml") || lower(n).endsWith(".sysmld"));
  if (!e) return [];
  const uriOf = (n: string) => env.child(node.uri, n);
  return [
    ...capFolders(node, e.folders.map((n) => folderNode(uriOf(n))), empty),
    ...(empty ? [] : e.files.filter((n) => lower(n).endsWith(".sysml")).map(uriOf).filter((u) => indexed.has(u)).map(fileNode)),
    ...(empty ? [] : e.files.filter((n) => lower(n).endsWith(".sysmld")).map(uriOf).filter((u) => diagrams.has(u)).map(diagramNode)),
  ];
}

export function allFolderInfo(index: ModelIndex, diagrams: ReadonlySet<string>, env: FolderEnv, node: ModelNode): { label: string; description?: string; empty: boolean } {
  const root = env.roots.find((r) => r.uri === node.uri);
  const empty = !hasAnythingBelow(index, diagrams, node.uri);
  return { label: root?.name ?? fileName(node.uri), description: empty ? "no SysML files or diagrams" : undefined, empty };
}

// ---- Search: filter the tree to the nodes matching a query, plus the path to them ----

/** Case-insensitive substring test of a trimmed query; an empty query matches nothing (it means "no filter"). */
export function matchesQuery(text: string | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length > 0 && text !== undefined && text.toLowerCase().includes(q);
}

/** What stays visible in the Elements view while a query is active. */
export interface ElementFilter {
  /** Element node ids that match or lead to a match. */
  elements: ReadonlySet<string>;
  /** The subset of `elements` that has a matching descendant (expanded while filtering). */
  expanded: ReadonlySet<string>;
  /** Files that contain a match, or whose name matches. */
  files: ReadonlySet<string>;
  /** The subset of `files` with matching elements (the others match by name only and show no children). */
  contentFiles: ReadonlySet<string>;
  /** The number of matching elements and file names. */
  matches: number;
  /** Folders above those files. */
  folders: ReadonlySet<string>;
}

/** Match the declared name or short name of every element of every indexed workspace file. */
export function buildElementFilter(index: ModelIndex, query: string): ElementFilter {
  const elements = new Set<string>();
  const expanded = new Set<string>();
  const files = new Set<string>();
  const contentFiles = new Set<string>();
  let matches = 0;
  for (const uri of workspaceUris(index)) {
    if (matchesQuery(fileName(uri), query)) {
      files.add(uri);
      matches++;
    }
    const doc = index.getDocument(uri);
    // A file that never parsed cleanly shows only its error placeholder, no elements.
    if (!doc || (!doc.everParsedCleanly && doc.errors.length > 0)) continue;
    const visit = (siblings: readonly Element[], parentId: string | undefined): boolean => {
      let any = false;
      const segs = segments(siblings);
      for (const e of siblings) {
        const id = parentId === undefined ? makeId(uri, [segs.get(e)!]) : parentId + "/" + segs.get(e)!;
        const below = visit(visibleChildren(e), id);
        const self = matchesQuery(e.name, query) || matchesQuery(e.shortName, query);
        if (self) matches++;
        if (self || below) {
          elements.add(id);
          if (below) expanded.add(id);
          any = true;
        }
      }
      return any;
    };
    if (visit(doc.model.roots.filter(isVisible), undefined)) {
      files.add(uri);
      contentFiles.add(uri);
    }
  }
  return { elements, expanded, files, contentFiles, matches, folders: ancestorsOf(files) };
}

/** What stays visible in the Diagrams view while a query is active. */
export interface DiagramFilter {
  files: ReadonlySet<string>;
  folders: ReadonlySet<string>;
}

/** Match the file names of the diagram set. */
export function buildDiagramFilter(diagrams: Iterable<string>, query: string): DiagramFilter {
  const files = new Set<string>();
  for (const u of diagrams) if (matchesQuery(fileName(u), query)) files.add(u);
  return { files, folders: ancestorsOf(files) };
}

/** Keep the folder and file/diagram nodes that lie on the way to a match. */
export function keepFolderNodes(nodes: readonly ModelNode[], filter: { files: ReadonlySet<string>; folders: ReadonlySet<string> }): ModelNode[] {
  return nodes.filter((n) => (isFolderNode(n) ? filter.folders.has(n.uri) : filter.files.has(n.uri)));
}

/** Keep the element nodes that match or lead to a match. */
export function keepElementNodes(nodes: readonly ModelNode[], filter: ElementFilter): ModelNode[] {
  return nodes.filter((n) => filter.elements.has(n.id));
}

/** What stays visible in the All view: the element filter, with the matching diagram files added to its files. */
export function buildAllFilter(index: ModelIndex, diagrams: Iterable<string>, query: string): ElementFilter {
  const ef = buildElementFilter(index, query);
  const files = new Set(ef.files);
  let matches = ef.matches;
  for (const u of diagrams) {
    if (matchesQuery(fileName(u), query)) {
      files.add(u);
      matches++;
    }
  }
  return { ...ef, files, matches, folders: ancestorsOf(files) };
}
