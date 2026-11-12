/** The requirements editor: a webview panel with a Table and a Document view of a package or file. */
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { DiagramUi } from "../diagram/diagram-editor.js";
import type { Element, ModelIndex } from "../model/index.js";
import type { ModelActions } from "../model-service/interactive.js";
import type { ModelService } from "../model-service/service.js";
import { nodeForElement, resolveNode, type ModelNode } from "../tree/tree-model.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import { RequirementsController, type Navigation, type PickItem, type RequirementsUi } from "./controller.js";
import type { Gesture, HostToWebview, Intent, RequirementsMetrics, RequirementsScope, ViewMode, WebviewToHost } from "./protocol.js";
import { buildState, scopeRoot } from "./view-model.js";

export const REQUIREMENTS_VIEW_TYPE = "sysml.requirements";
const REQUEST_TIMEOUT_MS = 30_000;

export interface RequirementsTestApi {
  /** Open the editor on a scope and wait until it has rendered. */
  open(scope: RequirementsScope, view?: ViewMode): Promise<void>;
  close(scope: RequirementsScope): Promise<void>;
  metrics(scope: RequirementsScope): Promise<RequirementsMetrics>;
  /** A PNG (base64) of the current view and theme. */
  png(scope: RequirementsScope): Promise<string>;
  gesture(scope: RequirementsScope, g: Gesture): Promise<void>;
  /** Run an intent as the webview would send it (the real path from the controller down). */
  intent(scope: RequirementsScope, intent: Intent): Promise<{ ok: boolean; message?: string }>;
  setView(scope: RequirementsScope, view: ViewMode): Promise<void>;
  /** Replace the questions asked of the user (undefined restores them). */
  setUi(ui?: Partial<RequirementsUi>): void;
  /** What the editor was asked to do for navigation, in order. */
  navigation(): string[];
  errors(): string[];
  /** Wait until the editor has rendered everything the model says now. */
  settled(scope: RequirementsScope): Promise<void>;
  scopeFromNode(node: ModelNode): RequirementsScope | undefined;
}

interface Panel {
  panel: vscode.WebviewPanel;
  scope: RequirementsScope;
  ready: boolean;
  view: ViewMode;
  generation: number;
  lastHash?: string;
}

export const scopeKey = (s: RequirementsScope): string => (s.kind === "package" ? `package:${s.qualifiedName}` : `file:${s.uri}`);

function titleOf(s: RequirementsScope): string {
  return `Requirements: ${s.kind === "package" ? s.qualifiedName : decodeURIComponent(s.uri.split("/").pop() ?? s.uri)}`;
}

export class RequirementsEditor implements vscode.Disposable {
  private readonly panels = new Map<string, Panel>();
  private readonly subs: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;
  private readonly pending = new Map<number, (m: WebviewToHost) => void>();
  private readonly errorLog: string[] = [];
  private readonly navLog: string[] = [];
  private uiOverride: Partial<RequirementsUi> = {};
  revealInTree?: (el: Element) => void;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: WorkspaceModel,
    private readonly service: ModelService,
    private readonly actions: ModelActions,
    private readonly diagramUi: () => DiagramUi,
  ) {
    this.subs.push(this.model.index.onDidChange(() => this.schedule()));
    this.subs.push(vscode.window.registerWebviewPanelSerializer(REQUIREMENTS_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel, state: { scope?: RequirementsScope; view?: ViewMode } | undefined) => {
        if (!state?.scope) {
          panel.dispose();
          return;
        }
        this.attach(panel, state.scope, state.view ?? "table");
      },
    }));
  }

  private get index(): ModelIndex {
    return this.model.index;
  }

  // ---- questions and navigation --------------------------------------------------------------

  private readonly ui: RequirementsUi = {
    confirm: (m, d, a) => (this.uiOverride.confirm ?? ((mm, dd, aa) => this.diagramUi().confirm(mm, dd, aa)))(m, d, a),
    pickOne: async (items, title) => {
      if (this.uiOverride.pickOne) return this.uiOverride.pickOne(items, title);
      const r = await this.diagramUi().pick(items.map((i) => ({ label: i.label, ...(i.description ? { description: i.description } : {}), id: i.id })), { title, placeHolder: "Type to filter", matchOnDescription: true });
      return r?.id;
    },
    pickMany: async (items, title) => {
      if (this.uiOverride.pickMany) return this.uiOverride.pickMany(items, title);
      const r = await vscode.window.showQuickPick(items.map((i) => ({ label: i.label, ...(i.description ? { description: i.description } : {}), id: i.id })), { title, canPickMany: true, matchOnDescription: true });
      return r?.map((x) => x.id);
    },
    pickVerification: async (cases: PickItem[], title) => {
      if (this.uiOverride.pickVerification) return this.uiOverride.pickVerification(cases, title);
      const create = "\0new";
      const r = await this.diagramUi().pick([{ label: "$(add) New verification case...", id: create, description: "" }, ...cases.map((c) => ({ label: c.label, ...(c.description ? { description: c.description } : {}), id: c.id }))], { title, placeHolder: "Choose a verification case" });
      if (!r) return undefined;
      if (r.id !== create) return { existing: r.id };
      const name = await this.diagramUi().input({ prompt: "Name of the new verification case" });
      return name?.trim() ? { create: name.trim() } : undefined;
    },
    inputName: (p) => (this.uiOverride.inputName ? this.uiOverride.inputName(p) : Promise.resolve(this.diagramUi().input({ prompt: p }))),
    report: (r, what) => (this.uiOverride.report ? this.uiOverride.report(r, what) : void this.actions.report(r, what)),
  };

  private readonly nav: Navigation = {
    revealInTree: (el) => {
      this.navLog.push(`tree ${el.qualifiedName}`);
      this.revealInTree?.(el);
    },
    goToText: (el) => {
      this.navLog.push(`text ${el.qualifiedName}`);
      const range = el.nameRange ?? el.range;
      void vscode.window.showTextDocument(vscode.Uri.parse(el.uri), { selection: new vscode.Range(range.start.line, range.start.column, range.end.line, range.end.column), viewColumn: vscode.ViewColumn.Beside });
    },
    showInDiagram: (el) => {
      this.navLog.push(`diagram ${el.qualifiedName}`);
      const node = nodeForElement(this.index, el);
      if (node) void vscode.commands.executeCommand("sysml.showInDiagram", node);
    },
  };

  private controller(scope: RequirementsScope): RequirementsController {
    return new RequirementsController(this.service, this.index, this.ui, this.nav, () => scopeRoot(this.index, scope)?.qualifiedName);
  }

  // ---- panels --------------------------------------------------------------------------------

  /** Open (or reveal) the editor for a scope. */
  async open(scope: RequirementsScope, view: ViewMode = "table"): Promise<void> {
    const key = scopeKey(scope);
    const existing = this.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const panel = vscode.window.createWebviewPanel(REQUIREMENTS_VIEW_TYPE, titleOf(scope), vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [root], retainContextWhenHidden: true });
    this.attach(panel, scope, view);
  }

  private attach(panel: vscode.WebviewPanel, scope: RequirementsScope, view: ViewMode): void {
    const key = scopeKey(scope);
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    panel.title = titleOf(scope);
    const p: Panel = { panel, scope, ready: false, view, generation: 0 };
    this.panels.set(key, p);
    panel.onDidDispose(() => {
      if (this.panels.get(key) === p) this.panels.delete(key);
    });
    panel.webview.options = { enableScripts: true, localResourceRoots: [root] };
    panel.webview.onDidReceiveMessage((m: WebviewToHost) => void this.onMessage(p, m));
    const nonce = randomBytes(16).toString("base64");
    const csp = ["default-src 'none'", `style-src ${panel.webview.cspSource}`, `script-src 'nonce-${nonce}'`, `img-src ${panel.webview.cspSource} data:`, `font-src ${panel.webview.cspSource}`].join("; ");
    const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, "requirements.css"));
    const js = panel.webview.asWebviewUri(vscode.Uri.joinPath(root, "requirements.js"));
    panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${css}"><title>Requirements</title></head><body><div id="app"></div><script nonce="${nonce}" src="${js}"></script></body></html>`;
  }

  private post(p: Panel, m: HostToWebview): void {
    try {
      void Promise.resolve(p.panel.webview.postMessage(m)).then(undefined, () => undefined);
    } catch {
      // the panel was closed while an operation was running
    }
  }

  private async render(p: Panel, force = false): Promise<void> {
    if (!p.ready) return;
    await this.model.ready.catch(() => undefined);
    const state = buildState(this.index, p.scope, (uri) => this.service.blockedReason(uri) === undefined);
    const hash = JSON.stringify(state);
    if (!force && hash === p.lastHash) return;
    p.lastHash = hash;
    p.generation++;
    this.post(p, { type: "render", state, scope: p.scope, view: p.view, generation: p.generation });
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      for (const p of this.panels.values()) void this.render(p);
    }, 120);
  }

  private async onMessage(p: Panel, m: WebviewToHost): Promise<void> {
    switch (m.type) {
      case "ready":
        p.ready = true;
        p.lastHash = undefined;
        await this.render(p);
        break;
      case "viewChanged":
        p.view = m.view;
        break;
      case "error":
        this.errorLog.push(m.message.slice(0, 400));
        break;
      case "intent":
        await this.handleIntent(p, m.intent);
        break;
      case "metricsResult":
      case "pngResult":
      case "gestureResult":
        this.pending.get(m.requestId)?.(m);
        break;
    }
  }

  private async handleIntent(p: Panel, intent: Intent): Promise<{ ok: boolean; message?: string }> {
    let result: { ok: boolean; message?: string };
    try {
      result = await this.controller(p.scope).handle(intent);
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    if (!result.ok && result.message) this.post(p, { type: "notice", level: "error", message: result.message });
    else if (result.message !== "cancelled") this.post(p, { type: "notice", level: "info", message: "" });
    // Always draw what the model says now (a refused edit must not leave a changed field on screen).
    await this.render(p, true);
    return result;
  }

  // ---- test support --------------------------------------------------------------------------

  private request<T extends WebviewToHost["type"]>(scope: RequirementsScope, make: (id: number) => HostToWebview): Promise<Extract<WebviewToHost, { type: T }>> {
    const p = this.panels.get(scopeKey(scope));
    if (!p?.ready) return Promise.reject(new Error(`no ready requirements editor for ${scopeKey(scope)}`));
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`the requirements webview did not answer within ${REQUEST_TIMEOUT_MS} ms (errors: ${this.errorLog.join(" | ")})`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, (m) => {
        clearTimeout(t);
        this.pending.delete(id);
        resolve(m as Extract<WebviewToHost, { type: T }>);
      });
      this.post(p, make(id));
    });
  }

  readonly testApi: RequirementsTestApi = {
    open: async (scope, view = "table") => {
      // A new webview can be slow to come up (or, the first time in a session, not at all while its group is not visible): ask again with a fresh panel.
      for (let attempt = 0; attempt < 4; attempt++) {
        await this.open(scope, view);
        const p = this.panels.get(scopeKey(scope))!;
        const end = performance.now() + 30_000;
        while (!p.ready || p.generation === 0) {
          if (performance.now() > end) break;
          await new Promise((r) => setTimeout(r, 40));
        }
        if (p.ready && p.generation > 0) {
          if (p.view !== view) await this.testApi.setView(scope, view);
          return;
        }
        p.panel.dispose();
      }
      throw new Error(`the requirements editor for ${scopeKey(scope)} did not render (errors: ${this.errorLog.join(" | ")})`);
    },
    close: async (scope) => {
      this.panels.get(scopeKey(scope))?.panel.dispose();
    },
    metrics: async (scope) => (await this.request<"metricsResult">(scope, (requestId) => ({ type: "getMetrics", requestId }))).metrics,
    png: async (scope) => {
      const r = await this.request<"pngResult">(scope, (requestId) => ({ type: "exportPng", requestId }));
      if (r.error || !r.base64) throw new Error(r.error ?? "empty PNG");
      return r.base64;
    },
    gesture: async (scope, gesture) => {
      const r = await this.request<"gestureResult">(scope, (requestId) => ({ type: "testGesture", requestId, gesture }));
      if (r.error) throw new Error(`gesture ${gesture.kind} failed in the webview: ${r.error}`);
    },
    intent: (scope, intent) => {
      const p = this.panels.get(scopeKey(scope));
      if (!p) return Promise.reject(new Error("no requirements editor for the scope"));
      return this.handleIntent(p, intent);
    },
    setView: async (scope, view) => {
      const p = this.panels.get(scopeKey(scope));
      if (!p) throw new Error("no requirements editor for the scope");
      p.view = view;
      this.post(p, { type: "setView", view });
      await this.request<"metricsResult">(scope, (requestId) => ({ type: "getMetrics", requestId }));
    },
    setUi: (ui) => {
      this.uiOverride = ui ?? {};
    },
    navigation: () => [...this.navLog],
    errors: () => [...this.errorLog],
    settled: async (scope) => {
      const p = this.panels.get(scopeKey(scope));
      if (!p) throw new Error("no requirements editor for the scope");
      await this.service.ready();
      clearTimeout(this.timer);
      await this.render(p);
      await this.request<"metricsResult">(scope, (requestId) => ({ type: "getMetrics", requestId }));
    },
    scopeFromNode: (node) => this.scopeOf(resolveNode(this.index, node)),
  };

  /** The scope a command opens for an element: a package, or the file that holds the element. */
  scopeOf(el: Element | undefined): RequirementsScope | undefined {
    if (!el) return undefined;
    if ((el.kind === "package" || el.kind === "library package") && el.qualifiedName !== undefined) return { kind: "package", qualifiedName: el.qualifiedName };
    return undefined;
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const p of this.panels.values()) p.panel.dispose();
    this.panels.clear();
    for (const s of this.subs) s.dispose();
  }
}
