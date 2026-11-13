/** The VS Code side of the diagram commands: tree actions, "New Diagram…", pickers and the diagram file watcher. */
import * as vscode from "vscode";
import type { Element } from "../model/index.js";
import { isLibraryUri } from "../model/index.js";
import type { ModelNode } from "../tree/tree-model.js";
import { resolveNode } from "../tree/tree-model.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import { createDiagram, diagramKindsFor } from "./create.js";
import type { DiagramEditorProvider } from "./diagram-editor.js";
import { VIEW_TYPE } from "./diagram-editor.js";
import { DiagramFileIndex } from "./diagram-index.js";
import { readSettled } from "./read-settled.js";
import { serializeDiagram, type DiagramDocument, type DiagramKind } from "./format.js";
import { KIND_LABELS, defaultDiagramFileName, fileRoots, listElements, uniqueFileName } from "./new-diagram.js";
import { uriKey } from "../workspace/uri-key.js";
import { makeSourceMapper } from "./resolve.js";
import { makeIndexFilter } from "../workspace/exclude.js";

const decoder = new TextDecoder();
const exists = async (uri: vscode.Uri) => vscode.workspace.fs.stat(uri).then(() => true, () => false);

/** Keeps the index of diagram files current: a scan at start, then a watcher. Honours `sysml.exclude` and `files.exclude`. */
export class DiagramFiles implements vscode.Disposable {
  readonly index = new DiagramFileIndex();
  ready: Promise<void>;
  private readonly subs: vscode.Disposable[] = [];
  /** Per-URI sequence number of the latest read or delete: an older read that finishes later is discarded. */
  private readonly latest = new Map<string, number>();
  private counter = 0;
  private filterKey = "";
  private filter: (rel: string) => boolean = () => false;

  constructor() {
    const pattern = "**/*.sysmld";
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.subs.push(
      watcher,
      watcher.onDidCreate((u) => void this.load(u)),
      watcher.onDidChange((u) => void this.load(u)),
      watcher.onDidDelete((u) => this.drop(u)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("sysml.exclude") || e.affectsConfiguration("files.exclude")) this.ready = this.scan();
      }),
    );
    this.ready = this.scan();
  }

  private excluded(uri: vscode.Uri): boolean {
    const sysml = vscode.workspace.getConfiguration("sysml").get<string[]>("exclude", ["**/node_modules/**"]);
    const files = vscode.workspace.getConfiguration("files").get<Record<string, unknown>>("exclude");
    const key = JSON.stringify([sysml, files]);
    if (key !== this.filterKey) {
      this.filterKey = key;
      this.filter = makeIndexFilter(sysml, files);
    }
    return this.filter(vscode.workspace.asRelativePath(uri, false));
  }

  private drop(uri: vscode.Uri): void {
    this.latest.set(uri.toString(), ++this.counter);
    this.index.delete(uri.toString());
  }

  private async load(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    if (this.excluded(uri)) return this.drop(uri);
    const n = ++this.counter;
    this.latest.set(key, n);
    let text: string | undefined;
    try {
      text = await readSettled(async () => decoder.decode(await vscode.workspace.fs.readFile(uri)));
    } catch {
      text = undefined;
    }
    if (this.latest.get(key) !== n) return; // a newer read or delete has been issued
    if (text === undefined) this.index.delete(key);
    else this.index.set(key, text);
  }

  private async scan(): Promise<void> {
    // No exclude argument: VS Code's own `files.exclude` applies to the search; `sysml.exclude` is applied in `excluded`.
    const found = await Promise.resolve(vscode.workspace.findFiles("**/*.sysmld", undefined));
    const wanted = new Set(found.filter((u) => !this.excluded(u)).map((u) => u.toString()));
    for (const known of this.index.allUris()) if (!wanted.has(known)) this.drop(vscode.Uri.parse(known));
    await Promise.all(found.filter((u) => wanted.has(u.toString())).map((u) => this.load(u)));
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

/**
 * Where a diagram of `element` goes by default: beside its source file when that lies inside a workspace
 * folder, otherwise (library element, file outside every folder, non-file source) the first workspace folder.
 */
export function diagramTargetFolder(element: Element): { dir: vscode.Uri; folder: vscode.WorkspaceFolder } | undefined {
  const source = vscode.Uri.parse(element.uri);
  const own = !isLibraryUri(element.uri) && source.scheme === "file" ? vscode.workspace.getWorkspaceFolder(source) : undefined;
  if (own) return { dir: vscode.Uri.joinPath(source, ".."), folder: own };
  const first = vscode.workspace.workspaceFolders?.[0];
  return first && { dir: first.uri, folder: first };
}

/**
 * "New Diagram…": choose the root (an element, or a file's top-level element), choose a kind, and open the diagram unsaved (D37).
 * Nothing is written until the user saves; the intended path is next to the element's file.
 */
export async function newDiagram(deps: DiagramCommandDeps, arg?: ModelNode | vscode.Uri): Promise<vscode.Uri | undefined> {
  await deps.model.ready;
  let element: Element | undefined;
  const fileUri = arg instanceof vscode.Uri ? uriKey(arg) : arg && arg.kind === "file" ? arg.uri : undefined;
  if (fileUri !== undefined) {
    const found = fileRoots(deps.model.index, fileUri);
    if (!found.ok) {
      void vscode.window.showWarningMessage(`New Diagram: ${found.reason}`);
      return undefined;
    }
    element = found.roots.length === 1
      ? found.roots[0]
      : (await deps.diagrams.ui.pick(found.roots.map((e) => ({ label: e.name!, description: e.kind, detail: e.qualifiedName!, element: e })), { title: "New Diagram: choose the root", placeHolder: "Which element is the diagram of?" }))?.element;
  } else element = arg && !(arg instanceof vscode.Uri) ? resolveNode(deps.model.index, arg) : await pickElement(deps, "New Diagram from Element");
  if (!element) return undefined;
  if (element.qualifiedName === undefined) {
    void vscode.window.showWarningMessage("A diagram needs a named element as its root.");
    return undefined;
  }
  const kinds = diagramKindsFor(element).map((k) => ({ label: KIND_LABELS[k].label, detail: KIND_LABELS[k].detail, diagramKind: k }));
  const kind = (await deps.diagrams.ui.pick(kinds, { title: `New Diagram: ${element.name}`, placeHolder: "Choose the kind of diagram" }))?.diagramKind;
  if (!kind) return undefined;

  const target = diagramTargetFolder(element);
  if (!target) {
    void vscode.window.showWarningMessage("Open a folder to create a diagram file.");
    return undefined;
  }
  const { dir, folder } = target;
  const taken = new Set((await vscode.workspace.fs.readDirectory(dir).then((d) => d, () => [])).map(([n]) => n));
  // A diagram that is open and unsaved holds its name too.
  for (const open of deps.diagrams.openUris()) {
    const u = vscode.Uri.parse(open);
    if (u.path.startsWith(dir.path + "/")) taken.add(u.path.slice(dir.path.length + 1));
  }
  const name = uniqueFileName(defaultDiagramFileName(element.name ?? "diagram"), (n) => taken.has(n));
  const uri = vscode.Uri.joinPath(dir, name);
  const doc: DiagramDocument = createDiagram(deps.model.index, element.qualifiedName, kind, { sourceOf: makeSourceMapper(folder?.uri.toString()) });
  await deps.diagrams.openNew(uri, serializeDiagram(doc));
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

/** "Add to Diagram": the elements become nodes of the diagram in the active editor. */
export function addToActiveDiagram(deps: DiagramCommandDeps, clicked?: ModelNode, selected?: readonly ModelNode[]): void {
  const doc = deps.diagrams.activeDocument();
  if (!doc) {
    void vscode.window.showInformationMessage("Open a diagram first: Add to Diagram needs a diagram editor to be active.");
    return;
  }
  const els = elementsOf(deps, clicked, selected);
  if (els.length) deps.diagrams.addElementsTo(doc, els);
}

export function registerDiagramCommands(deps: DiagramCommandDeps): vscode.Disposable[] {
  const active = () => deps.diagrams.activeDocument();
  return [
    vscode.commands.registerCommand("sysml.newDiagram", (node?: ModelNode | vscode.Uri) => newDiagram(deps, node)),
    vscode.commands.registerCommand("sysml.showInDiagram", (node?: ModelNode) => showInDiagram(deps, node)),
    vscode.commands.registerCommand("sysml.addToActiveDiagram", (node?: ModelNode, selected?: ModelNode[]) => addToActiveDiagram(deps, node, selected)),
    vscode.commands.registerCommand("sysml.diagram.autoLayout", () => {
      if (!deps.diagrams.runCommand(active(), "autoLayout")) void vscode.window.showInformationMessage("Open a diagram first: Auto-layout needs a diagram editor to be active.");
    }),
  ];
}
