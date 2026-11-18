/** Tree commands for editing the model, and the diagram's "Delete from Model…" command. */
import * as vscode from "vscode";
import { registerCommand } from "../command-events.js";
import type { DiagramEditorProvider } from "../diagram/diagram-editor.js";
import { isFileNode, resolveNode, type ModelNode } from "../tree/tree-model.js";
import { deleteFileConfirmation, referencesToFile } from "./delete-file.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import { uriKey } from "../workspace/uri-key.js";
import type { ModelActions } from "./interactive.js";
import { showError, showInfo, showWarning } from "../ui-messages.js";

export function registerModelCommands(deps: { model: WorkspaceModel; actions: ModelActions; diagrams: DiagramEditorProvider; selection: () => readonly ModelNode[] }): vscode.Disposable[] {
  const elementOf = async (node?: ModelNode) => {
    const n = node ?? deps.selection()[0];
    if (!n) return undefined;
    await deps.model.ready;
    return resolveNode(deps.model.index, n);
  };
  const noElement = () => void showInfo("Select an element in the SysML tree first.");
  return [
    registerCommand("sysml.tree.addChild", async (node?: ModelNode) => {
      const el = await elementOf(node);
      if (!el) return noElement();
      await deps.actions.addChild(el);
    }),
    registerCommand("sysml.tree.rename", async (node?: ModelNode) => {
      const el = await elementOf(node);
      if (!el) return noElement();
      await deps.actions.rename({ element: el });
    }),
    registerCommand("sysml.tree.delete", async (node?: ModelNode) => {
      const el = await elementOf(node);
      if (!el) return noElement();
      await deps.actions.delete({ element: el }, { alwaysConfirm: true });
    }),
    registerCommand("sysml.tree.deleteFile", async (node?: ModelNode) => {
      const n = node ?? deps.selection()[0];
      if (!n || !isFileNode(n)) return;
      await deleteFile(deps, n.uri);
    }),
    registerCommand("sysml.diagram.deleteFromModel", async () => {
      const doc = deps.diagrams.activeDocument();
      if (!doc) return void showInfo("Open a diagram first: Delete from Model needs a diagram editor to be active.");
      await deps.diagrams.deleteSelectionFromModel(doc);
    }),
  ];
}

async function deleteFile(deps: { model: WorkspaceModel; diagrams: DiagramEditorProvider }, key: string): Promise<void> {
  if (!vscode.workspace.isTrusted) return void showWarning("Delete File is not available in an untrusted workspace.");
  const uri = vscode.Uri.parse(key);
  await deps.model.ready;
  const same = (u: vscode.Uri) => u.toString() === uri.toString() || uriKey(u) === key;
  const dirty = vscode.workspace.textDocuments.some((d) => same(d.uri) && d.isDirty);
  const { message, detail } = deleteFileConfirmation(key, referencesToFile(deps.model.index, key), dirty);
  if (!(await deps.diagrams.ui.confirm(message, detail, "Delete"))) return;
  // Close the file's editors without saving: revert first so VS Code does not ask.
  for (const doc of vscode.workspace.textDocuments.filter((d) => same(d.uri) && d.isDirty)) {
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("workbench.action.files.revert");
  }
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputText && same(t.input.uri));
  if (tabs.length) await vscode.window.tabGroups.close(tabs);
  try {
    await vscode.workspace.fs.delete(uri, { useTrash: true });
  } catch {
    try {
      await vscode.workspace.fs.delete(uri, { useTrash: false });
      void showInfo(`The trash is unavailable, so ${key.split("/").pop()} was deleted permanently.`);
    } catch (e) {
      void showError(`Could not delete the file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
