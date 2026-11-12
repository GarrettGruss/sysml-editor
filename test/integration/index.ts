import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

// Structural copies of the extension's test API (importing src/ would pull the whole bundle into this compile).
interface ModelNode { id: string; uri: string }
interface TestApi {
  model: { ready: Promise<void>; index: { uris(): string[]; isReadOnly(u: string): boolean; getDocument(u: string): { errors: unknown[]; detailsPending?: boolean } | undefined } };
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
  const norm = (p: string) => path.resolve(p).toLowerCase();
  const insideDir = process.env.SYSML_EXPECT_EXTENSIONS_DIR;
  const repoRoot = process.env.SYSML_EXPECT_EXTENSION_PATH;
  if (insideDir) {
    // Run against the installed .vsix: must never silently test the working tree.
    assert.ok((norm(ext.extensionPath) + path.sep).startsWith(norm(insideDir) + path.sep), `extension ${ext.extensionPath} is inside the installed-extensions dir ${insideDir}`);
  } else {
    assert.ok(repoRoot, "SYSML_EXPECT_EXTENSION_PATH is set by runTest");
    assert.strictEqual(norm(ext.extensionPath), norm(repoRoot), "normal run loads the extension from the repository root");
  }
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
      assert.match(String(item.description), /syntax error/);
      // The first report may be the provisional fast-path error; wait for the parse worker's details.
      await waitFor(() => ix.getDocument(vehicleUri.toString())?.detailsPending === false, 30000, "error details from the parse worker");
      const precise = String(api.provider.getTreeItem(rootOf("Vehicle")).tooltip);
      assert.match(precise, /line 3, column 3: mismatched input 'part'/);
      assert.doesNotMatch(precise, /details pending/);
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
    ["end to end: tree, both tool channels and the document agree through edit, syntax error and fix", async () => {
      await api.agent.apply();
      assert.ok(api.agent.mcpEndpoint(), "MCP server is running");
      const lm = async (name: string, input: object) => {
        const r = await vscode.lm.invokeTool(name, { toolInvocationToken: undefined, input });
        return r.content.map((p) => (p as vscode.LanguageModelTextPart).value).join("");
      };
      const mcp = async (name: string, input: object) => {
        const r = await api.agent.testCallToolOverMcp(name, input);
        assert.strictEqual(r.isError, false, `${name} over MCP: ${r.text}`);
        return r.text;
      };
      const both = async (name: string, input: object) => {
        const a = await lm(name, input);
        const b = await mcp(name, input);
        assert.strictEqual(a, b, `${name}: identical over both channels`);
        return JSON.parse(a);
      };
      const doc = await vscode.workspace.openTextDocument(vehicleUri);

      // (1) the tree as the provider presents it
      assert.ok(labels(api.provider.getChildren()).includes("Vehicle"));
      assert.ok(!labels(api.provider.getChildren(rootOf("Vehicle"))).includes("Trailer"));

      // (2) an unsaved edit adds a part def
      const add = new vscode.WorkspaceEdit();
      add.insert(vehicleUri, new vscode.Position(1, 0), "  part def Trailer;\n");
      assert.ok(await vscode.workspace.applyEdit(add));
      assert.ok(doc.isDirty, "edit is unsaved");
      await waitFor(() => labels(api.provider.getChildren(rootOf("Vehicle"))).includes("Trailer"), 2000, "Trailer in the tree");

      // (3) tree, both channels and document text agree
      const treeJson = await both("sysml_get_element_tree", { root: "Vehicle", depth: 2 });
      const names = (treeJson.nodes[0].children as { name: string }[]).map((c) => c.name);
      assert.ok(names.includes("Trailer"), `tool tree has Trailer: ${names}`);
      assert.deepStrictEqual(
        names.slice().sort(),
        labels(api.provider.getChildren(rootOf("Vehicle"))).sort(),
        "tool tree and view tree list the same children",
      );
      const el = (await both("sysml_get_element", { qualifiedName: "Vehicle::Trailer" })).elements[0];
      assert.strictEqual(el.name, "Trailer");
      assert.match(String(el.file), /vehicle\.sysml$/);
      assert.ok(doc.lineAt(el.startLine - 1).text.includes("part def Trailer;"), "element line points at the declaration in the document");
      assert.ok(doc.getText().includes("part def Trailer;"));

      // (4) a syntax error: validate reports it on both channels, the tree keeps the previous contents
      const brokenLine = 3; // 1-based line of the text inserted below
      const bad = new vscode.WorkspaceEdit();
      bad.insert(vehicleUri, new vscode.Position(brokenLine - 1, 0), "  part def 123;\n");
      assert.ok(await vscode.workspace.applyEdit(bad));
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 0) > 0, 2000, "error recorded");
      const broken = await both("sysml_validate", { file: "vehicle.sysml" });
      const syntax = (broken.problems as { file: string; line: number; severity: string }[]).filter((p) => p.severity === "error");
      assert.ok(syntax.length > 0, "validate reports the syntax error");
      assert.ok(syntax.some((p) => p.line === brokenLine && /vehicle\.sysml$/.test(p.file)), `error on line ${brokenLine}: ${JSON.stringify(syntax)}`);
      assert.ok(doc.lineAt(brokenLine - 1).text.includes("123"), "the reported line holds the broken text");
      assert.ok(labels(api.provider.getChildren(rootOf("Vehicle"))).includes("Trailer"), "tree keeps the previous contents");
      const keep = await both("sysml_get_element_tree", { root: "Vehicle", depth: 2 });
      assert.ok((keep.nodes[0].children as { name: string }[]).some((c) => c.name === "Trailer"), "tool tree keeps the previous contents");

      // (5) fix it: validate is clean for the file
      const fix = new vscode.WorkspaceEdit();
      fix.delete(vehicleUri, new vscode.Range(brokenLine - 1, 0, brokenLine, 0));
      assert.ok(await vscode.workspace.applyEdit(fix));
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 1) === 0, 2000, "error cleared");
      const clean = await both("sysml_validate", { file: "vehicle.sysml" });
      assert.deepStrictEqual(clean.problems, []);
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
      const listing = async (expected: number) => {
        try {
          await waitFor(() => lmNames().length === expected, 3000, `${expected} sysml_ tools in vscode.lm.tools`);
        } catch (e) {
          throw new Error(`assertion A (vscode.lm.tools listing) failed: expected ${expected}, saw [${lmNames()}]; ${e}`);
        }
      };
      const invoke = async (shouldWork: boolean) => {
        let err: unknown;
        try {
          await vscode.lm.invokeTool("sysml_list_files", { toolInvocationToken: undefined, input: {} });
        } catch (e) {
          err = e;
        }
        if (shouldWork && err) throw new Error(`assertion B (invokeTool) failed: expected success, got ${err}`);
        if (!shouldWork && !err) throw new Error("assertion B (invokeTool) failed: expected rejection, but it succeeded");
      };
      try {
        await set("mcp");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: false, mcpServer: true, registerWithVsCode: true });
        // vscode.lm.tools lists every tool declared in the manifest, whatever the `when` clause says;
        // the clause only governs what VS Code's chat offers. So in mcp mode check the call fails.
        await invoke(false);
        assert.ok(api.agent.mcpEndpoint());
        await set("lmTools");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: true, mcpServer: false, registerWithVsCode: false });
        await listing(4);
        await invoke(true);
        assert.strictEqual(api.agent.mcpEndpoint(), undefined);
        await set("both");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: true, mcpServer: true, registerWithVsCode: false });
        await listing(4);
        await invoke(true);
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
