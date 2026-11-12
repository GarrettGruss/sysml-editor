import * as vscode from "vscode";
import { ModelTreeDragAndDrop, ModelTreeProvider, VIEW_ID, createNewFile, goToDefinition, registerCursorSync } from "./tree/tree-provider.js";
import { nodeForElement, type ModelNode } from "./tree/tree-model.js";
import { DiagramFiles, registerDiagramCommands } from "./diagram/commands.js";
import { AgentIntegration } from "./agent-integration.js";
import { DiagramEditorProvider, VIEW_TYPE as DIAGRAM_VIEW_TYPE, type DiagramTestApi } from "./diagram/diagram-editor.js";
import { WorkspaceModel } from "./workspace/workspace-model.js";

/** Returned from `activate` so integration tests can reach the internals. */
export interface TestApi {
  model: WorkspaceModel;
  provider: ModelTreeProvider;
  view: vscode.TreeView<ModelNode>;
  agent: AgentIntegration;
  diagram: DiagramTestApi;
  dnd: ModelTreeDragAndDrop;
}

export function activate(context: vscode.ExtensionContext): TestApi {
  const log = vscode.window.createOutputChannel("SysML", { log: true });
  const model = new WorkspaceModel(context.extensionPath, (m) => log.warn(m));
  const provider = new ModelTreeProvider(model.index);
  const dnd = new ModelTreeDragAndDrop(model.index);
  const view = vscode.window.createTreeView<ModelNode>(VIEW_ID, { treeDataProvider: provider, dragAndDropController: dnd, canSelectMany: true });

  const agent = new AgentIntegration(model, (m) => log.info(m), String(context.extension.packageJSON.version ?? "0.0.1"));
  void agent.apply();
  const diagrams = new DiagramEditorProvider(context.extensionUri, model, (m) => log.warn(m));
  const files = new DiagramFiles();
  diagrams.revealInTree = (el) => {
    const node = nodeForElement(model.index, el);
    if (node && view.selection[0]?.id !== node.id) void Promise.resolve(view.reveal(node, { select: true, focus: false, expand: false })).then(undefined, () => {});
  };

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
    agent,
    provider,
    view,
    registerCursorSync(model.index, view),
    diagrams,
    files,
    ...registerDiagramCommands({ model, diagrams, files }),
    vscode.window.registerCustomEditorProvider(DIAGRAM_VIEW_TYPE, diagrams, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand("sysml.goToDefinition", (node?: ModelNode) => goToDefinition(model.index, node)),
    vscode.commands.registerCommand("sysml.newFile", createNewFile),
  );
  return { model, provider, view, agent, diagram: diagrams.testApi, dnd };
}

export function deactivate(): void {}
