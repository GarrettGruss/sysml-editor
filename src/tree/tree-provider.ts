/** VS Code adapter for the model tree: renders what tree-model.ts computes. */
import * as vscode from "vscode";
import { uriKey } from "../workspace/uri-key.js";
import type { ModelIndex } from "../model/index.js";
import { ELEMENT_MIME } from "../diagram/protocol.js";
import { RescanScheduler } from "./rescan-scheduler.js";
import { makeExcludeFilter, patternsFromObject } from "../workspace/exclude.js";
import {
  NO_MATCHES_NODE, allChildren, allFolderInfo, buildAllFilter, MAX_AUTO_EXPAND, messageText, tooManyMatchesNode, buildDiagramFilter, buildElementFilter, isMessageNode, keepElementNodes, keepFolderNodes, isExcludedPath,
  affectedDiagramNodes, affectedFolderNodes, childNodes, diagramChildren, diagramFolderInfo, diagramKindLabel, elementNames, fileChildren, fileName, firstErrorPosition, firstErrorText,
  diagramRoots, folderChildren, folderInfo, folderParent, folderRoots, isDiagramNode, isErrorNode, isFileNode, isFolderNode, nodeAtOffset, nodeInfo, resolveNode, visibleDiagrams, workspaceUris,
  type DiagramFilter, type ElementFilter, type FolderChange, type FolderEnv, type ModelNode,
} from "./tree-model.js";

export type TreeFilter = "elements" | "diagrams" | "all";
const FILTER_KEY = "sysml.treeFilter";
export const DIAGRAM_VIEW_TYPE_ID = "sysml.diagram";

/** The directory listing and exclusion rules of the tree, backed by the workspace. */
export function workspaceFolderEnv(): FolderEnv {
  let key = "";
  let filter: (rel: string) => boolean = () => false;
  return {
    get roots() {
      return (vscode.workspace.workspaceFolders ?? []).map((f) => ({ name: f.name, uri: uriKey(f.uri) }));
    },
    async list(folderUri) {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.parse(folderUri));
      return entries.map(([name, type]) => ({ name, isDir: (type & vscode.FileType.Directory) !== 0 }));
    },
    child: (folderUri, name) => uriKey(vscode.Uri.joinPath(vscode.Uri.parse(folderUri), name)),
    excluded(rel) {
      const sysml = vscode.workspace.getConfiguration("sysml").get<string[]>("exclude", ["**/node_modules/**"]);
      const files = vscode.workspace.getConfiguration("files").get<Record<string, unknown>>("exclude");
      const k = JSON.stringify([sysml, files]);
      if (k !== key) {
        key = k;
        filter = makeExcludeFilter([...sysml, ...patternsFromObject(files)]);
      }
      return filter(rel);
    },
  };
}

export const VIEW_ID = "sysmlModel";
/** Seconds after a folder is created at which its subtree is read again for diagrams (watchers may have missed some). */
const SUBTREE_RESCAN_MS = [1000, 3000, 10000];
/** Created folders re-read at once per workspace folder; more collapse into their common folder. */
const MAX_SCHEDULED_FOLDERS = 20;
/** Event order entries kept before the ones no re-read can still need are dropped. */
const MAX_EVENTS = 1000;

const ICONS: Record<string, string> = {
  package: "package",
  "part-def": "symbol-class",
  "part-usage": "symbol-field",
  "port-def": "plug",
  "port-usage": "symbol-event",
  "attribute-def": "symbol-struct",
  "attribute-usage": "symbol-property",
  "item-def": "symbol-interface",
  "item-usage": "symbol-variable",
  "action-def": "symbol-method",
  "action-usage": "play",
  "state-def": "circle-large-filled",
  "state-usage": "circle-large-outline",
  "requirement-def": "checklist",
  "requirement-usage": "check",
  "connection-def": "git-merge",
  "connection-usage": "link",
  element: "symbol-misc",
};

export class ModelTreeProvider implements vscode.TreeDataProvider<ModelNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ModelNode | ModelNode[] | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private files = new Set<string>();
  private filterValue: TreeFilter = "elements";
  /** The `.sysmld` files shown in the Diagrams view, and their kind labels (undefined when unreadable). */
  private diagrams: ReadonlySet<string> = new Set();
  private readonly kinds = new Map<string, string | undefined>();
  private diagramsReady: Promise<void> = Promise.resolve();
  private readonly subs: vscode.Disposable[] = [];
  private readonly env: FolderEnv;
  /** Workspace searches and directory reads done for the tree (a test hook: an idle workspace does none). */
  private io = 0;
  /** The few re-reads of newly created folders: skipped below a scheduled folder, collapsed in bursts. */
  private readonly rescans = new RescanScheduler<vscode.Uri>(
    (_path, uri) => void this.rescanSubtree(uri),
    SUBTREE_RESCAN_MS,
    {
      max: MAX_SCHEDULED_FOLDERS,
      bucketOf: (path) => this.env.roots.find((r) => path === r.uri || path.startsWith(r.uri + "/"))?.uri,
      // The common folder is above the original URI by the difference in segments; walk up from it.
      merge: (common, from) => {
        const f = from[0]!;
        const up = f.path.split("/").length - common.split("/").length;
        return up <= 0 ? f.payload : vscode.Uri.joinPath(f.payload, ...Array<string>(up).fill(".."));
      },
    },
  );
  private readonly emitterQuery = new vscode.EventEmitter<string>();
  /** Fires with the new query text whenever the search changes. */
  readonly onDidChangeQuery = this.emitterQuery.event;
  private queryValue = "";
  private queryGeneration = 0;
  private elementFilterCache: ElementFilter | undefined;
  private diagramFilterCache: DiagramFilter | undefined;
  private allFilterCache: ElementFilter | undefined;
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  /** Nodes the user expanded in the unfiltered tree, so their state returns when a search is cleared. */
  private readonly expandedIds = new Set<string>();
  /** Why a document cannot be edited (workspace boundary, `sysml.exclude`, not a file); such nodes get no Add Child, Rename or Delete. */
  editBlocker?: (uri: string) => string | undefined;

  constructor(
    readonly index: ModelIndex,
    env: FolderEnv = workspaceFolderEnv(),
    private readonly state?: vscode.Memento,
    folderChanges?: vscode.Event<FolderChange>,
  ) {
    this.env = Object.create(env, {
      list: {
        value: (folderUri: string) => {
          this.io++;
          return env.list(folderUri);
        },
      },
    }) as FolderEnv;
    this.filterValue = (["diagrams", "all"] as const).find((f) => f === state?.get<TreeFilter>(FILTER_KEY)) ?? "elements";
    this.files = new Set(workspaceUris(index));
    void vscode.commands.executeCommand("setContext", "sysml.treeFilter", this.filterValue);
    this.diagramsReady = this.scanDiagrams();
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.sysmld");
    this.subs.push(
      watcher,
      watcher.onDidCreate((u) => this.onDiagramFile(uriKey(u), true)),
      watcher.onDidDelete((u) => this.onDiagramFile(uriKey(u), false)),
      watcher.onDidChange((u) => this.onDiagramChanged(uriKey(u))),
      index.onDidChange((e) => this.onModelChange(e.uris)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.rescanAll()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (["sysml.exclude", "files.exclude"].some((k) => e.affectsConfiguration(k))) this.rescanAll();
      }),
    );
    if (folderChanges) this.subs.push(folderChanges((parent) => this.onFolderChange(parent)));
  }

  /** The diagram set may be wrong everywhere (configuration or workspace folders changed): rescan now if shown, else when shown. */
  private rescanAll(): void {
    this.diagramsDirty = true;
    if (this.filterValue !== "elements") this.diagramsReady = this.scanDiagrams().then(() => this.fullRefresh());
    this.fullRefresh();
  }

  /** Refresh everything; VS Code asks for the children again, so what was handed out is forgotten. */
  private fullRefresh(): void {
    this.handed.clear();
    this.emitter.fire(undefined);
  }

  /**
   * Fire a targeted refresh. VS Code keys the nodes it knows by object identity and ignores others, so
   * each node is replaced by the object getChildren handed out under that id, or by its nearest handed
   * ancestor (nothing when none was ever shown).
   */
  private fireTargeted(nodes: readonly ModelNode[]): void {
    const out = new Set<ModelNode>();
    for (const n of nodes) {
      let cur: ModelNode | undefined = n;
      for (let i = 0; cur && i < 1000; i++, cur = this.getParent(cur)) {
        const h = this.handed.get(cur.id);
        if (h) {
          out.add(h);
          break;
        }
      }
    }
    if (out.size) this.emitter.fire([...out]);
  }

  /** Every node getChildren handed to VS Code (id to the last object). */
  private readonly handed = new Map<string, ModelNode>();

  /** Whether `node` is the object last handed out under its id (not one built afresh). */
  isHanded(node: ModelNode): boolean {
    return this.handed.get(node.id) === node;
  }

  get filter(): TreeFilter {
    return this.filterValue;
  }

  async setFilter(filter: TreeFilter): Promise<void> {
    if (filter === this.filterValue) return;
    this.filterValue = filter;
    if (filter !== "elements" && this.diagramsDirty) this.diagramsReady = this.scanDiagrams();
    await this.state?.update(FILTER_KEY, filter);
    await vscode.commands.executeCommand("setContext", "sysml.treeFilter", filter);
    this.fullRefresh();
  }

  /** Scan the workspace for `.sysmld` files (files.exclude applies to the search, sysml.exclude to the result) and refresh the affected nodes. */
  private async scanDiagrams(): Promise<void> {
    const generation = ++this.scanGeneration;
    this.diagramsDirty = false;
    this.scanEvents.clear();
    this.lastEvent.clear(); // reads started before this scan give way to it anyway
    this.scanning++;
    try {
      await this.runScan(generation);
    } finally {
      this.scanning--;
    }
  }

  private scanGeneration = 0;
  private scanning = 0;
  /** File events seen while a full scan runs (the scan may have read the disk before them), replayed on its result. */
  private readonly scanEvents = new Map<string, boolean>();
  /** Order of the file events applied, so a folder re-read that started before an event does not undo it. */
  private eventSeq = 0;
  private readonly lastEvent = new Map<string, number>();
  /** Start orders of the folder re-reads in flight. */
  private readonly readsInFlight = new Set<number>();

  /** Forget events no folder re-read in flight can compare against. */
  private pruneEvents(): void {
    if (this.lastEvent.size <= MAX_EVENTS) return;
    const oldest = this.readsInFlight.size ? Math.min(...this.readsInFlight) : Infinity;
    for (const [u, seq] of this.lastEvent) if (seq <= oldest) this.lastEvent.delete(u);
  }

  /** The diagram set may be stale (changes seen while the Elements view was shown); rescanned when switching to Diagrams. */
  private diagramsDirty = false;

  private async runScan(generation: number): Promise<void> {
    let found: vscode.Uri[];
    this.io++;
    try {
      found = await vscode.workspace.findFiles("**/*.sysmld", undefined);
    } catch {
      return;
    }
    if (generation !== this.scanGeneration) return;
    const next = visibleDiagrams(this.env, found.map(uriKey));
    for (const [u, created] of this.scanEvents) {
      if (created && visibleDiagrams(this.env, [u]).size > 0) next.add(u);
      else if (!created) next.delete(u);
    }
    this.scanEvents.clear();
    this.applyDiagrams(next);
  }

  private applyDiagrams(next: ReadonlySet<string>): void {
    const previous = this.diagrams;
    this.diagrams = next;
    for (const u of this.kinds.keys()) if (!next.has(u)) this.kinds.delete(u);
    this.diagramFilterCache = undefined;
    if (this.filterValue === "elements") return;
    this.allFilterCache = undefined;
    if (this.queryValue) {
      this.scheduleFilterRefresh();
      return;
    }
    const nodes = affectedDiagramNodes(this.env, previous, next);
    if (nodes.length) this.fireTargeted(nodes);
  }

  /** A single `.sysmld` was created or deleted: apply it to the diagram set without scanning the workspace. */
  private onDiagramFile(uri: string, created: boolean): void {
    if (this.filterValue === "elements") {
      this.diagramsDirty = true;
      return;
    }
    if (this.scanning > 0) this.scanEvents.set(uri, created);
    this.lastEvent.set(uri, ++this.eventSeq);
    this.pruneEvents();
    const next = new Set(this.diagrams);
    if (created) {
      if (visibleDiagrams(this.env, [uri]).size === 0) return;
      next.add(uri);
    } else if (!next.delete(uri)) return;
    this.applyDiagrams(next);
  }

  /**
   * File watchers can miss changes inside a folder created moments earlier (the watch is added late), so
   * that one folder's subtree is read again at about 1 s, 3 s and 10 s, then never again. Only directories.
   */
  private async rescanCreatedFolder(path: string, uri: vscode.Uri): Promise<void> {
    if (this.filterValue === "elements" || isExcludedPath(this.env, path)) return;
    try {
      if (((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) === 0) return;
    } catch {
      return; // gone again
    }
    this.rescans.schedule(path, uri);
  }

  /** Reconcile the diagram entries below `path` (adds and removes) with the disk and refresh the affected folders. */
  private async rescanSubtree(uri: vscode.Uri): Promise<void> {
    if (this.filterValue === "elements") return;
    const path = uriKey(uri);
    const generation = this.scanGeneration;
    const start = this.eventSeq;
    this.io++;
    let found: vscode.Uri[];
    this.readsInFlight.add(start);
    // Entries added after the read began (by a scan or another folder's re-read) are newer than this read and are not removed by it.
    const before = this.diagrams;
    try {
      found = await vscode.workspace.findFiles(new vscode.RelativePattern(uri, "**/*.sysmld"));
    } catch {
      return;
    } finally {
      this.readsInFlight.delete(start);
    }
    // A full scan started meanwhile has the newer word.
    if (generation !== this.scanGeneration || (this.filterValue as TreeFilter) === "elements") return;
    const prefix = path + "/";
    const fresh = (u: string) => (this.lastEvent.get(u) ?? 0) > start;
    // Entries an event touched after the read began keep the event's word.
    const next = new Set([...this.diagrams].filter((u) => !u.startsWith(prefix) || fresh(u) || !before.has(u)));
    for (const u of visibleDiagrams(this.env, found.map(uriKey))) if (!fresh(u) || this.diagrams.has(u)) next.add(u);
    if (next.size === this.diagrams.size && [...next].every((u) => this.diagrams.has(u))) return;
    this.applyDiagrams(next);
  }

  /** A deleted folder takes the diagrams below it out of the set. */
  private dropDiagramsBelow(path: string): void {
    const prefix = path + "/";
    const next = new Set([...this.diagrams].filter((u) => !u.startsWith(prefix)));
    if (next.size !== this.diagrams.size) this.applyDiagrams(next);
  }

  /** Test hooks: how many workspace searches and directory reads the tree did, and how many folder re-reads are still due. */
  get ioCalls(): number {
    return this.io;
  }

  get pendingFolderRescans(): number {
    return this.rescans.pending;
  }

  private onDiagramChanged(uri: string): void {
    this.kinds.delete(uri);
    if (this.filterValue === "elements" || !this.diagrams.has(uri)) return;
    void this.loadKind(uri).then(() => this.fireTargeted([{ id: uri, uri, kind: "diagram" }]));
  }

  /** The kind label of a diagram file, cached; read from the first bytes of the file. */
  private async loadKind(uri: string): Promise<void> {
    if (this.kinds.has(uri)) return;
    let label: string | undefined;
    this.io++;
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
      label = diagramKindLabel(new TextDecoder().decode(bytes.subarray(0, 4096)));
    } catch {
      label = undefined;
    }
    this.kinds.set(uri, label);
  }

  private pendingFolders = new Set<string>();
  private folderTimer: ReturnType<typeof setTimeout> | undefined;

  /** A path was created or deleted below `parent` (a folder URI key): refresh that node only, batched. */
  private onFolderChange({ parent, path, deleted, uri }: FolderChange): void {
    if (deleted) {
      this.rescans.cancel(path);
      const prefix = path + "/";
      for (const id of [...this.expandedIds]) if (id === path || id.startsWith(prefix)) this.expandedIds.delete(id);
    }
    if (this.filterValue !== "elements") {
      if (deleted) this.dropDiagramsBelow(path);
      else void this.rescanCreatedFolder(path, (uri as vscode.Uri | undefined) ?? vscode.Uri.parse(path));
    } else this.diagramsDirty = true;
    this.leafFolders.delete(parent);
    if (!this.handed.has(parent)) return;
    const root = this.env.roots.find((r) => parent === r.uri || parent.startsWith(r.uri + "/"));
    if (!root || this.env.excluded(parent.slice(root.uri.length + 1))) return;
    this.pendingFolders.add(parent);
    clearTimeout(this.folderTimer);
    this.folderTimer = setTimeout(() => {
      const parents = [...this.pendingFolders];
      this.pendingFolders.clear();
      const roots = this.env.roots;
      const nodes: ModelNode[] = [];
      for (const p of parents) {
        const root = roots.find((r) => p === r.uri || p.startsWith(r.uri + "/"));
        if (!root || this.env.excluded(p.slice(root.uri.length + 1))) continue;
        nodes.push({ id: p, uri: p, kind: "folder" });
      }
      if (nodes.length) this.fireTargeted(nodes);
    }, 150);
  }

  private onModelChange(uris: string[]): void {
    const nodes = this.filterValue !== "diagrams" ? affectedFolderNodes(this.index, this.env, this.files, uris) : [];
    this.files = new Set(workspaceUris(this.index));
    this.elementFilterCache = undefined;
    this.allFilterCache = undefined;
    if (this.queryValue) this.scheduleFilterRefresh();
    else if (nodes.length) this.fireTargeted(nodes);
  }

  /** What VS Code calls; the nodes returned are the ones it will know. */
  getChildren(node?: ModelNode): ModelNode[] | Promise<ModelNode[]> {
    return this.children(node, true);
  }

  /** The children of a node; `record` false for callers other than VS Code (tests), whose objects VS Code does not know. */
  children(node: ModelNode | undefined, record: boolean): ModelNode[] | Promise<ModelNode[]> {
    const track = (kids: ModelNode[]) => {
      if (record) for (const k of kids) this.handed.set(k.id, k);
      return kids;
    };
    if (this.filterValue === "diagrams") {
      return this.diagramsReady.then(async () => {
        const f = this.queryValue ? this.diagramFilterNow() : undefined;
        if (!node) {
          const roots = diagramRoots(this.env, this.diagrams);
          if (!f) return track(roots);
          const kept = keepFolderNodes(roots, f);
          return track(this.withTooMany(kept));
        }
        if (!isFolderNode(node)) return [];
        let kids = await diagramChildren(this.diagrams, this.env, node);
        this.noteSubfolders(node, kids);
        if (f) kids = keepFolderNodes(kids, f);
        await Promise.all(kids.filter(isDiagramNode).map((k) => this.loadKind(k.uri)));
        return track(kids);
      });
    }
    if (this.filterValue === "all") {
      return this.diagramsReady.then(async () => {
        const f = this.queryValue ? this.allFilterNow() : undefined;
        if (!node) {
          const roots = folderRoots(this.index, this.env);
          return track(f ? this.withTooMany(keepFolderNodes(roots, f)) : roots);
        }
        if (isMessageNode(node) || isDiagramNode(node)) return [];
        if (isFolderNode(node)) {
          let kids = await allChildren(this.index, this.diagrams, this.env, node);
          this.noteSubfolders(node, kids);
          if (f) kids = keepFolderNodes(kids, f);
          await Promise.all(kids.filter(isDiagramNode).map((k) => this.loadKind(k.uri)));
          return track(kids);
        }
        const kids = isFileNode(node) ? fileChildren(this.index, node) : childNodes(this.index, node);
        return track(f ? keepElementNodes(kids, f) : kids);
      });
    }
    const f = this.queryValue ? this.elementFilterNow() : undefined;
    if (!node) {
      const roots = folderRoots(this.index, this.env);
      if (!f) return track(roots);
      const kept = keepFolderNodes(roots, f);
      return track(this.withTooMany(kept));
    }
    if (isMessageNode(node)) return [];
    if (isFolderNode(node)) {
      return folderChildren(this.index, this.env, node).then((k) => {
        this.noteSubfolders(node, k);
        return track(f ? keepFolderNodes(k, f) : k);
      });
    }
    const kids = isFileNode(node) ? fileChildren(this.index, node) : childNodes(this.index, node);
    return track(f ? keepElementNodes(kids, f) : kids);
  }

  /** The roots of a filtered view: "no matches" for none, a "refine the search" item first when there are too many to expand. */
  private withTooMany(kept: ModelNode[]): ModelNode[] {
    if (!kept.length) return [NO_MATCHES_NODE];
    return this.tooManyMatches() ? [tooManyMatchesNode(this.matchCount()), ...kept] : kept;
  }

  /** Empty folders without subfolders found when last listed: shown as leaves. */
  private readonly leafFolders = new Set<string>();

  private noteSubfolders(node: ModelNode, kids: readonly ModelNode[]): void {
    if (kids.length === 0) this.leafFolders.add(node.uri);
    else this.leafFolders.delete(node.uri);
  }

  private elementFilterNow(): ElementFilter {
    return (this.elementFilterCache ??= buildElementFilter(this.index, this.queryValue));
  }

  /** The filter of the Elements or All view, whichever is shown. */
  private activeElementFilter(): ElementFilter {
    return this.filterValue === "all" ? this.allFilterNow() : this.elementFilterNow();
  }

  private allFilterNow(): ElementFilter {
    return (this.allFilterCache ??= buildAllFilter(this.index, this.diagrams, this.queryValue));
  }

  private diagramFilterNow(): DiagramFilter {
    return (this.diagramFilterCache ??= buildDiagramFilter(this.diagrams, this.queryValue));
  }

  get query(): string {
    return this.queryValue;
  }

  /** Filter the active view to the nodes matching `text` (and the path to them); an empty text restores the tree. */
  setQuery(text: string): void {
    const q = text.trim();
    if (q === this.queryValue) return;
    this.queryValue = q;
    this.queryGeneration++;
    this.elementFilterCache = undefined;
    this.diagramFilterCache = undefined;
    this.allFilterCache = undefined;
    clearTimeout(this.filterTimer);
    this.emitterQuery.fire(q);
    void vscode.commands.executeCommand("setContext", "sysml.searchActive", q.length > 0);
    this.fullRefresh();
  }

  /** How many nodes match the active query (0 without one). */
  private matchCount(): number {
    if (!this.queryValue) return 0;
    if (this.filterValue === "diagrams") return this.diagramFilterNow().files.size;
    return this.activeElementFilter().matches;
  }

  private tooManyMatches(): boolean {
    return this.matchCount() > MAX_AUTO_EXPAND;
  }

  /** The model or the diagram set changed while a query is active: recompute the matches once the changes settle. */
  private scheduleFilterRefresh(): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.fullRefresh(), 150);
  }

  /** The user expanded or collapsed a node in the unfiltered tree; remembered so the state returns after a search. */
  setExpanded(node: ModelNode, expanded: boolean): void {
    if (this.queryValue) return;
    if (expanded) this.expandedIds.add(node.id);
    else this.expandedIds.delete(node.id);
  }

  /** Whether the node is part of the filtered tree (always true without a query). */
  private isShown(node: ModelNode): boolean {
    if (!this.queryValue) return true;
    if (this.filterValue === "diagrams") {
      const f = this.diagramFilterNow();
      return isFolderNode(node) ? f.folders.has(node.uri) : f.files.has(node.uri);
    }
    const f = this.activeElementFilter();
    if (isFolderNode(node)) return f.folders.has(node.uri);
    if (isFileNode(node) || isDiagramNode(node)) return f.files.has(node.uri);
    return f.elements.has(node.id);
  }

  /** Select a node; VS Code resolves it through getParent/getChildren. Failures are logged. */
  async revealNode(view: vscode.TreeView<ModelNode>, node: ModelNode, log?: (m: string) => void): Promise<void> {
    const say = log ?? ((m: string) => console.warn(m));
    if (!this.isShown(node)) return;
    try {
      await view.reveal(node, { select: true, focus: false, expand: false });
    } catch (e) {
      say(`SysML tree: reveal of ${node.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  getParent(node: ModelNode): ModelNode | undefined {
    return folderParent(this.env, node);
  }

  private folderItem(node: ModelNode): vscode.TreeItem {
    if (isDiagramNode(node)) {
      const item = new vscode.TreeItem(fileName(node.uri), vscode.TreeItemCollapsibleState.None);
      item.id = node.id;
      item.description = this.kinds.get(node.uri);
      item.iconPath = new vscode.ThemeIcon("type-hierarchy");
      item.contextValue = "sysmlDiagram";
      item.tooltip = vscode.Uri.parse(node.uri).fsPath;
      item.command = { command: "vscode.openWith", title: "Open Diagram", arguments: [vscode.Uri.parse(node.uri), DIAGRAM_VIEW_TYPE_ID] };
      return item;
    }
    if (isFolderNode(node)) {
      const f = this.filterValue === "diagrams" ? diagramFolderInfo(this.diagrams, this.env, node) : this.filterValue === "all" ? allFolderInfo(this.index, this.diagrams, this.env, node) : folderInfo(this.index, this.env, node);
      // An empty folder expands to its subfolders; it is a leaf once a listing found none (read lazily).
      const leaf = f.empty && this.leafFolders.has(node.uri);
      const item = new vscode.TreeItem(f.label, leaf ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
      item.id = node.id;
      item.description = f.description;
      item.iconPath = f.empty ? new vscode.ThemeIcon("folder", new vscode.ThemeColor("disabledForeground")) : new vscode.ThemeIcon("folder");
      item.contextValue = f.empty ? "sysmlFolderEmpty" : "sysmlFolder";
      item.tooltip = vscode.Uri.parse(node.uri).fsPath;
      return item;
    }
    const kids = fileChildren(this.index, node).length > 0;
    const item = new vscode.TreeItem(fileName(node.uri), kids ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = node.id;
    item.iconPath = new vscode.ThemeIcon("file-code");
    item.contextValue = "sysmlFile";
    item.tooltip = vscode.Uri.parse(node.uri).fsPath;
    item.command = { command: "vscode.open", title: "Open File", arguments: [vscode.Uri.parse(node.uri)] };
    return item;
  }

  getTreeItem(node: ModelNode): vscode.TreeItem {
    const item = this.buildItem(node);
    if (isMessageNode(node)) return item;
    if (!this.queryValue) {
      if (item.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed && this.expandedIds.has(node.id)) item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      return item;
    }
    // While searching, the ids differ from the normal ones so VS Code applies the expanded state given here
    // instead of the one it remembers for the unfiltered tree, which returns when the search is cleared.
    item.id = `q${this.queryGeneration}:${node.id}`;
    // A search with many matches shows its path nodes collapsed: expanding them all would render nearly the whole model.
    const open = this.tooManyMatches() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
    if (this.filterValue === "diagrams" || isFolderNode(node) || isDiagramNode(node)) {
      if (item.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed) item.collapsibleState = open;
    } else if (isFileNode(node)) {
      // A file matching only by name has no matching children to show.
      item.collapsibleState = this.activeElementFilter().contentFiles.has(node.uri) ? open : vscode.TreeItemCollapsibleState.None;
    } else {
      const f = this.activeElementFilter();
      // Elements that only match have their children hidden: no twistie.
      item.collapsibleState = f.expanded.has(node.id) ? open : vscode.TreeItemCollapsibleState.None;
    }
    return item;
  }

  private buildItem(node: ModelNode): vscode.TreeItem {
    if (isMessageNode(node)) {
      const item = new vscode.TreeItem(messageText(node), vscode.TreeItemCollapsibleState.None);
      item.id = node.id;
      item.contextValue = node === NO_MATCHES_NODE ? "sysmlNoMatches" : "sysmlMessage";
      return item;
    }
    if (isFolderNode(node) || isFileNode(node) || isDiagramNode(node)) return this.folderItem(node);
    const info = nodeInfo(this.index, node);
    const item = new vscode.TreeItem(info?.label ?? "<gone>");
    item.id = node.id;
    if (!info) return item;
    item.collapsibleState = info.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
    item.description = info.description;
    item.iconPath = new vscode.ThemeIcon(ICONS[info.icon] ?? ICONS.element!);
    item.contextValue = this.editBlocker?.(node.uri) ? "sysmlElementReadOnly" : "sysmlElement";
    item.command = { command: "sysml.goToDefinition", title: "Go to Definition", arguments: [node] };
    if (isErrorNode(node)) {
      item.contextValue = "sysmlSyntaxError";
      item.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground"));
      item.tooltip = `Syntax error at ${firstErrorText(this.index, node.uri)}`;
      return item;
    }
    const error = info.isRoot ? firstErrorText(this.index, node.uri) : undefined;
    if (error) {
      item.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground"));
      item.tooltip = `Syntax error, showing the last good model. First error at ${error}`;
    }
    return item;
  }

  dispose(): void {
    clearTimeout(this.folderTimer);
    clearTimeout(this.filterTimer);
    this.rescans.clear();
    this.emitterQuery.dispose();
    for (const s of this.subs) s.dispose();
    this.emitter.dispose();
  }
}

/**
 * Dragging elements out of the tree. The elements travel as a JSON array of qualified names under
 * a custom MIME type (and as plain text for other drop targets); a diagram's drop handler adds them.
 */
export class ModelTreeDragAndDrop implements vscode.TreeDragAndDropController<ModelNode> {
  readonly dragMimeTypes = [ELEMENT_MIME, "text/plain"];
  readonly dropMimeTypes: string[] = [];

  constructor(private readonly index: ModelIndex) {}

  handleDrag(source: readonly ModelNode[], data: vscode.DataTransfer): void {
    const names = elementNames(this.index, source);
    if (!names.length) return;
    data.set(ELEMENT_MIME, new vscode.DataTransferItem(JSON.stringify(names)));
    data.set("text/plain", new vscode.DataTransferItem(names.join("\n")));
  }
}

/** Open the element's file with its name (or whole declaration) selected. */
export async function goToDefinition(index: ModelIndex, node: ModelNode | undefined): Promise<void> {
  if (!node) return;
  if (isFileNode(node)) {
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(node.uri));
    return;
  }
  if (isFolderNode(node)) return;
  if (isErrorNode(node)) {
    const pos = firstErrorPosition(index, node.uri);
    if (!pos) return;
    const p = new vscode.Position(pos.line, pos.column);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(node.uri));
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(p, p), preserveFocus: false });
    return;
  }
  const el = resolveNode(index, node);
  if (!el) return;
  const r = el.nameRange ?? el.range;
  const range = new vscode.Range(r.start.line, r.start.column, r.end.line, r.end.column);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(node.uri));
  await vscode.window.showTextDocument(doc, { selection: range, preserveFocus: false });
}

/** Cursor-to-tree sync. Never reveals while the view is hidden or while the index lags the editor text. */
export function registerCursorSync(index: ModelIndex, view: vscode.TreeView<ModelNode>, provider: ModelTreeProvider, log?: (m: string) => void): vscode.Disposable {
  // The selection lags a reveal still in flight, so equality with it alone must not suppress the next reveal.
  let requested: string | undefined;
  const follow = (editor: vscode.TextEditor | undefined): void => {
    if (!editor) return;
    if (!vscode.workspace.getConfiguration("sysml").get<boolean>("tree.followCursor", true)) return;
    if (!view.visible) return;
    const doc = editor.document;
    const key = uriKey(doc.uri);
    // A debounce is pending: offsets in the index would not match the editor.
    if (index.getDocument(key)?.text !== doc.getText()) return;
    const node = nodeAtOffset(index, key, doc.offsetAt(editor.selections[0]!.active));
    if (!node || (requested === node.id && view.selection[0]?.id === node.id)) return;
    requested = node.id;
    void provider.revealNode(view, node, log);
  };
  // Switching to an editor (opening a file from the Explorer restores its cursor without a selection event) follows too.
  return vscode.Disposable.from(
    vscode.window.onDidChangeTextEditorSelection((e) => follow(e.textEditor)),
    vscode.window.onDidChangeActiveTextEditor((e) => follow(e)),
  );
}

/** Create `model.sysml` (or `modelN.sysml`) in the folder node, else in the workspace folder (asking which when there are several). */
export async function createNewFile(node?: ModelNode): Promise<void> {
  let folderUri: vscode.Uri | undefined;
  if (node && isFolderNode(node)) folderUri = vscode.Uri.parse(node.uri);
  else {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 1) folderUri = folders[0]!.uri;
    else if (folders.length > 1) {
      const pick = await vscode.window.showQuickPick(
        folders.map((f) => ({ label: f.name, description: f.uri.fsPath, uri: f.uri })),
        { placeHolder: "Folder for the new SysML file" },
      );
      if (!pick) return;
      folderUri = pick.uri;
    }
  }
  const content = new TextEncoder().encode("package NewPackage {\n}\n");
  if (!folderUri) {
    const doc = await vscode.workspace.openTextDocument({ content: "package NewPackage {\n}\n" });
    await vscode.window.showTextDocument(doc);
    return;
  }
  let uri = vscode.Uri.joinPath(folderUri, "model.sysml");
  for (let i = 2; await exists(uri); i++) uri = vscode.Uri.joinPath(folderUri, `model${i}.sysml`);
  await vscode.workspace.fs.writeFile(uri, content);
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
