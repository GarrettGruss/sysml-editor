/**
 * MCP server exposing the agent tools over Streamable HTTP on loopback. Stateless: every POST gets a fresh
 * protocol server. Every request must carry the per-session bearer token. Free of `vscode`.
 */
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { callTool, toolDefinitions, type ToolContext } from "../agent-tools/index.js";
import { removeDiscoveryFile, writeDiscoveryFile } from "./discovery.js";

export const MCP_PATH = "/mcp";
const MAX_BODY = 1_000_000;

export interface McpServerOptions {
  /** Called per tool call, so handlers always see the current model. */
  context: () => ToolContext;
  /** Workspace folder; when set, a discovery file is written on start and removed on stop. */
  workspace?: string;
  /** Overrides the home directory used for the discovery file (tests). */
  home?: string;
  serverVersion?: string;
}

export interface RunningMcpServer {
  readonly port: number;
  readonly token: string;
  readonly url: string;
  stop(): Promise<void>;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time comparison of an Authorization header against the expected bearer token. */
export function tokenMatches(header: string | undefined, token: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  const given = m?.[1] ?? "";
  // Hashing equalises lengths so timingSafeEqual never throws and length does not leak.
  const ok = timingSafeEqual(digest(given), digest(token));
  return ok && m !== null;
}

function createProtocolServer(opts: McpServerOptions): Server {
  const server = new Server(
    { name: "sysml-editor", version: opts.serverVersion ?? "0.0.1" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object" },
      annotations: { readOnlyHint: t.readOnly },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, (req) => {
    const r = callTool(req.params.name, req.params.arguments, opts.context());
    return { content: [{ type: "text" as const, text: r.text }], ...(r.isError ? { isError: true } : {}) };
  });
  return server;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function reply(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

export async function startMcpServer(opts: McpServerOptions): Promise<RunningMcpServer> {
  const token = randomBytes(32).toString("hex");

  const http: HttpServer = createServer((req, res) => {
    void (async () => {
      if (!tokenMatches(req.headers.authorization, token)) {
        return reply(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
      }
      if (new URL(req.url ?? "/", "http://localhost").pathname !== MCP_PATH) return reply(res, 404, { error: "not found" });
      if (req.method !== "POST") return reply(res, 405, { error: "method not allowed" }, { allow: "POST" });
      let body: unknown;
      try {
        body = await readBody(req);
      } catch {
        return reply(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
      }
      const server = createProtocolServer(opts);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (e) {
        reply(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: e instanceof Error ? e.message : String(e) }, id: null });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const port = (http.address() as AddressInfo).port;
  if (opts.workspace !== undefined) {
    writeDiscoveryFile({ port, token, pid: process.pid, workspace: opts.workspace }, opts.home);
  }

  let stopped: Promise<void> | undefined;
  return {
    port,
    token,
    url: `http://127.0.0.1:${port}${MCP_PATH}`,
    stop() {
      stopped ??= new Promise<void>((resolve) => {
        if (opts.workspace !== undefined) removeDiscoveryFile(opts.workspace, opts.home);
        http.close(() => resolve());
        http.closeAllConnections();
      });
      return stopped;
    },
  };
}
