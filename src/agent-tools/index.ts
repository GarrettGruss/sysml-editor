import { validateSchema } from "./schema.js";
import { toolDefinitions } from "./tools.js";
import { ToolError, type ToolContext, type ToolResult } from "./types.js";

export * from "./types.js";
export { toolDefinitions, DEFAULT_DEPTH, MAX_DEPTH, NODE_CAP, PROBLEM_CAP, FILE_CAP, MEMBER_CAP, DECLARATION_CAP } from "./tools.js";
export { validateSchema } from "./schema.js";
export { findUnresolvedNames } from "./unresolved.js";

const err = (message: string): ToolResult => ({ isError: true, text: message });

/** Validate `input` against the tool's schema and run its handler. Never throws. */
export function callTool(name: string, input: unknown, ctx: ToolContext): ToolResult {
  const tool = toolDefinitions.find((t) => t.name === name);
  if (!tool) return err(`Unknown tool "${name}". Available tools: ${toolDefinitions.map((t) => t.name).join(", ")}.`);
  const args = input ?? {};
  const problems = validateSchema(args, tool.inputSchema);
  if (problems.length) return err(`Invalid input for ${name}: ${problems.join("; ")}.`);
  try {
    return tool.handler(args as Record<string, unknown>, ctx);
  } catch (e) {
    if (e instanceof ToolError) return err(e.message);
    return err(`Tool ${name} failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
  }
}
