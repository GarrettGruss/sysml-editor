import { validateSchema } from "./schema.js";
import { toolDefinitions } from "./tools.js";
import { ToolError, type ToolContext, type ToolResult } from "./types.js";

export * from "./types.js";
export { toolDefinitions, DEFAULT_DEPTH, MAX_DEPTH, NODE_CAP, PROBLEM_CAP, FILE_CAP, MEMBER_CAP, DECLARATION_CAP } from "./tools.js";
export { validateSchema } from "./schema.js";
export { validateDiagramPath, DIAGRAM_FILE_CAP, DIAGRAM_ELEMENT_CAP, DIAGRAM_ID_CAP } from "./diagram-tools.js";
export { findUnresolvedNames } from "./unresolved.js";

const err = (message: string): ToolResult => ({ isError: true, text: message });

const failure = (name: string, e: unknown): ToolResult =>
  e instanceof ToolError ? err(e.message) : err(`Tool ${name} failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`);

/**
 * Validate `input` against the tool's schema and run its handler; the result is synchronous for tools
 * that do not need the editor. Never throws. Most callers want {@link callTool}.
 */
export function invokeTool(name: string, input: unknown, ctx: ToolContext): ToolResult | Promise<ToolResult> {
  const tool = toolDefinitions.find((t) => t.name === name);
  if (!tool) return err(`Unknown tool "${name}". Available tools: ${toolDefinitions.map((t) => t.name).join(", ")}.`);
  const args = input ?? {};
  const problems = validateSchema(args, tool.inputSchema);
  if (problems.length) return err(`Invalid input for ${name}: ${problems.join("; ")}.`);
  try {
    const r = tool.handler(args as Record<string, unknown>, ctx);
    return r instanceof Promise ? r.catch((e: unknown) => failure(name, e)) : r;
  } catch (e) {
    return failure(name, e);
  }
}

/** Validate `input` against the tool's schema and run its handler. Never rejects. */
export async function callTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  return invokeTool(name, input, ctx);
}
