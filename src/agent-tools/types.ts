import type { Element, ModelIndex } from "../model/index.js";
import type { DiagramDocument, DiagramProblem } from "../diagram/format.js";
import type { SourceMapper } from "../diagram/resolve.js";

/** What a tool handler can use. Transport-free: adapters build one of these. */
export interface ToolContext {
  index: ModelIndex;
  /** Document URI to workspace-relative path (forward slashes); undefined if it is outside the workspace. */
  uriToPath(uri: string): string | undefined;
  /** Workspace-relative path to document URI; undefined if no such document is known. */
  pathToUri(path: string): string | undefined;
  /** The diagram files of the workspace; implemented by the VS Code layer. Absent when diagrams are not available. */
  diagrams?: DiagramService;
}

/** A diagram file as listed: parsed when it parses. */
export interface DiagramFileInfo {
  /** Workspace-relative path. */
  path: string;
  /** The diagram is open in an editor (its in-memory content is shown). */
  open: boolean;
  doc?: DiagramDocument;
  problems?: DiagramProblem[];
}

/** A diagram read for a tool: the open document when there is one, else the file. */
export interface DiagramContent {
  path: string;
  open: boolean;
  /** Open with changes that are not saved. */
  unsaved: boolean;
  doc: DiagramDocument;
  sourceOf: SourceMapper;
}

export type DiagramImage = { ok: true; png: Uint8Array } | { ok: false; reason: string };

/** How a write reached the diagram: as an undoable, unsaved edit of the open editor, or on disk. */
export type DiagramWrite = "editor" | "file" | "none";

export interface DiagramWriteResult {
  applied: DiagramWrite;
  doc: DiagramDocument;
  sourceOf: SourceMapper;
  path: string;
}

/**
 * What the diagram tools need from the editor. All paths are workspace-relative with forward slashes.
 * Methods throw `ToolError` for expected failures (missing file, invalid path, unparsed file).
 */
export interface DiagramService {
  /** False in an untrusted workspace: the write tools refuse. */
  isTrusted(): boolean;
  list(): Promise<DiagramFileInfo[]>;
  read(path: string): Promise<DiagramContent>;
  /** A PNG in the fixed light theme, rendered by the diagram webview; never throws for a rendering failure. */
  renderImage(path: string): Promise<DiagramImage>;
  /** Write a new diagram file, never overwriting; `path` undefined means beside the root's source file. */
  create(request: { path?: string; root: Element; make(sourceOf: SourceMapper): DiagramDocument }): Promise<DiagramWriteResult>;
  /** One edit: `change` returns the new document, or undefined for no change. Open diagram: undoable and unsaved; otherwise the file. */
  edit(path: string, label: string, change: (doc: DiagramDocument, sourceOf: SourceMapper) => DiagramDocument | undefined): Promise<DiagramWriteResult>;
  /** Open diagram: the Auto-layout command (undoable, unsaved). Closed: stored positions are cleared in the file. */
  layout(path: string): Promise<DiagramWriteResult>;
}

/** `text` is JSON. `image` is set by `sysml_read_diagram` when an image was asked for and could be rendered. */
export interface ToolResult {
  text: string;
  isError?: boolean;
  image?: { data: Uint8Array; mimeType: string };
}

/** The subset of JSON Schema the validator understands. */
export interface JsonSchema {
  type?: "object" | "string" | "integer" | "number" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  items?: JsonSchema;
  minItems?: number;
  minLength?: number;
  /** Exactly one of the alternatives must match. */
  oneOf?: JsonSchema[];
  /** Local reference of the form `#/definitions/<name>`. */
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
}

export interface ToolDefinition {
  /** snake_case. */
  name: string;
  /** Written for an AI agent: what it returns, when to use it, what the inputs mean. */
  description: string;
  inputSchema: JsonSchema & { type: "object" };
  readOnly: boolean;
  handler(input: Record<string, unknown>, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

/** Thrown by handlers for expected failures; turned into an `isError` result. */
export class ToolError extends Error {}
