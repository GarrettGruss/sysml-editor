/**
 * The `.sysmld` custom editor: the VS Code adapter around `DiagramState`. Layout and drawing
 * happen in the webview (design D7); this file only owns documents, messages and files.
 */
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { isLibraryUri, type Element } from "../model/index.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import { readSettled } from "./read-settled.js";
import { writeDiagramFile } from "./write-uri.js";
import { exportWithinLimit, RenderQueue } from "./agent-guards.js";
import { addElements } from "./create.js";
import { applyAutoLayout, applyBoxPatches, removeItems } from "./edits.js";
import { listElements, relinkCandidates } from "./new-diagram.js";
import type { DiagramCommand, DiagramEdit, HostToWebview, PngTheme, TestGesture, WebviewToHost } from "./protocol.js";
import { relink } from "./reconcile.js";
import { makeSourceMapper, referenceKey, resolveReference } from "./resolve.js";
import { DiagramState, decideSave, dropKeys, followRename, forceChange, hashViewModel, noteExternalChange, refresh, unforceChange } from "./session.js";
import type { DiagramChange } from "../model-service/diagram-changes.js";
import type { DiagramDocument as FileDoc, DiagramDocument as DiagramFile, DiagramProblem } from "./format.js";

export const VIEW_TYPE = "sysml.diagram";
const REFRESH_DEBOUNCE_MS = 50;
const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_DROPPED_NAMES = 200;
const RENDER_TIMEOUT_MS = 20_000;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** The questions the editor asks the user; replaced in tests, which cannot click a quick pick. */
export interface DiagramUi {
  pick<T extends vscode.QuickPickItem>(items: readonly T[], options: vscode.QuickPickOptions): Promise<T | undefined>;
  input(options: vscode.InputBoxOptions): Promise<string | undefined>;
}

export const defaultUi: DiagramUi = {
  pick: (items, options) => Promise.resolve(vscode.window.showQuickPick(items, options)),
  input: (options) => Promise.resolve(vscode.window.showInputBox(options)),
};

export class SysmlDiagramDocument implements vscode.CustomDocument {
  readonly changed = new vscode.EventEmitter<void>();
  /** Ids selected in the editor, as last reported by the webview. */
  selection: string[] = [];
  /** Ids to select once the next render has reached the webview. */
  pendingSelect?: string[];
  /** Resolvers of callers waiting for the webview's answer to an Auto-layout command. */
  layoutWaiters: Array<() => void> = [];
  private readonly disposables: vscode.Disposable[] = [];
  /**
   * `key` names the document's panels; it is the URI for a document open in an editor. A `renderOnly` document backs a
   * short-lived panel that only produces an image: it never writes files, edits or follows the selection.
   */
  constructor(readonly uri: vscode.Uri, readonly state: DiagramState, readonly key: string = uri.toString(), readonly renderOnly = false) {}
  onDispose(...d: vscode.Disposable[]): void {
    this.disposables.push(...d);
  }
  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.changed.dispose();
  }
}

interface Panel {
  panel: vscode.WebviewPanel;
  ready: boolean;
  /** Which page is loaded (diagram or error page, with the problems shown), so it is rebuilt when that changes. */
  pageKey?: string;
  /** Hash of the last view model posted. */
  lastHash?: string;
}

interface Pending {
  resolve(m: WebviewToHost): void;
  reject(e: Error): void;
}

export interface DiagramTestApi {
  open(uri: vscode.Uri): Promise<void>;
  metrics(uri: vscode.Uri): Promise<Extract<WebviewToHost, { type: "metricsResult" }>>;
  /** Base64 PNG of the diagram. */
  png(uri: vscode.Uri): Promise<string>;
  /** Base64 PNG of the editor appearance (selection and handles included) in a fixed dark palette. */
  pngEditor(uri: vscode.Uri): Promise<string>;
  /** Replays a gesture in the webview as DOM events; resolves when it has been handled. */
  gesture(uri: vscode.Uri, g: TestGesture): Promise<void>;
  /** Replaces the questions the editor asks the user. */
  setUi(ui: Partial<DiagramUi> | undefined): void;
  /** The diagram editor that is active now. */
  activeUri(): string | undefined;
  /** Writes the in-memory document in canonical form, as Save would. */
  save(uri: vscode.Uri): Promise<void>;
  /** Applies a move of nodes as one user edit (undoable, dirties the document). */
  edit(uri: vscode.Uri, moves: { id: string; x: number; y: number }[]): void;
  state(uri: vscode.Uri): { errorPage: boolean; dirty: boolean; problems: DiagramProblem[]; doc?: DiagramFile };
  errors(): string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export class DiagramEditorProvider implements vscode.CustomEditorProvider<SysmlDiagramDocument>, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SysmlDiagramDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChange.event;
  private readonly docs = new Map<string, SysmlDiagramDocument>();
  private readonly panels = new Map<string, Set<Panel>>();
  private readonly pending = new Map<number, Pending>();
  private readonly subs: vscode.Disposable[] = [];
  private readonly errorLog: string[] = [];
  private requestId = 0;
  private renderCount = 0;
  private timer?: ReturnType<typeof setTimeout>;
  ui: DiagramUi = defaultUi;
  /** Called when a node is selected in a diagram and the tree should follow (set by the extension). */
  revealInTree?: (element: Element) => void;

  constructor(private readonly extensionUri: vscode.Uri, private readonly model: WorkspaceModel, private readonly log: (m: string) => void = () => {}) {
    this.subs.push(this.model.index.onDidChange(() => this.scheduleRefresh()), this._onDidChange);
    const sync = () => void vscode.commands.executeCommand("setContext", "sysml.diagramActive", this.activeDocument() !== undefined);
    this.subs.push(vscode.window.tabGroups.onDidChangeTabs(sync), vscode.window.tabGroups.onDidChangeTabGroups(sync));
    sync();
  }

  /** The in-memory content of the diagrams that are open, for finding which diagrams show an element. */
  openDocuments(): Map<string, FileDoc> {
    const out = new Map<string, FileDoc>();
    for (const [uri, d] of this.docs) if (d.state.doc) out.set(uri, d.state.doc);
    return out;
  }

  /** The diagram document shown in the active editor group, if any. */
  activeDocument(): SysmlDiagramDocument | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE ? this.docs.get(input.uri.toString()) : undefined;
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const s of this.subs) s.dispose();
  }

  // ---- documents -------------------------------------------------------------------------

  async openCustomDocument(uri: vscode.Uri, ctx: vscode.CustomDocumentOpenContext): Promise<SysmlDiagramDocument> {
    const read = async (u: vscode.Uri) => decoder.decode(await vscode.workspace.fs.readFile(u));
    let state: DiagramState;
    if (ctx.backupId) {
      const disk = await read(uri).catch(() => "");
      state = new DiagramState("");
      state.loadDirty(await read(vscode.Uri.parse(ctx.backupId)), disk);
    } else {
      state = new DiagramState(await read(uri));
    }
    const doc = new SysmlDiagramDocument(uri, state);
    this.docs.set(uri.toString(), doc);
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), uri.path.split("/").pop()!));
    const onDisk = async () => {
      try {
        const change = noteExternalChange(doc.state, (await readSettled(() => read(uri))) as string);
        if (change === "reload") this.rerender(doc);
        else if (change === "conflict") {
          void vscode.window.showWarningMessage(`${uri.path.split("/").pop()} changed on disk while it has unsaved changes. Saving will ask whether to overwrite it.`);
        }
      } catch {
        /* deleted: keep what is open */
      }
    };
    doc.onDispose(watcher, watcher.onDidChange(() => void onDisk()), watcher.onDidCreate(() => void onDisk()), {
      // A document closed a moment ago must not unregister the one opened in its place.
      dispose: () => { if (this.docs.get(uri.toString()) === doc) this.docs.delete(uri.toString()); },
    });
    return doc;
  }

  async saveCustomDocument(doc: SysmlDiagramDocument): Promise<void> {
    const s = doc.state;
    const name = doc.uri.path.split("/").pop();
    const disk = await vscode.workspace.fs.readFile(doc.uri).then((b) => decoder.decode(b), () => undefined);
    const decision = decideSave(s, disk);
    if (decision === "unparsed") {
      throw new Error(`${name} cannot be saved: it is not a valid diagram file, and it was not changed. Open it as text to fix it.`);
    }
    if (decision === "conflict") {
      const overwrite = "Overwrite";
      const revert = "Revert to file on disk";
      const pick = await vscode.window.showWarningMessage(`${name} was changed on disk since it was opened or last saved.`, { modal: true, detail: "Overwrite replaces the file with this diagram. Revert discards the unsaved changes and shows the file on disk." }, overwrite, revert);
      if (pick === revert) {
        await this.revertCustomDocument(doc);
        return;
      }
      if (pick !== overwrite) throw new Error(`Save cancelled: ${name} was changed on disk.`);
    }
    const previous = s.disk;
    s.disk = s.text(); // our own write must not look like an external change
    try {
      await writeDiagramFile(doc.uri, encoder.encode(s.text()));
    } catch (e) {
      s.disk = previous;
      throw e;
    }
    s.markSaved();
  }

  async saveCustomDocumentAs(doc: SysmlDiagramDocument, dest: vscode.Uri): Promise<void> {
    await writeDiagramFile(dest, encoder.encode(doc.state.text()));
  }

  async revertCustomDocument(doc: SysmlDiagramDocument): Promise<void> {
    doc.state.load(decoder.decode(await vscode.workspace.fs.readFile(doc.uri)));
    this.rerender(doc);
  }

  async backupCustomDocument(doc: SysmlDiagramDocument, ctx: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.writeFile(ctx.destination, encoder.encode(doc.state.text()));
    return { id: ctx.destination.toString(), delete: () => void vscode.workspace.fs.delete(ctx.destination).then(undefined, () => {}) };
  }

  // ---- editor ----------------------------------------------------------------------------

  async resolveCustomEditor(doc: SysmlDiagramDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const webview = webviewPanel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [root] };
    const key = doc.key;
    const p: Panel = { panel: webviewPanel, ready: false };
    this.panels.set(key, (this.panels.get(key) ?? new Set()).add(p));
    webviewPanel.onDidDispose(() => {
      const set = this.panels.get(key);
      set?.delete(p);
      if (set && !set.size) this.panels.delete(key);
    });
    webview.onDidReceiveMessage((m: WebviewToHost) => this.onMessage(doc, p, m));
    this.syncPage(doc, p);
    // The model must have loaded before references can resolve.
    void this.model.ready.then(() => this.rerender(doc), () => this.rerender(doc));
  }

  /** Load the diagram page or the error page, whichever fits the document now; rebuilt when that changes. */
  private syncPage(doc: SysmlDiagramDocument, p: Panel): void {
    const key = doc.state.doc ? "diagram" : "error:" + JSON.stringify(doc.state.problems ?? []);
    if (p.pageKey === key) return;
    p.pageKey = key;
    p.ready = false;
    p.lastHash = undefined;
    const webview = p.panel.webview;
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const nonce = randomBytes(16).toString("base64");
    webview.html = doc.state.doc
      ? this.page(webview, root, nonce, `<script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(root, "diagram.js"))}"></script>`)
      : this.page(webview, root, nonce, this.errorBody(doc, nonce));
  }

  private page(webview: vscode.Webview, root: vscode.Uri, nonce: string, body: string): string {
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join("; ");
    const css = webview.asWebviewUri(vscode.Uri.joinPath(root, "diagram.css"));
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${css}"><title>SysML Diagram</title></head><body>${body}</body></html>`;
  }

  private errorBody(doc: SysmlDiagramDocument, nonce: string): string {
    const items = (doc.state.problems ?? []).map((p) => `<li><code>${esc(p.path)}</code> ${esc(p.message)}</li>`).join("");
    return (
      `<div class="error-page"><h1>This diagram file cannot be shown</h1><p>The file was not changed. Fix the problems below, or open it as text.</p><ul>${items}</ul>` +
      `<button id="open-text">Open as text</button></div>` +
      `<script nonce="${nonce}">const vscode = acquireVsCodeApi();document.getElementById("open-text").addEventListener("click", () => vscode.postMessage({ type: "openAsText" }));vscode.postMessage({ type: "ready" });</script>`
    );
  }

  private onMessage(doc: SysmlDiagramDocument, p: Panel, m: WebviewToHost): void {
    if (doc.renderOnly && !["ready", "layoutChanged", "pngResult", "metricsResult", "gestureResult", "error"].includes(m.type)) return;
    switch (m.type) {
      case "ready":
        p.ready = true;
        p.lastHash = undefined;
        this.rerender(doc);
        break;
      case "layoutChanged":
        // Held in memory until the next save: automatic layout is not an edit.
        doc.state.mergeLayout(Array.isArray(m.nodes) ? m.nodes : [], Array.isArray(m.edges) ? m.edges : []);
        break;
      case "edit":
        // An edit made on a render of an earlier load (revert, external change) must not be applied to the document now.
        if (m.generation !== doc.state.generation) this.log(`diagram: dropped an edit from generation ${String(m.generation)} (document is at ${doc.state.generation})`);
        else this.userEdit(doc, m.edit);
        if (m.edit?.kind === "autoLayout") this.layoutDone(doc);
        break;
      case "selection":
        doc.selection = Array.isArray(m.ids) ? m.ids.filter((i) => typeof i === "string") : [];
        this.followSelection(doc);
        break;
      case "relink":
        void this.relinkInteractive(doc, m.id).catch((e) => this.fail("Re-link", e));
        break;
      case "showElement":
        void this.showElementInteractive(doc).catch((e) => this.fail("Show Element", e));
        break;
      case "dropElements":
        this.addByName(doc, Array.isArray(m.names) ? m.names : []);
        break;
      case "gestureResult":
      case "pngResult":
      case "metricsResult":
        this.pending.get(m.requestId)?.resolve(m);
        break;
      case "openAsText":
        void vscode.commands.executeCommand("vscode.openWith", doc.uri, "default");
        break;
      case "error":
        this.errorLog.push(m.message);
        this.log(`diagram webview error: ${m.message}`);
        break;
    }
  }

  /**
   * Apply `next` as one undoable, dirtying edit (user actions and agent tool calls; layout and
   * rename follow are not edits). Undo and redo do nothing once the document was reloaded.
   */
  edit(doc: SysmlDiagramDocument, next: FileDoc, label: string): void {
    const e = doc.state.apply(next);
    const redraw = (applied: boolean) => {
      if (!applied) return;
      doc.state.snapshot = undefined; // an undone rename must not be detected again
      this.rerender(doc);
    };
    this._onDidChange.fire({ document: doc, label, undo: () => redraw(e.undo()), redo: () => redraw(e.redo()) });
    this.rerender(doc);
  }

  /**
   * A change a model edit forces on an open diagram: applied to memory (not dirty, no undo entry) and to the file's last
   * saved state, which is written at once. Returns whether the file was written.
   */
  async forceOpen(doc: SysmlDiagramDocument, change: DiagramChange, mode: "apply" | "revert"): Promise<boolean> {
    const disk = await vscode.workspace.fs.readFile(doc.uri).then((b) => decoder.decode(b), () => undefined);
    const ctx = { uri: doc.uri.toString(), sourceOf: this.opts(doc).sourceOf };
    const r =
      mode === "apply"
        ? forceChange(doc.state, change, (d) => change.apply(d, ctx), disk)
        : unforceChange(doc.state, change, (d) => change.revert(d, ctx), disk);
    if (mode === "apply") for (const k of change.createdKeys?.() ?? []) doc.state.created.add(k);
    doc.state.snapshot = undefined;
    if (r.kind === "write") await writeDiagramFile(doc.uri, encoder.encode(r.text));
    this.rerender(doc);
    return r.kind === "write";
  }

  /** One undo entry for a model edit made from this diagram; its undo and redo reverse and repeat text and diagram together. */
  recordModelEdit(uri: vscode.Uri, label: string, undo: () => Promise<void>, redo: () => Promise<void>): void {
    const doc = this.docs.get(uri.toString());
    if (!doc) return;
    this._onDidChange.fire({ document: doc, label, undo: async () => { await undo(); this.rerender(doc); }, redo: async () => { await redo(); this.rerender(doc); } });
  }

  private fail(what: string, e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.log(`diagram ${what} failed: ${msg}`);
    void vscode.window.showErrorMessage(`${what} failed: ${msg}`);
  }

  /** A layout or remove edit from the webview: one undoable edit of the diagram file, never of the model. */
  private userEdit(doc: SysmlDiagramDocument, edit: DiagramEdit): void {
    const cur = doc.state.doc;
    if (!cur || !edit || typeof edit !== "object") return;
    let next: FileDoc | undefined;
    let label = "Edit diagram";
    switch (edit.kind) {
      case "layout":
        next = Array.isArray(edit.boxes) ? applyBoxPatches(cur, edit.boxes) : undefined;
        label = edit.label === "Resize" ? "Resize" : edit.label === "Nudge" ? "Nudge" : "Move";
        break;
      case "autoLayout":
        next = Array.isArray(edit.boxes) ? applyAutoLayout(cur, edit.boxes, Array.isArray(edit.edges) ? edit.edges : []) : undefined;
        label = "Auto-layout";
        break;
      case "remove": {
        const ids = Array.isArray(edit.ids) ? edit.ids.filter((i) => typeof i === "string") : [];
        const removed = removeItems(cur, ids, doc.state.viewModel);
        next = removed === cur ? undefined : removed;
        label = "Remove from Diagram";
        doc.selection = doc.selection.filter((i) => !ids.includes(i));
        break;
      }
    }
    if (next) this.edit(doc, next, label);
  }

  // ---- model-aware actions ---------------------------------------------------------------

  private selectIds(doc: SysmlDiagramDocument, ids: string[]): void {
    if (!ids.length) return;
    doc.selection = ids;
    let sent = false;
    for (const p of this.panels.get(doc.key) ?? []) {
      if (p.ready && p.lastHash !== undefined) { this.post(p, { type: "select", ids }); sent = true; }
    }
    doc.pendingSelect = sent ? undefined : ids;
  }

  /** The tree follows a node selected in a diagram (behind `sysml.tree.followCursor`). */
  private followSelection(doc: SysmlDiagramDocument): void {
    if (!this.revealInTree || !vscode.workspace.getConfiguration("sysml").get<boolean>("tree.followCursor", true)) return;
    const d = doc.state.doc;
    const id = doc.selection[doc.selection.length - 1];
    const node = d?.nodes.find((n) => n.id === id);
    if (!d || !node) return;
    const el = resolveReference(node, d, this.model.index, this.opts(doc));
    if (el) this.revealInTree(el);
  }

  /** Add elements to the diagram as one undoable edit; existing ones are just selected. */
  addElementsTo(doc: SysmlDiagramDocument, elements: Element[]): { ids: string[]; added: number } {
    const cur = doc.state.doc;
    if (!cur) throw new Error("This diagram cannot be edited: its file does not parse.");
    const r = addElements(cur, this.model.index, elements, this.opts(doc));
    if (r.added.length) this.edit(doc, r.doc, elements.length === 1 ? "Add to Diagram" : "Add elements to Diagram");
    this.selectIds(doc, r.ids);
    return { ids: r.ids, added: r.added.length };
  }

  private addByName(doc: SysmlDiagramDocument, names: string[]): void {
    // A drop payload comes from outside the extension: bounded, and never standard library content.
    const els = names.slice(0, MAX_DROPPED_NAMES).flatMap((n) => (typeof n === "string" ? [...this.model.index.findByQualifiedName(n).filter((e) => !isLibraryUri(e.uri)).slice(0, 1)] : []));
    if (!els.length) return;
    try {
      this.addElementsTo(doc, els);
    } catch (e) {
      this.fail("Add to Diagram", e);
    }
  }

  /** The "Show Element…" picker: any named element of the workspace model. */
  async showElementInteractive(doc: SysmlDiagramDocument): Promise<void> {
    const items = listElements(this.model.index).map((e) => ({ label: e.name!, description: e.qualifiedName!, detail: e.kind, element: e }));
    const pick = await this.ui.pick(items, { title: "Show Element on Diagram", placeHolder: "Type the name of a model element", matchOnDescription: true, matchOnDetail: true });
    if (pick) this.addElementsTo(doc, [pick.element]);
  }

  /** The "Re-link…" picker for an unresolved item: elements of the kind it had, not already shown. */
  async relinkInteractive(doc: SysmlDiagramDocument, id: string): Promise<void> {
    const cur = doc.state.doc;
    const node = cur?.nodes.find((n) => n.id === id);
    if (!cur || !node) return;
    const shown = new Set(cur.nodes.filter((n) => n.id !== id).map((n) => referenceKey(n)));
    const cands = relinkCandidates(this.model.index, doc.state.kinds.get(id)).filter((e) => e.qualifiedName !== undefined && !shown.has(referenceKey({ ref: e.qualifiedName })));
    const items = cands.map((e) => ({ label: e.name!, description: e.qualifiedName!, detail: e.kind, element: e }));
    const pick = await this.ui.pick(items, { title: `Re-link ${node.ref ?? "item"}`, placeHolder: "Choose the element this item should show", matchOnDescription: true });
    const now = doc.state.doc;
    if (pick && now) this.edit(doc, relink(now, id, pick.element), "Re-link");
  }

  /** Ask the active (or given) diagram's webview to run a command. */
  runCommand(doc: SysmlDiagramDocument | undefined, name: DiagramCommand): boolean {
    const p = [...(this.panels.get(doc?.key ?? "") ?? [])].find((x) => x.ready);
    if (!p) return false;
    this.post(p, { type: "command", name });
    return true;
  }

  /** Open a diagram (if it is not open) and select an item in it. */
  async openAndSelect(uri: vscode.Uri, ids: string[]): Promise<void> {
    await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE);
    const end = performance.now() + 60_000;
    while (!this.docs.has(uri.toString()) || ![...(this.panels.get(uri.toString()) ?? [])].some((p) => p.ready)) {
      if (performance.now() > end) throw new Error(`The diagram ${uri.path.split("/").pop()} did not open${this.errorSuffix()}`);
      await new Promise((r) => setTimeout(r, 50));
    }
    this.selectIds(this.docs.get(uri.toString())!, ids);
  }

  // ---- model refresh ---------------------------------------------------------------------

  private scheduleRefresh(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { for (const d of this.docs.values()) this.rerender(d); }, REFRESH_DEBOUNCE_MS);
  }

  private opts(doc: SysmlDiagramDocument) {
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    return { sourceOf: makeSourceMapper(folder?.uri.toString()) };
  }

  /** Re-resolve, write detected renames to the file, and send the view model to every ready panel. */
  private rerender(doc: SysmlDiagramDocument): void {
    for (const p of this.panels.get(doc.key) ?? []) this.syncPage(doc, p);
    const r = refresh(doc.state, this.model.index, this.opts(doc));
    if (!r) return;
    if (r.updates && !doc.renderOnly) void this.followRename(doc, r.updates);
    if (r.vanished && !doc.renderOnly) void this.dropVanished(doc, r.vanished);
    for (const p of this.panels.get(doc.key) ?? []) {
      if (!p.ready) continue;
      // The generation is part of the key: after a reload the webview must learn the new one even if the drawing is the same.
      const h = `${doc.state.generation}:${hashViewModel(r.viewModel)}`;
      if (h === p.lastHash) continue;
      p.lastHash = h;
      this.post(p, { type: "render", viewModel: r.viewModel, generation: doc.state.generation });
    }
    if (doc.pendingSelect) {
      const ids = doc.pendingSelect;
      doc.pendingSelect = undefined;
      for (const p of this.panels.get(doc.key) ?? []) if (p.ready && p.lastHash !== undefined) this.post(p, { type: "select", ids });
    }
  }

  /** Entries this session created for elements that have since disappeared from the text are removed (no placeholder). */
  private async dropVanished(doc: SysmlDiagramDocument, keys: string[]): Promise<void> {
    try {
      const disk = await vscode.workspace.fs.readFile(doc.uri).then((b) => decoder.decode(b), () => undefined);
      // A later undo of an unrelated edit must not bring the dropped placement back.
      doc.state.forced = doc.state.forced.filter((f) => !((f.token as Partial<DiagramChange>).createdKeys?.() ?? []).some((k) => keys.includes(k)));
      const r = forceChange(doc.state, {}, (d) => dropKeys(d, keys), disk);
      for (const k of keys) doc.state.created.delete(k);
      if (r.kind === "write") await writeDiagramFile(doc.uri, encoder.encode(r.text));
      this.rerender(doc);
    } catch (e) {
      this.log(`diagram: dropping vanished entries failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async followRename(doc: SysmlDiagramDocument, updates: NonNullable<ReturnType<typeof refresh>>["updates"]): Promise<void> {
    try {
      const disk = await vscode.workspace.fs.readFile(doc.uri).then((b) => decoder.decode(b), () => undefined);
      const r = followRename(doc.state, updates ?? [], disk);
      if (r.kind === "reloaded") this.rerender(doc);
      else if (r.kind === "write") await writeDiagramFile(doc.uri, encoder.encode(r.text));
    } catch (e) {
      this.log(`diagram rename follow failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private post(p: Panel, m: HostToWebview): void {
    void p.panel.webview.postMessage(m);
  }

  // ---- agent support ---------------------------------------------------------------------

  /** The document open in an editor for `uri`, if any. */
  openDocument(uri: vscode.Uri): SysmlDiagramDocument | undefined {
    return this.docs.get(uri.toString());
  }

  /** URIs of the diagrams open in editors. */
  openUris(): string[] {
    return [...this.docs.keys()];
  }

  private async waitUntil(cond: () => boolean, ms: number, what: string, key?: string): Promise<void> {
    const end = performance.now() + ms;
    while (!cond()) {
      if (performance.now() > end) throw new Error(`timed out waiting for ${what}${this.errorSuffix()}`);
      if (key !== undefined && !this.panels.has(key)) throw new Error(`the diagram panel was closed while waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  private renderedPanel(key: string): Panel | undefined {
    return [...(this.panels.get(key) ?? [])].find((p) => p.ready && p.lastHash !== undefined);
  }

  /**
   * A PNG (base64) of the diagram in the fixed light theme. If an editor shows it, that webview is used. Otherwise a
   * short-lived webview panel renders it: VS Code has no hidden or background webview (a webview in a tab that is not
   * visible is not loaded), so the panel is opened beside the active editor without taking focus (`preserveFocus`), and
   * is disposed as soon as the image is exported. `text` is the diagram's content, used when no editor shows it.
   */
  async renderImage(uri: vscode.Uri, text: string): Promise<string> {
    const open = this.docs.get(uri.toString());
    if (open && !open.renderOnly) {
      try {
        await this.waitUntil(() => this.renderedPanel(open.key) !== undefined, 10_000, "the open diagram to render", open.key);
        return await this.exportPngLimited(open.key);
      } catch (e) {
        this.log(`diagram image from the open editor failed (${e instanceof Error ? e.message : String(e)}); rendering in a temporary panel`);
      }
    }
    // One temporary panel at a time; a bounded number of requests wait.
    return this.renderQueue.run(() => this.renderTemporarily(uri, text));
  }

  private readonly renderQueue = new RenderQueue();

  /** A PNG of at most 1 MB: re-exported at a lower scale when larger; throws "image too large" when it still does not fit. */
  private exportPngLimited(key: string): Promise<string> {
    return exportWithinLimit((maxWidth) => this.exportPng(key, "light", maxWidth));
  }

  private async renderTemporarily(uri: vscode.Uri, text: string): Promise<string> {
    await this.model.ready.catch(() => undefined);
    const key = `render:${++this.renderCount}:${uri.toString()}`;
    const doc = new SysmlDiagramDocument(uri, new DiagramState(text), key, true);
    if (!doc.state.doc) throw new Error("the diagram does not parse");
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const panel = vscode.window.createWebviewPanel(
      "sysml.diagram.render",
      "SysML diagram (rendering)",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [root], retainContextWhenHidden: true },
    );
    const p: Panel = { panel, ready: false };
    this.panels.set(key, new Set([p]));
    const subs = [panel.webview.onDidReceiveMessage((m: WebviewToHost) => this.onMessage(doc, p, m)), panel.onDidDispose(() => this.panels.delete(key))];
    try {
      this.syncPage(doc, p);
      await this.waitUntil(() => p.ready && p.lastHash !== undefined, RENDER_TIMEOUT_MS, "the temporary diagram panel to render", key);
      return await this.exportPngLimited(key);
    } finally {
      this.panels.delete(key);
      for (const d of subs) d.dispose();
      panel.dispose();
      doc.dispose();
    }
  }

  private layoutDone(doc: SysmlDiagramDocument): void {
    const waiters = doc.layoutWaiters;
    doc.layoutWaiters = [];
    for (const w of waiters) w();
  }

  /**
   * Run the Auto-layout command in the open editor, the same code path as the command, and wait until the webview has
   * answered with its edit (or nothing changed). Rejects when the editor does not answer in time.
   */
  async autoLayout(doc: SysmlDiagramDocument): Promise<void> {
    await this.waitUntil(() => this.renderedPanel(doc.key) !== undefined, 10_000, "the diagram editor to render", doc.key);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = new Promise<void>((resolve, reject) => {
      doc.layoutWaiters.push(resolve);
      timer = setTimeout(() => reject(new Error(`the diagram editor did not finish the layout in ${RENDER_TIMEOUT_MS} ms${this.errorSuffix()}`)), RENDER_TIMEOUT_MS);
    });
    try {
      if (!this.runCommand(doc, "autoLayout")) throw new Error("the diagram editor is not ready");
      await done;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- test support ----------------------------------------------------------------------

  private request<T extends WebviewToHost["type"]>(key: string | vscode.Uri, make: (id: number) => HostToWebview): Promise<Extract<WebviewToHost, { type: T }>> {
    const k = typeof key === "string" ? key : key.toString();
    const p = [...(this.panels.get(k) ?? [])].find((x) => x.ready);
    if (!p) return Promise.reject(new Error(`no ready diagram panel for ${k}`));
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`diagram webview did not answer within ${REQUEST_TIMEOUT_MS} ms (errors: ${this.errorLog.join(" | ")})`)); }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: (m) => { clearTimeout(t); this.pending.delete(id); resolve(m as Extract<WebviewToHost, { type: T }>); }, reject });
      this.post(p, make(id));
    });
  }

  /** The webview's logged errors, for messages about a webview that did not come up. */
  private errorSuffix(): string {
    return this.errorLog.length ? ` (webview errors: ${this.errorLog.slice(-5).join(" | ")})` : "";
  }

  private async exportPng(uri: vscode.Uri | string, theme: PngTheme, maxWidth?: number): Promise<string> {
    const r = await this.request<"pngResult">(uri, (requestId) => ({ type: "exportPng", requestId, theme, ...(maxWidth !== undefined ? { maxWidth } : {}) }));
    if (r.error || !r.base64) throw new Error(r.error ?? "PNG export returned an empty image");
    return r.base64;
  }

  readonly testApi: DiagramTestApi = {
    open: async (uri) => {
      await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE);
      const end = performance.now() + 60_000;
      while (![...(this.panels.get(uri.toString()) ?? [])].some((p) => p.ready)) {
        if (performance.now() > end) throw new Error(`diagram editor for ${uri.toString()} did not become ready${this.errorSuffix()}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    metrics: (uri) => this.request<"metricsResult">(uri, (requestId) => ({ type: "getMetrics", requestId })),
    png: (uri) => this.exportPng(uri, "light"),
    pngEditor: (uri) => this.exportPng(uri, "editor-dark"),
    gesture: async (uri, gesture) => {
      const r = await this.request<"gestureResult">(uri, (requestId) => ({ type: "testGesture", requestId, gesture }));
      if (r.error) throw new Error(`gesture ${gesture.kind} failed in the webview: ${r.error}`);
    },
    setUi: (ui) => { this.ui = ui ? { ...defaultUi, ...ui } : defaultUi; },
    activeUri: () => this.activeDocument()?.uri.toString(),
    edit: (uri, moves) => {
      const d = this.docs.get(uri.toString());
      if (!d?.state.doc) throw new Error("diagram is not open or not parsed");
      const ids = new Map(moves.map((m) => [m.id, m] as const));
      const next = { ...d.state.doc, nodes: d.state.doc.nodes.map((n) => (ids.has(n.id) ? { ...n, x: ids.get(n.id)!.x, y: ids.get(n.id)!.y } : n)) };
      this.edit(d, next, "Move");
    },
    save: async (uri) => {
      const d = this.docs.get(uri.toString());
      if (!d) throw new Error("diagram is not open");
      await this.saveCustomDocument(d);
    },
    state: (uri) => {
      const d = this.docs.get(uri.toString());
      if (!d) throw new Error("diagram is not open");
      return { errorPage: !d.state.doc, dirty: d.state.dirty, problems: d.state.problems ?? [], ...(d.state.doc ? { doc: d.state.doc } : {}) };
    },
    errors: () => [...this.errorLog],
  };
}


