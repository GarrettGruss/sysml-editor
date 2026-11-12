/**
 * The `.sysmld` custom editor: the VS Code adapter around `DiagramState`. Layout and drawing
 * happen in the webview (design D7); this file only owns documents, messages and files.
 */
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import type { HostToWebview, NodeBox, WebviewToHost } from "./protocol.js";
import { makeSourceMapper } from "./resolve.js";
import { DiagramState, applyLayout, refresh } from "./session.js";
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
    let state: DiagramState;
    if (ctx.backupId) {
      state = new DiagramState("");
      state.loadDirty(decoder.decode(await vscode.workspace.fs.readFile(vscode.Uri.parse(ctx.backupId))));
    } else {
      state = new DiagramState(decoder.decode(await vscode.workspace.fs.readFile(uri)));
    }
    const doc = new SysmlDiagramDocument(uri, state);
    this.docs.set(uri.toString(), doc);
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), uri.path.split("/").pop()!));
    const onDisk = async () => {
      if (doc.state.dirty) return;
      try {
        const text = decoder.decode(await vscode.workspace.fs.readFile(uri));
        if (text === doc.state.raw) return;
        doc.state.load(text);
        this.rerender(doc);
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
    // A file that did not parse is never overwritten.
    if (!doc.state.doc) return;
    await vscode.workspace.fs.writeFile(doc.uri, encoder.encode(doc.state.text()));
    doc.state.markSaved();
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
    webviewPanel.onDidDispose(() => this.panels.get(key)?.delete(p));
    webview.onDidReceiveMessage((m: WebviewToHost) => this.onMessage(doc, p, m));
    const nonce = randomBytes(16).toString("base64");
    webview.html = doc.state.doc
      ? this.page(webview, root, nonce, `<script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(root, "diagram.js"))}"></script>`)
      : this.page(webview, root, nonce, this.errorBody(doc, nonce));
    // The model must have loaded before references can resolve.
    void this.model.ready.then(() => this.rerender(doc), () => this.rerender(doc));
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
        this.rerender(doc);
        break;
      case "layoutChanged":
        this.onLayout(doc, m.nodes);
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

  private onLayout(doc: SysmlDiagramDocument, nodes: NodeBox[]): void {
    const cur = doc.state.doc;
    const next = cur && applyLayout(cur, nodes);
    if (next) this.edit(doc, next, "Auto-layout");
  }

  /** Apply `next` as one undoable edit. */
  private edit(doc: SysmlDiagramDocument, next: FileDoc, label: string): void {
    const e = doc.state.apply(next);
    const redraw = () => {
      doc.state.snapshot = undefined; // an undone rename must not be detected again
      this.rerender(doc);
    };
    this._onDidChange.fire({ document: doc, label, undo: () => { e.undo(); redraw(); }, redo: () => { e.redo(); redraw(); } });
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

  /** Re-resolve, apply detected renames as one edit, and send the view model to every ready panel. */
  private rerender(doc: SysmlDiagramDocument): void {
    const r = refresh(doc.state, this.model.index, this.opts(doc));
    if (!r) return;
    if (r.renamed) this.edit(doc, r.renamed, "Follow rename");
    for (const p of this.panels.get(doc.uri.toString()) ?? []) if (p.ready) this.post(p, { type: "render", viewModel: r.viewModel });
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
    png: async (uri) => (await this.request<"pngResult">(uri, (requestId) => ({ type: "exportPng", requestId, theme: "light" }))).base64,
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


