/**
 * Pieces of the UI-control tools that need no editor: the command allowlist, argument and path validation, the audit
 * line, the prompt broker and the message log. No `vscode` import.
 */
import * as path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { AnswerOutcome, MessageLevel, PromptKind, UiAnswer, UiMessage, UiPrompt } from "./ui-driver.js";

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

const SYSML_COMMAND = /^sysml\.[A-Za-z0-9_.]{1,120}$/;

export function isAllowedCommand(id: string): boolean {
  return SYSML_COMMAND.test(id) || CORE_COMMANDS.includes(id);
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
  for (const r of roots) {
    const rel = path.relative(path.resolve(r), abs);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return abs;
  }
  return undefined;
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
    if (!looksLikePath(v)) return v;
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
  answer(id: number | undefined, a: UiAnswer, resolveSavePath: (p: string) => string | undefined): AnswerOutcome {
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
        const abs = resolveSavePath(a.path);
        return abs === undefined ? refuse("The path is outside the workspace.") : done({ path: abs });
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
