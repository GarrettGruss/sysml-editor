/** Tree commands for editing the model, and the diagram's "Delete from Model…" command. */
import * as vscode from "vscode";
import type { DiagramEditorProvider } from "../diagram/diagram-editor.js";
import { resolveNode, type ModelNode } from "../tree/tree-model.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import type { ModelActions } from "./interactive.js";

export function registerModelCommands(deps: { model: WorkspaceModel; actions: ModelActions; diagrams: DiagramEditorProvider; selection: () => readonly ModelNode[] }): vscode.Disposable[] {
  const elementOf = async (node?: ModelNode) => {
    const n = node ?? deps.selection()[0];
    if (!n) return undefined;
    await deps.model.ready;
    return resolveNode(deps.model.index, n);
  };
  const noElement = () => void vscode.window.showInformationMessage("Select an element in the SysML tree first.");
  return [
    vscode.commands.registerCommand("sysml.tree.addChild", async (node?: ModelNode) => {
      const el = await elementOf(node);
      if (!el) return noElement();
      await deps.actions.addChild(el);
    }),
    vscode.commands.registerCommand("sysml.tree.rename", async (node?: ModelNode) => {
      const el = await elementOf(node);
      if (!el) return noElement();
      await deps.actions.rename({ element: el });
    }),
    vscode.commands.registerCommand("sysml.tree.delete", async (node?: ModelNode) => {
      const el = await elementOf(node);
      if (!el) return noElement();
      await deps.actions.delete({ element: el }, { alwaysConfirm: true });
    }),
    vscode.commands.registerCommand("sysml.diagram.deleteFromModel", async () => {
      const doc = deps.diagrams.activeDocument();
      if (!doc) return void vscode.window.showInformationMessage("Open a diagram first: Delete from Model needs a diagram editor to be active.");
      await deps.diagrams.deleteSelectionFromModel(doc);
    }),
  ];
}
