import * as vscode from "vscode";
import { ModelTreeProvider, VIEW_ID, createNewFile, goToDefinition, registerCursorSync } from "./tree/tree-provider.js";
import type { ModelNode } from "./tree/tree-model.js";
import { WorkspaceModel } from "./workspace/workspace-model.js";

/** Returned from `activate` so integration tests can reach the internals. */
export interface TestApi {
  model: WorkspaceModel;
  provider: ModelTreeProvider;
  view: vscode.TreeView<ModelNode>;
}

export async function activate(context: vscode.ExtensionContext): Promise<TestApi> {
  const model = new WorkspaceModel(context.extensionPath);
  const provider = new ModelTreeProvider(model.index);
  const view = vscode.window.createTreeView<ModelNode>(VIEW_ID, { treeDataProvider: provider });

  const updateContext = () => {
    const empty = !model.index.uris().some((u) => !model.index.isReadOnly(u));
    void vscode.commands.executeCommand("setContext", "sysml.workspaceEmpty", empty);
  };
  model.index.onDidChange(updateContext);

  context.subscriptions.push(
    model,
    provider,
    view,
    registerCursorSync(model.index, view),
    vscode.commands.registerCommand("sysml.goToDefinition", (node?: ModelNode) => goToDefinition(model.index, node)),
    vscode.commands.registerCommand("sysml.newFile", createNewFile),
  );
  await model.ready;
  updateContext();
  return { model, provider, view };
}

export function deactivate(): void {}
