import * as vscode from "vscode";
import { ModelTreeDragAndDrop, ModelTreeProvider, VIEW_ID, createNewFile, goToDefinition, registerCursorSync } from "./tree/tree-provider.js";
import { nodeForElement, type ModelNode } from "./tree/tree-model.js";
import { DiagramFiles, registerDiagramCommands } from "./diagram/commands.js";
import { VsCodeDiagramService } from "./diagram/agent-service.js";
import { AgentIntegration } from "./agent-integration.js";
import { DiagramEditorProvider, VIEW_TYPE as DIAGRAM_VIEW_TYPE, type DiagramTestApi } from "./diagram/diagram-editor.js";
import { WorkspaceModel } from "./workspace/workspace-model.js";
import { ModelService } from "./model-service/service.js";
import { VsCodeModelHost } from "./model-service/vscode-host.js";
import { ModelActions } from "./model-service/interactive.js";
import { registerModelCommands } from "./model-service/commands.js";
import { RequirementsEditor, type RequirementsTestApi } from "./requirements/editor.js";
import { registerRequirementsCommands } from "./requirements/commands.js";

/** Returned from `activate` so integration tests can reach the internals. */
export interface TestApi {
  model: WorkspaceModel;
  provider: ModelTreeProvider;
  view: vscode.TreeView<ModelNode>;
  agent: AgentIntegration;
  diagram: DiagramTestApi;
  dnd: ModelTreeDragAndDrop;
  /** The model-changing operations shared by the tree, the diagrams and the agent tools. */
  edit: ModelService;
  /** The requirements editor (table and document views). */
  requirements: RequirementsTestApi;
}

export function activate(context: vscode.ExtensionContext): TestApi {
  const log = vscode.window.createOutputChannel("SysML", { log: true });
  const model = new WorkspaceModel(context.extensionPath, (m) => log.warn(m));
  const provider = new ModelTreeProvider(model.index);
  const dnd = new ModelTreeDragAndDrop(model.index);
  const view = vscode.window.createTreeView<ModelNode>(VIEW_ID, { treeDataProvider: provider, dragAndDropController: dnd, canSelectMany: true });

  const diagrams = new DiagramEditorProvider(context.extensionUri, model, (m) => log.warn(m));
  const files = new DiagramFiles();
  const modelHost = new VsCodeModelHost(model, diagrams, files, (m) => log.warn(m));
  const edit = new ModelService(modelHost);
  modelHost.service = edit;
  provider.editBlocker = (uri) => edit.blockedReason(uri);
  diagrams.editBlocker = (uri) => edit.blockedReason(uri);
  const actions = new ModelActions(edit, model.index, () => diagrams.ui);
  diagrams.modelActions = actions;
  const requirements = new RequirementsEditor(context.extensionUri, model, edit, actions, () => diagrams.ui);
  const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => ({ name: f.name, fsPath: f.uri.fsPath }));
  const diagramService = new VsCodeDiagramService(diagrams, files, folders);
  const agent = new AgentIntegration(model, (m) => log.info(m), String(context.extension.packageJSON.version ?? "0.0.1"), diagramService, {
    service: edit,
    isTrusted: () => vscode.workspace.isTrusted,
    diagramUri: (path) => diagramService.uriForPath(path),
  });
  void agent.apply();
  diagrams.revealInTree = (el) => {
    const node = nodeForElement(model.index, el);
    if (node && view.selection[0]?.id !== node.id) void Promise.resolve(view.reveal(node, { select: true, focus: false, expand: false })).then(undefined, () => {});
  };

  requirements.revealInTree = diagrams.revealInTree;

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
    requirements,
    files,
    ...registerDiagramCommands({ model, diagrams, files }),
    ...registerModelCommands({ model, actions, diagrams, selection: () => view.selection }),
    ...registerRequirementsCommands({ model, editor: requirements, extensionUri: context.extensionUri, selection: () => view.selection }),
    vscode.window.registerCustomEditorProvider(DIAGRAM_VIEW_TYPE, diagrams, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand("sysml.goToDefinition", (node?: ModelNode) => goToDefinition(model.index, node)),
    vscode.commands.registerCommand("sysml.newFile", createNewFile),
  );
  return { model, provider, view, agent, diagram: diagrams.testApi, dnd, edit, requirements: requirements.testApi };
}

export function deactivate(): void {}
