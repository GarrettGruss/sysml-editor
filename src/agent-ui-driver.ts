/**
 * The VS Code side of the UI-control tools (D55, D57, D58, D60): the gate, the audit channel, command running, and the
 * recording of the questions the editor asks while an agent drives it. The logic that needs no `vscode` is in
 * `agent-tools/ui-support.ts`.
 */
import * as vscode from "vscode";
import {
  type AnswerOutcome, type CommandOutcome, type UiAnswer, type UiDriver, type UiGate, type UiPrompt, type UiState,
} from "./agent-tools/ui-driver.js";
import { MessageLog, PromptBroker, resolveInWorkspace, runUntilPromptOrDone, type PromptResult } from "./agent-tools/ui-support.js";
import type { DiagramEditorProvider, DiagramUi } from "./diagram/diagram-editor.js";
import { VIEW_TYPE as DIAGRAM_VIEW_TYPE } from "./diagram/diagram-editor.js";
import type { RequirementsEditor } from "./requirements/editor.js";
import type { NewEntryTestApi } from "./tree/new-entry-flow.js";
import { setMessageSink } from "./ui-messages.js";

export const UI_CONTROL_SETTING = "sysml.agent.uiControl";
export const AGENT_UI_CHANNEL = "SysML Agent UI";
/** Id of the New File / New Folder input box in the prompt list (it is not recorded by the broker). */
export const NEW_ENTRY_PROMPT_ID = 999_999;

/** How long after an agent call the editor's questions are routed to the agent rather than shown to the person at the window. */
const AGENT_WINDOW_MS = 60_000;
/** A command still running after this long is reported as not completed. */
const COMMAND_WAIT_MS = 15_000;

export interface UiDriverDeps {
  diagrams: DiagramEditorProvider;
  requirements: RequirementsEditor;
  newEntry(): NewEntryTestApi | undefined;
  log(message: string): void;
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
  private readonly messages = new MessageLog();
  private readonly broker: PromptBroker;
  private readonly subs: vscode.Disposable[] = [];
  private lastCall = 0;

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

  workspaceRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file").map((f) => f.uri.fsPath);
  }

  audit(line: string): void {
    this.lastCall = Date.now();
    this.channel.appendLine(`${new Date().toISOString()} ${line}`);
  }

  /** Called by the other UI tools (gestures, menus) so questions they cause are routed to the agent. */
  touch(): void {
    this.lastCall = Date.now();
  }

  private routing(): boolean {
    const g = this.gate();
    return g.enabled && g.trusted && (Date.now() - this.lastCall < AGENT_WINDOW_MS || this.broker.list().length > 0);
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

  async runCommand(id: string, args: unknown[]): Promise<CommandOutcome> {
    this.touch();
    let run: Promise<unknown>;
    try {
      run = Promise.resolve(vscode.commands.executeCommand(id, ...args.map(toEditorArgs)));
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e), prompts: this.prompts() };
    }
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
    if (!useEntry) return this.broker.answer(promptId, a, (p) => resolveInWorkspace(p, this.workspaceRoots()));
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
        if ((await vscode.env.clipboard.readText()) !== "") clipboard = "text";
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
