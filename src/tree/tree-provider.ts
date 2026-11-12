/** VS Code adapter for the model tree: renders what tree-model.ts computes. */
import * as vscode from "vscode";
import { uriKey } from "../workspace/uri-key.js";
import type { ModelIndex } from "../model/index.js";
import { ELEMENT_MIME } from "../diagram/protocol.js";
import { makeExcludeFilter, patternsFromObject } from "../workspace/exclude.js";
import {
  affectedFolderNodes, affectedNodes, childNodes, elementNames, fileChildren, fileName, firstErrorPosition, firstErrorText, folderChildren, folderInfo, folderParent,
  folderRoots, isErrorNode, isFileNode, isFolderNode, nodeAtOffset, nodeInfo, parentNode, resolveNode, rootNodes, workspaceUris,
  type FolderEnv, type ModelNode,
} from "./tree-model.js";

export type TreeLayout = "folders" | "packages";
const LAYOUT_KEY = "sysml.treeLayout";

/** The directory listing and exclusion rules of the Folders layout, backed by the workspace. */
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
  private rootIds: string[] = [];
  private files = new Set<string>();
  private layoutValue: TreeLayout = "folders";
  private readonly subs: vscode.Disposable[] = [];
  /** Why a document cannot be edited (workspace boundary, `sysml.exclude`, not a file); such nodes get no Add Child, Rename or Delete. */
  editBlocker?: (uri: string) => string | undefined;

  constructor(
    readonly index: ModelIndex,
    private readonly env: FolderEnv = workspaceFolderEnv(),
    private readonly state?: vscode.Memento,
    folderChanges?: vscode.Event<string>,
  ) {
    this.layoutValue = state?.get<TreeLayout>(LAYOUT_KEY) === "packages" ? "packages" : "folders";
    this.rootIds = rootNodes(index).map((n) => n.id);
    this.files = new Set(workspaceUris(index));
    void vscode.commands.executeCommand("setContext", "sysml.treeLayout", this.layoutValue);
    this.subs.push(
      index.onDidChange((e) => this.onModelChange(e.uris)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.emitter.fire(undefined)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (["sysml.exclude", "files.exclude"].some((k) => e.affectsConfiguration(k))) this.emitter.fire(undefined);
      }),
    );
    if (folderChanges) this.subs.push(folderChanges((parent) => this.onFolderChange(parent)));
  }

  get layout(): TreeLayout {
    return this.layoutValue;
  }

  async setLayout(layout: TreeLayout): Promise<void> {
    if (layout === this.layoutValue) return;
    this.layoutValue = layout;
    await this.state?.update(LAYOUT_KEY, layout);
    await vscode.commands.executeCommand("setContext", "sysml.treeLayout", layout);
    this.emitter.fire(undefined);
  }

  /** Folder nodes handed out by getChildren, so changes in folders nobody sees are ignored. */
  private rendered = new Set<string>();
  private pendingFolders = new Set<string>();
  private folderTimer: ReturnType<typeof setTimeout> | undefined;

  /** A path was created or deleted below `parent` (a folder URI key): refresh that node only, batched. */
  private onFolderChange(parent: string): void {
    if (this.layoutValue !== "folders") return;
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
    if (this.layoutValue === "folders") {
      const nodes = affectedFolderNodes(this.index, this.env, this.files, uris);
      const wasEmpty = this.files.size === 0;
      this.files = new Set(workspaceUris(this.index));
      // The roots appear and disappear with the first and last file (the welcome message shows when there are none).
      if (wasEmpty !== (this.files.size === 0)) this.emitter.fire(undefined);
      else if (nodes.length) this.emitter.fire(nodes);
      return;
    }
    this.files = new Set(workspaceUris(this.index));
    const r = affectedNodes(this.index, this.rootIds, uris);
    this.rootIds = rootNodes(this.index).map((n) => n.id);
    if (r.full) this.emitter.fire(undefined);
    else if (r.ids.length) {
      const ids = new Set(r.ids);
      this.emitter.fire(rootNodes(this.index).filter((n) => ids.has(n.id)));
    }
  }

  getChildren(node?: ModelNode): ModelNode[] | Promise<ModelNode[]> {
    if (this.layoutValue === "folders") {
      if (!node) {
        const roots = folderRoots(this.index, this.env);
        for (const r of roots) this.rendered.add(r.id);
        return roots;
      }
      if (isFolderNode(node)) {
        return folderChildren(this.index, this.env, node).then((kids) => {
          for (const k of kids) if (isFolderNode(k)) this.rendered.add(k.id);
          return kids;
        });
      }
      if (isFileNode(node)) return fileChildren(this.index, node);
      return childNodes(this.index, node);
    }
    if (!node) {
      const roots = rootNodes(this.index);
      this.rootIds = roots.map((n) => n.id);
      return roots;
    }
    return childNodes(this.index, node);
  }

  getParent(node: ModelNode): ModelNode | undefined {
    return this.layoutValue === "folders" ? folderParent(this.env, node) : parentNode(node);
  }

  private folderItem(node: ModelNode): vscode.TreeItem {
    if (isFolderNode(node)) {
      const f = folderInfo(this.index, this.env, node);
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
    if (isFolderNode(node) || isFileNode(node)) return this.folderItem(node);
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
