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

export function activate(context: vscode.ExtensionContext): TestApi {
  const log = vscode.window.createOutputChannel("SysML", { log: true });
  const model = new WorkspaceModel(context.extensionPath, (m) => log.warn(m));
  const provider = new ModelTreeProvider(model.index);
  const view = vscode.window.createTreeView<ModelNode>(VIEW_ID, { treeDataProvider: provider });

  const updateContext = () => {
    const empty = !model.index.uris().some((u) => !model.index.isReadOnly(u));
    void vscode.commands.executeCommand("setContext", "sysml.workspaceEmpty", empty);
  };
  // Until loading finishes the empty-workspace welcome must not show.
  void vscode.commands.executeCommand("setContext", "sysml.workspaceEmpty", false);
  view.message = "Loading SysML model…";
  model.ready
    .catch((e: unknown) => {
      log.error("loading the SysML model failed", e instanceof Error ? e : String(e));
      void vscode.window.showErrorMessage("SysML: loading the model failed. See the SysML output channel for details.");
    })
    .finally(() => {
      view.message = undefined;
      updateContext();
    });
  model.index.onDidChange(() => {
    if (view.message === undefined) updateContext();
  });

  context.subscriptions.push(
    log,
    model,
    provider,
    view,
    registerCursorSync(model.index, view),
    vscode.commands.registerCommand("sysml.goToDefinition", (node?: ModelNode) => goToDefinition(model.index, node)),
    vscode.commands.registerCommand("sysml.newFile", createNewFile),
  );
  return { model, provider, view };
}

export function deactivate(): void {}
