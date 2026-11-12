import type { ModelIndex } from "../model/index.js";

/** What a tool handler can use. Transport-free: adapters build one of these. */
export interface ToolContext {
  index: ModelIndex;
  /** Document URI to workspace-relative path (forward slashes); undefined if it is outside the workspace. */
  uriToPath(uri: string): string | undefined;
  /** Workspace-relative path to document URI; undefined if no such document is known. */
  pathToUri(path: string): string | undefined;
}

/** `text` is JSON. `image` is reserved for diagram tools in a later change. */
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
  handler(input: Record<string, unknown>, ctx: ToolContext): ToolResult;
}

/** Thrown by handlers for expected failures; turned into an `isError` result. */
export class ToolError extends Error {}
