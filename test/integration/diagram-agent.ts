import * as assert from "node:assert";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { DiagramDoc, Metrics, PickItem, TestApi } from "./index.js";
import type { Ctx } from "./diagram-interaction.js";
import { elementRoots } from "./tree-util.js";

type Test = [name: string, fn: () => Promise<void>];

export interface ToolOutput {
  text: string;
  isError: boolean;
  images: { mimeType: string; data: Buffer }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Calls a tool as an in-editor agent would (Language Model Tools), keeping the text and the image parts apart. */
export async function viaLm(name: string, input: object): Promise<ToolOutput> {
  const r = await vscode.lm.invokeTool(name, { toolInvocationToken: undefined, input });
  const parts = r.content as unknown[];
  return {
    text: parts.filter((p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart).map((p) => p.value).join(""),
    isError: false,
    images: parts.filter((p): p is vscode.LanguageModelDataPart => p instanceof vscode.LanguageModelDataPart).map((p) => ({ mimeType: p.mimeType, data: Buffer.from(p.data) })),
  };
}

export async function viaMcp(api: TestApi, name: string, input: object): Promise<ToolOutput> {
  const r = await api.agent.testCallToolOverMcp(name, input);
  return { text: r.text, isError: r.isError, images: r.images.map((i) => ({ mimeType: i.mimeType, data: Buffer.from(i.base64, "base64") })) };
}

export const isPng = (b: Buffer) => [...b.subarray(0, 8)].every((v, i) => v === PNG_SIGNATURE[i]);

interface Described {
  path: string; open: boolean; unsaved: boolean; kind: string; root: string;
  nodes: { id: string; resolved: boolean; parent?: string; x?: number; y?: number; w?: number; h?: number; element?: { name?: string; qualifiedName?: string; kind: string; types: string[] } }[];
  edges: { id: string }[];
  unresolved: unknown[];
}

/** Diagram tools through the real extension: both channels, real editors, real files. */
export function agentTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const bytes = (name: string) => readFileSync(uriOf(name).fsPath);
  const onDisk = (name: string) => JSON.parse(readFileSync(uriOf(name).fsPath, "utf8")) as DiagramDoc;
  const inMemory = (name: string) => api.diagram.state(uriOf(name)).doc as DiagramDoc;
  const copy = (from: string, to: string) => copyFileSync(uriOf(from).fsPath, uriOf(to).fsPath);
  const rm = (...names: string[]) => { for (const n of names) rmSync(uriOf(n).fsPath, { force: true }); };
  const close = async () => {
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  };
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    const end = performance.now() + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(25);
    }
  };
  const sysmlBytes = () => new Map(readdirSync(folder.fsPath).filter((f) => f.endsWith(".sysml") && !f.startsWith("tmp-")).map((f) => [f, readFileSync(path.join(folder.fsPath, f))] as const));
  const sameSysml = (before: Map<string, Buffer>) => {
    const now = sysmlBytes();
    assert.deepStrictEqual([...now.keys()], [...before.keys()], "the set of .sysml files is unchanged");
    for (const [k, v] of before) assert.ok(v.equals(now.get(k)!), `${k} is byte-identical`);
  };
  const json = (o: ToolOutput) => JSON.parse(o.text) as Described;
  const names = (d: Described) => d.nodes.map((n) => n.element?.name).sort();
  const tabsNow = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => `${g.viewColumn}:${t.label}`)).sort();
  const childOf = (parent: { id: string }, l: string) => {
    const n = api.provider.getChildren(parent as never).find((r) => String(api.provider.getTreeItem(r).label) === l);
    assert.ok(n, `tree node ${l}`);
    return n;
  };
  const rootOf = async (l: string) => (await elementRoots(api)).find((r) => String(api.provider.getTreeItem(r).label) === l)!;
  /** An agent's call, wrapped so that a leftover open editor or temp file does not leak into the next test. */
  const withTmp = (fixture: string, tmp: string, fn: () => Promise<void>) => async () => {
    copy(fixture, tmp);
    const before = sysmlBytes();
    try {
      await fn();
      assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
      sameSysml(before);
    } finally {
      await close();
      rm(tmp);
    }
  };
  return [
    ["sysml_list_diagrams lists the diagram files with kind, root, node count and whether each parses, identically on both channels", async () => {
      await c.eventually(async () => {
        const r = JSON.parse((await viaLm("sysml_list_diagrams", {})).text) as { diagrams: { path: string }[] };
        assert.ok(r.diagrams.some((d) => d.path === "ports-general.sysmld") && r.diagrams.some((d) => d.path === "invalid.sysmld"), "the fixtures are indexed");
      }, "the diagram index is built");
      const a = await viaLm("sysml_list_diagrams", {});
      const b = await viaMcp(api, "sysml_list_diagrams", {});
      assert.strictEqual(a.text, b.text, "identical text");
      const list = (JSON.parse(a.text) as { diagrams: { path: string; kind?: string; root?: string; nodeCount?: number; parses: boolean; open: boolean }[] }).diagrams;
      const by = new Map(list.map((d) => [d.path, d] as const));
      assert.deepStrictEqual(by.get("ports-general.sysmld"), { path: "ports-general.sysmld", kind: "general", root: "Ports", nodeCount: 5, parses: true, open: by.get("ports-general.sysmld")!.open });
      assert.strictEqual(by.get("drivetrain-interconnection.sysmld")?.kind, "interconnection");
      assert.strictEqual(by.get("requirements.sysmld")?.kind, "requirements");
      assert.strictEqual(by.get("invalid.sysmld")?.parses, false, "a file that does not parse is listed and flagged");
      assert.ok([...by.keys()].every((p) => !p.startsWith("/") && !p.includes("\\")), "paths are workspace-relative");
      assert.deepStrictEqual([...by.keys()], [...by.keys()].sort((x, y) => x.localeCompare(y)), "sorted by path");
    }],

    ["Read without image: JSON with resolved names, kinds, types and the stored positions, no image on either channel", async () => {
      const a = await viaLm("sysml_read_diagram", { path: "ports-general.sysmld" });
      const b = await viaMcp(api, "sysml_read_diagram", { path: "ports-general.sysmld" });
      assert.strictEqual(a.text, b.text);
      assert.strictEqual(a.images.length, 0);
      assert.strictEqual(b.images.length, 0);
      const d = json(a);
      assert.strictEqual(d.kind, "general");
      assert.strictEqual(d.root, "Ports");
      const n5 = d.nodes.find((n) => n.id === "n5")!;
      assert.deepStrictEqual(n5.element, { name: "battery", qualifiedName: "Ports::Drivetrain::battery", kind: "part", types: ["Battery"] });
      assert.deepStrictEqual([n5.x, n5.y], [380, 60]);
      assert.deepStrictEqual(d.unresolved, []);
    }],

    ["Read with image: a PNG of the diagram next to the text, identical text, on both channels", async () => {
      const a = await viaLm("sysml_read_diagram", { path: "ports-general.sysmld", includeImage: true });
      const b = await viaMcp(api, "sysml_read_diagram", { path: "ports-general.sysmld", includeImage: true });
      assert.strictEqual(a.text, b.text, "identical text");
      for (const [channel, r] of [["Language Model Tools", a], ["MCP", b]] as const) {
        assert.strictEqual(r.images.length, 1, `${channel}: one image`);
        assert.strictEqual(r.images[0]!.mimeType, "image/png", `${channel}: mime type`);
        assert.ok(isPng(r.images[0]!.data), `${channel}: PNG signature`);
        assert.ok(r.images[0]!.data.length > 2048, `${channel}: ${r.images[0]!.data.length} bytes`);
      }
      const w = r16(a.images[0]!.data);
      assert.ok(w > 0 && w <= 1600, `the image is at most 1600 px wide (${w})`);
      assert.strictEqual(json(a).kind, "general");
    }],

    ["Image through Language Model Tools: the PNG is a LanguageModelDataPart with image/png", async () => {
      const r = await vscode.lm.invokeTool("sysml_read_diagram", { toolInvocationToken: undefined, input: { path: "ports-general.sysmld", includeImage: true } });
      const data = (r.content as unknown[]).filter((p): p is vscode.LanguageModelDataPart => p instanceof vscode.LanguageModelDataPart);
      assert.strictEqual(data.length, 1);
      assert.strictEqual(data[0]!.mimeType, "image/png");
      assert.ok(isPng(Buffer.from(data[0]!.data)));
      assert.ok((r.content as unknown[])[0] instanceof vscode.LanguageModelTextPart, "the text part comes first");
    }],

    ["Diagram not open: the image is rendered without changing the active editor, the tabs or the groups, and no tab is left open", async () => {
      await close();
      const notes = await vscode.workspace.openTextDocument(uriOf("notes.sysml"));
      await vscode.window.showTextDocument(notes);
      await vscode.commands.executeCommand("workbench.action.splitEditorRight");
      await vscode.window.showTextDocument(notes, { viewColumn: vscode.ViewColumn.One });
      const snapshot = () => ({
        editor: vscode.window.activeTextEditor?.document.uri.toString(),
        column: vscode.window.tabGroups.activeTabGroup.viewColumn,
        tab: vscode.window.tabGroups.activeTabGroup.activeTab?.label,
        groups: vscode.window.tabGroups.all.length,
        tabs: tabsNow(),
      });
      const before = snapshot();
      assert.strictEqual(before.editor, uriOf("notes.sysml").toString());
      assert.ok(!api.diagram.activeUri(), "no diagram is open");
      const seen: string[] = [];
      let drift: string | undefined;
      const sampler = setInterval(() => {
        const s = snapshot();
        if (s.editor !== before.editor || s.column !== before.column || s.tab !== before.tab) drift = JSON.stringify(s);
        for (const t of s.tabs) if (!before.tabs.includes(t) && !seen.includes(t)) seen.push(t);
      }, 15);
      let r: ToolOutput;
      try {
        r = await viaLm("sysml_read_diagram", { path: "requirements.sysmld", includeImage: true });
      } finally {
        clearInterval(sampler);
      }
      console.log(`  (while the closed diagram was rendered, tabs that appeared: ${seen.length ? seen.join("; ") : "none observed"})`);
      assert.strictEqual(r.images.length, 1, "the image is returned");
      assert.ok(isPng(r.images[0]!.data) && r.images[0]!.data.length > 2048);
      mkdirSync(c.artifactDir, { recursive: true });
      writeFileSync(path.join(c.artifactDir, "agent-read-diagram-closed.png"), r.images[0]!.data);
      assert.strictEqual(drift, undefined, `the active editor, group and tab never changed while rendering (saw ${drift})`);
      await c.eventually(async () => assert.deepStrictEqual(snapshot(), before, "the editors are as they were"), "the temporary tab is gone", 5000);
      assert.strictEqual(api.diagram.activeUri(), undefined);
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), before.editor);
      const again = await viaMcp(api, "sysml_read_diagram", { path: "requirements.sysmld", includeImage: true });
      assert.strictEqual(again.images.length, 1, "MCP too");
      await c.eventually(async () => assert.deepStrictEqual(snapshot(), before), "no tab left after the second render", 5000);
      assert.deepStrictEqual(api.diagram.errors(), []);
      await close();
    }],

    ["Generate general view: sysml_create_diagram writes a valid file next to the source with the root's direct members, never overwriting, changing no .sysml file", async () => {
      const before = sysmlBytes();
      const created: string[] = [];
      try {
        const out = await viaLm("sysml_create_diagram", { root: "Vehicle", kind: "general" });
        const d = JSON.parse(out.text) as { path: string; created: boolean; applied: string; diagram: Described };
        created.push(d.path);
        assert.strictEqual(d.path, "Vehicle.sysmld", "beside vehicle.sysml, named after the root");
        assert.strictEqual(d.applied, "file");
        const file = onDisk(d.path);
        assert.strictEqual(file.version, 1);
        assert.strictEqual(file.kind, "general");
        assert.strictEqual(file.root, "Vehicle");
        assert.deepStrictEqual(names(d.diagram as Described), ["Car", "Engine", "Vehicle", "Wheel"]);
        assert.deepStrictEqual(file.nodes.map((n) => n.ref), ["Vehicle", "Vehicle::Engine", "Vehicle::Car", "Vehicle::Wheel"]);
        assert.ok(file.nodes.every((n) => n.x === undefined), "no positions are stored until the editor lays it out");
        // the same call again must not overwrite
        const again = JSON.parse((await viaMcp(api, "sysml_create_diagram", { root: "Vehicle", kind: "general" })).text) as { path: string };
        created.push(again.path);
        assert.strictEqual(again.path, "Vehicle 2.sysmld");
        // an explicit path in a sub folder, restricted members; an existing path is rejected
        const sub = JSON.parse((await viaLm("sysml_create_diagram", { root: "Vehicle::Car", kind: "general", path: "tmp-agent-dir/car.sysmld", elements: ["Vehicle::Car::engine"] })).text) as { path: string; diagram: Described };
        created.push(sub.path);
        assert.deepStrictEqual(names(sub.diagram), ["Car", "engine"]);
        const refused = await viaMcp(api, "sysml_create_diagram", { root: "Vehicle::Car", kind: "general", path: "tmp-agent-dir/car.sysmld" });
        assert.strictEqual(refused.isError, true);
        assert.match(refused.text, /already exists/);
        for (const bad of ["../outside.sysmld", "/tmp/outside.sysmld", "notes.sysml", "a/../../b.sysmld"]) {
          const r = await viaMcp(api, "sysml_create_diagram", { root: "Vehicle", kind: "general", path: bad });
          assert.strictEqual(r.isError, true, bad);
        }
        // readable through the read tool, and it opens in the editor
        const read = json(await viaLm("sysml_read_diagram", { path: "Vehicle.sysmld" }));
        assert.deepStrictEqual(names(read), ["Car", "Engine", "Vehicle", "Wheel"]);
        await c.renders("Vehicle.sysmld", ["n1", "n2", "n3", "n4"], []);
        sameSysml(before);
      } finally {
        await close();
        for (const p of created) rm(p);
        rmSync(path.join(folder.fsPath, "tmp-agent-dir"), { recursive: true, force: true });
      }
    }],

    ["Remove from diagram by an agent changes only the .sysmld, as a file write when the diagram is not open", withTmp("ports-general.sysmld", "tmp-agent-remove.sysmld", async () => {
      const f = "tmp-agent-remove.sysmld";
      const original = onDisk(f);
      const r = JSON.parse((await viaMcp(api, "sysml_remove_from_diagram", { path: f, ids: ["n3"] })).text) as { applied: string; removed: number; diagram: Described };
      assert.strictEqual(r.applied, "file");
      assert.strictEqual(r.removed, 1);
      const now = onDisk(f);
      assert.deepStrictEqual(now.nodes.map((n) => n.id), original.nodes.filter((n) => n.id !== "n3").map((n) => n.id));
      assert.deepStrictEqual(now.nodes, original.nodes.filter((n) => n.id !== "n3"), "the other nodes are untouched");
      assert.ok(!r.diagram.nodes.some((n) => n.id === "n3"));
      const bad = await viaLm("sysml_remove_from_diagram", { path: f, ids: ["n9"] });
      assert.match(bad.text, /No node or edge/, "an unknown id is an error result, not a change");
    })],

    ["Diagram not open (write): add, remove and layout reach the file on disk and no editor opens", withTmp("ports-general.sysmld", "tmp-agent-closed.sysmld", async () => {
      const f = "tmp-agent-closed.sysmld";
      assert.strictEqual(api.diagram.activeUri(), undefined);
      const tabsBefore = tabsNow();
      const added = JSON.parse((await viaLm("sysml_add_to_diagram", { path: f, elements: ["Ports::Drivetrain::motor"] })).text) as { applied: string; added: number };
      assert.strictEqual(added.applied, "file");
      assert.ok(added.added >= 1);
      assert.ok(onDisk(f).nodes.some((n) => n.ref === "Ports::Drivetrain::motor"), "the node is in the file");
      const laid = JSON.parse((await viaMcp(api, "sysml_layout_diagram", { path: f })).text) as { applied: string; diagram: Described };
      assert.strictEqual(laid.applied, "file");
      assert.ok(onDisk(f).nodes.every((n) => n.x === undefined && n.y === undefined && n.w === undefined), "stored positions are cleared so the next render lays out");
      assert.ok(laid.diagram.nodes.every((n) => n.x === undefined));
      assert.deepStrictEqual(tabsNow(), tabsBefore, "no editor was opened");
      // the cleared file opens and is laid out
      const uri = uriOf(f);
      await api.diagram.open(uri);
      await c.eventually(async () => {
        const m = await api.diagram.metrics(uri);
        assert.strictEqual(m.nodes.length, onDisk(f).nodes.length);
        assert.strictEqual(m.overlaps, 0);
      }, "the diagram opens and is laid out");
    })],

    ["User undoes agent change: an agent edit of an OPEN diagram is unsaved, the tab is dirty, and undo removes the node", withTmp("ports-general.sysmld", "tmp-agent-undo.sysmld", async () => {
      const f = "tmp-agent-undo.sysmld";
      const uri = uriOf(f);
      await api.diagram.open(uri);
      await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uri)).nodes.length, 5), "rendered");
      const disk = bytes(f);
      assert.strictEqual(c.tabDirty(uri), false);
      const r = JSON.parse((await viaLm("sysml_add_to_diagram", { path: f, elements: ["Ports::Drivetrain::motor"] })).text) as { applied: string; diagram: Described; note: string };
      assert.strictEqual(r.applied, "editor");
      assert.match(r.note, /unsaved/);
      assert.ok(r.diagram.nodes.some((n) => n.element?.qualifiedName === "Ports::Drivetrain::motor"));
      await waitFor(() => c.tabDirty(uri) === true, 5000, "the tab shows the change as unsaved");
      assert.ok(disk.equals(bytes(f)), "the file on disk is unchanged");
      assert.ok(inMemory(f).nodes.some((n) => n.ref === "Ports::Drivetrain::motor"));
      await vscode.commands.executeCommand("undo");
      await waitFor(() => !inMemory(f).nodes.some((n) => n.ref === "Ports::Drivetrain::motor"), 5000, "undo removes the node");
      await waitFor(() => c.tabDirty(uri) === false, 5000, "the tab is clean again");
      assert.ok(disk.equals(bytes(f)));
      // one edit per call: two calls need two undos
      await viaMcp(api, "sysml_remove_from_diagram", { path: f, ids: ["n3"] });
      await viaMcp(api, "sysml_remove_from_diagram", { path: f, ids: ["n2"] });
      assert.ok(!inMemory(f).nodes.some((n) => n.id === "n3" || n.id === "n2"));
      await vscode.commands.executeCommand("undo");
      await waitFor(() => inMemory(f).nodes.some((n) => n.id === "n2"), 5000, "the first undo restores the second removal only");
      assert.ok(!inMemory(f).nodes.some((n) => n.id === "n3"));
      await vscode.commands.executeCommand("undo");
      await waitFor(() => inMemory(f).nodes.some((n) => n.id === "n3") && c.tabDirty(uri) === false, 5000, "the second undo restores the first");
    })],

    ["Diagram open during agent edit: the open editor shows the new node without being reopened", withTmp("ports-general.sysmld", "tmp-agent-live.sysmld", async () => {
      const f = "tmp-agent-live.sysmld";
      const uri = uriOf(f);
      await api.diagram.open(uri);
      await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uri)).nodes.length, 5), "rendered");
      const before = (await api.diagram.metrics(uri)).nodes.map((n) => [n.id, n.x, n.y]);
      await viaMcp(api, "sysml_add_to_diagram", { path: f, elements: ["Ports::Drivetrain::motor"] });
      await c.eventually(async () => {
        const m = await api.diagram.metrics(uri);
        assert.strictEqual(m.nodes.length, 6, "six nodes");
        assert.ok(m.nodes.some((n) => /motor/.test(n.text ?? "")), "the new node is drawn");
      }, "the open editor shows the agent's node");
      const m: Metrics = await api.diagram.metrics(uri);
      assert.deepStrictEqual(m.nodes.filter((n) => before.some((b) => b[0] === n.id)).map((n) => [n.id, n.x, n.y]), before, "the nodes that were there did not move");
      assert.strictEqual(m.overlaps, 0);
      // a tool that reads the open diagram sees the unsaved node
      const read = json(await viaLm("sysml_read_diagram", { path: f }));
      assert.strictEqual(read.open, true);
      assert.strictEqual(read.unsaved, true);
      assert.ok(read.nodes.some((n) => n.element?.qualifiedName === "Ports::Drivetrain::motor"));
    })],

    ["Open diagram stays unsaved: an agent layout shows in the editor, dirties the tab and leaves the file alone", withTmp("ports-general.sysmld", "tmp-agent-layout.sysmld", async () => {
      const f = "tmp-agent-layout.sysmld";
      const uri = uriOf(f);
      await api.diagram.open(uri);
      await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uri)).nodes.length, 5), "rendered");
      const disk = bytes(f);
      const before = JSON.stringify(inMemory(f).nodes.map((n) => [n.id, n.x, n.y, n.w, n.h]));
      const r = JSON.parse((await viaLm("sysml_layout_diagram", { path: f })).text) as { applied: string; diagram: Described };
      assert.strictEqual(r.applied, "editor");
      assert.notStrictEqual(JSON.stringify(inMemory(f).nodes.map((n) => [n.id, n.x, n.y, n.w, n.h])), before, "the layout changed the stored positions");
      await waitFor(() => c.tabDirty(uri) === true, 5000, "the tab is dirty");
      assert.ok(disk.equals(bytes(f)), "the file on disk is unchanged");
      await c.eventually(async () => {
        const m = await api.diagram.metrics(uri);
        const inDoc = inMemory(f).nodes;
        for (const n of inDoc) if (n.parent === undefined) assert.strictEqual(m.nodes.find((x) => x.id === n.id)!.x, n.x, `${n.id} is drawn where the new layout puts it`);
        assert.strictEqual(m.overlaps, 0);
      }, "the editor shows the new layout");
      await vscode.commands.executeCommand("undo");
      await waitFor(() => JSON.stringify(inMemory(f).nodes.map((n) => [n.id, n.x, n.y, n.w, n.h])) === before && c.tabDirty(uri) === false, 5000, "undo restores the earlier layout");
    })],

    ["End to end: create from the tree, move a node, save, close, reopen, then an agent reads it as JSON and PNG with the saved positions", async () => {
      const file = "Wheel.sysmld";
      const before = sysmlBytes();
      try {
        api.diagram.setUi({
          pick: async (items: PickItem[]) => items.find((i) => i.label === "General View"),
          input: async (o) => o.value,
        });
        const wheel = childOf(await rootOf("Vehicle"), "Wheel");
        const created = (await vscode.commands.executeCommand("sysml.newDiagram", wheel)) as vscode.Uri;
        assert.strictEqual(path.basename(created.fsPath), file);
        const uri = uriOf(file);
        await c.eventually(async () => assert.ok((await api.diagram.metrics(uri)).nodes.length >= 1), "the new diagram renders");
        // a diagram of Wheel has the root only; add the others so there is something to move
        await viaLm("sysml_add_to_diagram", { path: file, elements: ["Vehicle::Car", "Vehicle::Engine"] });
        await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uri)).nodes.length, 3), "three nodes");
        await api.diagram.gesture(uri, { kind: "flush" });
        await api.diagram.gesture(uri, { kind: "drag", id: "n2", dx: 96, dy: 64 });
        await waitFor(() => c.tabDirty(uri) === true, 5000, "the move dirties the tab");
        await api.diagram.save(uri);
        const saved = onDisk(file);
        assert.ok(saved.nodes.every((n) => typeof n.x === "number" && typeof n.y === "number"), "every node has a stored position");
        await close();
        await api.diagram.open(uri);
        await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uri)).nodes.length, 3), "reopened");
        await close();
        assert.strictEqual(api.diagram.activeUri(), undefined, "closed");
        // an agent reads it: JSON and PNG
        const out = await viaLm("sysml_read_diagram", { path: file, includeImage: true });
        const d = json(out);
        assert.strictEqual(d.open, false);
        assert.deepStrictEqual(d.nodes.map((n) => [n.id, n.x, n.y, n.w, n.h]), saved.nodes.map((n) => [n.id, n.x, n.y, n.w, n.h]), "positions equal the saved ones");
        assert.deepStrictEqual(names(d), ["Car", "Engine", "Wheel"]);
        assert.strictEqual(d.root, "Vehicle::Wheel");
        assert.strictEqual(out.images.length, 1);
        assert.ok(isPng(out.images[0]!.data) && out.images[0]!.data.length > 2048);
        const mcp = await viaMcp(api, "sysml_read_diagram", { path: file, includeImage: true });
        assert.strictEqual(mcp.text, out.text, "identical on MCP");
        assert.ok(mcp.images.length === 1 && isPng(mcp.images[0]!.data));
        mkdirSync(c.artifactDir, { recursive: true });
        writeFileSync(path.join(c.artifactDir, "agent-read-diagram-end-to-end.png"), out.images[0]!.data);
        sameSysml(before);
      } finally {
        api.diagram.setUi(undefined);
        await close();
        rm(file, "Wheel 2.sysmld");
      }
    }],
  ];
}

/** Width of a PNG, from its IHDR chunk. */
function r16(png: Buffer): number {
  return png.readUInt32BE(16);
}
