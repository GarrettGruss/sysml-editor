/** VS Code adapter for the model tree: renders what tree-model.ts computes. */
import * as vscode from "vscode";
import { uriKey } from "../workspace/uri-key.js";
import type { ModelIndex } from "../model/index.js";
import { ELEMENT_MIME } from "../diagram/protocol.js";
import { makeExcludeFilter, patternsFromObject } from "../workspace/exclude.js";
import {
  affectedDiagramNodes, affectedFolderNodes, childNodes, diagramChildren, diagramFolderInfo, diagramKindLabel, elementNames, fileChildren, fileName, firstErrorPosition, firstErrorText,
  folderChildren, folderInfo, folderParent, folderRoots, isDiagramNode, isErrorNode, isFileNode, isFolderNode, nodeAtOffset, nodeInfo, resolveNode, visibleDiagrams, workspaceUris,
  type FolderEnv, type ModelNode,
} from "./tree-model.js";

export type TreeFilter = "elements" | "diagrams";
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
  /** Why a document cannot be edited (workspace boundary, `sysml.exclude`, not a file); such nodes get no Add Child, Rename or Delete. */
  editBlocker?: (uri: string) => string | undefined;

  constructor(
    readonly index: ModelIndex,
    private readonly env: FolderEnv = workspaceFolderEnv(),
    private readonly state?: vscode.Memento,
    folderChanges?: vscode.Event<string>,
  ) {
    this.filterValue = state?.get<TreeFilter>(FILTER_KEY) === "diagrams" ? "diagrams" : "elements";
    this.files = new Set(workspaceUris(index));
    void vscode.commands.executeCommand("setContext", "sysml.treeFilter", this.filterValue);
    this.diagramsReady = this.scanDiagrams();
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.sysmld");
    this.subs.push(
      watcher,
      watcher.onDidCreate(() => this.scheduleRescan()),
      watcher.onDidDelete(() => this.scheduleRescan()),
      watcher.onDidChange((u) => this.onDiagramChanged(uriKey(u))),
      index.onDidChange((e) => this.onModelChange(e.uris)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.emitter.fire(undefined)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!["sysml.exclude", "files.exclude"].some((k) => e.affectsConfiguration(k))) return;
        this.diagramsReady = this.scanDiagrams().then(() => this.emitter.fire(undefined));
        this.emitter.fire(undefined);
      }),
    );
    if (folderChanges) this.subs.push(folderChanges((parent) => this.onFolderChange(parent)));
  }

  get filter(): TreeFilter {
    return this.filterValue;
  }

  async setFilter(filter: TreeFilter): Promise<void> {
    if (filter === this.filterValue) return;
    this.filterValue = filter;
    await this.state?.update(FILTER_KEY, filter);
    await vscode.commands.executeCommand("setContext", "sysml.treeFilter", filter);
    this.emitter.fire(undefined);
  }

  /** Scan the workspace for `.sysmld` files (files.exclude applies to the search, sysml.exclude to the result) and refresh the affected nodes. */
  private async scanDiagrams(): Promise<void> {
    let found: vscode.Uri[];
    try {
      found = await vscode.workspace.findFiles("**/*.sysmld", undefined);
    } catch {
      return;
    }
    const next = visibleDiagrams(this.env, found.map(uriKey));
    const previous = this.diagrams;
    this.diagrams = next;
    for (const u of this.kinds.keys()) if (!next.has(u)) this.kinds.delete(u);
    if (this.filterValue !== "diagrams") return;
    const nodes = affectedDiagramNodes(this.env, previous, next);
    if (nodes.length) this.emitter.fire(nodes);
  }

  private rescanTimer: ReturnType<typeof setTimeout> | undefined;

  private scheduleRescan(): void {
    clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      this.diagramsReady = this.scanDiagrams();
    }, 150);
  }

  private onDiagramChanged(uri: string): void {
    this.kinds.delete(uri);
    if (this.filterValue === "diagrams" && this.diagrams.has(uri)) this.emitter.fire([{ id: uri, uri, kind: "diagram" }]);
  }

  /** The kind label of a diagram file, cached; read from the first bytes of the file. */
  private async loadKind(uri: string): Promise<void> {
    if (this.kinds.has(uri)) return;
    let label: string | undefined;
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
      label = diagramKindLabel(new TextDecoder().decode(bytes.subarray(0, 4096)));
    } catch {
      label = undefined;
    }
    this.kinds.set(uri, label);
  }

  /** Folder nodes handed out by getChildren, so changes in folders nobody sees are ignored. */
  private rendered = new Set<string>();
  private pendingFolders = new Set<string>();
  private folderTimer: ReturnType<typeof setTimeout> | undefined;

  /** A path was created or deleted below `parent` (a folder URI key): refresh that node only, batched. */
  private onFolderChange(parent: string): void {
    if (this.filterValue === "diagrams") this.scheduleRescan();
    if (!this.rendered.has(parent)) return;
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
      if (nodes.length) this.emitter.fire(nodes);
    }, 150);
  }

  private onModelChange(uris: string[]): void {
    const nodes = this.filterValue === "elements" ? affectedFolderNodes(this.index, this.env, this.files, uris) : [];
    const wasEmpty = this.files.size === 0;
    this.files = new Set(workspaceUris(this.index));
    // The roots appear and disappear with the first and last file (the welcome message shows when there are none).
    if (wasEmpty !== (this.files.size === 0)) this.emitter.fire(undefined);
    else if (nodes.length) this.emitter.fire(nodes);
  }

  getChildren(node?: ModelNode): ModelNode[] | Promise<ModelNode[]> {
    const track = (kids: ModelNode[]) => {
      for (const k of kids) if (isFolderNode(k)) this.rendered.add(k.id);
      return kids;
    };
    if (this.filterValue === "diagrams") {
      return this.diagramsReady.then(async () => {
        if (!node) return track(folderRoots(this.index, this.env));
        if (!isFolderNode(node)) return [];
        const kids = await diagramChildren(this.diagrams, this.env, node);
        await Promise.all(kids.filter(isDiagramNode).map((k) => this.loadKind(k.uri)));
        return track(kids);
      });
    }
    if (!node) return track(folderRoots(this.index, this.env));
    if (isFolderNode(node)) return folderChildren(this.index, this.env, node).then(track);
    if (isFileNode(node)) return fileChildren(this.index, node);
    return childNodes(this.index, node);
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
      const f = this.filterValue === "diagrams" ? diagramFolderInfo(this.diagrams, this.env, node) : folderInfo(this.index, this.env, node);
      const item = new vscode.TreeItem(f.label, f.empty ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
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
    clearTimeout(this.rescanTimer);
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
export function registerCursorSync(index: ModelIndex, view: vscode.TreeView<ModelNode>): vscode.Disposable {
  return vscode.window.onDidChangeTextEditorSelection((e) => {
    if (!vscode.workspace.getConfiguration("sysml").get<boolean>("tree.followCursor", true)) return;
    if (!view.visible) return;
    const doc = e.textEditor.document;
    const key = uriKey(doc.uri);
    // A debounce is pending: offsets in the index would not match the editor.
    if (index.getDocument(key)?.text !== doc.getText()) return;
    const node = nodeAtOffset(index, key, doc.offsetAt(e.selections[0]!.active));
    if (!node || view.selection[0]?.id === node.id) return;
    void Promise.resolve(view.reveal(node, { select: true, focus: false, expand: false })).then(undefined, () => {});
  });
}

export async function createNewFile(node?: ModelNode): Promise<void> {
  const folder = node && isFolderNode(node) ? { uri: vscode.Uri.parse(node.uri) } : vscode.workspace.workspaceFolders?.[0];
  const content = new TextEncoder().encode("package NewPackage {\n}\n");
  if (!folder) {
    const doc = await vscode.workspace.openTextDocument({ content: "package NewPackage {\n}\n" });
    await vscode.window.showTextDocument(doc);
    return;
  }
  let uri = vscode.Uri.joinPath(folder.uri, "model.sysml");
  for (let i = 2; await exists(uri); i++) uri = vscode.Uri.joinPath(folder.uri, `model${i}.sysml`);
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
