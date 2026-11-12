import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

// Structural copies of the extension's test API (importing src/ would pull the whole bundle into this compile).
interface ModelNode { id: string; uri: string }
interface TestApi {
  model: { ready: Promise<void>; index: { uris(): string[]; isReadOnly(u: string): boolean; getDocument(u: string): { errors: unknown[] } | undefined } };
  provider: {
    getChildren(n?: ModelNode): ModelNode[];
    getTreeItem(n: ModelNode): vscode.TreeItem;
    onDidChangeTreeData: vscode.Event<unknown>;
  };
  view: vscode.TreeView<ModelNode>;
  agent: {
    apply(): Promise<void>;
    currentPlan(): { lmTools: boolean; mcpServer: boolean; registerWithVsCode: boolean };
    mcpEndpoint(): { url: string; port: number; token: string } | undefined;
    testCallToolOverMcp(name: string, input: object): Promise<{ text: string; isError: boolean }>;
  };
}

type Test = [name: string, fn: () => Promise<void>];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, ms: number, what: string): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) assert.fail(`timed out waiting for: ${what}`);
    await sleep(25);
  }
}

export async function run(): Promise<void> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === "sysml-editor");
  assert.ok(ext, "extension is installed in the development host");
  const api = (await ext.activate()) as TestApi;
  assert.strictEqual(ext.isActive, true, "extension activated");
  await api.model.ready;

  const ix = api.model.index;
  const labelOf = (n: ModelNode) => String(api.provider.getTreeItem(n).label);
  const labels = (nodes: ModelNode[]) => nodes.map(labelOf);
  const rootOf = (label: string) => {
    const n = api.provider.getChildren().find((r) => labelOf(r) === label);
    assert.ok(n, `root ${label}`);
    return n;
  };
  const folder = vscode.workspace.workspaceFolders![0]!.uri;
  const vehicleUri = vscode.Uri.joinPath(folder, "vehicle.sysml");

  const tests: Test[] = [
    ["roots are the workspace packages, not the library", async () => {
      assert.deepStrictEqual(labels(api.provider.getChildren()).sort(), ["Notes", "Ports", "Vehicle", "broken.sysml"]);
      assert.ok(ix.uris().some((u) => ix.isReadOnly(u)), "library is loaded");
      const lib = labels(api.provider.getChildren());
      assert.ok(!lib.includes("ScalarValues") && !lib.includes("ISQ"), "library packages are not roots");
    }],
    ["files under sysml.exclude are not indexed", async () => {
      assert.ok(!ix.uris().some((u) => u.includes("/ignored/")), "ignored/ is not indexed");
      assert.ok(!labels(api.provider.getChildren()).includes("Ignored"));
    }],
    ["a file that never parsed cleanly shows an error node", async () => {
      const node = rootOf("broken.sysml");
      const item = api.provider.getTreeItem(node);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "error");
      assert.strictEqual(item.description, "syntax error");
      assert.match(String(item.tooltip), /line \d+, column \d+/);
      await vscode.commands.executeCommand("sysml.goToDefinition", node);
      const ed = vscode.window.activeTextEditor!;
      assert.ok(ed.document.uri.path.endsWith("/broken.sysml"));
      assert.ok(ed.selection.active.line >= 0);
    }],
    ["children of a part def and typed usage presentation", async () => {
      const vehicle = rootOf("Vehicle");
      assert.deepStrictEqual(labels(api.provider.getChildren(vehicle)), ["Engine", "Car", "Wheel"]);
      const car = api.provider.getChildren(vehicle)[1]!;
      const kids = api.provider.getChildren(car);
      assert.deepStrictEqual(labels(kids), ["engine", "wheels"]);
      const item = api.provider.getTreeItem(kids[0]!);
      assert.strictEqual(item.label, "engine");
      assert.ok(String(item.description).includes("Engine"));
      assert.strictEqual(item.id, kids[0]!.id);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "symbol-field");
      assert.strictEqual(api.provider.getTreeItem(kids[1]!).description, ": Wheel [4]");
      assert.deepStrictEqual(labels(api.provider.getChildren(rootOf("Notes"))), ["Mass"]);
    }],
    ["unsaved edit adds a node within one second and fires a targeted refresh", async () => {
      const doc = await vscode.workspace.openTextDocument(vehicleUri);
      const fired: unknown[] = [];
      const sub = api.provider.onDidChangeTreeData((e) => fired.push(e));
      const before = api.provider.getChildren(rootOf("Vehicle")).map((n) => n.id);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(vehicleUri, new vscode.Position(1, 0), "  part def Gearbox;\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      assert.ok(doc.isDirty, "edit is unsaved");
      const t0 = Date.now();
      await waitFor(() => labels(api.provider.getChildren(rootOf("Vehicle"))).includes("Gearbox"), 1000, "Gearbox in tree");
      assert.ok(Date.now() - t0 < 1000);
      const after = api.provider.getChildren(rootOf("Vehicle")).map((n) => n.id);
      for (const id of before) assert.ok(after.includes(id), "existing node ids are stable");
      assert.ok(fired.length > 0, "tree data change fired");
      assert.ok(fired.every((e) => e !== undefined), "targeted, not a full refresh");
      sub.dispose();
    }],
    ["syntax error keeps old children and sets the error state", async () => {
      const kidsBefore = labels(api.provider.getChildren(rootOf("Vehicle")));
      const edit = new vscode.WorkspaceEdit();
      edit.insert(vehicleUri, new vscode.Position(1, 0), "  part def Broken\n");
      await vscode.workspace.applyEdit(edit);
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 0) > 0, 1500, "error recorded");
      const root = rootOf("Vehicle");
      assert.deepStrictEqual(labels(api.provider.getChildren(root)), kidsBefore);
      const item = api.provider.getTreeItem(root);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "error");
      assert.match(String(item.tooltip), /line \d+, column \d+/);
      assert.match(String(item.description), /syntax error/);
      // Undo the broken text so later tests see a clean model.
      const fix = new vscode.WorkspaceEdit();
      fix.delete(vehicleUri, new vscode.Range(1, 0, 2, 0));
      await vscode.workspace.applyEdit(fix);
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 1) === 0, 1500, "error cleared");
    }],
    ["sysml.goToDefinition selects the name range", async () => {
      const car = api.provider.getChildren(rootOf("Vehicle")).find((n) => labelOf(n) === "Car")!;
      const item = api.provider.getTreeItem(car);
      assert.strictEqual(item.command?.command, "sysml.goToDefinition");
      await vscode.commands.executeCommand("sysml.goToDefinition", car);
      const ed = vscode.window.activeTextEditor!;
      assert.strictEqual(ed.document.uri.toString(), vehicleUri.toString());
      assert.strictEqual(ed.document.getText(ed.selection), "Car");
    }],
    ["cursor on a declaration reveals the tree node", async () => {
      const car = api.provider.getChildren(rootOf("Vehicle")).find((n) => labelOf(n) === "Car")!;
      const engine = api.provider.getChildren(car)[0]!;
      const calls: ModelNode[] = [];
      const view = api.view;
      const orig = view.reveal.bind(view);
      (view as { reveal: typeof view.reveal }).reveal = (n, o) => { calls.push(n); return orig(n, o); };
      try {
        await vscode.commands.executeCommand("sysmlModel.focus");
        await waitFor(() => view.visible, 3000, "view visible");
        const ed = vscode.window.activeTextEditor!;
        const line = ed.document.getText().split("\n").findIndex((l) => l.includes("part engine"));
        ed.selection = new vscode.Selection(line, 11, line, 11);
        await waitFor(() => calls.some((c) => c.id === engine.id), 2000, "reveal of engine");
      } finally {
        (view as { reveal: typeof view.reveal }).reveal = orig;
      }
    }],
    ["channel contract: every tool gives identical text over Language Model Tools and MCP", async () => {
      await api.agent.apply();
      assert.ok(api.agent.mcpEndpoint(), "MCP server is running under the default channels");
      const lm = async (name: string, input: object) => {
        const r = await vscode.lm.invokeTool(name, { toolInvocationToken: undefined, input });
        return r.content.map((p) => (p as vscode.LanguageModelTextPart).value).join("");
      };
      const calls: Array<[string, object]> = [
        ["sysml_list_files", {}],
        ["sysml_get_element_tree", { depth: 1 }],
        ["sysml_get_element", { qualifiedName: "Vehicle::Car" }],
        ["sysml_validate", {}],
      ];
      for (const [name, input] of calls) {
        const viaLm = await lm(name, input);
        const viaMcp = await api.agent.testCallToolOverMcp(name, input);
        assert.strictEqual(viaMcp.isError, false, `${name} over MCP`);
        assert.strictEqual(viaLm, viaMcp.text, `${name}: identical results`);
        JSON.parse(viaLm);
      }
      const car = JSON.parse(await lm("sysml_get_element", { qualifiedName: "Vehicle::Car" }));
      assert.ok(car.elements.length > 0, "in-editor agent reads an element");
    }],
    ["channel contract: both channels see unsaved edits", async () => {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(vehicleUri, new vscode.Position(1, 0), "  part def UnsavedClutch;\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      const doc = await vscode.workspace.openTextDocument(vehicleUri);
      assert.ok(doc.isDirty, "edit is unsaved");
      await waitFor(() => labels(api.provider.getChildren(rootOf("Vehicle"))).includes("UnsavedClutch"), 1500, "index sees the edit");
      const input = { qualifiedName: "Vehicle::UnsavedClutch" };
      const r = await vscode.lm.invokeTool("sysml_get_element", { toolInvocationToken: undefined, input });
      const viaLm = r.content.map((p) => (p as vscode.LanguageModelTextPart).value).join("");
      const viaMcp = await api.agent.testCallToolOverMcp("sysml_get_element", input);
      assert.ok(viaLm.includes("UnsavedClutch"), "LM tools see unsaved content");
      assert.ok(viaMcp.text.includes("UnsavedClutch"), "MCP sees unsaved content");
      assert.strictEqual(viaLm, viaMcp.text);
    }],
    ["MCP rejects a wrong token; bridge reports no server for an unknown workspace", async () => {
      const ep = api.agent.mcpEndpoint()!;
      const res = await fetch(ep.url, { method: "POST", headers: { Authorization: "Bearer wrong", "content-type": "application/json" }, body: "{}" });
      assert.strictEqual(res.status, 401);
      const bridge = path.join(ext.extensionPath, "dist", "mcp-bridge.js");
      const r = spawnSync("node", [bridge, "--workspace", path.join(os.tmpdir(), "sysml-no-such-workspace")], { encoding: "utf8" });
      assert.strictEqual(r.status, 1);
      assert.strictEqual(r.stderr.trim(), "VS Code must be open on this workspace");
    }],
    ["sysml.agent.channels switches channels without a reload", async () => {
      const cfg = vscode.workspace.getConfiguration();
      const set = async (v: string | undefined) => {
        await cfg.update("sysml.agent.channels", v, vscode.ConfigurationTarget.Workspace);
        await api.agent.apply();
      };
      const lmNames = () => vscode.lm.tools.map((t) => t.name).filter((n) => n.startsWith("sysml_")).sort();
      try {
        await set("mcp");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: false, mcpServer: true, registerWithVsCode: true });
        assert.deepStrictEqual(lmNames(), []);
        assert.ok(api.agent.mcpEndpoint());
        await set("lmTools");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: true, mcpServer: false, registerWithVsCode: false });
        assert.strictEqual(lmNames().length, 4);
        assert.strictEqual(api.agent.mcpEndpoint(), undefined);
        await set("both");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: true, mcpServer: true, registerWithVsCode: false });
        assert.strictEqual(lmNames().length, 4);
        assert.ok(api.agent.mcpEndpoint());
      } finally {
        await set(undefined);
      }
    }],
  ];

  const failures: string[] = [];
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (e) {
      failures.push(name);
      console.error(`not ok - ${name}\n${e instanceof Error ? e.stack : String(e)}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} integration test(s) failed: ${failures.join("; ")}`);
}
