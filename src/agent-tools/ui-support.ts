/**
 * Pieces of the UI-control tools that need no editor: the command allowlist, argument and path validation, the audit
 * line, the prompt broker and the message log. No `vscode` import.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { AnswerOutcome, ChromeTargetName, MessageLevel, PromptKind, UiAnswer, UiGate, UiMessage, UiPrompt, UserEvent } from "./ui-driver.js";

// ---- the allowlist (D54) ---------------------------------------------------------------------------

/** Core commands an agent may run besides `sysml.*`. */
export const CORE_COMMANDS: readonly string[] = [
  "undo",
  "redo",
  "workbench.action.files.save",
  "workbench.action.files.saveAll",
  "workbench.action.navigateBack",
  "workbench.action.navigateForward",
];

/** `own` is the list of command ids this extension contributes (`contributes.commands`); other extensions' `sysml.*` ids are refused. */
export function isAllowedCommand(id: string, own: readonly string[]): boolean {
  return own.includes(id) || CORE_COMMANDS.includes(id);
}

/** True when a save-dialog answer may be used: no hidden segment (.git, .vscode), and the suggested extension when there is one. */
export function saveAnswerAllowed(abs: string, suggested: string | undefined): boolean {
  if (abs.split(/[\\/]/).some((s) => s.startsWith(".") && s !== "." && s !== "..")) return false;
  const want = suggested ? path.extname(suggested).toLowerCase() : "";
  return want === "" || path.extname(abs).toLowerCase() === want;
}

// ---- arguments and paths ---------------------------------------------------------------------------

export const MAX_ARGS = 8;
const MAX_STRING = 4096;
const MAX_DEPTH = 3;
const MAX_KEYS = 20;

/** A string that names a file rather than a model element or a label. */
export function looksLikePath(s: string): boolean {
  return s.includes("/") || s.includes("\\") || /^file:/i.test(s) || /^~/.test(s) || /^[a-zA-Z]:/.test(s) || s.split(/[\\/]/).includes("..");
}

/** Resolve `p` (absolute path, relative path or `file:` URI) inside one of the roots; undefined when it is outside them. */
export function resolveInWorkspace(p: string, roots: readonly string[]): string | undefined {
  if (p.includes("\0") || roots.length === 0 || /^~/.test(p)) return undefined;
  let abs: string;
  if (/^file:/i.test(p)) {
    try {
      abs = fileURLToPath(p);
    } catch {
      return undefined;
    }
  } else if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(p) && !/^[a-zA-Z]:[\\/]/.test(p)) {
    return undefined; // some other URI scheme
  } else {
    abs = path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p) ? path.resolve(p) : path.resolve(roots[0]!, p);
  }
  // Symlinks are resolved on both sides, so a link inside the workspace cannot lead outside it.
  const real = realPathOf(abs);
  for (const r of roots) {
    const rel = path.relative(realPathOf(path.resolve(r)), real);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return real;
  }
  return undefined;
}

/**
 * The real path of `p`: symlinks resolved for the nearest existing ancestor, with the part that does not exist yet
 * appended. A dangling symlink is followed to its target, so creating through it is judged by where it leads.
 */
export function realPathOf(p: string, depth = 0): string {
  const tail: string[] = [];
  let cur = p;
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail.reverse());
    } catch {
      try {
        if (depth < 20 && fs.lstatSync(cur).isSymbolicLink()) return path.join(realPathOf(path.resolve(path.dirname(cur), fs.readlinkSync(cur)), depth + 1), ...tail.reverse());
      } catch {
        // Not a link either: it does not exist, look one level up.
      }
      const parent = path.dirname(cur);
      if (parent === cur) return p;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

export type ArgsResult = { ok: true; args: unknown[] } | { ok: false; reason: string };

/**
 * Check the arguments of a command: JSON values only, bounded, and every path-like string inside the workspace.
 * Path-like strings are replaced by `file:` URIs, which the driver turns into editor URIs.
 */
export function validateCommandArgs(args: unknown, roots: readonly string[]): ArgsResult {
  if (args === undefined) return { ok: true, args: [] };
  if (!Array.isArray(args)) return { ok: false, reason: "args must be an array" };
  if (args.length > MAX_ARGS) return { ok: false, reason: `at most ${MAX_ARGS} arguments are allowed` };
  const out: unknown[] = [];
  for (let i = 0; i < args.length; i++) {
    const r = cleanValue(args[i], roots, 0, `args[${i}]`);
    if (typeof r === "object" && r !== null && "__refused" in r) return { ok: false, reason: (r as { __refused: string }).__refused };
    out.push(r);
  }
  return { ok: true, args: out };
}

function cleanValue(v: unknown, roots: readonly string[], depth: number, where: string): unknown {
  const refuse = (m: string) => ({ __refused: `${where}: ${m}` });
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : refuse("not a finite number");
  if (typeof v === "string") {
    if (v.length > MAX_STRING) return refuse(`longer than ${MAX_STRING} characters`);
    if (v.includes("\0")) return refuse("contains a NUL character");
    if (!looksLikePath(v) && !/\.[A-Za-z0-9]{1,6}$/.test(v)) return v; // a bare file name such as out.png is a path too
    const abs = resolveInWorkspace(v, roots);
    return abs === undefined ? refuse(`"${v.length > 80 ? v.slice(0, 80) + "..." : v}" is outside the workspace`) : pathToFileURL(abs).toString();
  }
  if (depth >= MAX_DEPTH) return refuse(`nested deeper than ${MAX_DEPTH} levels`);
  if (Array.isArray(v)) {
    if (v.length > 100) return refuse("an array of more than 100 items");
    const items: unknown[] = [];
    for (let i = 0; i < v.length; i++) {
      const r = cleanValue(v[i], roots, depth + 1, `${where}[${i}]`);
      if (typeof r === "object" && r !== null && "__refused" in r) return r;
      items.push(r);
    }
    return items;
  }
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return refuse("not a plain object");
    const keys = Object.keys(v);
    if (keys.length > MAX_KEYS) return refuse(`an object with more than ${MAX_KEYS} keys`);
    const o: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const k of keys) {
      if (k === "__proto__" || k === "constructor" || k === "prototype" || k === "__refused") return refuse(`key "${k}" is not allowed`);
      const r = cleanValue((v as Record<string, unknown>)[k], roots, depth + 1, `${where}.${k}`);
      if (typeof r === "object" && r !== null && "__refused" in r) return r;
      o[k] = r;
    }
    return o;
  }
  return refuse("not a JSON value");
}

// ---- the audit line (D60) --------------------------------------------------------------------------

const AUDIT_TEXT = 80;
const AUDIT_TOTAL = 600;

/** One line for the output channel: tool, target, and the arguments with text values truncated. */
export function formatAuditLine(tool: string, target: string | undefined, args: unknown): string {
  const text = JSON.stringify(args ?? {}, (_k, v: unknown) => (typeof v === "string" && v.length > AUDIT_TEXT ? `${v.slice(0, AUDIT_TEXT)}...(${v.length} chars)` : v));
  const body = (text ?? "{}").length > AUDIT_TOTAL ? `${(text ?? "").slice(0, AUDIT_TOTAL)}...` : text;
  const t = (target ?? "-").replace(/[\r\n]+/g, " ");
  return `${tool} target=${t.length > AUDIT_TEXT ? t.slice(0, AUDIT_TEXT) + "..." : t} args=${body}`.replace(/[\r\n]+/g, " ");
}

// ---- the message log (D58) -------------------------------------------------------------------------

/** A bounded queue of messages shown to the user; `drain` hands each over once. */
export class MessageLog {
  private queue: UiMessage[] = [];
  constructor(private readonly cap = 100) {}
  add(level: MessageLevel, text: string): void {
    this.queue.push({ level, text: text.length > 2000 ? text.slice(0, 2000) + "..." : text });
    if (this.queue.length > this.cap) this.queue.splice(0, this.queue.length - this.cap);
  }
  drain(): UiMessage[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}

// ---- prompts (D57) ---------------------------------------------------------------------------------

export type PromptSpec =
  | { kind: "pick"; title?: string; message?: string; items: string[] }
  | { kind: "multiPick"; title?: string; items: string[]; picked?: string[] }
  | { kind: "input"; title?: string; message?: string; value?: string; validate?: (v: string) => string | undefined }
  | { kind: "confirm"; title?: string; message: string }
  | { kind: "choice"; message: string; items: string[] }
  | { kind: "save"; title?: string; value: string };

/** What a prompt resolves to. */
export type PromptResult =
  | { cancelled: true }
  | { cancelled?: false; picked?: string; pickedMany?: string[]; text?: string; confirmed?: boolean; path?: string };

interface Open { prompt: UiPrompt; spec: PromptSpec; resolve(r: PromptResult): void; timer: ReturnType<typeof setTimeout> }

export const DEFAULT_PROMPT_TIMEOUT_MS = 120_000;

/** Holds the questions the editor asked while an agent drives it, until they are answered, cancelled or time out. */
export class PromptBroker {
  private open: Open[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();
  constructor(
    private readonly timeoutMs = DEFAULT_PROMPT_TIMEOUT_MS,
    /** Called when a prompt timed out and was cancelled. */
    private readonly onTimeout: (p: UiPrompt) => void = () => {},
  ) {}

  /** Record a question; resolves when it is answered, cancelled or timed out (a timeout is a cancel). */
  ask(spec: PromptSpec): Promise<PromptResult> {
    const id = this.nextId++;
    const prompt: UiPrompt = { id, kind: spec.kind as PromptKind };
    if ("title" in spec && spec.title) prompt.title = spec.title;
    if ("message" in spec && spec.message) prompt.message = spec.message;
    if ("items" in spec) prompt.items = [...spec.items];
    if (spec.kind === "multiPick" && spec.picked) prompt.picked = [...spec.picked];
    if ((spec.kind === "input" || spec.kind === "save") && spec.value !== undefined) prompt.value = spec.value;
    return new Promise<PromptResult>((resolve) => {
      const timer = setTimeout(() => {
        this.close(id);
        this.onTimeout(prompt);
        resolve({ cancelled: true });
      }, this.timeoutMs);
      this.open.push({ prompt, spec, resolve, timer });
      this.listeners.forEach((l) => l());
    });
  }

  list(): UiPrompt[] {
    return this.open.map((o) => ({ ...o.prompt }));
  }

  /** Called when a prompt opens. */
  onOpen(l: () => void): () => void {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }

  private close(id: number): Open | undefined {
    const i = this.open.findIndex((o) => o.prompt.id === id);
    if (i < 0) return undefined;
    const [o] = this.open.splice(i, 1);
    clearTimeout(o!.timer);
    return o;
  }

  /** Cancel everything still open (the setting was turned off, the extension is closing). */
  cancelAll(): void {
    for (const o of [...this.open]) {
      this.close(o.prompt.id);
      o.resolve({ cancelled: true });
    }
  }

  /** Answer the prompt with `id`, or the oldest open one. A wrong kind of answer or an invalid value leaves it open. */
  answer(id: number | undefined, a: UiAnswer, resolveSavePath: (p: string, suggested?: string) => string | undefined): AnswerOutcome {
    const o = id === undefined ? this.open[0] : this.open.find((x) => x.prompt.id === id);
    const rest = () => this.list();
    if (!o) return { ok: false, reason: id === undefined ? "No prompt is open." : `No open prompt with id ${id}.`, remaining: rest() };
    const refuse = (reason: string, validation?: string): AnswerOutcome => ({ ok: false, reason, ...(validation !== undefined ? { validation } : {}), remaining: rest() });
    const done = (r: PromptResult): AnswerOutcome => {
      this.close(o.prompt.id);
      o.resolve(r);
      return { ok: true, remaining: rest() };
    };
    const s = o.spec;
    if (a.kind === "cancel") return done({ cancelled: true });
    switch (s.kind) {
      case "pick":
      case "choice": {
        if (a.kind !== "pick") return refuse(`This ${s.kind} prompt takes a "pick" answer (one of: ${s.items.join(", ")}).`);
        const label = s.items.find((x) => x === a.label) ?? s.items.find((x) => x.toLowerCase() === a.label.toLowerCase());
        return label === undefined ? refuse(`No item "${a.label}". Items: ${s.items.join(", ")}.`) : done({ picked: label });
      }
      case "multiPick": {
        if (a.kind !== "picks") return refuse(`This prompt takes a "picks" answer (a list of: ${s.items.join(", ")}).`);
        const chosen: string[] = [];
        for (const l of a.labels) {
          const m = s.items.find((x) => x === l);
          if (m === undefined) return refuse(`No item "${l}". Items: ${s.items.join(", ")}.`);
          if (!chosen.includes(m)) chosen.push(m);
        }
        return done({ pickedMany: chosen });
      }
      case "input": {
        if (a.kind !== "text") return refuse('This input box takes a "text" answer.');
        const v = s.validate?.(a.text);
        if (v) {
          o.prompt.value = a.text;
          o.prompt.validation = v;
          return refuse("The value was rejected; the input box stays open.", v);
        }
        return done({ text: a.text });
      }
      case "confirm":
        return a.kind === "confirm" ? done({ confirmed: true }) : refuse('This confirmation takes a "confirm" or "cancel" answer.');
      case "save": {
        if (a.kind !== "path") return refuse('This save dialog takes a "path" answer.');
        const abs = resolveSavePath(a.path, s.value);
        return abs === undefined ? refuse("The path is outside the workspace, hidden, or lacks the suggested file extension.") : done({ path: abs });
      }
    }
  }
}

/**
 * Wait for `command` to settle, but not past the moment a prompt opens or `maxMs` passes, so the agent never deadlocks on
 * a command that is waiting for its answer. `settled` tells which happened.
 */
export async function runUntilPromptOrDone<T>(command: Promise<T>, broker: PromptBroker, maxMs: number): Promise<{ settled: true; value: T } | { settled: false }> {
  let stop: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const early = new Promise<{ settled: false }>((resolve) => {
    stop = broker.onOpen(() => resolve({ settled: false }));
    timer = setTimeout(() => resolve({ settled: false }), maxMs);
  });
  try {
    return await Promise.race([command.then((value) => ({ settled: true as const, value })), early]);
  } finally {
    stop();
    if (timer) clearTimeout(timer);
  }
}


// ---- selectors, gestures and the tree (inputs of the webview and tree tools) --------------------------

/** A CSS selector for the requirements webview: bounded, printable. It runs only inside the sandboxed webview. */
export function validSelector(sel: unknown): sel is string {
  return typeof sel === "string" && sel.length > 0 && sel.length <= 300 && !/[\u0000-\u001f\u007f]/.test(sel);
}

/** Tree commands in the view title (`view/title` of package.json). */
export const TREE_TITLE_COMMANDS: readonly string[] = ["sysml.tree.newFile", "sysml.tree.newFolder", "sysml.tree.refresh", "sysml.tree.changeView", "sysml.tree.clearSearch"];

/** Tree commands a node offers by its context value (`view/item/context` of package.json); a unit test compares this with the manifest. */
export const TREE_NODE_COMMANDS: readonly { command: string; contextValue: RegExp }[] = [
  { command: "sysml.goToDefinition", contextValue: /^sysmlElement/ },
  { command: "sysml.newDiagram", contextValue: /^sysmlElement/ },
  { command: "sysml.newDiagram", contextValue: /^sysmlFile$/ },
  { command: "sysml.showInDiagram", contextValue: /^sysmlElement/ },
  { command: "sysml.addToActiveDiagram", contextValue: /^sysmlElement/ },
  { command: "sysml.tree.addChild", contextValue: /^sysmlElement$/ },
  { command: "sysml.tree.rename", contextValue: /^sysmlElement$/ },
  { command: "sysml.tree.delete", contextValue: /^sysmlElement$/ },
  { command: "sysml.tree.deleteFile", contextValue: /^sysmlFile$/ },
  { command: "sysml.openRequirementsEditor", contextValue: /^sysmlElement/ },
  { command: "sysml.tree.newFile", contextValue: /^sysmlFolder/ },
  { command: "sysml.tree.newFolder", contextValue: /^sysmlFolder/ },
];

/** Whether the tree offers `command` for a node with this context value (any title command needs no node). */
export function treeCommandOffered(command: string, contextValue: string | undefined): boolean {
  if (contextValue === undefined) return TREE_TITLE_COMMANDS.includes(command);
  return TREE_NODE_COMMANDS.some((c) => c.command === command && c.contextValue.test(contextValue));
}

// ---- the tutor (D62 to D67) ------------------------------------------------------------------------

/** `control` tools need `sysml.agent.uiControl`; `tutor` tools (display and observe only) pass on either setting. */
export type ToolClass = "control" | "tutor";

export const SETTING_OFF = 'UI control is off. The user must turn on the user setting "sysml.agent.uiControl" (it is ignored in workspace settings).';
export const TUTOR_OFF = 'The tutor tools are off. The user must turn on the user setting "sysml.agent.tutor" (or "sysml.agent.uiControl"); both are ignored in workspace settings.';
export const UNTRUSTED = "UI control is not available in an untrusted workspace. Trust the workspace first.";

/** Why a tool of this class is refused, or undefined when it may run. */
export function gateFor(g: UiGate, cls: ToolClass): string | undefined {
  if (!g.trusted) return UNTRUSTED;
  if (cls === "control") return g.enabled ? undefined : SETTING_OFF;
  return g.enabled || g.tutor ? undefined : TUTOR_OFF;
}

export const CALLOUT_MAX = 280;

/** Callout text, cut to at most CALLOUT_MAX characters (D66). */
export function truncateCallout(text: string): string {
  return text.length > CALLOUT_MAX ? text.slice(0, CALLOUT_MAX - 3) + "..." : text;
}

/** Fixed descriptions of chrome the tutor cannot draw on (D64). */
export const CHROME_TARGETS: Record<ChromeTargetName, string> = {
  modelTree: "The SysML Model view in the Activity Bar (left side): the tree of files, packages and elements. No overlay was drawn; the view was revealed.",
  treeNewFile: "The New File button (a page icon with a plus) in the title bar of the SysML Model view. No overlay was drawn; the view was revealed.",
  treeNewFolder: "The New Folder button (a folder icon with a plus) in the title bar of the SysML Model view. No overlay was drawn; the view was revealed.",
  commandPalette: "The Command Palette (Ctrl+Shift+P, Cmd+Shift+P on macOS), opened with the command typed in. No overlay was drawn.",
};

export const WAIT_DEFAULT_S = 60;
export const WAIT_MAX_S = 300;

/** The wait in milliseconds: default 60 s, at most 300 s, at least 1 s. */
export function waitMs(seconds: unknown): number {
  const s = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : WAIT_DEFAULT_S;
  return Math.round(Math.min(WAIT_MAX_S, Math.max(1, s)) * 1000);
}

/** A bounded queue of user events with waiters. The driver pushes only events the user caused (D67). */
export class UserEventQueue {
  private queue: UserEvent[] = [];
  private waiters: ((e: UserEvent | undefined) => void)[] = [];
  constructor(private readonly cap = 100) {}
  push(e: UserEvent): void {
    const w = this.waiters.shift();
    if (w) return w(e);
    this.queue.push(e);
    if (this.queue.length > this.cap) this.queue.shift();
  }
  /** The oldest pending event, or the next one, or undefined at the timeout. */
  wait(timeoutMs: number): Promise<UserEvent | undefined> {
    const first = this.queue.shift();
    if (first) return Promise.resolve(first);
    return new Promise((resolve) => {
      const done = (e: UserEvent | undefined) => {
        clearTimeout(timer);
        const i = this.waiters.indexOf(done);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(e);
      };
      const timer = setTimeout(() => done(undefined), timeoutMs);
      this.waiters.push(done);
    });
  }
  clear(): void {
    this.queue = [];
  }
}
