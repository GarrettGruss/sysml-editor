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

/** What a diagram shows after a gesture settled: the metrics the integration tests read, bounded for an agent. */
export interface DiagramObservation {
  path: string;
  selected: string[];
  /** Labels of the context menu that is open (empty when none). */
  menu: string[];
  nodes: { id: string; x: number; y: number; w: number; h: number }[];
  edgeCount: number;
  /** Labels in the legend when it is shown. */
  legend?: string[];
  descriptions: boolean;
  inlineEditor: boolean;
  inline?: { value: string; error?: string; purpose: string };
  quickBar: string[];
  tool?: string;
  zoom: number;
  clipboard: UiState["clipboard"];
}

export type RequirementsScopeArg = { kind: "package"; qualifiedName: string } | { kind: "file"; path: string };
export type RequirementsView = "table" | "matrix" | "document";

/** What the requirements editor shows, as the integration tests read it. */
export interface RequirementsObservation {
  view: RequirementsView;
  scopeName: string;
  outline: { number: string; heading: string; level: number; items: number }[];
  items: { id: string; name: string; text: string; number: string }[];
  matrixRows: { qn: string; kind: string; number: string; id: string; satisfiedBy: string[]; verifiedBy: string[]; status: string }[];
  pendingEdits: string[];
  notice?: { level: string; message: string };
  errors: string[];
}

export type RequirementsAction =
  | { kind: "open"; view?: RequirementsView }
  | { kind: "view"; view: RequirementsView }
  | { kind: "gesture"; gesture: RequirementsGesture }
  | { kind: "exportMatrix"; format: "csv" | "markdown"; path: string }
  | { kind: "observe" };

/** A node of the model tree as listed for an agent. */
export interface TreeNodeInfo {
  id: string;
  label: string;
  description?: string;
  /** The context value that decides which commands the node offers. */
  contextValue: string;
  depth: number;
  hasChildren: boolean;
  selected: boolean;
}

export type TreeOutcome = { ok: true } | { ok: false; reason: string };

export type ScreenshotTarget = { kind: "diagram"; path: string } | { kind: "requirements"; scope: RequirementsScopeArg };

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
  /** Replay a gesture on the open diagram at the absolute `path` (opening it when it is not open); resolves after it settled. Throws with the webview's reason. */
  diagramGesture(path: string, gesture: DiagramGesture): Promise<DiagramObservation>;
  /** Act in the requirements editor of a scope (a file scope has an absolute path) and observe it. Throws with the reason. */
  requirements(scope: RequirementsScopeArg, action: RequirementsAction): Promise<RequirementsObservation>;
  /** Visible nodes below `parent` (the roots when absent), to `depth` levels, at most `limit`. Throws when `parent` is unknown. */
  treeList(parent: string | undefined, depth: number, limit: number): Promise<TreeNodeInfo[]>;
  /** The node last listed with this id. */
  treeNode(id: string): Promise<TreeNodeInfo | undefined>;
  treeSelect(ids: string[]): Promise<TreeOutcome>;
  treeCollapseAll(): Promise<void>;
  /** Run a tree command, with the node as its argument when `nodeId` is given (the node is selected first). */
  treeCommand(command: string, nodeId: string | undefined): Promise<CommandOutcome>;
  /** A PNG of what the webview of the diagram or requirements editor shows, as base64. Throws when it is not open. */
  screenshot(target: ScreenshotTarget): Promise<string>;
}
