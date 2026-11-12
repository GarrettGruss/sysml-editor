/** VS Code adapter for the model tree: renders what tree-model.ts computes. */
import * as vscode from "vscode";
import type { ModelIndex } from "../model/index.js";
import {
  affectedNodes, childNodes, firstErrorText, nodeAtOffset, nodeInfo, parentNode, resolveNode, rootNodes,
  type ModelNode,
} from "./tree-model.js";

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
  private readonly sub: vscode.Disposable;

  constructor(readonly index: ModelIndex) {
    this.rootIds = rootNodes(index).map((n) => n.id);
    this.sub = index.onDidChange((e) => this.onModelChange(e.uris));
  }

  private onModelChange(uris: string[]): void {
    const r = affectedNodes(this.index, this.rootIds, uris);
    this.rootIds = rootNodes(this.index).map((n) => n.id);
    if (r.full) this.emitter.fire(undefined);
    else if (r.ids.length) {
      const ids = new Set(r.ids);
      this.emitter.fire(rootNodes(this.index).filter((n) => ids.has(n.id)));
    }
  }

  getChildren(node?: ModelNode): ModelNode[] {
    if (!node) {
      const roots = rootNodes(this.index);
      this.rootIds = roots.map((n) => n.id);
      return roots;
    }
    return childNodes(this.index, node);
  }

  getParent(node: ModelNode): ModelNode | undefined {
    return parentNode(node);
  }

  getTreeItem(node: ModelNode): vscode.TreeItem {
    const info = nodeInfo(this.index, node);
    const item = new vscode.TreeItem(info?.label ?? "<gone>");
    item.id = node.id;
    if (!info) return item;
    item.collapsibleState = info.hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
    item.description = info.description;
    item.iconPath = new vscode.ThemeIcon(ICONS[info.icon] ?? ICONS.element!);
    item.contextValue = "sysmlElement";
    item.command = { command: "sysml.goToDefinition", title: "Go to Definition", arguments: [node] };
    const error = info.isRoot ? firstErrorText(this.index, node.uri) : undefined;
    if (error) {
      item.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground"));
      item.tooltip = `Syntax error, showing the last good model. First error at ${error}`;
    }
    return item;
  }

  dispose(): void {
    this.sub.dispose();
    this.emitter.dispose();
  }
}

/** Open the element's file with its name (or whole declaration) selected. */
export async function goToDefinition(index: ModelIndex, node: ModelNode | undefined): Promise<void> {
  if (!node) return;
  const el = resolveNode(index, node);
  if (!el) return;
  const r = el.nameRange ?? el.range;
  const range = new vscode.Range(r.start.line, r.start.column, r.end.line, r.end.column);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(node.uri));
  await vscode.window.showTextDocument(doc, { selection: range, preserveFocus: false });
}

/** Cursor-to-tree sync. Never reveals while the view is hidden. */
export function registerCursorSync(index: ModelIndex, view: vscode.TreeView<ModelNode>): vscode.Disposable {
  let last: string | undefined;
  return vscode.window.onDidChangeTextEditorSelection((e) => {
    if (!vscode.workspace.getConfiguration("sysml").get<boolean>("tree.followCursor", true)) return;
    if (!view.visible) return;
    const doc = e.textEditor.document;
    const node = nodeAtOffset(index, doc.uri.toString(), doc.offsetAt(e.selections[0]!.active));
    if (!node || node.id === last) return;
    last = node.id;
    Promise.resolve(view.reveal(node, { select: true, focus: false, expand: false })).then(undefined, () => {
      last = undefined;
    });
  });
}

export async function createNewFile(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
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
