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
  kind?: "folder" | "file" | "diagram";
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
 * The roots of both views: one per workspace folder. Empty while the workspace has no `.sysml`
 * file at all, so the view's welcome message (with its New SysML File action) shows.
 */
export function folderRoots(index: ModelIndex, env: FolderEnv): ModelNode[] {
  if (workspaceUris(index).length === 0) return [];
  return env.roots.map((r) => folderNode(r.uri));
}

/** The roots of the Diagrams view: the workspace folders, whenever any diagram exists. */
export function diagramRoots(env: FolderEnv, diagrams: ReadonlySet<string>): ModelNode[] {
  return diagrams.size === 0 ? [] : env.roots.map((r) => folderNode(r.uri));
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

/** Folders (by name), then files (by name), of a folder. Empty folders have no children. */
export async function folderChildren(index: ModelIndex, env: FolderEnv, node: ModelNode): Promise<ModelNode[]> {
  if (!hasSysmlBelow(index, node.uri)) return [];
  const indexed = new Set(workspaceUris(index));
  const e = await shownEntries(env, node, (n) => n.toLowerCase().endsWith(".sysml"));
  if (!e) return [];
  return [
    ...e.folders.map((n) => folderNode(env.child(node.uri, n))),
    ...e.files.map((n) => env.child(node.uri, n)).filter((u) => indexed.has(u)).map(fileNode),
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
  if (!hasDiagramBelow(diagrams, node.uri)) return [];
  const e = await shownEntries(env, node, (n) => n.toLowerCase().endsWith(".sysmld"));
  if (!e) return [];
  return [
    ...e.folders.map((n) => folderNode(env.child(node.uri, n))),
    ...e.files.map((n) => env.child(node.uri, n)).filter((u) => diagrams.has(u)).map(diagramNode),
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
