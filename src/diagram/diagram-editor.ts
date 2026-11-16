/**
 * The `.sysmld` custom editor: the VS Code adapter around `DiagramState`. Layout and drawing
 * happen in the webview (design D7); this file only owns documents, messages and files.
 */
import { badConnectIntent } from "./intent-check.js";
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { isInheritedIn, isLibraryUri, isSynthetic, participantName, type Element } from "../model/index.js";
import type { ModelActions } from "../model-service/interactive.js";
import { showFailure } from "../model-service/vscode-host.js";
import type { OpFailure, OpResult } from "../model-service/service.js";
import { commonOwner, type Target } from "../model-service/service.js";
import { nameProblem, typeCandidates } from "../model-service/support.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import { readSettled } from "./read-settled.js";
import { createDiagramFile, writeDiagramFile } from "./write-uri.js";
import { exportWithinLimit, RenderQueue } from "./agent-guards.js";
import { addElement, addElements, rootProblem } from "./create.js";
import { applyAutoLayout, applyBoxPatches, applyDiagramStyle, applyEdgeLayout, materializePins, removeItems } from "./edits.js";
import { defaultNameFor } from "./naming.js";
import { listElements, relinkCandidates } from "./new-diagram.js";
import type { DiagramCommand, DiagramEdit, HostToWebview, ModelIntent, PngTheme, TestGesture, WebviewToHost } from "./protocol.js";
import { applyUpdates, relink } from "./reconcile.js";
import { makeSourceMapper, referenceKey, resolveReference } from "./resolve.js";
import { DiagramState, decideSave, followRename, forceChange, hashViewModel, noteExternalChange, refresh, unforceChange } from "./session.js";
import { dropEntriesChange, type DiagramChange } from "../model-service/diagram-changes.js";
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
  /** A modal confirmation; true when the user chose `action`. */
  confirm(message: string, detail: string, action: string): Promise<boolean>;
  /** Show a refused or failed model edit, with "Go to error" or "Go to Definition" when it offers them. */
  fail(failure: OpFailure): Promise<void>;
  /** A message with action buttons; resolves to the chosen action, or undefined when dismissed. */
  choose(message: string, actions: readonly string[]): Promise<string | undefined>;
  /** Ask where to save a new diagram whose intended path is taken. */
  saveAs(suggested: vscode.Uri): Promise<vscode.Uri | undefined>;
}

export const defaultUi: DiagramUi = {
  pick: (items, options) => Promise.resolve(vscode.window.showQuickPick(items, options)),
  input: (options) => Promise.resolve(vscode.window.showInputBox(options)),
  fail: (f) => showFailure(f),
  choose: (message, actions) => Promise.resolve(vscode.window.showWarningMessage(message, ...actions)),
  confirm: async (message, detail, action) => (await vscode.window.showWarningMessage(message, { modal: true, detail }, action)) === action,
  saveAs: async (suggested) => Promise.resolve(vscode.window.showSaveDialog({ defaultUri: suggested, filters: { "SysML diagram": ["sysmld"] }, title: "Save Diagram" })),
};

export class SysmlDiagramDocument implements vscode.CustomDocument {
  readonly changed = new vscode.EventEmitter<void>();
  /** Ids selected in the editor, as last reported by the webview. */
  selection: string[] = [];
  /** Ids to select once the next render has reached the webview. */
  pendingSelect?: string[];
  /** Resolvers of callers waiting for the webview's answer to an Auto-layout command. */
  layoutWaiters: Array<() => void> = [];
  /** Whether the root has been checked against the kind since the document was opened. */
  rootChecked = false;
  /** A new diagram that has no file yet (D37): its URI is the intended path, it is written when saved. */
  pending = false;
  /** The generated text of a pending diagram, for Revert. */
  initialText = "";
  /** Own writes of the file in flight (state.disk already has their text); file watcher events during them are stale. */
  writing = 0;
  /** Set when a watcher event was skipped during an own write: the file is read once more afterwards. */
  recheck?: () => void;
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
  /** Node or edge id under the pointer, as last reported by this panel's webview. */
  hover?: string;
  /** Ids selected in this panel, as last reported. */
  selection: string[];
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
  /** Base64 PNG of the editor window with the palette and properties panel, in the editor's own theme (light or dark). */
  pngWindow(uri: vscode.Uri, theme: "editor-dark" | "editor-light"): Promise<string>;
  /** Replays a gesture in the webview as DOM events; resolves when it has been handled. */
  gesture(uri: vscode.Uri, g: TestGesture): Promise<void>;
  /** Replaces the questions the editor asks the user. */
  setUi(ui: Partial<DiagramUi> | undefined): void;
  /** The diagram editor that is active now. */
  activeUri(): string | undefined;
  /** The id the panel's webview last reported under the pointer. */
  hoverOf(uri: vscode.Uri): string | undefined;
  /** Writes the in-memory document in canonical form, as Save would. */
  save(uri: vscode.Uri): Promise<void>;
  /** Applies a move of nodes as one user edit (undoable, dirties the document). */
  edit(uri: vscode.Uri, moves: { id: string; x: number; y: number }[]): void;
  state(uri: vscode.Uri): { errorPage: boolean; dirty: boolean; pending: boolean; problems: DiagramProblem[]; doc?: DiagramFile };
  errors(): string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export class DiagramEditorProvider implements vscode.CustomEditorProvider<SysmlDiagramDocument>, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SysmlDiagramDocument> | vscode.CustomDocumentContentChangeEvent<SysmlDiagramDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChange.event;
  private readonly docs = new Map<string, SysmlDiagramDocument>();
  private readonly panels = new Map<string, Set<Panel>>();
  private readonly pending = new Map<number, Pending>();
  private readonly subs: vscode.Disposable[] = [];
  private readonly errorLog: string[] = [];
  private requestId = 0;
  /** The diagram panel that was active last, for when the active tab is not a diagram (the user is in the chat). */
  private lastActive?: { doc: SysmlDiagramDocument; p: Panel };
  private renderCount = 0;
  /** New diagrams waiting to be opened with no file: intended URI to generated text (D37). */
  private readonly newDocs = new Map<string, string>();
  private timer?: ReturnType<typeof setTimeout>;
  ui: DiagramUi = defaultUi;
  /** Called when a node is selected in a diagram and the tree should follow (set by the extension). */
  revealInTree?: (element: Element) => void;
  /** Why a document cannot be edited (library aside); nodes of such elements are locked in the view model. Set by the extension. */
  editBlocker?: (uri: string) => string | undefined;
  /** Model edits (palette, connection tool, delete from model, rename, properties); set by the extension. */
  modelActions?: ModelActions;

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

  /** Open a new diagram without writing it (D37): the tab shows `uri`, the file is created when the user saves. */
  async openNew(uri: vscode.Uri, text: string): Promise<void> {
    this.newDocs.set(uri.toString(), text);
    await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE);
  }

  async openCustomDocument(uri: vscode.Uri, ctx: vscode.CustomDocumentOpenContext): Promise<SysmlDiagramDocument> {
    const read = async (u: vscode.Uri) => decoder.decode(await vscode.workspace.fs.readFile(u));
    let state: DiagramState;
    let pendingText = this.newDocs.get(uri.toString());
    this.newDocs.delete(uri.toString());
    if (pendingText !== undefined) {
      state = new DiagramState(pendingText);
      state.disk = "";
    } else if (ctx.backupId) {
      const disk = await read(uri).then((t) => t, () => undefined);
      state = new DiagramState("");
      state.loadDirty(await read(vscode.Uri.parse(ctx.backupId)), disk ?? "");
      // A backup of a new diagram that was never saved comes back as one.
      if (disk === undefined) pendingText = await read(vscode.Uri.parse(ctx.backupId + ".initial")).then((t) => t, () => "");
    } else {
      state = new DiagramState(await read(uri));
    }
    const doc = new SysmlDiagramDocument(uri, state);
    if (pendingText !== undefined) {
      doc.pending = true;
      doc.initialText = pendingText;
    }
    this.docs.set(uri.toString(), doc);
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), uri.path.split("/").pop()!));
    const onDisk = async () => {
      try {
        if (doc.pending) return; // no file of its own yet
        if (doc.writing > 0) {
          // state.disk is ahead of the file while our own write is in flight: reading now would mistake the older text for an
          // external change and reload it over what the model edit just put in memory. Look again when the write is done.
          doc.recheck = () => void onDisk();
          return;
        }
        const diskBefore = doc.state.disk;
        const text = (await readSettled(() => read(uri))) as string;
        if (doc.writing > 0 || doc.state.disk !== diskBefore) {
          // An own write started or finished while reading: the text read may be older than state.disk.
          if (doc.writing > 0) doc.recheck = () => void onDisk();
          else void onDisk();
          return;
        }
        const change = noteExternalChange(doc.state, text);
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

  /** Writes the diagram file of an open document; watcher events meanwhile are not taken for external changes. */
  private async writeOwn(doc: SysmlDiagramDocument, text: string): Promise<void> {
    doc.writing++;
    try {
      await writeDiagramFile(doc.uri, encoder.encode(text));
    } finally {
      doc.writing--;
      if (doc.writing === 0 && doc.recheck) {
        const again = doc.recheck;
        doc.recheck = undefined;
        again();
      }
    }
  }

  /** Save a new diagram: create the file at the intended path, or ask for another path when one exists there (never overwrite). */
  private async saveNew(doc: SysmlDiagramDocument): Promise<void> {
    const s = doc.state;
    if (!s.doc) throw new Error(`${doc.uri.path.split("/").pop()} cannot be saved: it is not a valid diagram file.`);
    const bytes = encoder.encode(s.text());
    let dest = doc.uri;
    if (await vscode.workspace.fs.stat(dest).then(() => true, () => false)) {
      const picked = await this.ui.saveAs(doc.uri);
      if (!picked) throw new Error(`Save cancelled: ${doc.uri.path.split("/").pop()} already exists.`);
      dest = picked;
    }
    doc.writing++;
    try {
      await createDiagramFile(dest, bytes);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`${dest.path.split("/").pop()} was created by something else in the meantime, so nothing was written.`);
      throw e;
    } finally {
      doc.writing--;
    }
    s.markSaved();
    if (dest.toString() === doc.uri.toString()) {
      doc.pending = false;
      doc.initialText = "";
    } else {
      // Saved under another name: that file is the diagram now. Open it, and close this tab (it is clean) so no editor stays on the old path.
      await vscode.commands.executeCommand("vscode.openWith", dest, VIEW_TYPE);
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VIEW_TYPE && tab.input.uri.toString() === doc.uri.toString()) void vscode.window.tabGroups.close(tab);
      }
    }
  }

  async saveCustomDocument(doc: SysmlDiagramDocument): Promise<void> {
    if (doc.pending) return this.saveNew(doc);
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
      await this.writeOwn(doc, s.text());
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
    if (doc.pending) {
      doc.state.load(doc.initialText);
      doc.state.disk = "";
      this.rerender(doc);
      return;
    }
    doc.state.load(decoder.decode(await vscode.workspace.fs.readFile(doc.uri)));
    this.rerender(doc);
  }

  async backupCustomDocument(doc: SysmlDiagramDocument, ctx: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.writeFile(ctx.destination, encoder.encode(doc.state.text()));
    // A new diagram also keeps its generated text, which Revert restores after the window was reloaded.
    const initial = vscode.Uri.parse(ctx.destination.toString() + ".initial");
    if (doc.pending) await vscode.workspace.fs.writeFile(initial, encoder.encode(doc.initialText));
    return { id: ctx.destination.toString(), delete: () => { void vscode.workspace.fs.delete(ctx.destination).then(undefined, () => {}); if (doc.pending) void vscode.workspace.fs.delete(initial).then(undefined, () => {}); } };
  }

  // ---- editor ----------------------------------------------------------------------------

  async resolveCustomEditor(doc: SysmlDiagramDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const webview = webviewPanel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [root] };
    const key = doc.key;
    const p: Panel = { panel: webviewPanel, ready: false, selection: [] };
    this.panels.set(key, (this.panels.get(key) ?? new Set()).add(p));
    webviewPanel.onDidDispose(() => {
      const set = this.panels.get(key);
      set?.delete(p);
      if (set && !set.size) this.panels.delete(key);
    });
    // Hover belongs to the pointer: a hidden or inactive panel has none.
    webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) this.lastActive = { doc, p };
      if (!webviewPanel.visible && p.hover !== undefined) { p.hover = undefined; this.post(p, { type: "resetHover" }); }
    });
    if (webviewPanel.active) this.lastActive = { doc, p };
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

  /** Satisfy, verify and derivation from the Requirements View palette: the same service operations as the requirements editor. */
  private async drawRequirementRelation(actions: ModelActions, relation: "satisfy" | "verify" | "derivation", a: Element, b: Element, origin: { diagram: string }): Promise<OpResult> {
    const isReq = (e: Element) => e.kind === "requirement" || e.kind === "requirement def";
    const isCase = (e: Element) => e.kind === "verification" || e.kind === "verification def";
    const bad = (m: string): OpResult => ({ ok: false, reason: m });
    if (relation === "derivation") {
      if (!isReq(a) || !isReq(b)) return bad("A derivation connects two requirements: click the original requirement, then the derived one.");
      return actions.service.derive(a, [b], undefined, origin);
    }
    // Either order is accepted: the requirement is the one that is a requirement.
    if (relation === "satisfy") {
      if (isReq(a) === isReq(b)) return bad("A satisfy relationship connects a requirement and the element that satisfies it.");
      return isReq(a) ? actions.service.satisfy(a, b, undefined, origin) : actions.service.satisfy(b, a, undefined, origin);
    }
    const [req, vc] = isReq(a) ? [a, b] : [b, a];
    if (!isReq(req) || !isCase(vc)) return bad("A verify relationship connects a requirement and a verification case.");
    return actions.service.verify(req, vc, origin);
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
        if (m.generation !== doc.state.generation) {
          this.log(`diagram: dropped an edit from generation ${String(m.generation)} (document is at ${doc.state.generation})`);
          this.post(p, { type: "editRejected" });
        } else this.post(p, { type: this.userEdit(doc, m.edit) ? "editApplied" : "editRejected" });
        if (m.edit?.kind === "autoLayout") this.layoutDone(doc);
        break;
      case "hover":
        p.hover = typeof m.id === "string" && this.inView(doc, m.id) ? m.id : undefined;
        break;
      case "selection":
        p.selection = Array.isArray(m.ids) ? m.ids.filter((i) => typeof i === "string" && this.inView(doc, i)) : [];
        doc.selection = Array.isArray(m.ids) ? m.ids.filter((i) => typeof i === "string") : [];
        this.followSelection(doc);
        break;
      case "model":
        if (m.generation !== undefined && m.generation !== doc.state.generation) this.log(`diagram: dropped a model edit from generation ${String(m.generation)}`);
        else void this.onModelIntent(doc, m.intent).catch((e) => this.fail("Edit", e));
        break;
      case "typeSuggestions": {
        const t = this.targetOf(doc, m.id);
        const items = t ? typeCandidates(this.model.index, t.element, typeof m.query === "string" ? m.query : "") : [];
        // To the panel that asked: the same diagram can be open in two.
        this.post(p, { type: "typeSuggestionsResult", requestId: m.requestId, items });
        break;
      }
      case "nameCheck": {
        const r = this.checkName(doc, m);
        this.post(p, { type: "nameCheckResult", requestId: m.requestId, ...r });
        break;
      }
      case "relink":
        void this.relinkInteractive(doc, m.id).catch((e) => this.fail("Re-link", e));
        break;
      case "dropElements":
        this.addByName(doc, Array.isArray(m.names) ? m.names : [], typeof m.x === "number" && typeof m.y === "number" && Number.isFinite(m.x) && Number.isFinite(m.y) ? { x: m.x, y: m.y } : undefined);
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
    const stat = () => vscode.workspace.fs.stat(doc.uri).then((x) => `${x.mtime}:${x.size}`, () => undefined);
    const ctx = { uri: doc.uri.toString(), sourceOf: this.opts(doc).sourceOf };
    if (doc.pending) {
      // No file yet: the change goes into memory only (it is not an edit of the diagram, so the document stays clean).
      const st = doc.state;
      if (st.doc) {
        const fn = (d: FileDoc) => (mode === "apply" ? change.apply(d, ctx) : change.revert(d, ctx));
        if (mode === "apply") {
          st.doc = fn(st.doc);
          if (!st.forced.some((f) => f.token === change)) st.forced.push({ token: change, fn: (d) => change.apply(d, ctx) });
          for (const k of change.createdKeys?.() ?? []) st.created.add(k);
          for (const [k, u] of change.createdIn?.() ?? []) st.createdIn.set(k, u);
        } else {
          st.forced = st.forced.filter((f) => f.token !== change);
          st.doc = fn(st.doc);
        }
        st.snapshot = undefined;
        // A new diagram has no file to hold the change: it is now content the user would lose, so it is dirty (close asks, hot exit backs it up).
        st.touch();
        this._onDidChange.fire({ document: doc });
      }
      this.rerender(doc);
      return false;
    }
    let wrote = false;
    for (let attempt = 0; ; attempt++) {
      const before = await stat();
      const disk = await vscode.workspace.fs.readFile(doc.uri).then((b) => decoder.decode(b), () => undefined);
      const prev = { disk: doc.state.disk, raw: doc.state.raw };
      const r =
        mode === "apply"
          ? forceChange(doc.state, change, (d) => change.apply(d, ctx), disk)
          : unforceChange(doc.state, change, (d) => change.revert(d, ctx), disk);
      if (mode === "apply") {
        for (const k of change.createdKeys?.() ?? []) doc.state.created.add(k);
        for (const [k, u] of change.createdIn?.() ?? []) doc.state.createdIn.set(k, u);
      }
      doc.state.snapshot = undefined;
      if (r.kind === "write") {
        // The file may have changed since it was read: do not overwrite an external change unseen.
        if ((await stat()) !== before) {
          doc.state.disk = prev.disk;
          doc.state.raw = prev.raw;
          if (attempt < 2) continue; // read again and re-apply the change to the new text
          void vscode.window.showWarningMessage(`${doc.uri.path.split("/").pop()} changed on disk while the model edit was being saved to it. The diagram file was not updated.`);
          this.rerender(doc);
          return false;
        }
        try {
          await this.writeOwn(doc, r.text);
        } catch (e) {
          doc.state.disk = prev.disk; // the text never landed
          doc.state.raw = prev.raw;
          throw e;
        }
        wrote = true;
      }
      break;
    }
    this.rerender(doc);
    return wrote;
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
  /** Whether the edit was applied (otherwise the webview is told to draw the committed state again). */
  private userEdit(doc: SysmlDiagramDocument, edit: DiagramEdit): boolean {
    const cur = doc.state.doc;
    if (!cur || !edit || typeof edit !== "object") return false;
    let next: FileDoc | undefined;
    let label = "Edit diagram";
    switch (edit.kind) {
      case "layout": {
        // Sliding a pin the diagram does not store yet: the pin's node is added (parent: its action) and takes the position.
        let base = cur;
        let boxes = Array.isArray(edit.boxes) ? edit.boxes : undefined;
        if (boxes?.some((b) => typeof b?.id === "string" && b.id.startsWith("pin:"))) {
          const m = materializePins(cur, boxes, doc.state.viewModel, this.model.index, this.opts(doc).sourceOf);
          base = m.doc;
          boxes = m.boxes;
        }
        edit = { ...edit, boxes: boxes ?? [] };
        next = Array.isArray(edit.boxes) ? applyBoxPatches(base, edit.boxes, { routes: Array.isArray(edit.routes) ? edit.routes : [], drop: Array.isArray(edit.drop) ? edit.drop.filter((i) => typeof i === "string") : [] }, doc.state.viewModel) : undefined;
        label = edit.label === "Resize" ? "Resize" : edit.label === "Nudge" ? "Nudge" : "Move";
        break;
      }
      case "autoLayout":
        next = Array.isArray(edit.boxes) ? applyAutoLayout(cur, edit.boxes, Array.isArray(edit.edges) ? edit.edges : []) : undefined;
        label = "Auto-layout";
        break;
      case "style":
        next = applyDiagramStyle(cur, edit);
        label = edit.descriptions ? "Show Descriptions" : "Hide Descriptions";
        break;
      case "edgeLayout":
        next = Array.isArray(edit.edges) ? applyEdgeLayout(cur, edit.edges, doc.state.viewModel) : undefined;
        label = edit.label === "Label" ? "Edit Label" : "Edit Route";
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
    return next !== undefined;
  }

  // ---- model edits ------------------------------------------------------------------------

  /** The element a node shows, and the node's container element when it only inherits the feature from there. */
  targetOf(doc: SysmlDiagramDocument, id: string): Target | undefined {
    const d = doc.state.doc;
    const edge = d?.edges.find((e) => e.id === id);
    const node = d?.nodes.find((n) => n.id === id) ?? edge;
    if (!d || !node) return undefined;
    const index = this.model.index;
    const element = resolveReference(node, d, index, this.opts(doc));
    if (!element) return undefined;
    if (edge) return { element };
    // Any container up the node ancestry that inherits the feature (or a feature it lies beneath) is its context.
    for (const anc of this.ancestry(doc, id).slice(1)) {
      const ancNode = d.nodes.find((n) => n.id === anc);
      const ancEl = ancNode ? resolveReference(ancNode, d, index, this.opts(doc)) : undefined;
      if (ancEl && isInheritedIn(index, element, ancEl)) return { element, context: ancEl };
    }
    return { element };
  }

  /** Whether a name can be used for a new or renamed element, and the default name of the kind (what the inline input asks before it writes). */
  private checkName(doc: SysmlDiagramDocument, m: Extract<WebviewToHost, { type: "nameCheck" }>): { problem?: string; suggested?: string } {
    const d = doc.state.doc;
    const index = this.model.index;
    if (!d || typeof m.name !== "string") return {};
    let owner: Element | undefined;
    let renaming: Element | undefined;
    if (typeof m.siblingOf === "string") {
      const el = this.targetOf(doc, m.siblingOf)?.element;
      owner = el?.owner;
      if (m.rename === true) renaming = el;
    } else if (typeof m.ownerId === "string") owner = this.targetOf(doc, m.ownerId)?.element;
    else owner = resolveReference({ ref: d.root }, d, index, this.opts(doc));
    if (!owner) return {};
    const problem = nameProblem(m.name, owner, renaming, index);
    return { ...(problem ? { problem } : {}), ...(typeof m.kind === "string" ? { suggested: defaultNameFor(index, owner, m.kind) } : {}) };
  }

  private notice(doc: SysmlDiagramDocument, message: string): void {
    for (const p of this.panels.get(doc.key) ?? []) if (p.ready) this.post(p, { type: "notice", message });
  }

  /** The node ancestry from a node up (`parent` or, for ports, the owner node). */
  private ancestry(doc: SysmlDiagramDocument, id: string): string[] {
    const vm = doc.state.viewModel?.nodes ?? [];
    const out: string[] = [];
    for (let cur: string | undefined = id, i = 0; cur !== undefined && i < 100; i++) {
      out.push(cur);
      const n = vm.find((x) => x.id === cur);
      cur = n ? (n.attachedTo ?? n.parent) : doc.state.doc?.nodes.find((x) => x.id === cur)?.parent;
    }
    return out;
  }

  private async onModelIntent(doc: SysmlDiagramDocument, intent: ModelIntent): Promise<void> {
    const actions = this.modelActions;
    const d = doc.state.doc;
    if (!actions || !d || doc.renderOnly) return;
    const origin = { diagram: doc.uri.toString() };
    switch (intent.kind) {
      case "add": {
        const ownerT = intent.ownerId !== undefined ? this.targetOf(doc, intent.ownerId) : undefined;
        const refusal = ownerT ? actions.service.refuseIfInherited(ownerT, "extended") : undefined;
        if (refusal) {
          void actions.report(refusal, "");
          return this.notice(doc, refusal.reason);
        }
        const owner = ownerT?.element ?? (intent.ownerId === undefined ? resolveReference({ ref: d.root }, d, this.model.index, this.opts(doc)) : undefined);
        if (!owner) return this.notice(doc, "The element to add to could not be found; it may be unresolved.");
        // The name was confirmed in the inline input (no quick input); a name missing from an older caller is the default one.
        const name = typeof intent.name === "string" ? intent.name : defaultNameFor(this.model.index, owner, intent.paletteKind);
        const problem = nameProblem(name, owner, undefined, this.model.index);
        if (problem) return this.notice(doc, problem);
        const r = await actions.addChild(owner, { kind: intent.paletteKind, name, origin, placement: { diagram: origin.diagram, ...(intent.ownerId !== undefined ? { parentNode: intent.ownerId } : {}), x: intent.x, y: intent.y } });
        if (r && !r.ok) this.notice(doc, r.reason);
        else if (r?.ok && r.element?.qualifiedName) {
          const id = doc.state.doc?.nodes.find((n) => n.ref === r.element!.qualifiedName)?.id;
          if (id) this.selectIds(doc, [id]);
        }
        return;
      }
      case "connect": {
        if (intent.relation === "flow") return this.drawFlow(doc, actions, intent.sourceId, intent.targetId, origin);
        const a = this.targetOf(doc, intent.sourceId);
        const b = this.targetOf(doc, intent.targetId);
        if (!a || !b) return this.notice(doc, "Both ends of a connection must be resolved elements.");
        if (intent.relation === "succession" || intent.relation === "transition" || intent.relation === "message") return this.drawBehaviorEdge(doc, actions, intent.relation, a, b, origin);
        if (intent.relation) {
          const r = await this.drawRequirementRelation(actions, intent.relation, a.element, b.element, origin);
          const shown = await actions.report(r, `Added ${intent.relation}`);
          if (!shown.ok) this.notice(doc, shown.reason);
          return;
        }
        const chainA = this.ancestry(doc, intent.sourceId);
        const chainB = this.ancestry(doc, intent.targetId);
        const ownerNode = chainA.slice(1).find((n) => chainB.slice(1).includes(n));
        let owner: Element | undefined;
        let endA: Target | string = a;
        let endB: Target | string = b;
        if (ownerNode !== undefined) {
          const ot = this.targetOf(doc, ownerNode);
          owner = ot?.element;
          const pathTo = (chain: string[]) => chain.slice(0, chain.indexOf(ownerNode)).reverse().map((n) => this.targetOf(doc, n)?.element.name);
          const pa = pathTo(chainA);
          const pb = pathTo(chainB);
          if (pa.every((x) => x !== undefined) && pb.every((x) => x !== undefined)) {
            const quote = (n: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `'${n.replace(/[\\']/g, (c) => "\\" + c)}'`);
            endA = pa.map((n) => quote(n!)).join(".");
            endB = pb.map((n) => quote(n!)).join(".");
          }
        } else owner = commonOwner(a.element, b.element);
        if (!owner) return this.notice(doc, "These two elements have no common owner on this diagram, so there is nowhere to put the connection.");
        const r = await actions.service.connect(owner, endA, endB, { ...origin, placement: { diagram: origin.diagram } });
        const shown = await actions.report(r, "Added connection");
        if (!shown.ok) this.notice(doc, shown.reason);
        return;
      }
      case "connectNew": {
        const bad = badConnectIntent(intent);
        if (bad) return this.notice(doc, bad);
        const a = this.targetOf(doc, intent.sourceId);
        if (!a) return this.notice(doc, "The source of the line must be a resolved element.");
        const refusal = actions.service.refuseIfInherited(a, "connected");
        if (refusal) {
          void actions.report(refusal, "");
          return this.notice(doc, refusal.reason);
        }
        const root = resolveReference({ ref: d.root }, d, this.model.index, this.opts(doc));
        const parent = d.nodes.find((n) => n.id === intent.sourceId)?.parent;
        const known = new Set(d.edges.map((e) => e.id));
        if (typeof intent.name === "string" && a.element.owner) {
          const problem = nameProblem(intent.name, a.element.owner, undefined, this.model.index);
          if (problem) return this.notice(doc, problem);
        }
        const r = await actions.service.addConnectedNode(a.element, intent.paletteKind, intent.relation, { ...origin, ...(typeof intent.name === "string" ? { name: intent.name } : {}), ...(root ? { context: root } : {}), placement: { diagram: origin.diagram, ...(parent !== undefined ? { parentNode: parent } : {}), x: intent.x, y: intent.y } });
        const shown = await actions.report(r, `Added ${intent.paletteKind} and ${intent.relation}`);
        if (!shown.ok) return this.notice(doc, shown.reason);
        const fresh = (doc.state.doc?.edges ?? []).filter((e) => !known.has(e.id)).map((e) => e.id);
        if (fresh.length) this.selectIds(doc, [fresh[fresh.length - 1]!]);
        return;
      }
      case "reconnect": {
        const bad = badConnectIntent(intent);
        if (bad) return this.notice(doc, bad);
        const e = d.edges.find((x) => x.id === intent.id);
        const stmt = e ? resolveReference(e, d, this.model.index, this.opts(doc)) : undefined;
        const b = this.targetOf(doc, intent.nodeId);
        if (!e || !stmt || !b) return this.notice(doc, "The line or the element could not be found; it may be unresolved.");
        const root = resolveReference({ ref: d.root }, d, this.model.index, this.opts(doc));
        // Without the root the inherited check cannot be made (D18): refuse.
        if (!root) return this.notice(doc, "The diagram's root element could not be found, so it cannot be checked whether this end is inherited; the line was not changed.");
        const r = await actions.service.reconnect(stmt, intent.end, b.element, { ...origin, context: root });
        const shown = await actions.report(r, "Moved the end of the line");
        if (!shown.ok) return this.notice(doc, shown.reason);
        this.selectIds(doc, [intent.id]);
        return;
      }
      case "deleteFromModel": {
        for (const id of intent.ids) {
          const t = this.targetOf(doc, id);
          if (!t) continue;
          // An edge (succession, transition, message) is an unnamed statement: always ask, naming its text.
          const r = await actions.delete(t, { origin, ...(d.edges.some((e) => e.id === id) ? { alwaysConfirm: true } : {}) });
          if (r && !r.ok) this.notice(doc, r.reason);
        }
        return;
      }
      case "rename": {
        const t = this.targetOf(doc, intent.id);
        if (!t) return;
        const r = await actions.rename(t, { origin, name: intent.name });
        if (r && !r.ok) this.notice(doc, r.reason);
        return;
      }
      case "setProperties": {
        const t = this.targetOf(doc, intent.id);
        if (!t) return;
        const r = await actions.report(await actions.service.setProperties(t, intent.changes, origin), "Changed properties");
        if (!r.ok) this.notice(doc, r.reason);
        else this.rerender(doc);
        return;
      }
      case "setTransition": {
        const e = d.edges.find((x) => x.id === intent.id);
        const el = e ? resolveReference(e, d, this.model.index, this.opts(doc)) : undefined;
        if (!el) return this.notice(doc, "The transition could not be found; it may be unresolved.");
        const changes = intent.changes && typeof intent.changes === "object" ? intent.changes : {};
        const parts: { trigger?: string; guard?: string; effect?: string } = {};
        for (const k of ["trigger", "guard", "effect"] as const) if (typeof changes[k] === "string") parts[k] = changes[k];
        const r = await actions.report(await actions.service.setTransition(el, parts, origin), "Changed transition");
        if (!r.ok) this.notice(doc, r.reason);
        else this.rerender(doc);
        return;
      }
      case "nest": {
        const t = this.targetOf(doc, intent.id);
        // Out of a parent: one level up, the parent's owner (refused when there is none).
        const owner: Element | undefined = intent.targetId !== undefined ? this.targetOf(doc, intent.targetId)?.element : t?.element.owner?.owner;
        if (t && intent.targetId === undefined && !owner) {
          this.notice(doc, `${t.element.name ?? "The element"} is not inside anything that is itself owned, so there is nowhere further out to move it.`);
          return this.rerender(doc);
        }
        if (!t || !owner) {
          this.notice(doc, "The element or the target could not be found; it may be unresolved.");
          return this.rerender(doc);
        }
        const r = await actions.report(await actions.service.nest(t, owner, origin), "Moved");
        if (!r.ok) this.notice(doc, r.reason);
        this.rerender(doc);
        return;
      }
      case "goToDefinition": {
        const t = this.targetOf(doc, intent.id);
        if (!t) return;
        const r = t.element.nameRange ?? t.element.range;
        const td = await vscode.workspace.openTextDocument(vscode.Uri.parse(t.element.uri));
        await vscode.window.showTextDocument(td, { selection: new vscode.Range(r.start.line, r.start.column, r.end.line, r.end.column) });
        return;
      }
    }
  }

  /**
   * A succession, transition or message drawn between two nodes. The statement goes into the element that owns both
   * (the root for a message); the same `ModelService` operations serve the agent tools.
   */
  private async drawBehaviorEdge(doc: SysmlDiagramDocument, actions: ModelActions, relation: "succession" | "transition" | "message", a: Target, b: Target, origin: { diagram: string }): Promise<void> {
    const d = doc.state.doc;
    if (!d) return;
    const index = this.model.index;
    for (const t of [a, b]) {
      const refusal = actions.service.refuseIfInherited(t, "connected");
      if (refusal) {
        void actions.report(refusal, "");
        return this.notice(doc, refusal.reason);
      }
    }
    const known = new Set(d.edges.map((e) => e.id));
    let r: OpResult;
    if (relation === "message") {
      const owner = resolveReference({ ref: d.root }, d, index, this.opts(doc));
      const from = participantName(a.element) ?? a.element.name;
      const to = participantName(b.element) ?? b.element.name;
      if (!owner || !from || !to) return this.notice(doc, "A message goes between two named lifelines of a resolved interaction.");
      const typed = await this.ui.input({ title: "New message", prompt: `Name of the message from ${from} to ${to} (optional; leave empty for none)`, validateInput: (v) => (v.trim() === "" ? undefined : nameProblem(v, owner, undefined, index)) });
      if (typed === undefined) return;
      r = await actions.service.addMessage(owner, from, to, typed.trim() === "" ? {} : { name: typed.trim() }, { ...origin, placement: { diagram: origin.diagram } });
    } else {
      const owner = isSynthetic(a.element) ? a.element.owner : isSynthetic(b.element) ? b.element.owner : a.element.owner === b.element.owner ? a.element.owner : commonOwner(a.element, b.element);
      const root = resolveReference({ ref: d.root }, d, index, this.opts(doc));
      if (!owner) return this.notice(doc, "These two elements have no common owner on this diagram, so there is nowhere to put the statement.");
      r = relation === "succession"
        ? await actions.service.addSuccession(owner, a.element, b.element, { ...origin, ...(root ? { context: root } : {}), placement: { diagram: origin.diagram } })
        : await actions.service.addTransition(owner, a.element, b.element, {}, { ...origin, ...(root ? { context: root } : {}), placement: { diagram: origin.diagram } });
    }
    const shown = await actions.report(r, `Added ${relation}`);
    if (!shown.ok) return this.notice(doc, shown.reason);
    const fresh = (doc.state.doc?.edges ?? []).filter((e) => !known.has(e.id)).map((e) => e.id);
    if (fresh.length) this.selectIds(doc, [fresh[fresh.length - 1]!]);
  }

  /** A flow drawn from the pin of one action to the pin of another: `flow from a.x to b.y;` in the action that holds both. */
  private async drawFlow(doc: SysmlDiagramDocument, actions: ModelActions, sourceId: string, targetId: string, origin: { diagram: string }): Promise<void> {
    const vm = doc.state.viewModel?.nodes ?? [];
    const end = (id: string): { action: Element; pin: string } | undefined => {
      const n = vm.find((x) => x.id === id);
      const action = n?.pin && n.attachedTo !== undefined ? this.targetOf(doc, n.attachedTo)?.element : undefined;
      return action && n ? { action, pin: n.label } : undefined;
    };
    const a = end(sourceId), b = end(targetId);
    if (!a || !b) return this.notice(doc, "A flow connects two parameter pins: start on an output pin and end on an input pin.");
    if (vm.find((x) => x.id === sourceId)?.pin?.direction === "in" || vm.find((x) => x.id === targetId)?.pin?.direction === "out") return this.notice(doc, "A flow runs from an output pin to an input pin.");
    const owner = commonOwner(a.action, b.action);
    if (!owner) return this.notice(doc, "These two actions have no common owner on this diagram, so there is nowhere to put the flow.");
    const path = (e: { action: Element; pin: string }): string | undefined => {
      const names: string[] = [];
      for (let x: Element | undefined = e.action; x && x !== owner; x = x.owner) {
        if (x.name === undefined) return undefined;
        names.unshift(/^[A-Za-z_][A-Za-z0-9_]*$/.test(x.name) ? x.name : `'${x.name.replace(/[\\']/g, (c) => "\\" + c)}'`);
      }
      return [...names, /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.pin) ? e.pin : `'${e.pin.replace(/[\\']/g, (c) => "\\" + c)}'`].join(".");
    };
    const from = path(a), to = path(b);
    if (!from || !to) return this.notice(doc, "An action on the way has no name, so the flow end cannot be written.");
    const known = new Set((doc.state.doc?.edges ?? []).map((e) => e.id));
    const r = await actions.report(await actions.service.addFlow(owner, from, to, { ...origin, placement: { diagram: origin.diagram } }), "Added flow");
    if (!r.ok) return this.notice(doc, r.reason);
    const fresh = (doc.state.doc?.edges ?? []).filter((e) => !known.has(e.id)).map((e) => e.id);
    if (fresh.length) this.selectIds(doc, [fresh[fresh.length - 1]!]);
  }

  /** "Delete from Model…" on the selected nodes (the command and the context menu). */
  async deleteSelectionFromModel(doc: SysmlDiagramDocument): Promise<void> {
    if (!doc.selection.length) {
      void vscode.window.showInformationMessage("Select an element in the diagram first.");
      return;
    }
    await this.onModelIntent(doc, { kind: "deleteFromModel", ids: [...doc.selection] });
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
  addElementsTo(doc: SysmlDiagramDocument, elements: Element[], at?: { x: number; y: number }): { ids: string[]; added: number } {
    const cur = doc.state.doc;
    if (!cur) throw new Error("This diagram cannot be edited: its file does not parse.");
    const r = addElements(cur, this.model.index, elements, { ...this.opts(doc), ...(at ? { at } : {}) });
    if (r.added.length) this.edit(doc, r.doc, elements.length === 1 ? "Add to Diagram" : "Add elements to Diagram");
    this.selectIds(doc, r.ids);
    return { ids: r.ids, added: r.added.length };
  }

  private addByName(doc: SysmlDiagramDocument, names: string[], at?: { x: number; y: number }): void {
    // A drop payload comes from outside the extension: bounded, and never standard library content.
    const els = names.slice(0, MAX_DROPPED_NAMES).flatMap((n) => (typeof n === "string" ? [...this.model.index.findByQualifiedName(n).filter((e) => !isLibraryUri(e.uri)).slice(0, 1)] : []));
    if (!els.length) return;
    try {
      this.addElementsTo(doc, els, at);
    } catch (e) {
      this.fail("Add to Diagram", e);
    }
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
  runCommand(doc: SysmlDiagramDocument | undefined, name: DiagramCommand, whole = false): boolean {
    const p = [...(this.panels.get(doc?.key ?? "") ?? [])].find((x) => x.ready);
    if (!p) return false;
    this.post(p, { type: "command", name, ...(whole ? { whole: true } : {}) });
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
    const r = refresh(doc.state, this.model.index, this.opts(doc), this.editBlocker);
    if (!r) return;
    if (r.updates && !doc.renderOnly) void this.followRename(doc, r.updates);
    if (r.vanished && !doc.renderOnly) void this.dropVanished(doc, r.vanished);
    if (r.restore && !doc.renderOnly) void this.restoreDropped(doc, r.restore);
    if (!doc.renderOnly && !doc.rootChecked && [...(this.panels.get(doc.key) ?? [])].some((p) => p.ready)) {
      void this.checkRoot(doc).catch((e) => this.fail("Check root", e));
    }
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

  /** An open diagram whose root does not fit its kind (an Interconnection View of a package): say why and offer to fix it (D27). */
  private async checkRoot(doc: SysmlDiagramDocument): Promise<void> {
    const d = doc.state.doc;
    if (!d) return;
    const root = resolveReference({ ref: d.root }, d, this.model.index, this.opts(doc));
    // Not resolved yet (the model is still loading): the next render asks again.
    if (!root) return;
    doc.rootChecked = true;
    const problem = rootProblem(d.kind, root);
    if (!problem) return;
    const change = "Change root", convert = "Convert to General";
    const pick = await this.ui.choose(`${problem} Change the root or convert the diagram to a General View.`, [change, convert]);
    const cur = doc.state.doc;
    if (!cur || cur.root !== d.root) return;
    if (pick === convert) this.edit(doc, { ...cur, kind: "general" }, "Convert to General View");
    else if (pick === change) {
      const items = listElements(this.model.index).filter((e) => e.qualifiedName !== undefined && !isLibraryUri(e.uri) && !rootProblem(cur.kind, e)).map((e) => ({ label: e.name ?? "", description: e.qualifiedName ?? "", detail: e.kind }));
      const chosen = await this.ui.pick(items, { title: "Change root", placeHolder: "Choose an element this diagram can show", matchOnDescription: true });
      if (!chosen) return;
      const latest = doc.state.doc;
      if (!latest || latest.root !== d.root) return;
      const index = this.model.index, opts = this.opts(doc);
      const oldRoot = resolveReference({ ref: latest.root }, latest, index, opts);
      // The root's own node is found by the element it resolves to, not by the stored text.
      const isRoot = (n: (typeof latest.nodes)[number]) => n.ref === latest.root || (oldRoot !== undefined && n.ref !== undefined && resolveReference(n, latest, index, opts) === oldRoot);
      this.edit(doc, { ...latest, root: chosen.description, nodes: latest.nodes.map((n) => (isRoot(n) ? { ...n, ref: chosen.description } : n)) }, "Change root");
    }
  }

  /**
   * Entries this session created for elements that have since disappeared from a CLEAN parse of their document are
   * removed (no placeholder). The removal is an ordinary forced change: if the element comes back at the same
   * qualified name in this session, the entries are restored at their previous position.
   */
  private async dropVanished(doc: SysmlDiagramDocument, keys: string[]): Promise<void> {
    // Synchronously, so a second refresh before the first finishes does not drop twice.
    for (const k of keys) doc.state.created.delete(k);
    try {
      // A later undo of an unrelated edit must not bring the dropped placement back.
      doc.state.forced = doc.state.forced.filter((f) => !((f.token as Partial<DiagramChange>).createdKeys?.() ?? []).some((k) => keys.includes(k)));
      const change = dropEntriesChange(keys, "Remove entries of vanished elements");
      doc.state.dropped.push({ change, uri: doc.uri.toString() });
      await this.forceOpen(doc, change, "apply");
    } catch (e) {
      this.log(`diagram: dropping vanished entries failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The element of dropped entries is back: put the entries back where they were (and track them as session-created again). */
  private async restoreDropped(doc: SysmlDiagramDocument, changes: DiagramChange[]): Promise<void> {
    const mine = doc.state.dropped.filter((d) => changes.includes(d.change));
    doc.state.dropped = doc.state.dropped.filter((d) => !changes.includes(d.change));
    for (const d of mine) {
      try {
        const items = d.change.removedItems?.(d.uri);
        await this.forceOpen(doc, d.change, "revert");
        for (const i of [...(items?.nodes ?? []), ...(items?.edges ?? [])]) {
          const k = referenceKey(i);
          doc.state.created.add(k);
        }
      } catch (e) {
        this.log(`diagram: restoring dropped entries failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private async followRename(doc: SysmlDiagramDocument, updates: NonNullable<ReturnType<typeof refresh>>["updates"]): Promise<void> {
    try {
      if (doc.pending) {
        if (doc.state.doc && updates?.length) {
          doc.state.doc = applyUpdates(doc.state.doc, updates);
          doc.state.follows.push([...updates]);
          this.rerender(doc);
        }
        return;
      }
      const disk = await vscode.workspace.fs.readFile(doc.uri).then((b) => decoder.decode(b), () => undefined);
      const prev = { disk: doc.state.disk, raw: doc.state.raw };
      const r = followRename(doc.state, updates ?? [], disk);
      if (r.kind === "reloaded") this.rerender(doc);
      else if (r.kind === "write") {
        try {
          await this.writeOwn(doc, r.text);
        } catch (e) {
          doc.state.disk = prev.disk; // the text never landed
          doc.state.raw = prev.raw;
          throw e;
        }
      }
    } catch (e) {
      this.log(`diagram rename follow failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The id names a node or line of the diagram as drawn (cheap: the view model is at hand). */
  private inView(doc: SysmlDiagramDocument, id: string): boolean {
    const vm = doc.state.viewModel;
    return id.length > 0 && id.length <= 500 && (!vm || vm.nodes.some((n) => n.id === id) || vm.edges.some((e) => e.id === id));
  }

  private post(p: Panel, m: HostToWebview): void {
    void p.panel.webview.postMessage(m);
  }

  // ---- agent support ---------------------------------------------------------------------

  /** The document open in an editor for `uri`, if any. */
  openDocument(uri: vscode.Uri): SysmlDiagramDocument | undefined {
    return this.docs.get(uri.toString());
  }

  /**
   * What the user is looking at: the diagram in the active tab, else the diagram panel that was active last if it is still visible
   * (`focused` says which), with its hover and selection, and the other open diagrams.
   */
  editorState(): { active?: { uri: string; focused: boolean; hover?: string; selection: string[] }; open: string[] } {
    let doc = this.activeDocument();
    let focused = true;
    let p: Panel | undefined;
    if (doc) {
      const panels = [...(this.panels.get(doc.key) ?? [])];
      p = panels.find((x) => x.panel.active && x.panel.visible) ?? panels.find((x) => x.panel.visible);
    } else {
      const last = this.lastActive;
      if (last && this.panels.get(last.doc.key)?.has(last.p) && last.p.panel.visible) { doc = last.doc; p = last.p; focused = false; }
    }
    const open = [...this.docs.keys()].filter((k) => k !== doc?.key);
    if (!doc) return { open };
    return { active: { uri: doc.key, focused, ...(p?.hover !== undefined ? { hover: p.hover } : {}), selection: [...(p?.selection ?? doc.selection)] }, open };
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
    const p: Panel = { panel, ready: false, selection: [] };
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
      if (!this.runCommand(doc, "autoLayout", true)) throw new Error("the diagram editor is not ready");
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

  private async exportPng(uri: vscode.Uri | string, theme: PngTheme, maxWidth?: number, panels = false): Promise<string> {
    const r = await this.request<"pngResult">(uri, (requestId) => ({ type: "exportPng", requestId, theme, ...(maxWidth !== undefined ? { maxWidth } : {}), ...(panels ? { panels: true } : {}) }));
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
    pngWindow: (uri, theme) => this.exportPng(uri, theme, 1800, true),
    gesture: async (uri, gesture) => {
      const r = await this.request<"gestureResult">(uri, (requestId) => ({ type: "testGesture", requestId, gesture }));
      if (r.error) throw new Error(`gesture ${gesture.kind} failed in the webview: ${r.error}`);
    },
    setUi: (ui) => { this.ui = ui ? { ...defaultUi, ...ui } : defaultUi; },
    activeUri: () => this.activeDocument()?.uri.toString(),
    hoverOf: (uri) => [...(this.panels.get(uri.toString()) ?? [])].map((x) => x.hover).find((h) => h !== undefined),
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
      return { errorPage: !d.state.doc, dirty: d.state.dirty, pending: d.pending, problems: d.state.problems ?? [], ...(d.state.doc ? { doc: d.state.doc } : {}) };
    },
    errors: () => [...this.errorLog],
  };
}


