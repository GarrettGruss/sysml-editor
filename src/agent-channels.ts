/** Which agent channels are active for each value of `sysml.agent.channels`. Free of `vscode`. */
export type AgentChannels = "both" | "mcp" | "lmTools";

export interface ChannelPlan {
  /** Register the tools with `vscode.lm.registerTool`. */
  lmTools: boolean;
  /** Run the hosted MCP server (and write the discovery file for external clients). */
  mcpServer: boolean;
  /** Register the hosted server with VS Code's MCP server definition provider. */
  registerWithVsCode: boolean;
}

export function parseChannels(value: unknown): AgentChannels {
  return value === "mcp" || value === "lmTools" ? value : "both";
}

export function planChannels(value: unknown): ChannelPlan {
  switch (parseChannels(value)) {
    case "mcp":
      return { lmTools: false, mcpServer: true, registerWithVsCode: true };
    case "lmTools":
      return { lmTools: true, mcpServer: false, registerWithVsCode: false };
    default:
      // In-editor agents use the LM tools; the MCP server serves external harnesses only (no duplicates).
      return { lmTools: true, mcpServer: true, registerWithVsCode: false };
  }
}
