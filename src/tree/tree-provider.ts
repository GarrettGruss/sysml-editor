/** VS Code adapter for the model tree: renders what tree-model.ts computes. */
import * as vscode from "vscode";
import { uriKey } from "../workspace/uri-key.js";
import type { ModelIndex } from "../model/index.js";
import { ELEMENT_MIME } from "../diagram/protocol.js";
import {
  affectedNodes, childNodes, elementNames, firstErrorPosition, firstErrorText, isErrorNode, nodeAtOffset, nodeInfo, parentNode, resolveNode, rootNodes,
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
    this.sub.dispose();
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
