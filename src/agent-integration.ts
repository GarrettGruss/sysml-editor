/**
 * VS Code side of the agent tools: the Language Model Tools adapter, the hosted MCP server, and its registration
 * with VS Code, switched by `sysml.agent.channels`. The logic lives in `vscode`-free modules; this is wiring.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { planChannels, type ChannelPlan } from "./agent-channels.js";
import { callTool, toolDefinitions, type ToolContext, type ToolResult } from "./agent-tools/index.js";
import { startMcpServer, type RunningMcpServer } from "./mcp/server.js";
import type { WorkspaceModel } from "./workspace/workspace-model.js";

export const MCP_PROVIDER_ID = "sysml.mcpServer";
const CHANNELS_SETTING = "sysml.agent.channels";

export class AgentIntegration implements vscode.Disposable {
  private plan: ChannelPlan = { lmTools: false, mcpServer: false, registerWithVsCode: false };
  private lmRegistrations: vscode.Disposable[] = [];
  private server: RunningMcpServer | undefined;
  private providerReg: vscode.Disposable | undefined;
  private readonly definitionsChanged = new vscode.EventEmitter<void>();
  private readonly subs: vscode.Disposable[] = [];
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly model: WorkspaceModel,
    private readonly log: (msg: string) => void,
    private readonly version: string,
  ) {
    this.subs.push(
      this.definitionsChanged,
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CHANNELS_SETTING)) void this.apply();
      }),
    );
  }

  /** The workspace folder this extension instance serves (the first one). */
  get workspaceFolder(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  currentPlan(): ChannelPlan {
    return this.plan;
  }

  /** Port and token of the running MCP server, for tests. */
  mcpEndpoint(): { url: string; port: number; token: string } | undefined {
    return this.server && { url: this.server.url, port: this.server.port, token: this.server.token };
  }

  private context(): ToolContext {
    const root = this.workspaceFolder;
    const uriToPath = (uri: string): string | undefined => {
      if (root === undefined || !uri.startsWith("file:")) return undefined;
      const rel = path.relative(root, vscode.Uri.parse(uri).fsPath);
      return rel === "" || rel.startsWith("..") || path.isAbsolute(rel) ? undefined : rel.split(path.sep).join("/");
    };
    return {
      index: this.model.index,
      uriToPath,
      pathToUri: (p) => this.model.index.uris().find((u) => uriToPath(u) === p),
    };
  }

  /** (Re)apply `sysml.agent.channels`. Calls are serialised. */
  apply(): Promise<void> {
    this.queue = this.queue.then(() => this.applyNow()).catch((e: unknown) => this.log(`agent channels: ${String(e)}`));
    return this.queue;
  }

  private async applyNow(): Promise<void> {
    if (this.disposed) return;
    const next = planChannels(vscode.workspace.getConfiguration().get(CHANNELS_SETTING));

    if (next.lmTools && this.lmRegistrations.length === 0) {
      this.lmRegistrations = toolDefinitions.map((def) =>
        vscode.lm.registerTool<object>(def.name, {
          invoke: (options) => toLmResult(callTool(def.name, options.input, this.context())),
        }),
      );
    } else if (!next.lmTools) {
      this.lmRegistrations.forEach((d) => d.dispose());
      this.lmRegistrations = [];
    }

    const folder = this.workspaceFolder;
    if (next.mcpServer && !this.server && folder !== undefined) {
      this.server = await startMcpServer({ context: () => this.context(), workspace: folder, serverVersion: this.version });
      this.log(`MCP server listening on ${this.server.url}`);
      this.definitionsChanged.fire();
    } else if (!next.mcpServer && this.server) {
      const s = this.server;
      this.server = undefined;
      await s.stop();
      this.definitionsChanged.fire();
    }

    const wantProvider = next.registerWithVsCode && next.mcpServer;
    if (wantProvider && !this.providerReg) {
      this.providerReg = vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
        onDidChangeMcpServerDefinitions: this.definitionsChanged.event,
        provideMcpServerDefinitions: () => {
          const s = this.server;
          if (!s) return [];
          return [new vscode.McpHttpServerDefinition("SysML Editor", vscode.Uri.parse(s.url), { Authorization: `Bearer ${s.token}` }, this.version)];
        },
      });
    } else if (!wantProvider && this.providerReg) {
      this.providerReg.dispose();
      this.providerReg = undefined;
    }
    this.plan = next;
  }

  /**
   * TEST ONLY: call a tool over MCP, using an SDK client inside the bundled extension (the node16-compiled
   * integration tests cannot import the ESM SDK). Returns the text content, like the LM tools channel does.
   */
  async testCallToolOverMcp(name: string, input: object): Promise<{ text: string; isError: boolean }> {
    const e = this.mcpEndpoint();
    if (!e) throw new Error("MCP server is not running");
    const client = new Client({ name: "sysml-test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(e.url), { requestInit: { headers: { Authorization: `Bearer ${e.token}` } } }));
    try {
      const r = await client.callTool({ name, arguments: input as Record<string, unknown> });
      const content = r.content as Array<{ type: string; text?: string }>;
      return { text: content.map((c) => c.text ?? "").join(""), isError: r.isError === true };
    } finally {
      await client.close();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.lmRegistrations.forEach((d) => d.dispose());
    this.providerReg?.dispose();
    this.subs.forEach((d) => d.dispose());
    void this.server?.stop();
    this.server = undefined;
  }
}

function toLmResult(r: ToolResult): vscode.LanguageModelToolResult {
  const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [new vscode.LanguageModelTextPart(r.text)];
  if (r.image) parts.push(vscode.LanguageModelDataPart.image(r.image.data, r.image.mimeType));
  return new vscode.LanguageModelToolResult(parts);
}
