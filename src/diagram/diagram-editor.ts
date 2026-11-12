/**
 * The `.sysmld` custom editor: the VS Code adapter around `DiagramState`. Layout and drawing
 * happen in the webview (design D7); this file only owns documents, messages and files.
 */
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import type { HostToWebview, WebviewToHost } from "./protocol.js";
import { makeSourceMapper } from "./resolve.js";
import { DiagramState, decideSave, followRename, hashViewModel, noteExternalChange, refresh } from "./session.js";
import type { DiagramDocument as FileDoc, DiagramDocument as DiagramFile, DiagramProblem } from "./format.js";

export const VIEW_TYPE = "sysml.diagram";
const REFRESH_DEBOUNCE_MS = 150;
const REQUEST_TIMEOUT_MS = 30_000;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class SysmlDiagramDocument implements vscode.CustomDocument {
  readonly changed = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [];
  constructor(readonly uri: vscode.Uri, readonly state: DiagramState) {}
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
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly extensionUri: vscode.Uri, private readonly model: WorkspaceModel, private readonly log: (m: string) => void = () => {}) {
    this.subs.push(this.model.index.onDidChange(() => this.scheduleRefresh()), this._onDidChange);
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
        const change = noteExternalChange(doc.state, await read(uri));
        if (change === "reload") this.rerender(doc);
        else if (change === "conflict") {
          void vscode.window.showWarningMessage(`${uri.path.split("/").pop()} changed on disk while it has unsaved changes. Saving will ask whether to overwrite it.`);
        }
      } catch {
        /* deleted: keep what is open */
      }
    };
    doc.onDispose(watcher, watcher.onDidChange(() => void onDisk()), watcher.onDidCreate(() => void onDisk()), {
      dispose: () => this.docs.delete(uri.toString()),
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
      await vscode.workspace.fs.writeFile(doc.uri, encoder.encode(s.text()));
    } catch (e) {
      s.disk = previous;
      throw e;
    }
    s.markSaved();
  }

  async saveCustomDocumentAs(doc: SysmlDiagramDocument, dest: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.writeFile(dest, encoder.encode(doc.state.text()));
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
    const key = doc.uri.toString();
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
    switch (m.type) {
      case "ready":
        p.ready = true;
        p.lastHash = undefined;
        this.rerender(doc);
        break;
      case "layoutChanged":
        doc.state.mergeLayout(Array.isArray(m.nodes) ? m.nodes : []); // held in memory until the next save
        break;
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
    for (const p of this.panels.get(doc.uri.toString()) ?? []) this.syncPage(doc, p);
    const r = refresh(doc.state, this.model.index, this.opts(doc));
    if (!r) return;
    if (r.updates) void this.followRename(doc, r.updates);
    for (const p of this.panels.get(doc.uri.toString()) ?? []) {
      if (!p.ready) continue;
      const h = hashViewModel(r.viewModel);
      if (h === p.lastHash) continue;
      p.lastHash = h;
      this.post(p, { type: "render", viewModel: r.viewModel });
    }
  }

  private async followRename(doc: SysmlDiagramDocument, updates: NonNullable<ReturnType<typeof refresh>>["updates"]): Promise<void> {
    try {
      const disk = await vscode.workspace.fs.readFile(doc.uri).then((b) => decoder.decode(b), () => undefined);
      const r = followRename(doc.state, updates ?? [], disk);
      if (r.kind === "reloaded") this.rerender(doc);
      else if (r.kind === "write") await vscode.workspace.fs.writeFile(doc.uri, encoder.encode(r.text));
    } catch (e) {
      this.log(`diagram rename follow failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private post(p: Panel, m: HostToWebview): void {
    void p.panel.webview.postMessage(m);
  }

  // ---- test support ----------------------------------------------------------------------

  private request<T extends WebviewToHost["type"]>(uri: vscode.Uri, make: (id: number) => HostToWebview): Promise<Extract<WebviewToHost, { type: T }>> {
    const p = [...(this.panels.get(uri.toString()) ?? [])].find((x) => x.ready);
    if (!p) return Promise.reject(new Error(`no ready diagram panel for ${uri.toString()}`));
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`diagram webview did not answer within ${REQUEST_TIMEOUT_MS} ms (errors: ${this.errorLog.join(" | ")})`)); }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: (m) => { clearTimeout(t); this.pending.delete(id); resolve(m as Extract<WebviewToHost, { type: T }>); }, reject });
      this.post(p, make(id));
    });
  }

  readonly testApi: DiagramTestApi = {
    open: async (uri) => {
      await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE);
      const end = Date.now() + 30_000;
      while (![...(this.panels.get(uri.toString()) ?? [])].some((p) => p.ready)) {
        if (Date.now() > end) throw new Error(`diagram editor for ${uri.toString()} did not become ready`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    metrics: (uri) => this.request<"metricsResult">(uri, (requestId) => ({ type: "getMetrics", requestId })),
    png: async (uri) => {
      const r = await this.request<"pngResult">(uri, (requestId) => ({ type: "exportPng", requestId, theme: "light" }));
      if (r.error || !r.base64) throw new Error(r.error ?? "PNG export returned an empty image");
      return r.base64;
    },
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


