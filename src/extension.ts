import { registerDodafCommands } from "./dodaf/commands.js";
import * as vscode from "vscode";
import { registerCommand } from "./command-events.js";
import { ModelTreeDragAndDrop, ModelTreeProvider, type TreeFilter, VIEW_ID, goToDefinition, registerCursorSync, keepSelectionAcrossRefresh } from "./tree/tree-provider.js";
import { NewEntryFlow, type NewEntryTestApi } from "./tree/new-entry-flow.js";
import { newEntryTarget } from "./tree/new-entry.js";
import { SEARCH_VIEW_ID, SearchViewProvider } from "./tree/search-view.js";
import { isFolderNode, nodeForElement, type ModelNode } from "./tree/tree-model.js";
import { DiagramFiles, registerDiagramCommands } from "./diagram/commands.js";
import { VsCodeDiagramService } from "./diagram/agent-service.js";
import { AgentIntegration } from "./agent-integration.js";
import { VsCodeUiDriver } from "./agent-ui-driver.js";
import { DiagramEditorProvider, VIEW_TYPE as DIAGRAM_VIEW_TYPE, type DiagramTestApi } from "./diagram/diagram-editor.js";
import { WorkspaceModel } from "./workspace/workspace-model.js";
import { ModelService } from "./model-service/service.js";
import { VsCodeModelHost } from "./model-service/vscode-host.js";
import { ModelActions } from "./model-service/interactive.js";
import { registerModelCommands } from "./model-service/commands.js";
import { RequirementsEditor, type RequirementsTestApi } from "./requirements/editor.js";
import { registerRequirementsCommands } from "./requirements/commands.js";
import { showError } from "./ui-messages.js";

/** Returned from `activate` so integration tests can reach the internals. */
export interface TestApi {
  model: WorkspaceModel;
  provider: Pick<ModelTreeProvider, "getParent" | "filter" | "setFilter" | "getTreeItem" | "isHanded" | "onDidChangeTreeData" | "ioCalls" | "pendingFolderRescans" | "diagramUris" | "diagramLog" | "query" | "setExpanded"> & { getChildren: ModelTreeProvider["getChildren"]; viewGetChildren: ModelTreeProvider["getChildren"] };
  view: vscode.TreeView<ModelNode>;
  agent: AgentIntegration;
  diagram: DiagramTestApi;
  dnd: ModelTreeDragAndDrop;
  /** The model-changing operations shared by the tree, the diagrams and the agent tools. */
  edit: ModelService;
  /** The requirements editor (table and document views). */
  requirements: RequirementsTestApi;
  /** The search box: `post` delivers a message as the webview would. */
  search: { post(message: unknown): void; query(): string };
  /** The input box of New File and New Folder. */
  newEntry: NewEntryTestApi;
  /** The UI-control driver; tests read its audit lines. */
  ui: VsCodeUiDriver;
}

export function activate(context: vscode.ExtensionContext): TestApi {
  const log = vscode.window.createOutputChannel("SysML", { log: true });
  const model = new WorkspaceModel(context.extensionPath, (m) => log.warn(m));
  const provider = new ModelTreeProvider(model.index, undefined, context.workspaceState, model.onDidChangeFolders);
  const dnd = new ModelTreeDragAndDrop(model.index);
  const view = vscode.window.createTreeView<ModelNode>(VIEW_ID, { treeDataProvider: provider, dragAndDropController: dnd, canSelectMany: true, showCollapseAll: true });

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
    if (node && view.selection[0]?.id !== node.id) void provider.revealNode(view, node, (m) => log.warn(m));
  };

  requirements.revealInTree = diagrams.revealInTree;

  view.message = "Loading SysML model…";
  model.ready
    .catch((e: unknown) => {
      log.error("loading the SysML model failed", e instanceof Error ? e : String(e));
      void showError("SysML: loading the model failed. See the SysML output channel for details.");
    })
    .finally(() => {
      view.message = undefined;
    });
  const newEntry = new NewEntryFlow(provider, view, (m) => log.warn(m), () => {
    provider.setQuery("");
    search.setText("");
  }, (uri) => model.indexFile(uri));
  const uiDriver = new VsCodeUiDriver({ diagrams, requirements, newEntry: () => newEntry.testApi, tree: { provider, view }, log: (m) => log.info(m), ownCommands: ((context.extension.packageJSON as { contributes?: { commands?: { command: string }[] } }).contributes?.commands ?? []).map((c) => c.command) });
  agent.ui = uiDriver;
  const search = new SearchViewProvider(context.extensionUri, (text) => provider.setQuery(text), () => provider.query);

  context.subscriptions.push(
    log,
    model,
    agent,
    uiDriver,
    provider,
    view,
    keepSelectionAcrossRefresh(model.index, view, provider, (m) => log.warn(m)),
    view.onDidExpandElement((e) => provider.setExpanded(e.element, true)),
    view.onDidCollapseElement((e) => provider.setExpanded(e.element, false)),
    vscode.window.registerWebviewViewProvider(SEARCH_VIEW_ID, search, { webviewOptions: { retainContextWhenHidden: true } }),
    registerCursorSync(model.index, view, provider, (m) => log.warn(m)),
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
    registerDodafCommands(context.extensionUri),
    registerCommand("sysml.goToDefinition", (node?: ModelNode) => goToDefinition(model.index, node)),
    registerCommand("sysml.tree.changeView", async (arg?: unknown) => {
      let filter: TreeFilter | undefined = arg === "elements" || arg === "diagrams" || arg === "all" ? arg : undefined;
      if (filter === undefined) {
        const items: { label: string; description?: string; filter: TreeFilter }[] = [
          { label: "Elements", filter: "elements" },
          { label: "Diagrams", filter: "diagrams" },
          { label: "All", filter: "all" },
        ];
        for (const i of items) if (i.filter === provider.filter) i.description = "current";
        filter = (await diagrams.ui.pick(items, { placeHolder: "Show in the SysML Model view", title: "Show in the SysML Model view" }))?.filter;
      }
      if (filter) await provider.setFilter(filter);
    }),
    registerCommand("sysml.tree.clearSearch", () => {
      provider.setQuery("");
      search.setText("");
    }),
    { dispose: () => newEntry.dispose() },
    registerCommand("sysml.tree.newFile", (node?: ModelNode) => newEntry.start("file", node && isFolderNode(node) ? node.uri : newEntryTarget(provider.roots, view.selection))),
    registerCommand("sysml.tree.newFolder", (node?: ModelNode) => newEntry.start("folder", node && isFolderNode(node) ? node.uri : newEntryTarget(provider.roots, view.selection))),
    registerCommand("sysml.tree.refresh", async () => {
      await model.rescan();
      await provider.refreshAll();
    }),
    provider.onDidChangeQuery((q) => {
      view.description = q ? `Filter: ${q}` : undefined;
    }),
  );
  // Tests read the tree directly; their objects are not the ones VS Code knows, so only `viewGetChildren` records.
  const testProvider = {
    getChildren: (n?: ModelNode) => provider.children(n, false),
    viewGetChildren: (n?: ModelNode) => provider.getChildren(n),
    getParent: (n: ModelNode) => provider.getParent(n),
    get filter() {
      return provider.filter;
    },
    setFilter: (f: TreeFilter) => provider.setFilter(f),
    getTreeItem: (n: ModelNode) => provider.getTreeItem(n),
    isHanded: (n: ModelNode) => provider.isHanded(n),
    onDidChangeTreeData: provider.onDidChangeTreeData,
    get ioCalls() {
      return provider.ioCalls;
    },
    get pendingFolderRescans() {
      return provider.pendingFolderRescans;
    },
    get diagramUris() {
      return provider.diagramUris;
    },
    get diagramLog() {
      return provider.diagramLog;
    },
    get query() {
      return provider.query;
    },
    setExpanded: (n: ModelNode, e: boolean) => provider.setExpanded(n, e),
  };
  return { model, provider: testProvider, view, agent, diagram: diagrams.testApi, dnd, edit, requirements: requirements.testApi, search: { post: (m) => search.handle(m), query: () => provider.query }, newEntry: newEntry.testApi, ui: uiDriver };
}

export function deactivate(): void {}

