/**
 * Stdio MCP bridge: `node dist/mcp-bridge.js --workspace <dir>`. A transparent proxy that forwards JSON-RPC
 * messages between the client on stdio and the MCP server hosted by VS Code for that workspace.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readLiveServer } from "./mcp/discovery.js";

export const NO_SERVER_MESSAGE = "VS Code must be open on this workspace";

function workspaceArg(argv: string[]): string | undefined {
  const i = argv.indexOf("--workspace");
  const v = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith("--workspace="))?.slice("--workspace=".length);
  return v || undefined;
}

async function main(): Promise<void> {
  const workspace = workspaceArg(process.argv.slice(2));
  if (!workspace) {
    console.error("usage: node mcp-bridge.js --workspace <dir>");
    process.exit(2);
  }
  const info = readLiveServer(workspace);
  if (!info) {
    console.error(NO_SERVER_MESSAGE);
    process.exit(1);
  }
  const upstream = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${info.port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${info.token}` } },
  });
  const stdio = new StdioServerTransport();
  let closing = false;
  const shutdown = (code: number) => {
    if (closing) return;
    closing = true;
    void Promise.allSettled([upstream.close(), stdio.close()]).finally(() => process.exit(code));
  };
  stdio.onmessage = (m) => {
    upstream.send(m).catch((e: unknown) => {
      console.error(`${NO_SERVER_MESSAGE} (${e instanceof Error ? e.message : String(e)})`);
      shutdown(1);
    });
  };
  upstream.onmessage = (m) => {
    stdio.send(m).catch(() => shutdown(1));
  };
  stdio.onclose = () => shutdown(0);
  stdio.onerror = (e) => console.error(e.message);
  upstream.onerror = (e) => console.error(e.message);
  await upstream.start();
  await stdio.start();
}

void main();
