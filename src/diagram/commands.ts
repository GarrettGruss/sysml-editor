/** The VS Code side of the diagram commands: tree actions, "New Diagram…", pickers and the diagram file watcher. */
import * as vscode from "vscode";
import type { Element } from "../model/index.js";
import { isLibraryUri } from "../model/index.js";
import type { ModelNode } from "../tree/tree-model.js";
import { resolveNode } from "../tree/tree-model.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import { createDiagram } from "./create.js";
import type { DiagramEditorProvider } from "./diagram-editor.js";
import { VIEW_TYPE } from "./diagram-editor.js";
import { DiagramFileIndex } from "./diagram-index.js";
import { serializeDiagram, type DiagramDocument, type DiagramKind } from "./format.js";
import { DIAGRAM_EXTENSION, KIND_LABELS, defaultDiagramFileName, fileNameProblem, listElements, uniqueFileName } from "./new-diagram.js";
import { makeSourceMapper } from "./resolve.js";

const decoder = new TextDecoder();
const exists = async (uri: vscode.Uri) => vscode.workspace.fs.stat(uri).then(() => true, () => false);

/** Keeps the index of diagram files current: a scan at start, then a watcher. */
export class DiagramFiles implements vscode.Disposable {
  readonly index = new DiagramFileIndex();
  readonly ready: Promise<void>;
  private readonly subs: vscode.Disposable[] = [];

  constructor() {
    const pattern = "**/*.sysmld";
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const load = async (uri: vscode.Uri) => {
      try {
        this.index.set(uri.toString(), decoder.decode(await vscode.workspace.fs.readFile(uri)));
      } catch {
        this.index.delete(uri.toString());
      }
    };
    this.subs.push(watcher, watcher.onDidCreate(load), watcher.onDidChange(load), watcher.onDidDelete((u) => this.index.delete(u.toString())));
    this.ready = Promise.resolve(vscode.workspace.findFiles(pattern, "**/node_modules/**")).then((uris) => Promise.all(uris.map(load))).then(() => undefined);
  }

  dispose(): void {
    for (const s of this.subs) s.dispose();
  }
}

export interface DiagramCommandDeps {
  model: WorkspaceModel;
  diagrams: DiagramEditorProvider;
  files: DiagramFiles;
}

/** Elements for a command invoked from the tree (clicked node plus the multi-selection), or chosen from a picker when invoked from the palette. */
function elementsOf(deps: DiagramCommandDeps, clicked?: ModelNode, selected?: readonly ModelNode[]): Element[] {
  const nodes = selected?.length ? selected : clicked ? [clicked] : [];
  return nodes.flatMap((n) => {
    const el = resolveNode(deps.model.index, n);
    return el ? [el] : [];
  });
}

async function pickElement(deps: DiagramCommandDeps, title: string): Promise<Element | undefined> {
  const items = listElements(deps.model.index).map((e) => ({ label: e.name!, description: e.qualifiedName!, detail: e.kind, element: e }));
  return (await deps.diagrams.ui.pick(items, { title, placeHolder: "Type the name of a model element", matchOnDescription: true }))?.element;
}

/** "New Diagram…": choose a kind and a file name, write the file pre-populated from the element, open it. */
export async function newDiagram(deps: DiagramCommandDeps, node?: ModelNode): Promise<vscode.Uri | undefined> {
  await deps.model.ready;
  const element = node ? resolveNode(deps.model.index, node) : await pickElement(deps, "New Diagram from Element");
  if (!element) return undefined;
  if (element.qualifiedName === undefined) {
    void vscode.window.showWarningMessage("A diagram needs a named element as its root.");
    return undefined;
  }
  const kinds = (Object.keys(KIND_LABELS) as DiagramKind[]).map((k) => ({ label: KIND_LABELS[k].label, detail: KIND_LABELS[k].detail, diagramKind: k }));
  const kind = (await deps.diagrams.ui.pick(kinds, { title: `New Diagram: ${element.name}`, placeHolder: "Choose the kind of diagram" }))?.diagramKind;
  if (!kind) return undefined;

  const source = vscode.Uri.parse(element.uri);
  const folder = vscode.workspace.getWorkspaceFolder(source) ?? vscode.workspace.workspaceFolders?.[0];
  const dir = !isLibraryUri(element.uri) && source.scheme === "file" ? vscode.Uri.joinPath(source, "..") : folder?.uri;
  if (!dir) {
    void vscode.window.showWarningMessage("Open a folder to create a diagram file.");
    return undefined;
  }
  const taken = new Set((await vscode.workspace.fs.readDirectory(dir).then((d) => d, () => [])).map(([n]) => n));
  const suggested = uniqueFileName(defaultDiagramFileName(element.name ?? "diagram"), (n) => taken.has(n));
  const typed = await deps.diagrams.ui.input({
    title: "New Diagram",
    prompt: `File name in ${vscode.workspace.asRelativePath(dir)}`,
    value: suggested,
    valueSelection: [0, suggested.length - DIAGRAM_EXTENSION.length],
    validateInput: (v) => fileNameProblem(v, (n) => taken.has(n)),
  });
  if (typed === undefined) return undefined;
  const problem = fileNameProblem(typed, (n) => taken.has(n));
  if (problem) {
    void vscode.window.showErrorMessage(`New Diagram: ${problem}`);
    return undefined;
  }
  const uri = vscode.Uri.joinPath(dir, typed);
  if (await exists(uri)) return undefined; // never overwrite (it may have appeared since the listing)
  const doc: DiagramDocument = createDiagram(deps.model.index, element.qualifiedName, kind, { sourceOf: makeSourceMapper(folder?.uri.toString()) });
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(serializeDiagram(doc)));
  deps.files.index.set(uri.toString(), serializeDiagram(doc));
  await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE);
  return uri;
}

/** "Show in Diagram": the diagram files that show the element; pick one, open it and select the node. */
export async function showInDiagram(deps: DiagramCommandDeps, node?: ModelNode): Promise<void> {
  await Promise.all([deps.model.ready, deps.files.ready]);
  const element = node ? resolveNode(deps.model.index, node) : await pickElement(deps, "Show Element in Diagram");
  if (!element) return;
  const sourceOf = (uri: string) => makeSourceMapper(vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uri))?.uri.toString());
  const hits = deps.files.index.showing(element, deps.model.index, sourceOf, deps.diagrams.openDocuments());
  if (!hits.length) {
    void vscode.window.showInformationMessage(`No diagram shows ${element.qualifiedName ?? element.name ?? "this element"}.`);
    return;
  }
  const items = hits.map((h) => ({ label: vscode.workspace.asRelativePath(vscode.Uri.parse(h.uri)), hit: h }));
  const chosen = hits.length === 1 ? items[0] : await deps.diagrams.ui.pick(items, { title: "Show in Diagram", placeHolder: "Choose a diagram" });
  if (!chosen) return;
  await deps.diagrams.openAndSelect(vscode.Uri.parse(chosen.hit.uri), [chosen.hit.itemId]);
}

/** "Add to Active Diagram": the elements become nodes of the diagram in the active editor. */
export function addToActiveDiagram(deps: DiagramCommandDeps, clicked?: ModelNode, selected?: readonly ModelNode[]): void {
  const doc = deps.diagrams.activeDocument();
  if (!doc) {
    void vscode.window.showInformationMessage("Open a diagram first: Add to Active Diagram needs a diagram editor to be active.");
    return;
  }
  const els = elementsOf(deps, clicked, selected);
  if (els.length) deps.diagrams.addElementsTo(doc, els);
}

export function registerDiagramCommands(deps: DiagramCommandDeps): vscode.Disposable[] {
  const active = () => deps.diagrams.activeDocument();
  return [
    vscode.commands.registerCommand("sysml.newDiagram", (node?: ModelNode) => newDiagram(deps, node)),
    vscode.commands.registerCommand("sysml.showInDiagram", (node?: ModelNode) => showInDiagram(deps, node)),
    vscode.commands.registerCommand("sysml.addToActiveDiagram", (node?: ModelNode, selected?: ModelNode[]) => addToActiveDiagram(deps, node, selected)),
    vscode.commands.registerCommand("sysml.diagram.autoLayout", () => {
      if (!deps.diagrams.runCommand(active(), "autoLayout")) void vscode.window.showInformationMessage("Open a diagram first: Auto-layout needs a diagram editor to be active.");
    }),
    vscode.commands.registerCommand("sysml.diagram.showElement", async () => {
      const doc = active();
      if (!doc) {
        void vscode.window.showInformationMessage("Open a diagram first: Show Element needs a diagram editor to be active.");
        return;
      }
      await deps.diagrams.showElementInteractive(doc);
    }),
  ];
}
