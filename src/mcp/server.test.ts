import { spawn } from "node:child_process";
import { request } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ModelIndex } from "../model/index.js";
import { callTool, toolDefinitions, type ToolContext } from "../agent-tools/index.js";
import { FakeDiagrams, fixtureDiagram, fixtureText } from "../agent-tools/test-support.js";
import { FakeHost } from "../model-service/fake-host.js";
import { ModelService } from "../model-service/service.js";
import { discoveryFilePath, readLiveServer, removeDiscoveryFile, writeDiscoveryFile } from "./discovery.js";
import { startMcpServer, tokenMatches, type RunningMcpServer } from "./server.js";

const ROOT = "file:///w/";
const index = new ModelIndex();
const M_TEXT = "package P { part def Engine; part def Car { part engine : Engine; part gearbox; } requirement def Req; requirement def Req2; requirement ua; requirement ub; state def S { state off; state on; transition t1 first off then on; } action def Act { action a1; action a2; } part def Pt { part x; part y; } }";
index.setDocument(ROOT + "m.sysml", M_TEXT);
index.setDocument(ROOT + "bad.sysml", "package Q { part x : Nope; }");
index.setDocument(ROOT + "ports.sysml", fixtureText("ports.sysml"));
const diagrams = new FakeDiagrams();
diagrams.files.set("ports-general.sysmld", fixtureDiagram("ports-general.sysmld"));
const host = new FakeHost(index);
host.buffers.set(ROOT + "m.sysml", M_TEXT);
host.disk.set(ROOT + "m.sysml", M_TEXT);
const ctx: ToolContext = {
  diagrams,
  edits: { service: new ModelService(host), isTrusted: () => true, diagramUri: async (p) => ROOT + p },
  index,
  uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
  pathToUri: (p) => (index.getDocument(ROOT + p) ? ROOT + p : undefined),
};

const INPUTS: Record<string, unknown> = {
  sysml_list_files: {},
  sysml_get_element_tree: { depth: 1 },
  sysml_get_element: { qualifiedName: "P::Car" },
  sysml_validate: {},
  sysml_list_diagrams: {},
  sysml_read_diagram: { path: "ports-general.sysmld" },
  sysml_create_diagram: { root: "P::Car", kind: "general", path: "car.sysmld" },
  sysml_add_to_diagram: { path: "ports-general.sysmld", elements: ["Ports::Power"] },
  sysml_remove_from_diagram: { path: "ports-general.sysmld", ids: ["n3"] },
  sysml_layout_diagram: { path: "ports-general.sysmld" },
  sysml_get_editor_context: {},
  sysml_create_element: { owner: "P::Car", kind: "part", name: "wheel", type: "Engine" },
  sysml_delete_element: { element: "P::Car::engine" },
  sysml_rename_element: { element: "P::Engine", newName: "Motor" },
  sysml_set_element_properties: { element: "P::Car::engine", multiplicity: "2" },
  sysml_create_relationship: { kind: "connection", owner: "P::Car", source: "P::Car::engine", target: "P::Car::gearbox" },
  sysml_read_requirements_document: { package: "P" },
  sysml_set_transition: { element: "P::S::t1", trigger: "Go", guard: "ready" },
  sysml_create_requirement: { owner: "P", name: "massLimit", id: "R1", documentation: "The mass shall be low." },
};
/** More inputs of tools above: the relationship kinds of the requirements editor, over both channels. */
const MORE: [string, unknown][] = [
  ["sysml_create_relationship", { kind: "satisfy", requirement: "P::Req", by: "P::Car" }],
  ["sysml_create_relationship", { kind: "verify", requirement: "P::Req", newVerificationCase: "check" }],
  ["sysml_create_relationship", { kind: "derivation", original: "P::ua", derived: ["P::ub"] }],
  // The behaviour statements: the same text over MCP and directly.
  ["sysml_create_relationship", { kind: "succession", owner: "P::Act", source: "a1", target: "a2", guard: "x > 1" }],
  ["sysml_create_relationship", { kind: "transition", owner: "P::S", source: "on", target: "off", trigger: "Stop", effect: "action log" }],
  ["sysml_create_relationship", { kind: "message", owner: "P::Pt", from: "x", to: "y", name: "hello" }],
];

let home: string;
let workspace: string;
let server: RunningMcpServer;

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), "sysml-mcp-"));
  workspace = path.join(home, "ws");
  server = await startMcpServer({ context: () => ctx, workspaces: [workspace], home });
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
  it("the requirement relationship kinds give the same result and text over MCP and directly", async () => {
    const client = await connect(server.token);
    for (const [name, input] of MORE) {
      const reset = () => {
        host.buffers.set(ROOT + "m.sysml", M_TEXT);
        host.disk.set(ROOT + "m.sysml", M_TEXT);
        index.setDocument(ROOT + "m.sysml", M_TEXT);
      };
      reset();
      const r = await client.callTool({ name, arguments: input as Record<string, unknown> });
      const viaMcp = host.buffers.get(ROOT + "m.sysml");
      reset();
      const expected = await callTool(name, input, ctx);
      expect(r.content, JSON.stringify(input)).toEqual([{ type: "text", text: expected.text }]);
      expect(r.isError).toBeUndefined();
      expect(host.buffers.get(ROOT + "m.sysml")).toBe(viaMcp);
      expect(viaMcp).not.toBe(M_TEXT);
    }
    await client.close();
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
      const reset = () => {
        host.buffers.set(ROOT + "m.sysml", M_TEXT);
        host.disk.set(ROOT + "m.sysml", M_TEXT);
        index.setDocument(ROOT + "m.sysml", M_TEXT);
        diagrams.files.delete("car.sysmld");
        diagrams.files.set("ports-general.sysmld", fixtureDiagram("ports-general.sysmld"));
      };
      reset();
      const r = await client.callTool({ name, arguments: input as Record<string, unknown> });
      reset();
      const expected = await callTool(name, input, ctx);
      expect(r.content).toEqual([{ type: "text", text: expected.text }]);
      expect(r.isError).toBeUndefined();
    }
    await client.close();
  });
  it("marks the write tools in the annotations", async () => {
    const client = await connect(server.token);
    const { tools } = await client.listTools();
    for (const t of tools) {
      const def = toolDefinitions.find((d) => d.name === t.name)!;
      expect(t.annotations?.readOnlyHint, t.name).toBe(def.readOnly);
      if (!def.readOnly) expect(t.annotations?.destructiveHint, t.name).toBe(false);
    }
    await client.close();
  });
  it("returns the PNG of sysml_read_diagram as an image content item next to the text", async () => {
    const client = await connect(server.token);
    const r = await client.callTool({ name: "sysml_read_diagram", arguments: { path: "ports-general.sysmld", includeImage: true } });
    const content = r.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    expect(content.map((c) => c.type)).toEqual(["text", "image"]);
    expect(content[1]).toEqual({ type: "image", mimeType: "image/png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64") });
    expect(JSON.parse(content[0]!.text!).kind).toBe("general");
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
  it("rejects any Origin and a foreign Host with 403, even with a valid token", async () => {
    const get = (headers: Record<string, string>) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(
          { host: "127.0.0.1", port: server.port, path: "/mcp", method: "POST", headers: { "content-type": "application/json", ...headers } },
          (res) => {
            let body = "";
            res.on("data", (d: Buffer) => (body += d.toString()));
            res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
          },
        );
        req.on("error", reject);
        req.end("{}");
      });
    const auth = { Authorization: `Bearer ${server.token}` };
    expect((await get({ ...auth, Origin: "http://evil.example" })).status).toBe(403);
    expect((await get({ Origin: "http://evil.example" })).status).toBe(403); // no token result revealed
    expect((await get({ ...auth, Host: "evil.example" })).status).toBe(403);
    expect((await get({ ...auth, Host: `127.0.0.1:${server.port + 1}` })).status).toBe(403);
    expect((await get({ ...auth, Host: `localhost:${server.port}` })).status).not.toBe(403);
    expect((await get({})).status).toBe(401);
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
    expect(r.content).toEqual([{ type: "text", text: (await callTool("sysml_list_files", {}, ctx)).text }]);
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

  it("reports a stale entry when the recorded server is not reachable", async () => {
    const ws = path.join(home, "stale");
    writeDiscoveryFile({ port: 1, token: "x", pid: process.pid, workspace: ws }, home);
    const child = spawn(process.execPath, args(ws), { env: env(), stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
    const code = await new Promise<number | null>((r) => child.on("close", r));
    expect(code).toBe(1);
    expect(err).toContain("Stale server entry for this workspace; reopen it in VS Code");
    removeDiscoveryFile(ws, home);
  }, 30_000);

  it("exits 1 after the server stops", async () => {
    const ws = path.join(home, "stopped");
    const s = await startMcpServer({ context: () => ctx, workspaces: [ws], home });
    await s.stop();
    const child = spawn(process.execPath, args(ws), { env: env() });
    const code = await new Promise<number | null>((r) => child.on("close", r));
    expect(code).toBe(1);
  }, 30_000);
});

describe("two windows on one workspace", () => {
  it("keeps the other server's discovery entry when either stops", async () => {
    const ws = path.join(home, "shared");
    // A foreign live process (our parent) owns the primary file.
    writeDiscoveryFile({ port: 1, token: "foreign", pid: process.ppid, workspace: ws }, home);
    const mine = await startMcpServer({ context: () => ctx, workspaces: [ws], home });
    expect(readLiveServer(ws, home)?.token).toBeDefined();
    await mine.stop();
    expect(readLiveServer(ws, home)?.token).toBe("foreign");
    const again = await startMcpServer({ context: () => ctx, workspaces: [ws], home });
    removeDiscoveryFile(ws, home, { pid: process.ppid, token: "foreign" });
    expect(readLiveServer(ws, home)?.token).toBe(again.token);
    await again.stop();
    expect(readLiveServer(ws, home)).toBeUndefined();
  });
  it("writes one entry per workspace folder", async () => {
    const a = path.join(home, "ra");
    const b = path.join(home, "rb");
    const s = await startMcpServer({ context: () => ctx, workspaces: [a, b], home });
    expect(readLiveServer(a, home)?.token).toBe(s.token);
    expect(readLiveServer(b, home)?.token).toBe(s.token);
    await s.stop();
    expect(readLiveServer(b, home)).toBeUndefined();
  });
  it("returns a generic 500 body and logs the detail", async () => {
    const logs: string[] = [];
    const s = await startMcpServer({
      context: () => {
        throw new Error("secret detail");
      },
      log: (m) => logs.push(m),
      home,
    });
    try {
      const r = await fetch(s.url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sysml_list_files", arguments: {} } }),
      });
      const text = await r.text();
      expect(text).not.toContain("secret detail");
      expect(text).toContain("Internal error");
      expect(logs.join("\n")).toContain("secret detail");
    } finally {
      await s.stop();
    }
  });
});
