/**
 * The VS Code side of the UI-control tools (D55, D57, D58, D60): the gate, the audit channel, command running, and the
 * recording of the questions the editor asks while an agent drives it. The logic that needs no `vscode` is in
 * `agent-tools/ui-support.ts`.
 */
import * as vscode from "vscode";
import {
  type AnswerOutcome, type CommandOutcome, type DiagramGesture, type DiagramObservation, type RequirementsAction, type RequirementsObservation, type RequirementsScopeArg,
  type ScreenshotTarget, type TreeNodeInfo, type TreeOutcome, type UiAnswer, type UiDriver, type UiGate, type UiPrompt, type UiState,
} from "./agent-tools/ui-driver.js";
import { MessageLog, PromptBroker, resolveInWorkspace, saveAnswerAllowed, runUntilPromptOrDone, type PromptResult } from "./agent-tools/ui-support.js";
import type { DiagramEditorProvider, DiagramUi } from "./diagram/diagram-editor.js";
import { VIEW_TYPE as DIAGRAM_VIEW_TYPE } from "./diagram/diagram-editor.js";
import type { RequirementsEditor } from "./requirements/editor.js";
import type { RequirementsScope } from "./requirements/protocol.js";
import type { ModelTreeProvider } from "./tree/tree-provider.js";
import type { ModelNode } from "./tree/tree-model.js";
import type { NewEntryTestApi } from "./tree/new-entry-flow.js";
import { setMessageSink } from "./ui-messages.js";

export const UI_CONTROL_SETTING = "sysml.agent.uiControl";
export const AGENT_UI_CHANNEL = "SysML Agent UI";
/** Id of the New File / New Folder input box in the prompt list (it is not recorded by the broker). */
export const NEW_ENTRY_PROMPT_ID = 999_999;

/** A command still running after this long is reported as not completed. */
const COMMAND_WAIT_MS = 15_000;

export interface UiDriverDeps {
  diagrams: DiagramEditorProvider;
  requirements: RequirementsEditor;
  newEntry(): NewEntryTestApi | undefined;
  tree: { provider: ModelTreeProvider; view: vscode.TreeView<ModelNode> };
  log(message: string): void;
  /** Command ids from this extension's `contributes.commands`. */
  ownCommands: string[];
}

/** Turn `file:` URI strings back into editor URIs, recursively (they were validated against the workspace). */
function toEditorArgs(v: unknown): unknown {
  if (typeof v === "string") return /^file:/i.test(v) ? vscode.Uri.parse(v) : v;
  if (Array.isArray(v)) return v.map(toEditorArgs);
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toEditorArgs(x)]));
  return v;
}

export class VsCodeUiDriver implements UiDriver, vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel(AGENT_UI_CHANNEL);
  private readonly recent: string[] = [];
  private readonly messages = new MessageLog();
  private readonly broker: PromptBroker;
  private readonly subs: vscode.Disposable[] = [];
  private lastCall = 0;
  /** Agent commands and gestures running now; only their questions are routed to the agent. */
  private inFlight = 0;

  constructor(private readonly deps: UiDriverDeps, timeoutMs?: number) {
    this.broker = new PromptBroker(timeoutMs, (p) => this.channel.appendLine(`prompt ${p.id} (${p.kind}) timed out and was cancelled`));
    setMessageSink((level, text) => this.messages.add(level, text));
    deps.diagrams.uiLayer = (base) => this.layer(base);
    this.subs.push(
      this.channel,
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(UI_CONTROL_SETTING) && !this.gate().enabled) this.broker.cancelAll();
      }),
    );
  }

  gate(): UiGate {
    // User settings only: a workspace value cannot turn this on (the setting is application-scoped as well).
    const enabled = vscode.workspace.getConfiguration().inspect<boolean>(UI_CONTROL_SETTING)?.globalValue === true;
    return { enabled, trusted: vscode.workspace.isTrusted };
  }

  ownCommands(): string[] {
    return this.deps.ownCommands;
  }

  /** Run `f` as an agent action: prompts it causes go to the agent, and only while it runs. */
  private async agentAction<T>(f: () => Promise<T>): Promise<T> {
    this.inFlight++;
    try {
      return await f();
    } finally {
      this.inFlight--;
    }
  }

  workspaceRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file").map((f) => f.uri.fsPath);
  }

  audit(line: string): void {
    this.lastCall = Date.now();
    const stamped = `${new Date().toISOString()} ${line}`;
    this.channel.appendLine(stamped);
    this.recent.push(stamped);
    if (this.recent.length > 200) this.recent.shift();
  }

  /** TEST ONLY: the last audit lines written to the channel, which a test cannot read back. */
  auditLines(): string[] {
    return [...this.recent];
  }

  /** Called by the other UI tools (gestures, menus) so questions they cause are routed to the agent. */
  touch(): void {
    this.lastCall = Date.now();
  }

  private routing(): boolean {
    const g = this.gate();
    return g.enabled && g.trusted && (this.inFlight > 0 || this.broker.list().length > 0);
  }

  // ---- the questions the diagram and requirements editors ask --------------------------------------

  private layer(base: DiagramUi): DiagramUi {
    const ask = (spec: Parameters<PromptBroker["ask"]>[0]): Promise<PromptResult> => this.broker.ask(spec);
    const labelOf = (i: vscode.QuickPickItem) => i.label;
    return {
      ...base,
      pick: async (items, options) => {
        if (!this.routing()) return base.pick(items, options);
        const r = await ask({ kind: "pick", ...(options.title ? { title: options.title } : {}), ...(options.placeHolder ? { message: options.placeHolder } : {}), items: items.map(labelOf) });
        return r.cancelled ? undefined : items.find((i) => i.label === r.picked);
      },
      pickMany: async (items, options) => {
        if (!this.routing()) return base.pickMany(items, options);
        const r = await ask({ kind: "multiPick", ...(options.title ? { title: options.title } : {}), items: items.map(labelOf), picked: items.filter((i) => i.picked).map(labelOf) });
        return r.cancelled || !r.pickedMany ? undefined : items.filter((i) => r.pickedMany!.includes(i.label));
      },
      input: async (options) => {
        if (!this.routing()) return base.input(options);
        const check = options.validateInput;
        const validate = check
          ? (v: string): string | undefined => {
              const m = check(v);
              if (m && typeof m === "object" && "message" in m) return m.severity === vscode.InputBoxValidationSeverity.Error ? m.message : undefined;
              return typeof m === "string" && m ? m : undefined; // an asynchronous validator is not consulted
            }
          : undefined;
        const r = await ask({ kind: "input", ...(options.title ? { title: options.title } : {}), ...(options.prompt ? { message: options.prompt } : {}), ...(options.value !== undefined ? { value: options.value } : {}), ...(validate ? { validate } : {}) });
        return r.cancelled ? undefined : r.text;
      },
      confirm: async (message, detail, action) => {
        if (!this.routing()) return base.confirm(message, detail, action);
        const r = await ask({ kind: "confirm", title: action, message: detail ? `${message}\n${detail}` : message });
        return !r.cancelled && r.confirmed === true;
      },
      choose: async (message, actions) => {
        if (!this.routing()) return base.choose(message, actions);
        const r = await ask({ kind: "choice", message, items: [...actions] });
        return r.cancelled ? undefined : r.picked;
      },
      fail: async (f) => {
        if (!this.routing()) return base.fail(f);
        this.messages.add("warning", f.reason);
      },
      saveAs: async (suggested) => {
        if (!this.routing()) return base.saveAs(suggested);
        const r = await ask({ kind: "save", title: "Save Diagram", value: suggested.fsPath });
        return r.cancelled || !r.path ? undefined : vscode.Uri.file(r.path);
      },
      saveFile: async (suggested, title, filters) => {
        if (!this.routing()) return base.saveFile(suggested, title, filters);
        const r = await ask({ kind: "save", title, value: suggested?.fsPath ?? "" });
        return r.cancelled || !r.path ? undefined : vscode.Uri.file(r.path);
      },
      saveImage: async (suggested) => {
        if (!this.routing()) return base.saveImage(suggested);
        const r = await ask({ kind: "save", title: "Save Diagram as Image", value: suggested.fsPath });
        return r.cancelled || !r.path ? undefined : vscode.Uri.file(r.path);
      },
    };
  }

  // ---- commands and prompts -------------------------------------------------------------------------

  prompts(): UiPrompt[] {
    const list = this.broker.list();
    const ne = this.deps.newEntry()?.active();
    if (ne) {
      list.push({
        id: NEW_ENTRY_PROMPT_ID,
        kind: "input",
        title: ne.kind === "file" ? "New SysML File" : "New Folder",
        value: ne.value,
        ...(ne.validation ? { validation: ne.validation.message } : {}),
      });
    }
    return list;
  }

  runCommand(id: string, args: unknown[]): Promise<CommandOutcome> {
    return this.execute(id, args.map(toEditorArgs));
  }

  /** Run a command with arguments that are already editor values. */
  private execute(id: string, args: unknown[]): Promise<CommandOutcome> {
    return this.agentAction(() => this.executeInner(id, args));
  }

  private async executeInner(id: string, args: unknown[]): Promise<CommandOutcome> {
    this.touch();
    let run: Promise<unknown>;
    try {
      run = Promise.resolve(vscode.commands.executeCommand(id, ...args));
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e), prompts: this.prompts() };
    }
    // Questions the command asks after it returned (a second prompt) still belong to the agent until it settles.
    this.inFlight++;
    const leave = () => void this.inFlight--;
    run.then(leave, leave);
    // A command left waiting on a prompt may fail later; that is logged, not lost.
    run.catch((e: unknown) => this.channel.appendLine(`command ${id} failed after it returned: ${e instanceof Error ? e.message : String(e)}`));
    try {
      const r = await runUntilPromptOrDone(run, this.broker, COMMAND_WAIT_MS);
      if (!r.settled) return { ok: true, completed: false, prompts: this.prompts() };
      const result = r.value === undefined || r.value === null ? undefined : toJsonResult(r.value);
      return { ok: true, completed: true, ...(result !== undefined ? { result } : {}), prompts: this.prompts() };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e), prompts: this.prompts() };
    }
  }

  async answer(promptId: number | undefined, a: UiAnswer): Promise<AnswerOutcome> {
    this.touch();
    const entry = this.deps.newEntry();
    const useEntry = promptId === NEW_ENTRY_PROMPT_ID || (promptId === undefined && this.broker.list().length === 0 && entry?.active() !== undefined);
    if (!useEntry) return this.broker.answer(promptId, a, (p, suggested) => {
      const abs = resolveInWorkspace(p, this.workspaceRoots());
      return abs !== undefined && saveAnswerAllowed(abs, suggested) ? abs : undefined;
    });
    const refuse = (reason: string, validation?: string): AnswerOutcome => ({ ok: false, reason, ...(validation !== undefined ? { validation } : {}), remaining: this.prompts() });
    if (!entry?.active()) return refuse("No prompt is open.");
    if (a.kind === "cancel") {
      await entry.cancel();
      return { ok: true, remaining: this.prompts() };
    }
    if (a.kind !== "text") return refuse('The New File / New Folder input box takes a "text" answer.');
    entry.type(a.text);
    const v = entry.active()?.validation;
    if (v?.severity === "error") return refuse("The value was rejected; the input box stays open.", v.message);
    await entry.accept();
    const still = entry.active();
    if (still?.validation?.severity === "error") return refuse("The value was rejected; the input box stays open.", still.validation.message);
    return { ok: true, remaining: this.prompts() };
  }

  // ---- observation ----------------------------------------------------------------------------------

  async state(): Promise<UiState> {
    const rel = (uri: vscode.Uri) => vscode.workspace.asRelativePath(uri, false);
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    let activeEditor: UiState["activeEditor"];
    if (tab) {
      const input = tab.input;
      if (input instanceof vscode.TabInputCustom) activeEditor = { kind: input.viewType === DIAGRAM_VIEW_TYPE ? "diagram" : input.viewType, path: rel(input.uri), dirty: tab.isDirty };
      else if (input instanceof vscode.TabInputText) activeEditor = { kind: "text", path: rel(input.uri), dirty: tab.isDirty };
      else if (input instanceof vscode.TabInputWebview) activeEditor = { kind: tab.label.startsWith("Requirements:") ? "requirements" : "webview", path: tab.label, dirty: tab.isDirty };
      else activeEditor = { kind: "other", path: tab.label, dirty: tab.isDirty };
    }
    const es = this.deps.diagrams.editorState();
    const selection = es.active ? [{ path: rel(vscode.Uri.parse(es.active.uri)), ids: es.active.selection }] : [];
    const undo = this.deps.diagrams.undoLabels().map((u) => ({ path: rel(vscode.Uri.parse(u.uri)), ...(u.undo ? { undo: u.undo } : {}), ...(u.redo ? { redo: u.redo } : {}) }));
    let clipboard: UiState["clipboard"] = this.deps.diagrams.lastCopy ?? "none";
    if (clipboard === "none") {
      try {
        // The system clipboard can be unavailable (no display) and then never answers: do not wait for it.
        const text = await Promise.race([vscode.env.clipboard.readText(), new Promise<string>((r) => setTimeout(() => r(""), 750))]);
        if (text !== "") clipboard = "text";
      } catch {
        // No clipboard access: report none.
      }
    }
    return {
      ...(activeEditor ? { activeEditor } : {}),
      selection,
      menus: [],
      undo,
      messages: this.messages.drain(),
      prompts: this.prompts(),
      navigation: this.deps.requirements.testApi.navigation(),
      clipboard,
    };
  }

  // ---- webviews and the tree -------------------------------------------------------------------------

  diagramGesture(path: string, gesture: DiagramGesture): Promise<DiagramObservation> {
    return this.agentAction(() => this.diagramGestureInner(path, gesture));
  }

  private async diagramGestureInner(path: string, gesture: DiagramGesture): Promise<DiagramObservation> {
    this.touch();
    const uri = vscode.Uri.file(path);
    const api = this.deps.diagrams.testApi;
    await api.open(uri);
    await api.gesture(uri, gesture);
    // A gesture that edits redraws a moment later: read until the boxes stop changing.
    let m = await api.metrics(uri);
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const next = await api.metrics(uri);
      const same = JSON.stringify(next.nodes) === JSON.stringify(m.nodes) && next.selected.join() === m.selected.join();
      m = next;
      if (same) break;
    }
    return {
      path: vscode.workspace.asRelativePath(uri, false),
      selected: m.selected,
      menu: m.menu,
      nodes: m.nodes.slice(0, 300).map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) })),
      edgeCount: m.edges.length,
      ...(m.legend ? { legend: m.legend } : {}),
      descriptions: m.descriptions,
      inlineEditor: m.inlineEditor,
      ...(m.inline ? { inline: m.inline } : {}),
      quickBar: m.quickBar,
      ...(m.tool ? { tool: m.tool } : {}),
      zoom: m.zoom,
      clipboard: this.deps.diagrams.lastCopy ?? "none",
    };
  }

  private scopeOf(s: RequirementsScopeArg): RequirementsScope {
    return s.kind === "package" ? { kind: "package", qualifiedName: s.qualifiedName } : { kind: "file", uri: vscode.Uri.file(s.path).toString() };
  }

  requirements(scopeArg: RequirementsScopeArg, action: RequirementsAction): Promise<RequirementsObservation> {
    return this.agentAction(() => this.requirementsInner(scopeArg, action));
  }

  private async requirementsInner(scopeArg: RequirementsScopeArg, action: RequirementsAction): Promise<RequirementsObservation> {
    this.touch();
    const scope = this.scopeOf(scopeArg);
    const api = this.deps.requirements.testApi;
    switch (action.kind) {
      case "open": await api.open(scope, action.view); break;
      case "view": await api.open(scope, action.view); await api.setView(scope, action.view); break;
      case "gesture": await api.open(scope); await api.gesture(scope, action.gesture); break;
      case "exportMatrix": await api.open(scope, "matrix"); await api.exportMatrix(scope, action.format, action.path); break;
      case "observe": await api.open(scope); break;
    }
    await api.settled(scope).catch(() => undefined);
    const m = await api.metrics(scope);
    return {
      view: m.view,
      scopeName: m.scopeName,
      outline: (m.document?.outline ?? []).slice(0, 200).map((o) => ({ number: o.number, heading: o.heading, level: o.level, items: o.items })),
      items: (m.document?.items ?? []).slice(0, 200).map((i) => ({ id: i.id, name: i.name, text: i.text.length > 300 ? `${i.text.slice(0, 300)}...` : i.text, number: i.number })),
      matrixRows: (m.matrix?.rows ?? []).slice(0, 200).map((r) => ({ qn: r.qn, kind: r.kind, number: r.number, id: r.id, satisfiedBy: r.satisfiedBy, verifiedBy: r.verifiedBy, status: r.status })),
      pendingEdits: m.pendingEdits ?? [],
      ...(m.notice ? { notice: m.notice } : {}),
      errors: m.errors ?? [],
    };
  }

  private readonly treeNodes = new Map<string, ModelNode>();

  private infoOf(node: ModelNode, depth: number): TreeNodeInfo {
    const item = this.deps.tree.provider.getTreeItem(node);
    const label = typeof item.label === "string" ? item.label : item.label?.label ?? node.id;
    const sel = new Set(this.deps.tree.view.selection.map((n) => n.id));
    return {
      id: node.id,
      label,
      ...(typeof item.description === "string" && item.description ? { description: item.description } : {}),
      contextValue: item.contextValue ?? "",
      depth,
      hasChildren: item.collapsibleState !== undefined && item.collapsibleState !== vscode.TreeItemCollapsibleState.None,
      selected: sel.has(node.id),
    };
  }

  async treeList(parent: string | undefined, depth: number, limit: number): Promise<TreeNodeInfo[]> {
    this.touch();
    const p = this.deps.tree.provider;
    let start: ModelNode | undefined;
    if (parent !== undefined) {
      start = this.treeNodes.get(parent);
      if (!start) throw new Error("Unknown parent node: list from the roots first and use an id from the result.");
    }
    const out: TreeNodeInfo[] = [];
    const walk = async (n: ModelNode | undefined, level: number): Promise<void> => {
      for (const c of await Promise.resolve(p.getChildren(n))) {
        if (out.length >= limit) return;
        if (this.treeNodes.size > 5000) this.treeNodes.clear();
        this.treeNodes.set(c.id, c);
        out.push(this.infoOf(c, level));
        if (level < depth) await walk(c, level + 1);
      }
    };
    await walk(start, 1);
    return out;
  }

  async treeNode(id: string): Promise<TreeNodeInfo | undefined> {
    const n = this.treeNodes.get(id);
    return n ? this.infoOf(n, 0) : undefined;
  }

  treeSelect(ids: string[]): Promise<TreeOutcome> {
    return this.agentAction(() => this.treeSelectInner(ids));
  }

  private async treeSelectInner(ids: string[]): Promise<TreeOutcome> {
    this.touch();
    const nodes: ModelNode[] = [];
    for (const id of ids) {
      const n = this.treeNodes.get(id);
      if (!n) return { ok: false, reason: `Unknown node "${id.slice(0, 80)}": list the tree first.` };
      nodes.push(n);
    }
    await this.showTree();
    for (const n of nodes) await this.deps.tree.provider.revealNode(this.deps.tree.view, n, (m) => this.deps.log(m));
    return { ok: true };
  }

  /** A hidden view ignores reveal and selection, so open its container first, as a user would. */
  private async showTree(): Promise<void> {
    if (this.deps.tree.view.visible) return;
    await vscode.commands.executeCommand("workbench.view.extension.sysml");
    for (let i = 0; i < 50 && !this.deps.tree.view.visible; i++) await new Promise((r) => setTimeout(r, 40));
  }

  async treeCollapseAll(): Promise<void> {
    this.touch();
    await vscode.commands.executeCommand("workbench.actions.treeView.sysmlModel.collapseAll");
  }

  treeCommand(command: string, nodeId: string | undefined): Promise<CommandOutcome> {
    return this.agentAction(() => this.treeCommandInner(command, nodeId));
  }

  private async treeCommandInner(command: string, nodeId: string | undefined): Promise<CommandOutcome> {
    this.touch();
    if (nodeId === undefined) return this.execute(command, []);
    const node = this.treeNodes.get(nodeId);
    if (!node) return { ok: false, reason: "Unknown node: list the tree first.", prompts: this.prompts() };
    await this.showTree();
    await this.deps.tree.provider.revealNode(this.deps.tree.view, node, (m) => this.deps.log(m));
    return this.execute(command, [node]);
  }

  async screenshot(target: ScreenshotTarget): Promise<string> {
    this.touch();
    if (target.kind === "diagram") {
      const uri = vscode.Uri.file(target.path);
      if (!this.deps.diagrams.openUris().includes(uri.toString())) throw new Error("That diagram is not open. Open it first (sysml_ui_diagram with gesture flush).");
      const k = vscode.window.activeColorTheme.kind;
      const dark = k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast;
      return this.deps.diagrams.testApi.pngWindow(uri, dark ? "editor-dark" : "editor-light");
    }
    return this.deps.requirements.testApi.png(this.scopeOf(target.scope));
  }

  dispose(): void {
    this.broker.cancelAll();
    setMessageSink(undefined);
    this.deps.diagrams.uiLayer = undefined;
    this.subs.forEach((d) => d.dispose());
  }
}

/** A command's return value as JSON-safe data, bounded; non-serialisable values are described. */
function toJsonResult(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return undefined;
    return s.length > 5000 ? `${s.slice(0, 5000)}... (truncated)` : JSON.parse(s);
  } catch {
    return "(a value that is not JSON)";
  }
}
