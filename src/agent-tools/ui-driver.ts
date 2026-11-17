/**
 * What the UI-control tools need from the editor (design D55). Implemented by the VS Code layer; unit tests use a fake.
 * No `vscode` import.
 */
import type { DiagramGesture, RequirementsGesture } from "../ui-gestures.js";

export type { DiagramGesture, RequirementsGesture };

/** The conditions that must both hold before any UI action runs (D53). */
export interface UiGate {
  /** `sysml.agent.uiControl`, read from the user's settings only. */
  enabled: boolean;
  /** The workspace is trusted. */
  trusted: boolean;
}

export type PromptKind = "pick" | "multiPick" | "input" | "confirm" | "choice" | "save";

/** A question open in the window, waiting for `sysml_ui_answer` (D57). */
export interface UiPrompt {
  id: number;
  kind: PromptKind;
  title?: string;
  message?: string;
  /** Labels of the choices (pick, multiPick, choice). */
  items?: string[];
  /** Labels ticked at first (multiPick). */
  picked?: string[];
  /** Current or suggested value (input, save). */
  value?: string;
  /** The validation message for the value last entered (input). */
  validation?: string;
}

/** An answer to a prompt; `cancel` is valid for every kind. */
export type UiAnswer =
  | { kind: "pick"; label: string }
  | { kind: "picks"; labels: string[] }
  | { kind: "text"; text: string }
  | { kind: "confirm" }
  | { kind: "path"; path: string }
  | { kind: "cancel" };

export type AnswerOutcome =
  | { ok: true; remaining: UiPrompt[] }
  /** The answer was not accepted and the prompt stays open (`validation` for an input box). */
  | { ok: false; reason: string; validation?: string; remaining: UiPrompt[] };

export type MessageLevel = "information" | "warning" | "error";
export interface UiMessage { level: MessageLevel; text: string }

export interface UiState {
  /** The active editor tab, when there is one. */
  activeEditor?: { kind: string; path?: string; dirty: boolean };
  /** Selected diagram node and line ids, per open diagram. */
  selection: { path: string; ids: string[] }[];
  /** Context menus open in webviews, with their item labels. */
  menus: { owner: string; items: string[] }[];
  /** Per diagram, the label of the edit Undo and Redo would act on. */
  undo: { path: string; undo?: string; redo?: string }[];
  /** Messages shown to the user since the last read; reading drains them (D58). */
  messages: UiMessage[];
  prompts: UiPrompt[];
  navigation: string[];
  /** What the clipboard holds, never its content. */
  clipboard: "none" | "text" | "image" | "elements";
}

export type CommandOutcome =
  /** `completed` is false when the command was still running after it opened a prompt or after the wait limit. */
  | { ok: true; completed: boolean; result?: unknown; prompts: UiPrompt[] }
  | { ok: false; reason: string; prompts: UiPrompt[] };

export interface UiDriver {
  gate(): UiGate;
  /** Absolute paths of the workspace folders. */
  workspaceRoots(): string[];
  /** Write one line to the "SysML Agent UI" output channel. */
  audit(line: string): void;
  /** Run an editor command; returns when it settles, opens a prompt, or the wait limit passes. Arguments were validated. */
  runCommand(id: string, args: unknown[]): Promise<CommandOutcome>;
  prompts(): UiPrompt[];
  answer(promptId: number | undefined, answer: UiAnswer): Promise<AnswerOutcome>;
  state(): Promise<UiState>;
}
