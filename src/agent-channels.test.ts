import { describe, expect, it } from "vitest";
import { parseChannels, planChannels } from "./agent-channels.js";

describe("planChannels", () => {
  it("both: LM tools and MCP server, but not registered with VS Code", () => {
    expect(planChannels("both")).toEqual({ lmTools: true, mcpServer: true, registerWithVsCode: false });
  });
  it("mcp: no LM tools; server registered with VS Code", () => {
    expect(planChannels("mcp")).toEqual({ lmTools: false, mcpServer: true, registerWithVsCode: true });
  });
  it("lmTools: LM tools only", () => {
    expect(planChannels("lmTools")).toEqual({ lmTools: true, mcpServer: false, registerWithVsCode: false });
  });
  it("falls back to both for unknown values", () => {
    expect(parseChannels(undefined)).toBe("both");
    expect(parseChannels("nope")).toBe("both");
    expect(planChannels(42)).toEqual(planChannels("both"));
  });
});
