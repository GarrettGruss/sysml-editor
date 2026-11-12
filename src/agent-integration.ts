/**
 * VS Code side of the agent tools: the Language Model Tools adapter, the hosted MCP server, and its registration
 * with VS Code, switched by `sysml.agent.channels`. The logic lives in `vscode`-free modules; this is wiring.
 */
import * as vscode from "vscode";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { planChannels, type ChannelPlan } from "./agent-channels.js";
import { callTool, toolDefinitions, type DiagramService, type ToolContext, type ToolResult } from "./agent-tools/index.js";
import { fsPathToToolPath, type FolderInfo } from "./agent-paths.js";
import { McpServerController } from "./mcp/server-controller.js";
import { startMcpServer } from "./mcp/server.js";
import type { WorkspaceModel } from "./workspace/workspace-model.js";

export const MCP_PROVIDER_ID = "sysml.mcpServer";
const CHANNELS_SETTING = "sysml.agent.channels";

export class AgentIntegration implements vscode.Disposable {
  private plan: ChannelPlan = { lmTools: false, mcpServer: false, registerWithVsCode: false };
  private lmRegistrations: vscode.Disposable[] = [];
  private readonly controller: McpServerController<string[]>;
  private providerReg: vscode.Disposable | undefined;
  private readonly definitionsChanged = new vscode.EventEmitter<void>();
  private readonly subs: vscode.Disposable[] = [];
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly model: WorkspaceModel,
    private readonly log: (msg: string) => void,
    private readonly version: string,
    private readonly diagrams?: DiagramService,
  ) {
    this.controller = new McpServerController<string[]>((workspaces) =>
      startMcpServer({ context: () => this.context(), workspaces, serverVersion: this.version, log: this.log }),
    );
    this.subs.push(
      this.definitionsChanged,
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CHANNELS_SETTING)) void this.apply();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.apply()),
    );
  }

  /** All workspace folders; the first one defines plain relative paths. */
  get folders(): FolderInfo[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => ({ name: f.name, fsPath: f.uri.fsPath }));
  }

  /** The first workspace folder. */
  get workspaceFolder(): string | undefined {
    return this.folders[0]?.fsPath;
  }

  currentPlan(): ChannelPlan {
    return this.plan;
  }

  /** Port and token of the running MCP server, for tests. */
  mcpEndpoint(): { url: string; port: number; token: string } | undefined {
    const s = this.controller.server;
    return s && { url: s.url, port: s.port, token: s.token };
  }

  private context(): ToolContext {
    const folders = this.folders;
    const uriToPath = (uri: string): string | undefined =>
      uri.startsWith("file:") ? fsPathToToolPath(folders, vscode.Uri.parse(uri).fsPath) : undefined;
    return {
      index: this.model.index,
      uriToPath,
      pathToUri: (p) => this.model.index.uris().find((u) => uriToPath(u) === p),
      ...(this.diagrams ? { diagrams: this.diagrams } : {}),
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
          invoke: async (options) => toLmResult(await callTool(def.name, options.input, this.context())),
          // Write tools apply directly (the user can undo them): a progress message, and no confirmation prompt.
          ...(def.readOnly ? {} : { prepareInvocation: () => ({ invocationMessage: `SysML: ${def.name.replace(/^sysml_/, "").replace(/_/g, " ")}` }) }),
        }),
      );
    } else if (!next.lmTools) {
      this.lmRegistrations.forEach((d) => d.dispose());
      this.lmRegistrations = [];
    }

    const folders = this.folders.map((f) => f.fsPath);
    const want = next.mcpServer && folders.length > 0 ? folders : undefined;
    const changed = await this.controller.reconcile(want);
    if (this.disposed) return;
    if (changed) {
      const s = this.controller.server;
      if (s) this.log(`MCP server listening on ${s.url}`);
      this.definitionsChanged.fire();
    }

    const wantProvider = next.registerWithVsCode && next.mcpServer;
    if (wantProvider && !this.providerReg) {
      this.providerReg = vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
        onDidChangeMcpServerDefinitions: this.definitionsChanged.event,
        provideMcpServerDefinitions: () => {
          const s = this.controller.server;
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
  async testCallToolOverMcp(name: string, input: object): Promise<{ text: string; isError: boolean; images: { mimeType: string; base64: string }[] }> {
    const e = this.mcpEndpoint();
    if (!e) throw new Error("MCP server is not running");
    const client = new Client({ name: "sysml-test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(e.url), { requestInit: { headers: { Authorization: `Bearer ${e.token}` } } }));
    try {
      const r = await client.callTool({ name, arguments: input as Record<string, unknown> });
      const content = r.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      return {
        text: content.map((c) => c.text ?? "").join(""),
        isError: r.isError === true,
        images: content.filter((c) => c.type === "image").map((c) => ({ mimeType: c.mimeType ?? "", base64: c.data ?? "" })),
      };
    } finally {
      await client.close();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.lmRegistrations.forEach((d) => d.dispose());
    this.providerReg?.dispose();
    this.subs.forEach((d) => d.dispose());
    void this.controller.dispose().catch((e: unknown) => this.log(`agent channels: ${String(e)}`));
  }
}

function toLmResult(r: ToolResult): vscode.LanguageModelToolResult {
  const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [new vscode.LanguageModelTextPart(r.text)];
  if (r.image) parts.push(vscode.LanguageModelDataPart.image(r.image.data, r.image.mimeType));
  return new vscode.LanguageModelToolResult(parts);
}
