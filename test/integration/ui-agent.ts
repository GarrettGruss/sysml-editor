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
  port def Radar;
  part def Ship;
  part def Frigate :> Ship { part engine : Engine; port radar : Radar; attribute mass; }
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
  const ui = () => (api as unknown as { ui: { auditCount(): number; auditSince(mark: number): string[] } }).ui;
  const cfg = () => vscode.workspace.getConfiguration("sysml.agent");
  const setUiControl = async (on: boolean | undefined) => {
    // The write to user settings can take a long time to resolve in a test window: poll for the value instead of waiting for it.
    void cfg().update(SETTING, on, vscode.ConfigurationTarget.Global).then(undefined, () => undefined);
    for (let i = 0; i < 500 && vscode.workspace.getConfiguration().inspect<boolean>("sysml.agent.uiControl")?.globalValue !== on; i++) await sleep(20);
    assert.strictEqual(vscode.workspace.getConfiguration().inspect<boolean>("sysml.agent.uiControl")?.globalValue, on, "the user setting took effect");
  };
  const setTutor = async (on: boolean | undefined) => {
    void cfg().update("tutor", on, vscode.ConfigurationTarget.Global).then(undefined, () => undefined);
    for (let i = 0; i < 500 && vscode.workspace.getConfiguration().inspect<boolean>("sysml.agent.tutor")?.globalValue !== on; i++) await sleep(20);
    assert.strictEqual(vscode.workspace.getConfiguration().inspect<boolean>("sysml.agent.tutor")?.globalValue, on, "the tutor setting took effect");
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
  /** Close every editor without saving (a scenario's unsaved layout must not reach the next one). */
  const closeEditors = async () => {
    for (let i = 0; i < 20 && vscode.window.tabGroups.all.some((gr) => gr.tabs.length > 0); i++) {
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor").then(undefined, () => undefined);
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    }
  };
  const withUi = (fn: () => Promise<void>) => async () => {
    await setUiControl(true);
    try {
      await fn();
    } finally {
      api.diagram.setUi(undefined);
      await closeEditors();
      await setUiControl(undefined);
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
      await closeEditors();
      for (const f of files) rmSync(abs(f), { force: true });
      rmSync(abs("UiFleet.sysmld"), { force: true });
      rmSync(abs("Frigate.sysmld"), { force: true });
    }
  });
  const g = (path: string, gesture: object, channel?: "mcp" | "lm") => call("sysml_ui_diagram", { path, gesture }, channel).then((r) => ok(r, `gesture ${JSON.stringify(gesture)}`).json as {
    selected: string[]; menu: string[]; nodes: { id: string; x: number; y: number; w: number; h: number }[]; legend?: string[]; clipboard: string; edgeCount: number;
  });
  /** Messages read so far: sysml_ui_state drains them. */
  const seen: { level: string; text: string }[] = [];
  const state = async () => { const r = ok(await call("sysml_ui_state", {}), "state").json; seen.push(...(r.messages ?? [])); return r as {
    enabled: boolean; activeEditor?: { kind: string; path?: string; dirty: boolean }; selection: { path: string; ids: string[] }[]; undo: { path: string; undo?: string; redo?: string }[];
    messages: { level: string; text: string }[]; prompts: { id: number; kind: string; title?: string; items?: string[]; validation?: string }[]; navigation: string[]; clipboard: string;
  }; };
  /** Wait for an open prompt of `kind` (as sysml_ui_state lists it). */
  const promptOf = async (kind: string) => {
    let p: { id: number; kind: string; items?: string[] } | undefined;
    await waitFor(async () => !!(p = (await state()).prompts.find((x) => x.kind === kind)), 15000, `a ${kind} prompt (messages: ${JSON.stringify(seen.slice(-5))}, webview errors: ${JSON.stringify(api.diagram.errors())})`);
    return p!;
  };
  const read = async (f: string) => ok(await call("sysml_read_diagram", { path: f }), `read ${f}`).json as {
    unsaved: boolean; nodes: { id: string; h?: number; element?: { name?: string; qualifiedName?: string; kind: string } }[];
    edges: { id: string; element?: { kind: string }; points?: { x: number; y: number }[]; label?: { dx?: number; dy?: number; w?: number } }[];
  };
  const element = async (qn: string) => call("sysml_get_element", { qualifiedName: qn });
  const exists = async (qn: string) => { const r = await element(qn); return !r.isError && !/not found|No element/i.test(r.text); };

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
      const mark = ui().auditCount();
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
      const lines = ui().auditSince(mark);
      for (const t of ["sysml_ui_command", "sysml_ui_diagram", "sysml_ui_tree", "sysml_ui_requirements"]) assert.ok(lines.some((l) => l.includes(`${t} target=`)), `the audit log has ${t}`);
      assert.ok(lines.some((l) => l.includes("workbench.action.terminal.new")), "refused calls are logged too");
      assert.ok(lines.every((l) => /^\d{4}-\d\d-\d\dT/.test(l)), "each line is timestamped");
      const s = await call("sysml_ui_state", {}, "lm");
      assert.strictEqual(s.json.enabled, true);
      assert.strictEqual((await call("sysml_ui_state", {}, "mcp")).json.enabled, true);
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

    ["Tree through the tools: list, select one node (several are refused), collapse all, refresh, create a diagram with its default name, then undo, dirty and save", withFleet({
      "tmp-ui-a.sysmld": { kind: "general", root: "UiFleet", nodes: nodes3 },
    }, async () => {
      const list = async (parent?: string, depth = 4) => ok(await call("sysml_ui_tree", { op: "list", ...(parent ? { parent } : {}), depth, limit: 500 }), "list").json.nodes as { id: string; label: string; contextValue: string; selected: boolean; depth: number }[];
      const roots = await list(undefined, 1);
      assert.ok(roots.length > 0, "the tree has roots");
      let all: Awaited<ReturnType<typeof list>> = [];
      await waitFor(async () => (all = await list()).some((n) => n.label === "Frigate" || n.label.startsWith("Frigate ")), 30000, "the new file's elements reach the tree");
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
      // create a diagram from a tree node: the kind is picked, the file is named after the element and never takes a name in use
      const created: string[] = [];
      for (let i = 0; i < 2; i++) {
        all = await list();
        const node = all.find((n) => n.label === "Frigate" || n.label.startsWith("Frigate "))!;
        const r = ok(await call("sysml_ui_tree", { op: "command", command: "sysml.newDiagram", node: node.id }), "new diagram");
        const prompts = r.json.prompts as { id: number; kind: string; items?: string[] }[];
        assert.strictEqual(prompts[0]?.kind, "pick", "the kind is asked first");
        assert.ok(prompts[0]!.items!.includes("General View"));
        ok(await call("sysml_ui_answer", { prompt: prompts[0]!.id, pick: "General View" }), "answer kind");
        let path = "";
        await waitFor(async () => { const e = (await state()).activeEditor; path = e?.path ?? ""; return e?.kind === "diagram" && /Frigate.*\.sysmld$/.test(path) && !created.includes(path); }, 20000, "the new diagram opens");
        created.push(path);
      }
      assert.ok(created[0] !== created[1], `a second diagram gets its own name: ${created.join(", ")}`);
      await closeEditors();
      for (const f of created) rmSync(abs(f), { force: true });
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
        // add a requirement inline, then edit its text in place
        await req({ package: "UiReqD", action: "click", selector: "[data-testid=add-root-requirement]" });
        await req({ package: "UiReqD", action: "input", selector: "[data-testid=new-id]", value: "UR9", event: "input" });
        await req({ package: "UiReqD", action: "input", selector: "[data-testid=new-name]", value: "Added", event: "input" });
        await req({ package: "UiReqD", action: "key", selector: "[data-testid=new-name]", key: "Enter" });
        await waitFor(() => text().includes("<'UR9'> Added"), 90000, "the new requirement is written");
        await waitFor(async () => (await req({ package: "UiReqD", action: "observe" })).items.some((i) => i.id === "UR9"), 30000, "the document lists it");
        await req({ package: "UiReqD", action: "input", selector: '[data-key="UiReqD::Two::r|text"]', value: "Edited by the agent." });
        await waitFor(() => text().includes("Edited by the agent."), 90000, "the text is rewritten");
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
    ["Diagram content through the tools: Show/Hide Parts and Ports, Display Related with its message, hide a compartment, Save as Image and apply an aspect, answered with sysml_ui_answer", withFleet({
      "tmp-ui-ic.sysmld": { kind: "interconnection", root: "UiFleet::Frigate", nodes: [{ id: "n1", ref: "UiFleet::Frigate", x: 40, y: 40, w: 300, h: 220 }] },
      "tmp-ui-rel.sysmld": { kind: "general", root: "UiFleet", nodes: [{ id: "n1", ref: "UiFleet::Frigate", x: 200, y: 200, w: 200, h: 120 }] },
      "tmp-ui-comp.sysmld": { kind: "general", root: "UiFleet", nodes: [{ id: "n1", ref: "UiFleet::Frigate", x: 40, y: 40, w: 300, h: 260 }] },
      "tmp-ui-asp.sysmld": { kind: "general", root: "UiFleet", style: { aspects: { Hulls: ["n1", "n2"] } }, nodes: [
        { id: "n1", ref: "UiFleet::Ship", x: 40, y: 40, w: 160, h: 60 }, { id: "n2", ref: "UiFleet::Frigate", x: 40, y: 200, w: 160, h: 60 }, { id: "n3", ref: "UiFleet::Engine", x: 400, y: 40, w: 160, h: 60 },
      ] },
    }, async () => {
      // DGM-007: ports on the shape
      const ic = "tmp-ui-ic.sysmld";
      let o = await g(ic, { kind: "contextmenu", id: "n1" });
      assert.ok(o.menu.includes("Show/Hide Parts and Ports…"), `menu: ${o.menu.join(", ")}`);
      await g(ic, { kind: "menuItem", label: "Show/Hide Parts and Ports…" });
      const mp = await promptOf("multiPick");
      assert.ok(mp.items!.includes("radar") && mp.items!.includes("engine"), `offered: ${mp.items}`);
      ok(await call("sysml_ui_answer", { prompt: mp.id, picks: ["engine", "radar"] }), "pick members");
      await waitFor(async () => (await read(ic)).nodes.some((n) => n.element?.qualifiedName === "UiFleet::Frigate::radar"), 10000, "the port is drawn");
      const radar = (await read(ic)).nodes.find((n) => n.element?.qualifiedName === "UiFleet::Frigate::radar")!;
      const box = (await g(ic, { kind: "flush" })).nodes;
      const frame = box.find((n) => n.id === "n1")!, port = box.find((n) => n.id === radar.id)!;
      const cx = port.x + port.w / 2, cy = port.y + port.h / 2;
      const onBorder = [Math.abs(cx - frame.x), Math.abs(cx - frame.x - frame.w), Math.abs(cy - frame.y), Math.abs(cy - frame.y - frame.h)].some((d) => d <= 2);
      assert.ok(onBorder, `the port sits on the border: ${JSON.stringify({ frame, port })}`);
      assert.strictEqual((await call("sysml_ui_screenshot", { path: ic })).images.length, 1);
      // DGM-009: display related, then the message that everything is drawn
      const rel = "tmp-ui-rel.sysmld";
      await g(rel, { kind: "contextmenu", id: "n1" });
      await g(rel, { kind: "menuItem", label: "Display Related Elements…" });
      let p = await promptOf("multiPick");
      assert.ok(p.items!.includes("Specialization"), `kinds: ${p.items}`);
      ok(await call("sysml_ui_answer", { prompt: p.id, picks: ["Specialization"] }), "pick Specialization");
      await waitFor(async () => (await g(rel, { kind: "flush" })).nodes.length === 3, 10000, "Ship and Destroyer are added");
      // Ask again, taking every kind offered, until the editor says everything related is drawn.
      for (let i = 0; i < 4 && !seen.some((m) => /already drawn/.test(m.text)); i++) {
        await g(rel, { kind: "contextmenu", id: "n1" });
        await g(rel, { kind: "menuItem", label: "Display Related Elements\u2026" });
        let open: { id: number; items?: string[] } | undefined;
        await waitFor(async () => { open = (await state()).prompts.find((x) => x.kind === "multiPick"); return !!open || seen.some((m) => /already drawn/.test(m.text)); }, 15000, `a prompt or the message (messages: ${JSON.stringify(seen.slice(-5))})`);
        if (open) ok(await call("sysml_ui_answer", { prompt: open.id, picks: open.items }), "pick every kind");
      }
      assert.ok(seen.some((m) => m.level === "information" && /already drawn/.test(m.text)), `sysml_ui_state reports the message: ${JSON.stringify(seen)}`);
      // DGM-034: hide the attributes compartment
      const comp = "tmp-ui-comp.sysmld";
      const h0 = (await g(comp, { kind: "flush" })).nodes.find((n) => n.id === "n1")!.h;
      o = await g(comp, { kind: "contextmenu", id: "n1" });
      assert.ok(o.menu.includes("Hide Attributes"), `menu: ${o.menu.join(", ")}`);
      await g(comp, { kind: "menuItem", label: "Hide Attributes" });
      await waitFor(async () => (await g(comp, { kind: "flush" })).nodes.find((n) => n.id === "n1")!.h < h0, 10000, "the node shrinks");
      // DGM-045: Save as Image through the save prompt
      let img = "tmp-ui-img.svg";
      try {
        const r = ok(await call("sysml_ui_command", { command: "sysml.diagram.saveImage" }), "save image");
        const save = (r.json.prompts as { id: number; kind: string }[]).find((x) => x.kind === "save") ?? await promptOf("save");
        // The answer must keep the extension the prompt suggested (security review).
        const ext = /\.(\w+)$/.exec((save as { value?: string }).value ?? "")?.[1] ?? "svg";
        img = `tmp-ui-img.${ext}`;
        ok(await call("sysml_ui_answer", { prompt: save.id, path: img }), "answer save");
        await waitFor(() => existsSync(abs(img)), 10000, "the image is written");
        if (img.endsWith(".svg")) assert.match(readFileSync(abs(img), "utf8"), /^<svg[\s>]/);
      } finally {
        rmSync(abs(img), { force: true });
      }
      // DGM-047: apply an aspect
      const asp = "tmp-ui-asp.sysmld";
      await g(asp, { kind: "flush" });
      ok(await call("sysml_ui_command", { command: "sysml.diagram.applyAspect" }), "apply aspect");
      p = await promptOf("pick");
      ok(await call("sysml_ui_answer", { prompt: p.id, pick: "Hulls" }), "pick Hulls");
      await waitFor(async () => (await g(asp, { kind: "flush" })).nodes.map((n) => n.id).sort().join() === "n1,n2", 10000, "only the aspect's nodes are drawn");
    })],

    ["Model edits through the tools: palette place and name, drop from the tree, draw a relationship, delete a line from the diagram versus from the model, text and diagram sync, tree rename and delete with confirmation", withFleet({
      "tmp-ui-ed.sysmld": { kind: "general", root: "UiFleet", nodes: [{ id: "n1", ref: "UiFleet::Ship", x: 40, y: 40, w: 160, h: 60 }, { id: "n2", ref: "UiFleet::Frigate", x: 40, y: 260, w: 240, h: 140 }] },
    }, async () => {
      const f = "tmp-ui-ed.sysmld";
      const text = () => readFileSync(abs("tmp-uifleet.sysml"), "utf8");
      // palette: place a part in Frigate and name it in the inline input
      await g(f, { kind: "flush" });
      // A webview edit made on a render that a re-index replaced meanwhile is dropped on purpose ("Try it again"), so the test tries again once.
      for (let attempt = 1; attempt <= 2; attempt++) {
        await g(f, { kind: "palette", item: "part", id: "n2", x: 10, y: 10, name: "wheel" });
        try { await waitFor(() => exists("UiFleet::Frigate::wheel"), attempt === 1 ? 10000 : 30000, "the part is in the model"); break; } catch (e) { if (attempt === 2) throw e; }
      }
      // drop from the tree
      await g(f, { kind: "drop", names: ["UiFleet::Engine"] });
      await waitFor(async () => (await read(f)).nodes.some((n) => n.element?.qualifiedName === "UiFleet::Engine"), 10000, "Engine dropped");
      // draw a relationship with the relationship tool, onto the open diagram
      ok(await call("sysml_create_relationship", { kind: "dependency", source: "UiFleet::Engine", target: "UiFleet::Ship", diagram: f }), "dependency");
      let dep: { id: string } | undefined;
      await waitFor(async () => !!(dep = (await read(f)).edges.find((e) => e.element?.kind === "dependency")), 15000, "the dependency line is drawn");
      assert.match(text(), /dependency from Engine to Ship;/);
      // Delete removes the line from the diagram only
      await g(f, { kind: "selectEdge", id: dep!.id });
      await g(f, { kind: "key", key: "Delete" });
      await waitFor(async () => !(await read(f)).edges.some((e) => e.id === dep!.id), 10000, "the line leaves the diagram");
      assert.match(text(), /dependency from Engine to Ship;/, "the model keeps it");
      ok(await call("sysml_ui_command", { command: "undo" }), "undo");
      await waitFor(async () => (await read(f)).edges.some((e) => e.id === dep!.id), 10000, "undo brings the line back");
      // Delete from Model removes the statement
      await g(f, { kind: "menu", id: dep!.id, action: "deleteModel" });
      const c0 = (await state()).prompts.find((x) => x.kind === "confirm");
      if (c0) ok(await call("sysml_ui_answer", { prompt: c0.id, confirm: true }), "confirm");
      await waitFor(() => !/dependency from/.test(text()), 15000, "the statement leaves the model");
      // text and diagram sync: a rename in the model shows in the open diagram
      ok(await call("sysml_rename_element", { element: "UiFleet::Ship", newName: "Hull" }), "rename");
      await waitFor(async () => (await read(f)).nodes.some((n) => n.element?.qualifiedName === "UiFleet::Hull"), 15000, "the diagram shows the new name");
      // tree: rename and delete the new part, answering the prompts
      const list = async (parent?: string) => ok(await call("sysml_ui_tree", { op: "list", depth: 4, limit: 500, ...(parent ? { parent } : {}) }), "list").json.nodes as { id: string; label: string }[];
      const named = (label: string) => (x: { label: string }) => x.label === label || x.label.startsWith(label + " ");
      const node = async (label: string) => {
        let n: { id: string } | undefined;
        await waitFor(async () => { const fr = (await list()).find(named("Frigate")); n = fr ? (await list(fr.id)).find(named(label)) : undefined; return !!n; }, 15000, `${label} in the tree`);
        return n!;
      };
      ok(await call("sysml_ui_tree", { op: "command", command: "sysml.tree.rename", node: (await node("wheel")).id }), "tree rename");
      const inp = await promptOf("input");
      ok(await call("sysml_ui_answer", { prompt: inp.id, text: "rotor" }), "new name");
      await waitFor(() => exists("UiFleet::Frigate::rotor"), 15000, "renamed");
      ok(await call("sysml_ui_tree", { op: "command", command: "sysml.tree.delete", node: (await node("rotor")).id }), "tree delete");
      const conf = await promptOf("confirm");
      ok(await call("sysml_ui_answer", { prompt: conf.id, confirm: true }), "confirm delete");
      await waitFor(async () => !(await exists("UiFleet::Frigate::rotor")), 15000, "deleted from the model");
    })],

    ["Lines through the tools: select a line, add a bend, drag a segment (reroute), move and reset its label, all as unsaved layout", withFleet({}, async () => {
      const f = "tmp-ui-lamp.sysmld";
      writeFileSync(abs(f), readFileSync(abs("lamp-state-transition.sysmld"), "utf8"));
      try {
        await g(f, { kind: "flush" });
        const edge = async () => (await read(f)).edges.find((e) => e.id === "e2")!;
        let o = await g(f, { kind: "selectEdge", id: "e2" });
        assert.deepStrictEqual(o.selected, ["e2"], "the line is selected");
        const n0 = (await edge()).points?.length ?? 0;
        await g(f, { kind: "dblclickEdge", id: "e2" });
        await waitFor(async () => ((await edge()).points?.length ?? 0) > Math.max(n0, 3), 10000, "a bend was added");
        const before = JSON.stringify((await edge()).points);
        await g(f, { kind: "dragSegment", id: "e2", index: 1, d: 24 });
        await waitFor(async () => JSON.stringify((await edge()).points) !== before, 10000, "the route moved");
        await g(f, { kind: "labelDrag", id: "e2", dx: 30, dy: 20 });
        await waitFor(async () => (await edge()).label !== undefined, 10000, "the label offset is stored");
        await g(f, { kind: "labelMenu", id: "e2", action: "reset" });
        await waitFor(async () => { const l = (await edge()).label; return l === undefined || (!l.dx && !l.dy && l.w === undefined); }, 10000, "the label is reset");
        const r = await read(f);
        assert.strictEqual(r.unsaved, true, "layout only, unsaved");
        assert.strictEqual((await state()).activeEditor?.dirty, true);
      } finally {
        await closeEditors();
        rmSync(abs(f), { force: true });
      }
    })],

    ["Tree New File and New Folder through sysml_ui_tree and sysml_ui_answer; a name in use is refused and the box stays open", withUi(async () => {
      const file = "tmp-ui-newfile.sysml", dir = "tmp-ui-newdir";
      try {
        ok(await call("sysml_ui_tree", { op: "command", command: "sysml.tree.newFile" }), "new file");
        let p = await promptOf("input");
        const bad = await call("sysml_ui_answer", { prompt: p.id, text: "vehicle.sysml" });
        assert.match(bad.text, /already exists/, `a name in use is refused with the reason: ${bad.text.slice(0, 200)}`);
        assert.ok((await state()).prompts.some((x) => x.id === p.id), "the box stays open");
        ok(await call("sysml_ui_answer", { prompt: p.id, text: file }), "file name");
        await waitFor(() => existsSync(abs(file)), 15000, "the file is created");
        ok(await call("sysml_ui_tree", { op: "command", command: "sysml.tree.newFolder" }), "new folder");
        p = await promptOf("input");
        ok(await call("sysml_ui_answer", { prompt: p.id, text: dir }), "folder name");
        await waitFor(() => existsSync(abs(dir)), 15000, "the folder is created");
      } finally {
        await closeEditors();
        rmSync(abs(file), { force: true });
        rmSync(abs(dir), { recursive: true, force: true });
      }
    })],

    ["Tutor only (uiControl off): control tools are refused on both channels, highlight on chrome, wait_for_user and state work, and every call is in the audit log", async () => {
      await setUiControl(false);
      await setTutor(true);
      try {
        const mark = ui().auditCount();
        for (const [name, input] of UI_TOOLS.filter(([n]) => n !== "sysml_ui_screenshot")) {
          for (const ch of ["mcp", "lm"] as const) assert.match((await call(name, input, ch)).text, /sysml\.agent\.uiControl/, `${name} via ${ch} is refused`);
        }
        for (const ch of ["mcp", "lm"] as const) {
          const h = ok(await call("sysml_ui_highlight", { text: "Open the Model view.", chrome: "modelTree" }, ch), `chrome highlight via ${ch}`).json;
          assert.strictEqual(h.highlighted, false);
          assert.match(h.description, /Model view/);
          const w = ok(await call("sysml_ui_wait_for_user", { timeoutSeconds: 1 }, ch), `wait via ${ch}`).json;
          assert.ok(w.event === null || typeof w.event.kind === "string", "an event or a timeout");
          ok(await call("sysml_ui_state", {}, ch), `state via ${ch}`);
        }
        const lines = ui().auditSince(mark);
        for (const t of ["sysml_ui_highlight", "sysml_ui_wait_for_user", "sysml_ui_command"]) assert.ok(lines.some((l) => l.includes(t)), `the audit log has ${t}`);
        // both settings off: the tutor tools are refused too, naming the tutor setting
        await setTutor(false);
        for (const ch of ["mcp", "lm"] as const) {
          assert.match((await call("sysml_ui_highlight", { text: "x", chrome: "modelTree" }, ch)).text, /sysml\.agent\.tutor/, `highlight off via ${ch}`);
          assert.match((await call("sysml_ui_wait_for_user", { timeoutSeconds: 1 }, ch)).text, /sysml\.agent\.tutor/, `wait off via ${ch}`);
        }
        // a workspace-level value does not turn it on
        await cfg().update("tutor", true, vscode.ConfigurationTarget.Workspace).then(undefined, () => undefined);
        try {
          assert.match((await call("sysml_ui_highlight", { text: "x", chrome: "modelTree" }, "mcp")).text, /sysml\.agent\.tutor/);
        } finally {
          await cfg().update("tutor", undefined, vscode.ConfigurationTarget.Workspace).then(undefined, () => undefined);
        }
      } finally {
        await setTutor(undefined);
        await setUiControl(undefined);
      }
    }],

    ["Tutor highlight in a diagram: a node is spotlighted, Esc and a lost target clear it, a new highlight replaces the last, a missing target is refused", withFleet({
      "tmp-ui-a.sysmld": { kind: "general", root: "UiFleet", nodes: nodes3 },
    }, async () => {
      const a = "tmp-ui-a.sysmld", uri = uriOf(a);
      const shown = async () => (await api.diagram.metrics(uri)).highlight;
      ok(await call("sysml_ui_highlight", { path: a, node: "n1", text: "This is the Ship." }), "highlight n1");
      await waitFor(async () => (await shown()) === "This is the Ship.", 10000, "the callout is drawn");
      const long = "x".repeat(400);
      ok(await call("sysml_ui_highlight", { path: a, node: "n2", text: long }), "highlight n2");
      await waitFor(async () => (await shown())?.length === 280, 10000, "a new highlight replaces the last, cut to 280 characters");
      await api.diagram.gesture(uri, { kind: "key", key: "Escape" });
      await waitFor(async () => (await shown()) === undefined, 10000, "Esc clears it");
      ok(await call("sysml_ui_highlight", { path: a, node: "n2", text: "Frigate." }), "highlight again");
      await waitFor(async () => (await shown()) === "Frigate.", 10000, "drawn again");
      ok(await call("sysml_ui_diagram", { path: a, gesture: { kind: "menu", id: "n2", action: "remove" } }), "remove n2 from the diagram");
      await waitFor(async () => (await shown()) === undefined, 10000, "losing the target clears it");
      const miss = await call("sysml_ui_highlight", { path: a, node: "nope", text: "x" });
      assert.match(miss.text, /not found|Refused|failed/i, "a missing node is refused");
      assert.strictEqual(await shown(), undefined);
      // markup in the text is shown as text
      ok(await call("sysml_ui_highlight", { path: a, node: "n1", text: "<b>bold</b>" }), "markup text");
      await waitFor(async () => (await shown()) === "<b>bold</b>", 10000, "plain text");
    })],

    ["Tutor highlight in the requirements editor: a selector is spotlighted, the close button clears it, and the chrome targets are described", withUi(async () => {
      const f = "tmp-uireqd.sysml";
      writeFileSync(abs(f), REQ_DOC);
      try {
        await vscode.workspace.openTextDocument(uriOf(f));
        await waitFor(() => api.model.index.findByQualifiedName("UiReqD::Three").length > 0, 120000, "the package is indexed");
        const scope = { kind: "package" as const, qualifiedName: "UiReqD" };
        const shown = async () => (await api.requirements.metrics(scope)).highlight;
        ok(await call("sysml_ui_requirements", { package: "UiReqD", action: "open", view: "document" }), "open the document view");
        await waitFor(async () => (await call("sysml_ui_requirements", { package: "UiReqD", action: "observe" })).json.view === "document", 60000, "document view");
        const sel = "[data-testid=add-root-requirement]";
        ok(await call("sysml_ui_highlight", { package: "UiReqD", selector: sel, text: "Add a requirement here." }), "highlight");
        await waitFor(async () => (await shown()) === "Add a requirement here.", 10000, "the callout is drawn");
        await api.requirements.gesture(scope, { kind: "click", selector: "[data-testid=tutor-close]" });
        await waitFor(async () => (await shown()) === undefined, 10000, "the close button clears it");
        ok(await call("sysml_ui_highlight", { package: "UiReqD", selector: sel, text: "Again." }), "highlight again");
        await waitFor(async () => (await shown()) === "Again.", 10000, "drawn again");
        await api.requirements.gesture(scope, { kind: "key", selector: sel, key: "Escape" });
        await waitFor(async () => (await shown()) === undefined, 10000, "Esc clears it");
        assert.match((await call("sysml_ui_highlight", { package: "UiReqD", selector: "[data-testid=nope]", text: "x" })).text, /not found|Refused|failed/i);
        for (const [chrome, re] of [["modelTree", /Model view/], ["treeNewFile", /New File/], ["treeNewFolder", /New Folder/], ["commandPalette", /Command Palette/]] as const) {
          const r = ok(await call("sysml_ui_highlight", { chrome, text: "Look here.", ...(chrome === "commandPalette" ? { command: "sysml.tree.newFile" } : {}) }), chrome).json;
          assert.strictEqual(r.highlighted, false);
          assert.match(r.description, re, chrome);
        }
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
      } finally {
        await closeEditors();
        rmSync(abs(f), { force: true });
      }
    })],

    ["wait_for_user returns a simulated user gesture, a command and a timeout, and ignores the agent's own actions", withFleet({
      "tmp-ui-a.sysmld": { kind: "general", root: "UiFleet", nodes: nodes3 },
    }, async () => {
      const a = "tmp-ui-a.sysmld", uri = uriOf(a);
      await g(a, { kind: "flush" });
      const wait = (s: number, ch?: "mcp" | "lm") => call("sysml_ui_wait_for_user", { timeoutSeconds: s }, ch).then((r) => ok(r, "wait").json as { event: { kind: string; id?: string } | null; timedOut?: boolean });
      /** Throw away events that queued up before (opening editors and the like). */
      const drain = async () => { for (let i = 0; i < 20; i++) if ((await wait(1)).event === null) return; };
      /** The next event that is not a tab change (those can arrive late from earlier steps). */
      const next = async (s: number, ch: "mcp" | "lm") => {
        const end = Date.now() + s * 1000;
        for (;;) {
          const r = await wait(Math.max(1, Math.ceil((end - Date.now()) / 1000)), ch);
          if (r.event === null || r.event.kind !== "editor" || Date.now() > end) return r;
        }
      };
      await drain();
      await drain();
      assert.deepStrictEqual(await next(1, "mcp"), { event: null, timedOut: true }, "a timeout");
      // the user selects a node (the test API is not an agent action)
      let pending = next(20, "mcp");
      await sleep(200);
      await api.diagram.gesture(uri, { kind: "select", id: "n3" });
      let e = (await pending).event;
      assert.deepStrictEqual(e, { kind: "selection", id: "n3" }, "the selection is reported");
      await drain();
      // the user runs a sysml.* command
      pending = next(20, "lm");
      await sleep(200);
      await vscode.commands.executeCommand("sysml.tree.clearSearch");
      e = (await pending).event;
      assert.deepStrictEqual(e, { kind: "command", id: "sysml.tree.clearSearch" }, "the command is reported");
      await drain();
      // the agent's own actions are not reported
      pending = next(4, "mcp");
      await sleep(200);
      await g(a, { kind: "select", id: "n1" }, "lm");
      await g(a, { kind: "select", id: "n2" }, "lm");
      ok(await call("sysml_ui_command", { command: "sysml.tree.clearSearch" }, "lm"), "agent command");
      const r = await pending;
      assert.strictEqual(r.event, null, `the agent's actions were not reported: ${JSON.stringify(r)}`);
      assert.strictEqual(r.timedOut, true);
      // an event that happened before the call is delivered at once
      await api.diagram.gesture(uri, { kind: "select", id: "n3" });
      await sleep(300);
      assert.strictEqual((await next(5, "lm")).event?.kind, "selection", "a queued event is returned at once");
    })],

    ["Turning UI control off after it was on refuses the tools at once, cancels an open prompt, and leaves the window responsive; on again works", withFleet({
      "tmp-ui-asp.sysmld": { kind: "general", root: "UiFleet", style: { aspects: { Hulls: ["n1"] } }, nodes: [{ id: "n1", ref: "UiFleet::Ship", x: 40, y: 40, w: 160, h: 60 }] },
    }, async () => {
      await g("tmp-ui-asp.sysmld", { kind: "flush" });
      ok(await call("sysml_ui_command", { command: "sysml.diagram.applyAspect" }), "apply aspect");
      await promptOf("pick");
      await setUiControl(false);
      for (const ch of ["mcp", "lm"] as const) assert.match((await call("sysml_ui_tree", { op: "list" }, ch)).text, /sysml\.agent\.uiControl/, `refused via ${ch}`);
      const s = await call("sysml_ui_state", {}, "mcp");
      assert.strictEqual(s.json.enabled, false);
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await setUiControl(true);
      assert.deepStrictEqual((await state()).prompts, [], "the prompt was cancelled");
      ok(await call("sysml_ui_tree", { op: "list" }), "on again");
    })],

    // Acceptance run (task 6.2 of add-agent-tutor): only when SYSML_TUTOR_SHOTS names the folder for the screenshots and the step log.
    ["Tutor acceptance: an agent tutors creating a diagram and placing an element, verifying each highlight by screenshot", async () => {
      const outDir = process.env.SYSML_TUTOR_SHOTS;
      if (!outDir) return;
      mkdirSync(outDir, { recursive: true });
      const log: string[] = [];
      const step = (s: string) => { log.push(s); console.log(`tutor-step: ${s}`); writeFileSync(path.join(outDir, "steps.log"), log.join("\n") + "\n"); };
      const model = "tmp-tutor.sysml";
      writeFileSync(abs(model), "package TutorDemo {\n  part def Vehicle;\n}\n");
      await setTutor(true);
      try {
        await vscode.workspace.openTextDocument(uriOf(model));
        await waitFor(() => api.model.index.findByQualifiedName("TutorDemo::Vehicle").length > 0, 60000, "indexed");
        const wait = (s: number) => call("sysml_ui_wait_for_user", { timeoutSeconds: s }, "mcp").then((r) => ok(r, "wait").json as { event: { kind: string; id?: string } | null; timedOut?: boolean });
        const nextUser = async (s: number) => { const end = Date.now() + s * 1000; for (;;) { const r = await wait(Math.max(1, Math.ceil((end - Date.now()) / 1000))); if (r.event === null || r.event.kind !== "editor" || Date.now() > end) return r; } };
        for (let i = 0; i < 10 && (await wait(1)).event !== null; i++) { /* drain */ }
        const shot = async (name: string, p: string) => {
          const r = ok(await call("sysml_ui_screenshot", { path: p }, "mcp"), "screenshot");
          assert.ok(r.images.length === 1 && isPng(r.images[0]!.data), "a PNG");
          writeFileSync(path.join(outDir, name), r.images[0]!.data);
        };
        // 1. point at the Model view (VS Code chrome: described in words, cannot be drawn on or screenshotted)
        const h1 = ok(await call("sysml_ui_highlight", { chrome: "modelTree", text: "This is the Model view." }, "mcp"), "chrome highlight").json;
        assert.strictEqual(h1.highlighted, false);
        step(`1 highlight chrome modelTree: ok, description "${h1.description}"`);
        // 2. the user creates a diagram (simulated through the test API, not the agent tools)
        api.diagram.setUi({ pick: async (items: any[]) => items.find((i) => i.label === "General View") ?? items.find((i) => i.description === "TutorDemo") ?? items[0], input: async (o) => o.value });
        let pending = nextUser(30);
        await sleep(2000); // the user needs more than the agent-action grace window (1.5 s)
        let created: vscode.Uri | undefined;
        void Promise.resolve(vscode.commands.executeCommand("sysml.newDiagram")).then((u) => { created = u as vscode.Uri; }, () => undefined);
        const r1 = await pending; const e1 = r1.event;
        step(`2 wait_for_user after the user ran New Diagram: ${JSON.stringify(e1)}`);
        assert.ok(e1 && e1.kind === "command" && e1.id === "sysml.newDiagram", `the command is reported: ${JSON.stringify(e1)}`);
        const state = async () => (await call("sysml_ui_state", {}, "mcp")).json as { activeEditor?: { kind: string; path: string } };
        await waitFor(async () => created !== undefined && (await state()).activeEditor?.kind === "diagram", 30000, "the diagram opens");
        const dpath = (await state()).activeEditor!.path;
        step(`  diagram opened: ${dpath}`);
        // 3. highlight the canvas and verify it by metrics and screenshot
        const duri = uriOf(dpath);
        const shown = async () => (await api.diagram.metrics(duri)).highlight;
        ok(await call("sysml_ui_highlight", { path: dpath, selector: "svg", text: "Place an element: pick an item from the palette, then click here." }, "mcp"), "highlight canvas");
        await waitFor(async () => (await shown())?.startsWith("Place an element") === true, 10000, "the callout is drawn");
        await shot("1-canvas-highlight.png", dpath);
        step("3 highlight canvas: callout drawn (metrics), screenshot 1-canvas-highlight.png");
        // 4. the user places an element (the palette gesture) and then clicks it; only the click is a reportable event
        await sleep(2000); // the user needs more than the agent-action grace window (1.5 s)
        await api.diagram.gesture(duri, { kind: "key", key: "Escape" });
        await waitFor(async () => (await shown()) === undefined, 10000, "Esc dismisses the callout");
        step("  the user dismissed the callout with Esc");
        pending = nextUser(8);
        await api.diagram.gesture(duri, { kind: "palette", item: "part", x: 40, y: 150, name: "car" });
        const placedEvent = (await pending).event;
        step(`4a wait_for_user after the user placed a part by the palette: ${JSON.stringify(placedEvent)} (no event: placement alone is not reported, only selections are)`);
        await waitFor(() => api.model.index.findByQualifiedName("TutorDemo::car").length > 0, 30000, "the part is in the model");
        const nodes = (await api.diagram.metrics(duri)).nodes as { id: string }[];
        step(`  model has TutorDemo::car; diagram nodes: ${JSON.stringify(nodes).slice(0, 600)}`);
        const nid = nodes[nodes.length - 1]!.id;
        await api.diagram.gesture(duri, { kind: "select", id: "n2" }); // the new node is already selected after placing, so a click on it alone sends no change
        await sleep(2000);
        for (let i = 0; i < 5 && (await wait(1)).event !== null; i++) { /* drain */ }
        pending = nextUser(20);
        await sleep(300);
        await api.diagram.gesture(duri, { kind: "select", id: nid });
        const e2 = (await pending).event;
        step(`4b wait_for_user after the user clicked the new node: ${JSON.stringify(e2)}`);
        assert.deepStrictEqual(e2, { kind: "selection", id: nid });
        // 5. confirm: highlight the new node
        ok(await call("sysml_ui_highlight", { path: dpath, node: nid, text: "Well done: this is your new part." }, "mcp"), "highlight node");
        await waitFor(async () => (await shown()) === "Well done: this is your new part.", 10000, "node callout drawn");
        await shot("2-new-node-highlight.png", dpath);
        step(`5 highlight node ${nid}: callout drawn, screenshot 2-new-node-highlight.png`);
        await api.diagram.gesture(duri, { kind: "key", key: "Escape" });
        await waitFor(async () => (await shown()) === undefined, 10000, "Esc clears it");
        step("6 user pressed Esc: highlight cleared");
        rmSync(abs(path.basename(dpath)), { force: true });
      } finally {
        api.diagram.setUi(undefined);
        await closeEditors();
        rmSync(abs(model), { force: true });
        await setTutor(undefined);
      }
    }],
  ];
}
