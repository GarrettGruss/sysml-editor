import * as assert from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Ctx } from "./diagram-interaction.js";
import { isPng, viaLm, viaMcp, type ToolOutput } from "./diagram-agent.js";

type Test = [name: string, fn: () => Promise<void>];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SETTING = "uiControl";

const FLEET = `package UiFleet {
  part def Engine;
  part def Ship;
  part def Frigate :> Ship { part engine : Engine; }
  part def Destroyer :> Frigate;
}
`;
const REQ_DOC = "package UiReqD {\n    package One {\n        doc /* first */\n    }\n    package Two {\n        doc /* second */\n        requirement <'R1'> r;\n    }\n    package Three;\n}\n";
const MATRIX = path.resolve(__dirname, "../../../test/fixtures/requirements/verification-matrix.sysml");

/** The UI-control tools through both channels (MCP and Language Model Tools), with `sysml.agent.uiControl` on at user level. */
export function uiAgentTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const abs = (name: string) => uriOf(name).fsPath;
  /** Paths in sysml_ui_state are workspace-relative. */
  const rel = (name: string) => name;
  const ui = () => (api as unknown as { ui: { auditLines(): string[] } }).ui;
  const cfg = () => vscode.workspace.getConfiguration("sysml.agent");
  const setUiControl = async (on: boolean | undefined) => {
    // The write to user settings can take a long time to resolve in a test window: poll for the value instead of waiting for it.
    void cfg().update(SETTING, on, vscode.ConfigurationTarget.Global).then(undefined, () => undefined);
    for (let i = 0; i < 500 && vscode.workspace.getConfiguration().inspect<boolean>("sysml.agent.uiControl")?.globalValue !== on; i++) await sleep(20);
    assert.strictEqual(vscode.workspace.getConfiguration().inspect<boolean>("sysml.agent.uiControl")?.globalValue, on, "the user setting took effect");
  };
  let turn = 0;
  /** One call, alternating channels so each tool is exercised through both over the run. */
  const call = async (name: string, input: object, channel?: "mcp" | "lm"): Promise<ToolOutput & { json: any }> => {
    const ch = channel ?? (turn++ % 2 === 0 ? "mcp" : "lm");
    const label = `${ch} ${name} ${JSON.stringify(input).slice(0, 120)}`;
    const run = ch === "mcp" ? viaMcp(api, name, input) : viaLm(name, input);
    let timer: NodeJS.Timeout | undefined;
    const r = await Promise.race([run, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`tool call timed out after 45 s: ${label}`)), 45000); })]).finally(() => clearTimeout(timer));
    let json: any;
    try { json = JSON.parse(r.text); } catch { json = undefined; }
    return { ...r, json };
  };
  /** The same read-only call on both channels, which must agree. */
  const both = async (name: string, input: object) => {
    const a = await call(name, input, "mcp");
    const b = await call(name, input, "lm");
    assert.strictEqual(a.text, b.text, `${name}: MCP and LM agree`);
    return a;
  };
  const ok = (r: ToolOutput & { json: any }, what: string) => {
    assert.ok(!r.isError && !/^(Refused|The .* failed)/.test(r.text), `${what}: ${r.text.slice(0, 300)}`);
    return r;
  };
  const withUi = (fn: () => Promise<void>) => async () => {
    await setUiControl(true);
    try {
      await fn();
    } finally {
      api.diagram.setUi(undefined);
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      // The setting stays on for the rest of the run: switching it off again from on freezes the test window. Each run has its own user-data dir (runTest.ts).
    }
  };
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    const end = performance.now() + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(40);
    }
  };
  const diagramText = (d: object) => JSON.stringify({ version: 1, sources: ["tmp-uifleet.sysml"], edges: [], ...d }, null, 2) + "\n";
  const nodes3 = [
    { id: "n1", ref: "UiFleet::Ship", x: 120, y: 40, w: 160, h: 60 },
    { id: "n2", ref: "UiFleet::Frigate", x: 40, y: 200, w: 160, h: 60 },
    { id: "n3", ref: "UiFleet::Destroyer", x: 300, y: 360, w: 160, h: 60 },
  ];
  /** Write the fleet model and diagrams, wait for the model, run, then remove everything. */
  const withFleet = (diagrams: Record<string, object>, fn: () => Promise<void>) => withUi(async () => {
    const files = ["tmp-uifleet.sysml", ...Object.keys(diagrams)];
    writeFileSync(abs("tmp-uifleet.sysml"), FLEET);
    await vscode.workspace.openTextDocument(uriOf("tmp-uifleet.sysml"));
    await waitFor(() => api.model.index.findByQualifiedName("UiFleet::Destroyer").length > 0, 30000, "the fleet model is indexed");
    for (const [n, d] of Object.entries(diagrams)) writeFileSync(abs(n), diagramText(d));
    try {
      await fn();
      assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
    } finally {
      for (const f of files) rmSync(abs(f), { force: true });
      rmSync(abs("UiFleet.sysmld"), { force: true });
      rmSync(abs("Frigate.sysmld"), { force: true });
    }
  });
  const g = (path: string, gesture: object, channel?: "mcp" | "lm") => call("sysml_ui_diagram", { path, gesture }, channel).then((r) => ok(r, `gesture ${JSON.stringify(gesture)}`).json as {
    selected: string[]; menu: string[]; nodes: { id: string; x: number; y: number; w: number; h: number }[]; legend?: string[]; clipboard: string; edgeCount: number;
  });
  const state = async () => ok(await both("sysml_ui_state", {}), "state").json as {
    enabled: boolean; activeEditor?: { kind: string; path?: string; dirty: boolean }; selection: { path: string; ids: string[] }[]; undo: { path: string; undo?: string; redo?: string }[];
    messages: { level: string; text: string }[]; prompts: { id: number; kind: string; title?: string; items?: string[]; validation?: string }[]; navigation: string[]; clipboard: string;
  };

  const UI_TOOLS: [string, object][] = [
    ["sysml_ui_command", { command: "undo" }],
    ["sysml_ui_answer", { cancel: true }],
    ["sysml_ui_diagram", { path: "ports-general.sysmld", gesture: { kind: "flush" } }],
    ["sysml_ui_requirements", { package: "Nope", action: "observe" }],
    ["sysml_ui_tree", { op: "list" }],
    ["sysml_ui_screenshot", { path: "ports-general.sysmld" }],
  ];

  return [
    ["UI control off (the default): every UI tool is refused through MCP and LM, sysml_ui_state says so, and nothing is opened", async () => {
      await setUiControl(false);
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      const before = vscode.window.tabGroups.all.flatMap((gr) => gr.tabs).length;
      for (const [name, input] of UI_TOOLS) {
        for (const ch of ["mcp", "lm"] as const) {
          const r = await call(name, input, ch);
          assert.match(r.text, /sysml\.agent\.uiControl/, `${name} via ${ch} names the setting`);
          if (ch === "mcp") assert.ok(r.isError, `${name} is an error over MCP`);
        }
      }
      const s = await both("sysml_ui_state", {});
      assert.strictEqual(s.json.enabled, false);
      assert.match(s.json.reason, /sysml\.agent\.uiControl/);
      assert.strictEqual(vscode.window.tabGroups.all.flatMap((gr) => gr.tabs).length, before, "no editor was opened");
      // a workspace-level value does not turn it on (the setting is user-only)
      await cfg().update(SETTING, true, vscode.ConfigurationTarget.Workspace).then(undefined, () => undefined);
      try {
        assert.match((await call("sysml_ui_command", { command: "undo" }, "mcp")).text, /sysml\.agent\.uiControl/);
      } finally {
        await cfg().update(SETTING, undefined, vscode.ConfigurationTarget.Workspace).then(undefined, () => undefined);
      }
    }],

    ["UI control on: unlisted commands, outside paths, bad gestures and unknown tree commands are refused on both channels, and every call is in the audit log", withUi(async () => {
      const mark = ui().auditLines().length;
      for (const ch of ["mcp", "lm"] as const) {
        for (const id of ["workbench.action.terminal.new", "vscode.open", "workbench.action.files.openFile", "editor.action.clipboardCopyAction"]) {
          const r = await call("sysml_ui_command", { command: id }, ch);
          assert.match(r.text, /allowlist/, `${id} via ${ch}`);
        }
        const outside = await call("sysml_ui_diagram", { path: "/etc/passwd.sysmld", gesture: { kind: "flush" } }, ch);
        assert.match(outside.text, /outside the workspace/);
        const bad = await call("sysml_ui_diagram", { path: "ports-general.sysmld", gesture: { kind: "eval", code: "1" } }, ch);
        assert.match(bad.text, /Unknown gesture kind/);
        const arg = await call("sysml_ui_command", { command: "sysml.openRequirementsEditor", args: ["/etc/passwd"] }, ch);
        assert.match(arg.text, /outside|Refused/i, `an outside path argument via ${ch}`);
        const tree = await call("sysml_ui_tree", { op: "command", command: "workbench.action.terminal.new" }, ch);
        assert.match(tree.text, /allowlist|not offered/);
        const req = await call("sysml_ui_requirements", { file: "/etc/passwd", action: "observe" }, ch);
        assert.match(req.text, /outside the workspace/);
      }
      const lines = ui().auditLines().slice(mark);
      for (const t of ["sysml_ui_command", "sysml_ui_diagram", "sysml_ui_tree", "sysml_ui_requirements"]) assert.ok(lines.some((l) => l.includes(`${t} target=`)), `the audit log has ${t}`);
      assert.ok(lines.some((l) => l.includes("workbench.action.terminal.new")), "refused calls are logged too");
      assert.ok(lines.every((l) => /^\d{4}-\d\d-\d\dT/.test(l)), "each line is timestamped");
      const s = await both("sysml_ui_state", {});
      assert.strictEqual(s.json.enabled, true);
    })],

    ["Diagrams through the tools: open, list the menu and click Align Left, multi-select, copy and paste across diagrams, legend and a screenshot", withFleet({
      "tmp-ui-a.sysmld": { kind: "general", root: "UiFleet", nodes: nodes3 },
      "tmp-ui-b.sysmld": { kind: "general", root: "UiFleet", nodes: [{ id: "n1", ref: "UiFleet::Engine", x: 40, y: 40, w: 160, h: 60 }] },
    }, async () => {
      const a = "tmp-ui-a.sysmld", b = "tmp-ui-b.sysmld";
      let o = await g(a, { kind: "flush" });
      assert.deepStrictEqual(o.nodes.map((n) => n.id).sort(), ["n1", "n2", "n3"]);
      await g(a, { kind: "select", id: "n1" });
      await g(a, { kind: "select", id: "n2", shift: true });
      o = await g(a, { kind: "select", id: "n3", shift: true });
      assert.deepStrictEqual([...o.selected].sort(), ["n1", "n2", "n3"], "multi-select");
      o = await g(a, { kind: "contextmenu", id: "n1" });
      assert.ok(o.menu.includes("Align Left"), `the menu lists Align Left: ${o.menu.join(", ")}`);
      assert.strictEqual((await state()).selection.find((s) => s.path === rel(a))?.ids.length, 3, "state shows the selection");
      o = await g(a, { kind: "menuItem", label: "Align Left" });
      await waitFor(async () => new Set((await g(a, { kind: "flush" })).nodes.map((n) => n.x)).size === 1, 10000, "left edges equal");
      assert.strictEqual(api.diagram.state(uriOf(a)).dirty, true, "a layout edit dirties the diagram");
      // copy two nodes, paste into the other diagram
      await g(a, { kind: "select", id: "n1" });
      await g(a, { kind: "select", id: "n2", shift: true });
      o = await g(a, { kind: "key", key: "c", ctrl: true });
      await waitFor(async () => (await g(a, { kind: "flush" })).clipboard === "elements", 5000, "clipboard holds elements");
      assert.strictEqual((await state()).clipboard, "elements");
      await api.diagram.open(uriOf(b));
      await g(b, { kind: "flush" });
      await g(b, { kind: "key", key: "v", ctrl: true });
      await waitFor(async () => (await g(b, { kind: "flush" })).nodes.length === 3, 15000, "two elements pasted into b");
      // legend and screenshot
      o = await g(a, { kind: "legend", show: true });
      await waitFor(async () => ((await g(a, { kind: "flush" })).legend ?? []).includes("Part def"), 10000, "legend lists Part def");
      for (const ch of ["mcp", "lm"] as const) {
        const shot = await call("sysml_ui_screenshot", { path: a }, ch);
        assert.strictEqual(shot.images.length, 1, `a screenshot via ${ch}`);
        assert.ok(isPng(shot.images[0]!.data) && shot.images[0]!.data.length > 2048);
        if (ch === "mcp") { mkdirSync(c.artifactDir, { recursive: true }); writeFileSync(path.join(c.artifactDir, "ui-legend-screenshot.png"), shot.images[0]!.data); }
      }
      o = await g(a, { kind: "legend", show: false });
      await waitFor(async () => (await g(a, { kind: "flush" })).legend === undefined, 10000, "legend off");
    })],

    ["Back and Forward through sysml_ui_command move between the two diagrams that were opened", withFleet({
      "tmp-ui-a.sysmld": { kind: "general", root: "UiFleet", nodes: nodes3 },
      "tmp-ui-b.sysmld": { kind: "general", root: "UiFleet", nodes: [{ id: "n1", ref: "UiFleet::Engine", x: 40, y: 40, w: 160, h: 60 }] },
    }, async () => {
      await vscode.commands.executeCommand("vscode.openWith", uriOf("tmp-ui-a.sysmld"), "sysml.diagram");
      await vscode.commands.executeCommand("vscode.openWith", uriOf("tmp-ui-b.sysmld"), "sysml.diagram");
      await waitFor(async () => (await state()).activeEditor?.path === rel("tmp-ui-b.sysmld"), 10000, "b is active");
      const r = ok(await call("sysml_ui_command", { command: "workbench.action.navigateBack" }), "back");
      assert.strictEqual(r.json.completed, true);
      await waitFor(async () => (await state()).activeEditor?.path === rel("tmp-ui-a.sysmld"), 10000, "back shows a");
      ok(await call("sysml_ui_command", { command: "workbench.action.navigateForward" }), "forward");
      await waitFor(async () => (await state()).activeEditor?.path === rel("tmp-ui-b.sysmld"), 10000, "forward shows b");
    })],

    ["Tree through the tools: list, select one node (several are refused), collapse all, refresh, create a diagram with naming prompts, then undo, dirty and save", withFleet({
      "tmp-ui-a.sysmld": { kind: "general", root: "UiFleet", nodes: nodes3 },
    }, async () => {
      const list = async (parent?: string, depth = 4) => ok(await both("sysml_ui_tree", { op: "list", ...(parent ? { parent } : {}), depth, limit: 500 }), "list").json.nodes as { id: string; label: string; contextValue: string; selected: boolean; depth: number }[];
      const roots = await list(undefined, 1);
      assert.ok(roots.length > 0, "the tree has roots");
      let all = await list();
      const find = (label: string) => all.find((n) => n.label === label || n.label.startsWith(label + " "));
      const frigate = find("Frigate");
      assert.ok(frigate, `Frigate is listed: ${all.map((n) => n.label).join(", ")}`);
      const ship = find("Ship")!;
      // select one node, observe the selection
      ok(await call("sysml_ui_tree", { op: "select", nodes: [frigate.id] }), "select");
      await waitFor(async () => (await list()).find((n) => n.id === frigate.id)?.selected === true, 5000, "Frigate selected");
      // several nodes: refused explicitly, the single selection is unchanged
      for (const ch of ["mcp", "lm"] as const) {
        const many = await call("sysml_ui_tree", { op: "select", nodes: [frigate.id, ship.id] }, ch);
        assert.match(many.text, /several|one node/i, `multi-select refused via ${ch}`);
      }
      assert.strictEqual((await list()).find((n) => n.id === frigate.id)?.selected, true);
      ok(await call("sysml_ui_tree", { op: "command", command: "sysml.tree.refresh" }), "refresh");
      ok(await call("sysml_ui_tree", { op: "collapseAll" }), "collapse all");
      all = await list(undefined, 1);
      assert.ok(all.every((n) => n.depth === 1));
      // create a diagram from a tree node: a pick, then a name; an invalid name keeps the box open
      all = await list();
      const node = all.find((n) => n.label === "Frigate" || n.label.startsWith("Frigate "))!;
      let r = ok(await call("sysml_ui_tree", { op: "command", command: "sysml.newDiagram", node: node.id }), "new diagram");
      let prompts = r.json.prompts as { id: number; kind: string; items?: string[]; validation?: string }[];
      assert.strictEqual(prompts[0]?.kind, "pick", "the kind is asked first");
      assert.ok(prompts[0]!.items!.includes("General View"));
      ok(await call("sysml_ui_answer", { pick: "General View" }), "answer kind");
      await waitFor(async () => (await state()).prompts.some((p) => p.kind === "input"), 10000, "the name is asked");
      const bad = ok(await call("sysml_ui_answer", { text: "bad/name" }), "invalid name answer");
      assert.match(bad.text, /name|character|invalid/i, `a validation message comes back: ${bad.text.slice(0, 200)}`);
      assert.ok((await state()).prompts.some((p) => p.kind === "input"), "the box stays open");
      ok(await call("sysml_ui_answer", { text: "FrigateView" }), "valid name");
      await waitFor(async () => (await state()).activeEditor?.path === rel("FrigateView.sysmld"), 20000, "the new diagram opens");
      rmSync(abs("FrigateView.sysmld"), { force: true });
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      // undo, dirty and save on a moved node
      const a = "tmp-ui-a.sysmld";
      const before = (await g(a, { kind: "flush" })).nodes.find((n) => n.id === "n1")!;
      await g(a, { kind: "drag", id: "n1", dx: 96, dy: 64 });
      await waitFor(async () => (await state()).activeEditor?.dirty === true, 10000, "the move dirties the tab");
      const s = await state();
      assert.ok(s.undo.find((u) => u.path === rel(a))?.undo, "an undo label is shown");
      const moved = (await g(a, { kind: "flush" })).nodes.find((n) => n.id === "n1")!;
      assert.ok(moved.x !== before.x || moved.y !== before.y, "the node moved");
      ok(await call("sysml_ui_command", { command: "undo" }), "undo");
      await waitFor(async () => { const n = (await g(a, { kind: "flush" })).nodes.find((x) => x.id === "n1")!; return n.x === before.x && n.y === before.y; }, 10000, "undo restored the position");
      assert.ok((await state()).undo.find((u) => u.path === rel(a))?.redo, "redo is offered");
      ok(await call("sysml_ui_command", { command: "redo" }), "redo");
      await waitFor(async () => (await g(a, { kind: "flush" })).nodes.find((x) => x.id === "n1")!.x === moved.x, 10000, "redo moved it again");
      const disk = () => JSON.parse(readFileSync(abs(a), "utf8")).nodes.find((n: { id: string }) => n.id === "n1").x as number;
      assert.strictEqual(disk(), before.x, "nothing saved yet");
      ok(await call("sysml_ui_command", { command: "workbench.action.files.save" }), "save");
      await waitFor(() => disk() === moved.x, 10000, "the save wrote the position");
      await waitFor(async () => (await state()).activeEditor?.dirty === false, 10000, "clean after save");
    })],

    ["Requirements through the tools: Document view outline, reorder by dragging a section, Matrix view and CSV export", withUi(async () => {
      const files = ["tmp-uireqd.sysml", "tmp-uireqm.sysml", "tmp-uimatrix.csv"];
      writeFileSync(abs(files[0]!), REQ_DOC);
      writeFileSync(abs(files[1]!), readFileSync(MATRIX, "utf8").replace(/MiningSpec/g, "UiReqM"));
      try {
        await vscode.workspace.openTextDocument(uriOf(files[0]!));
        await vscode.workspace.openTextDocument(uriOf(files[1]!));
        await waitFor(() => api.model.index.findByQualifiedName("UiReqD::Three").length > 0 && api.model.index.findByQualifiedName("UiReqM::Standalone").length > 0, 120000, "both packages indexed");
        await waitFor(() => !api.model.index.getDocument(uriOf(files[0]!).toString())?.detailsPending && !api.model.index.getDocument(uriOf(files[1]!).toString())?.detailsPending, 280000, "details settled");
        const req = (input: object, ch?: "mcp" | "lm") => call("sysml_ui_requirements", input, ch).then((r) => ok(r, JSON.stringify(input)).json as {
          view: string; outline: { number: string; heading: string }[]; items: { id: string; name: string }[]; matrixRows: { qn: string; satisfiedBy: string[]; verifiedBy: string[] }[];
        });
        let o = await req({ package: "UiReqD", action: "open", view: "document" });
        await waitFor(async () => (await req({ package: "UiReqD", action: "observe" })).view === "document", 30000, "document view");
        o = await req({ package: "UiReqD", action: "observe" });
        assert.deepStrictEqual(o.outline.map((x) => `${x.number} ${x.heading}`), ["1 One", "2 Two", "3 Three"]);
        const text = () => readFileSync(abs(files[0]!), "utf8");
        await req({ package: "UiReqD", action: "dragToc", fromQn: "UiReqD::One", ontoQn: "UiReqD::Two", position: "after" });
        await waitFor(() => text().indexOf("package Two") < text().indexOf("package One"), 90000, "One now follows Two in the text");
        await waitFor(async () => (await req({ package: "UiReqD", action: "observe" })).outline.map((x) => x.heading).join() === "Two,One,Three", 30000, "the outline follows");
        // matrix
        await req({ package: "UiReqM", action: "open", view: "matrix" });
        await waitFor(async () => (await req({ package: "UiReqM", action: "observe" })).matrixRows.length > 0, 60000, "matrix rows");
        const m = await req({ package: "UiReqM", action: "observe" });
        assert.ok(m.matrixRows.some((r) => r.qn.endsWith("Standalone::parentReq")), "the matrix lists a requirement");
        assert.ok(m.matrixRows.some((r) => r.verifiedBy.length > 0), "verification links are listed");
        const x = await call("sysml_ui_requirements", { package: "UiReqM", action: "exportMatrix", format: "csv", path: files[2]! });
        ok(x, "export");
        await waitFor(() => existsSync(abs(files[2]!)), 10000, "the CSV exists");
        assert.match(readFileSync(abs(files[2]!), "utf8"), /parentReq/);
        const out = await call("sysml_ui_requirements", { package: "UiReqM", action: "exportMatrix", format: "csv", path: "/tmp/x.csv" });
        assert.match(out.text, /outside the workspace/);
        assert.deepStrictEqual(api.requirements.errors(), []);
      } finally {
        for (const f of files) rmSync(abs(f), { force: true });
      }
    })],
  ];
}
