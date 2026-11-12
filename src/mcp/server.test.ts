import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ModelIndex } from "../model/index.js";
import { callTool, toolDefinitions, type ToolContext } from "../agent-tools/index.js";
import { discoveryFilePath } from "./discovery.js";
import { startMcpServer, tokenMatches, type RunningMcpServer } from "./server.js";

const ROOT = "file:///w/";
const index = new ModelIndex();
index.setDocument(ROOT + "m.sysml", "package P { part def Engine; part def Car { part engine : Engine; } }");
index.setDocument(ROOT + "bad.sysml", "package Q { part x : Nope; }");
const ctx: ToolContext = {
  index,
  uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
  pathToUri: (p) => (index.getDocument(ROOT + p) ? ROOT + p : undefined),
};

const INPUTS: Record<string, unknown> = {
  sysml_list_files: {},
  sysml_get_element_tree: { depth: 1 },
  sysml_get_element: { qualifiedName: "P::Car" },
  sysml_validate: {},
};

let home: string;
let workspace: string;
let server: RunningMcpServer;

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), "sysml-mcp-"));
  workspace = path.join(home, "ws");
  server = await startMcpServer({ context: () => ctx, workspace, home });
});
afterAll(async () => {
  await server.stop();
  rmSync(home, { recursive: true, force: true });
});

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  return client;
}

describe("tokenMatches", () => {
  it("accepts only the exact bearer token", () => {
    expect(tokenMatches("Bearer abc", "abc")).toBe(true);
    expect(tokenMatches("Bearer abd", "abc")).toBe(false);
    expect(tokenMatches("abc", "abc")).toBe(false);
    expect(tokenMatches(undefined, "abc")).toBe(false);
    expect(tokenMatches("Bearer ", "")).toBe(false);
  });
});

describe("MCP server over HTTP", () => {
  it("covers every tool definition in this test", () => {
    expect(Object.keys(INPUTS).sort()).toEqual(toolDefinitions.map((t) => t.name).sort());
  });
  it("lists every definition with its schema", async () => {
    const client = await connect(server.token);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(toolDefinitions.map((t) => t.name));
    for (const t of tools) {
      const d = toolDefinitions.find((x) => x.name === t.name)!;
      expect(t.description).toBe(d.description);
      expect(t.inputSchema).toMatchObject(d.inputSchema as object);
    }
    await client.close();
  });
  it("calls each tool and returns the handler text", async () => {
    const client = await connect(server.token);
    for (const [name, input] of Object.entries(INPUTS)) {
      const r = await client.callTool({ name, arguments: input as Record<string, unknown> });
      const expected = callTool(name, input, ctx);
      expect(r.content).toEqual([{ type: "text", text: expected.text }]);
      expect(r.isError).toBeUndefined();
    }
    await client.close();
  });
  it("propagates isError", async () => {
    const client = await connect(server.token);
    const r = await client.callTool({ name: "sysml_get_element", arguments: { qualifiedName: "No::Such" } });
    expect(r.isError).toBe(true);
    const u = await client.callTool({ name: "nope", arguments: {} });
    expect(u.isError).toBe(true);
    await client.close();
  });
  it("rejects a wrong or missing token with 401", async () => {
    const post = (headers: Record<string, string>) =>
      fetch(server.url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
    expect((await post({})).status).toBe(401);
    expect((await post({ Authorization: "Bearer wrong" })).status).toBe(401);
    await expect(connect("wrong")).rejects.toThrow();
  });
  it("binds to loopback and writes the discovery file", () => {
    expect(server.url).toContain("127.0.0.1");
    expect(existsSync(discoveryFilePath(workspace, home))).toBe(true);
  });
});

describe("stdio bridge", () => {
  const bridge = path.resolve(import.meta.dirname, "../mcp-bridge.ts");
  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home }) as Record<string, string>;
  const args = (ws: string) => ["--import", "tsx", bridge, "--workspace", ws];

  it("lists and calls tools through stdio", async () => {
    const client = new Client({ name: "test", version: "1" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: args(workspace), env: env(), stderr: "pipe" }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(toolDefinitions.map((t) => t.name));
    const r = await client.callTool({ name: "sysml_list_files", arguments: {} });
    expect(r.content).toEqual([{ type: "text", text: callTool("sysml_list_files", {}, ctx).text }]);
    await client.close();
  }, 30_000);

  it("reports that VS Code must be open when there is no server", async () => {
    const child = spawn(process.execPath, args(path.join(home, "no-such-workspace")), { env: env() });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    const code = await new Promise<number | null>((r) => child.on("close", r));
    expect(code).toBe(1);
    expect(err.trim()).toBe("VS Code must be open on this workspace");
  }, 30_000);

  it("exits 1 after the server stops", async () => {
    const ws = path.join(home, "stopped");
    const s = await startMcpServer({ context: () => ctx, workspace: ws, home });
    await s.stop();
    const child = spawn(process.execPath, args(ws), { env: env() });
    const code = await new Promise<number | null>((r) => child.on("close", r));
    expect(code).toBe(1);
  }, 30_000);
});
