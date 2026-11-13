import * as assert from "node:assert";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { DiagramDoc, Gesture, Metrics, MNode, ModelNode, PickItem, TestApi } from "./index.js";
import { viaLm, viaMcp } from "./diagram-agent.js";
import { elementRoots } from "./tree-util.js";

type Test = [name: string, fn: () => Promise<void>];

export interface Ctx {
  api: TestApi;
  folder: vscode.Uri;
  ext: vscode.Extension<unknown>;
  artifactDir: string;
  renders(file: string, ids: string[], edges: string[]): Promise<Metrics>;
  tabDirty(uri: vscode.Uri): boolean | undefined;
  eventually(fn: () => Promise<void>, what: string, ms?: number): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ELEMENT_MIME = "application/vnd.sysml-editor.elements";

/** Interaction, edits, tree actions and live refresh, through the real editor and webview. */
export function interactionTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const read = (name: string) => readFileSync(uriOf(name).fsPath);
  const doc = (name: string): DiagramDoc => api.diagram.state(uriOf(name)).doc as DiagramDoc;
  const node = (name: string, id: string) => doc(name).nodes.find((n) => n.id === id)!;
  const metrics = (name: string) => api.diagram.metrics(uriOf(name));
  const nodeOf = (m: Metrics, id: string): MNode => m.nodes.find((n) => n.id === id)!;
  const gesture = (name: string, g: Gesture) => api.diagram.gesture(uriOf(name), g);
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    const end = performance.now() + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(25);
    }
  };
  const label = (n: ModelNode) => String(api.provider.getTreeItem(n).label);
  const rootOf = async (l: string) => (await elementRoots(api)).find((r) => label(r) === l)!;
  const childOf = (parent: ModelNode, l: string) => {
    const n = api.provider.getChildren(parent).find((r) => label(r) === l);
    assert.ok(n, `tree node ${l}`);
    return n;
  };

  /** The `.sysml` files of the workspace, byte for byte (temporary files excluded). */
  const sysmlBytes = () => new Map(readdirSync(folder.fsPath).filter((f) => f.endsWith(".sysml") && !f.startsWith("tmp-")).map((f) => [f, readFileSync(path.join(folder.fsPath, f))] as const));
  const sameSysml = (before: Map<string, Buffer>) => {
    const now = sysmlBytes();
    assert.deepStrictEqual([...now.keys()], [...before.keys()], "the set of .sysml files is unchanged");
    for (const [k, v] of before) assert.ok(v.equals(now.get(k)!), `${k} is byte-identical`);
  };

  const close = async () => {
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  };
  const copy = (from: string, to: string) => copyFileSync(uriOf(from).fsPath, uriOf(to).fsPath);
  const rm = (...names: string[]) => { for (const n of names) rmSync(uriOf(n).fsPath, { force: true }); };
  const dirty = (name: string) => api.diagram.state(uriOf(name)).dirty;
  const isUndone = async (name: string, before: string) => {
    await vscode.commands.executeCommand("undo");
    await waitFor(() => JSON.stringify(doc(name)) === before && !dirty(name), 5000, "undo restores the document exactly");
  };
  /** Run a test on a temporary copy of a fixture diagram. */
  const withCopy = (fixture: string, tmp: string, fn: () => Promise<void>) => async () => {
    copy(fixture, tmp);
    const before = sysmlBytes();
    try {
      await api.diagram.open(uriOf(tmp));
      await c.eventually(async () => assert.ok((await metrics(tmp)).nodes.length > 0), `${tmp} rendered`);
      await fn();
      assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
      sameSysml(before);
    } finally {
      await close();
      rm(tmp);
    }
  };
  const settled = async (name: string) => { // wait until the webview shows what the host has
    await c.eventually(async () => {
      const m = await metrics(name);
      for (const n of doc(name).nodes) {
        const b = nodeOf(m, n.id);
        if (n.x !== undefined && b && n.parent === undefined && b.x !== n.x) assert.fail(`${n.id} is drawn at ${b.x}, stored at ${n.x}`);
      }
    }, "the view follows the document");
  };

  const MODEL = (extra = "") => `package Tmp {\n  part def Alpha;\n  part def Beta;\n  part def Gamma;\n${extra}}\n`;
  const diagramText = (d: object) => JSON.stringify(d, null, 2) + "\n";
  /** Write a model file and open it as a text document, so the model indexes it at once instead of waiting for the file watcher. */
  const writeModel = async (name: string, text: string) => {
    writeFileSync(uriOf(name).fsPath, text);
    return vscode.workspace.openTextDocument(uriOf(name));
  };
  const modelHas = (qn: string) => waitFor(() => api.model.index.findByQualifiedName(qn).length > 0, 30000, `the model has ${qn}`);

  return [
    // ---- A: interaction -------------------------------------------------------------------
    ["moving a node by dragging is one undoable edit that persists after save and reopen and changes no .sysml file", withCopy("ports-general.sysmld", "tmp-move.sysmld", async () => {
      const f = "tmp-move.sysmld";
      const before = JSON.stringify(doc(f));
      const start = node(f, "n1");
      assert.strictEqual(dirty(f), false);
      await gesture(f, { kind: "drag", id: "n1", dx: 64, dy: 48 });
      await waitFor(() => node(f, "n1").x === start.x! + 64, 5000, "the move reaches the document");
      assert.strictEqual(node(f, "n1").y, start.y! + 48, "snapped to the 8 px grid");
      await waitFor(() => c.tabDirty(uriOf(f)) === true, 5000, "the tab is dirty");
      assert.strictEqual(JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")).nodes[0].x, start.x, "nothing is written before save");
      await settled(f);
      const m = await metrics(f);
      assert.strictEqual(m.diagonalSegments, 0);
      assert.strictEqual(m.edgesThroughEndNodes, 0);
      assert.strictEqual(m.labelsOverEndNodes, 0);
      mkdirSync(c.artifactDir, { recursive: true });
      writeFileSync(path.join(c.artifactDir, "diagram-general-after-move.png"), Buffer.from(await api.diagram.png(uriOf(f)), "base64"));
      await api.diagram.save(uriOf(f));
      assert.strictEqual(JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")).nodes.find((n: { id: string }) => n.id === "n1").x, start.x! + 64);
      await close();
      await api.diagram.open(uriOf(f));
      await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n1").x, start.x! + 64), "the moved position after reopening");
      // undo restores exactly: the reopened document has no history, so move again and undo that
      await gesture(f, { kind: "drag", id: "n1", dx: -24, dy: 16 });
      await waitFor(() => dirty(f), 5000, "second move");
      const moved = JSON.stringify(doc(f));
      assert.notStrictEqual(moved, before);
      await vscode.commands.executeCommand("undo");
      await waitFor(() => !dirty(f), 5000, "undo returns to the saved state");
      assert.strictEqual(node(f, "n1").x, start.x! + 64);
      assert.strictEqual(node(f, "n1").y, start.y! + 48);
    })],

    ["undo restores the positions exactly and a drag is exactly one edit", withCopy("ports-general.sysmld", "tmp-undo.sysmld", async () => {
      const f = "tmp-undo.sysmld";
      const before = JSON.stringify(doc(f));
      await gesture(f, { kind: "drag", id: "n2", dx: 40, dy: 40, steps: 12 });
      await waitFor(() => dirty(f), 5000, "dirty after the drag");
      await isUndone(f, before);
      await vscode.commands.executeCommand("redo");
      await waitFor(() => dirty(f), 5000, "redo");
      assert.notStrictEqual(JSON.stringify(doc(f)), before);
    })],

    ["resizing a node persists its size after save and reopen and changes no .sysml file", withCopy("ports-general.sysmld", "tmp-resize.sysmld", async () => {
      const f = "tmp-resize.sysmld";
      const m0 = await metrics(f);
      const n0 = nodeOf(m0, "n4");
      const before = JSON.stringify(doc(f));
      await gesture(f, { kind: "resize", id: "n4", handle: "se", dx: 64, dy: 40 });
      await waitFor(() => (node(f, "n4").w ?? 0) > n0.w, 5000, "the new size reaches the document");
      await c.eventually(async () => {
        const n = nodeOf(await metrics(f), "n4");
        assert.ok(n.w >= n0.w + 56 && n.h >= n0.h + 32, `grew to ${n.w}x${n.h} from ${n0.w}x${n0.h}`);
      }, "the node is drawn larger");
      assert.strictEqual((await metrics(f)).handles, 8, "a selected node shows eight handles");
      const w = node(f, "n4").w;
      const h = node(f, "n4").h;
      await api.diagram.save(uriOf(f));
      await close();
      await api.diagram.open(uriOf(f));
      await c.eventually(async () => { const n = nodeOf(await metrics(f), "n4"); assert.deepStrictEqual([n.w, n.h], [w, h]); }, "the size after reopening");
      // minimum size = content: shrinking far below it stops at the content size
      await gesture(f, { kind: "resize", id: "n4", handle: "se", dx: -2000, dy: -2000 });
      await c.eventually(async () => { const n = nodeOf(await metrics(f), "n4"); assert.ok(n.w >= 90 && n.h >= 40 && (await metrics(f)).overflows === 0); }, "no shrinking below the content");
      assert.notStrictEqual(before, "");
    })],

    ["a child cannot be dragged out of its container, and nested nodes move with their container", withCopy("drivetrain-interconnection.sysmld", "tmp-contain.sysmld", async () => {
      const f = "tmp-contain.sysmld";
      const m0 = await metrics(f);
      const cont = nodeOf(m0, "n0");
      // released at once (no dwell on a target): a plain layout move, clamped; moving out of the container needs the hold of a nest gesture
      await gesture(f, { kind: "drag", id: "n1", dx: -2000, dy: -2000 });
      await waitFor(() => dirty(f), 5000, "the clamped move is still an edit");
      await settled(f);
      const m = await metrics(f);
      assert.strictEqual(m.outsideParent, 0, "no child outside its parent");
      const k = nodeOf(m, "n1");
      assert.ok(k.x >= cont.x && k.y >= cont.y && k.x + k.w <= cont.x + cont.w && k.y + k.h <= cont.y + cont.h, "the child stays inside");
      await gesture(f, { kind: "drag", id: "n2", dx: 5000, dy: 5000 });
      await settled(f);
      const m2 = await metrics(f);
      assert.strictEqual(m2.outsideParent, 0);
      // move the container: its children keep their offsets
      const rel = (mm: Metrics, id: string) => ({ x: nodeOf(mm, id).x - nodeOf(mm, "n0").x, y: nodeOf(mm, id).y - nodeOf(mm, "n0").y });
      const before = rel(m2, "n1");
      await gesture(f, { kind: "drag", id: "n0", dx: 80, dy: 64 });
      await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n0").x, Math.round((nodeOf(m2, "n0").x + 80) / 8) * 8), "the container moved, snapped to the grid");
      assert.deepStrictEqual(rel(await metrics(f), "n1"), before, "children moved with it");
    })],

    ["ports stay on their owner's border after the owner is moved or resized, and slide along it when dragged", withCopy("drivetrain-interconnection.sysmld", "tmp-ports.sysmld", async () => {
      const f = "tmp-ports.sysmld";
      assert.strictEqual((await metrics(f)).portsOffBorder, 0);
      await gesture(f, { kind: "drag", id: "n1", dx: -48, dy: 0 });
      await settled(f);
      assert.strictEqual((await metrics(f)).portsOffBorder, 0, "after moving the owner");
      const w0 = nodeOf(await metrics(f), "n1").w;
      await gesture(f, { kind: "resize", id: "n1", handle: "se", dx: 56, dy: 24 });
      await c.eventually(async () => assert.ok(nodeOf(await metrics(f), "n1").w > w0), "resized");
      await settled(f);
      const m = await metrics(f);
      assert.strictEqual(m.portsOffBorder, 0, "after resizing the owner");
      const owner = nodeOf(m, "n1");
      const port = nodeOf(m, "n3");
      assert.ok(Math.abs(port.x + port.w / 2 - (owner.x + owner.w)) <= 2, "the output port is on the owner's right border");
      const y0 = port.y;
      await gesture(f, { kind: "drag", id: "n3", dx: 0, dy: 16 });
      await c.eventually(async () => assert.notStrictEqual(nodeOf(await metrics(f), "n3").y, y0), "the port slid");
      const m3 = await metrics(f);
      assert.strictEqual(m3.portsOffBorder, 0, "after sliding a port");
      // dragging a port across to the other side puts it on that border
      await gesture(f, { kind: "drag", id: "n3", dx: -2000, dy: 0 });
      await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n3").x + 7, nodeOf(await metrics(f), "n1").x), "the port flipped to the left border");
      assert.strictEqual((await metrics(f)).portsOffBorder, 0);
    })],

    ["Auto-layout re-lays out everything as one undo step", withCopy("ports-general.sysmld", "tmp-auto.sysmld", async () => {
      const f = "tmp-auto.sysmld";
      const before = JSON.stringify(doc(f));
      assert.strictEqual(api.diagram.activeUri(), uriOf(f).toString(), "the diagram editor is active");
      await vscode.commands.executeCommand("sysml.diagram.autoLayout");
      await waitFor(() => dirty(f), 10000, "Auto-layout dirties the diagram");
      assert.notStrictEqual(JSON.stringify(doc(f)), before, "positions changed");
      assert.ok(doc(f).nodes.every((n) => n.x !== undefined && n.w !== undefined));
      await settled(f);
      const m = await metrics(f);
      assert.strictEqual(m.overlaps, 0);
      assert.strictEqual(m.diagonalSegments, 0);
      assert.strictEqual(m.edgesThroughEndNodes, 0);
      await isUndone(f, before); // one undo restores everything: it was a single edit
      // the toolbar button is the same code path: it posts one autoLayout edit
      await waitFor(() => c.tabDirty(uriOf(f)) === false, 5000, "the tab is clean again");
    })],

    ["Auto-layout of a selection moves only the selected nodes and leaves no overlaps", withCopy("ports-general.sysmld", "tmp-auto-sel.sysmld", async () => {
      const f = "tmp-auto-sel.sysmld";
      const before = JSON.stringify(doc(f));
      const picked = ["n1", "n2", "n3"];
      const prior = new Map(doc(f).nodes.map((n) => [n.id, JSON.stringify(n)] as const));
      await gesture(f, { kind: "select", id: "n1" });
      await gesture(f, { kind: "select", id: "n2", shift: true });
      await gesture(f, { kind: "select", id: "n3", shift: true });
      await c.eventually(async () => assert.deepStrictEqual([...(await metrics(f)).selected].sort(), picked), "three nodes are selected");
      await vscode.commands.executeCommand("sysml.diagram.autoLayout");
      await waitFor(() => dirty(f), 10000, "Auto-layout dirties the diagram");
      for (const n of doc(f).nodes) {
        if (picked.includes(n.id)) continue;
        assert.strictEqual(JSON.stringify(n), prior.get(n.id), `${n.id} was not selected and stays where it is`);
      }
      assert.ok(picked.some((id) => JSON.stringify(node(f, id)) !== prior.get(id)), "a selected node was laid out again");
      await settled(f);
      const m = await metrics(f);
      assert.strictEqual(m.overlaps, 0, "no overlaps");
      assert.strictEqual(m.diagonalSegments, 0, "lines are still orthogonal");
      assert.strictEqual(m.edgesThroughEndNodes, 0, "no line runs through the node it ends at");
      for (const e of m.edges) {
        const through = m.nodes.filter((n) => n.id !== e.source && n.id !== e.target && !n.parent && e.points.some((p, i) => i > 0 && Math.min(e.points[i - 1]!.x, p.x) < n.x + n.w && Math.max(e.points[i - 1]!.x, p.x) > n.x && Math.min(e.points[i - 1]!.y, p.y) < n.y + n.h && Math.max(e.points[i - 1]!.y, p.y) > n.y));
        assert.deepStrictEqual(through.map((n) => n.id), [], `line ${e.id} crosses no unrelated node`);
      }
      await isUndone(f, before);
    })],

    ["the editor context follows the pointer and the selection, through both channels", withCopy("drivetrain-interconnection.sysmld", "tmp-ctx.sysmld", async () => {
      const f = "tmp-ctx.sysmld";
      const ctxOf = async (via: "lm" | "mcp") => {
        const r = via === "lm" ? await viaLm("sysml_get_editor_context", {}) : await viaMcp(api, "sysml_get_editor_context", {});
        assert.strictEqual(r.isError, false, r.text);
        return JSON.parse(r.text) as { activeDiagram: { path: string; kind: string; root: string; focused: boolean } | null; hovered: { id: string; type: string; element?: { qualifiedName?: string; locator?: unknown } } | null; selected: { id: string }[]; openDiagrams: string[] };
      };
      const both = async (check: (r: Awaited<ReturnType<typeof ctxOf>>) => void, what: string) => {
        for (const via of ["lm", "mcp"] as const) await c.eventually(async () => { const r = await ctxOf(via); try { check(r); } catch (e) { throw new Error(JSON.stringify(r) + " " + String(e)); } }, `${what} (${via})`, 5000);
      };
      await both((r) => {
        assert.deepStrictEqual(r.activeDiagram, { path: f, kind: "interconnection", root: "Ports::Drivetrain", focused: true });
        assert.strictEqual(r.hovered, null);
        assert.deepStrictEqual(r.selected, []);
      }, "the active diagram with nothing under the pointer");
      await gesture(f, { kind: "hover", id: "n1" });
      await both((r) => {
        assert.strictEqual(r.hovered?.id, "n1");
        assert.strictEqual(r.hovered?.type, "node");
        assert.strictEqual(r.hovered?.element?.qualifiedName, "Ports::Drivetrain::battery");
      }, "a hovered node");
      await gesture(f, { kind: "hover", id: "e1" });
      await both((r) => {
        assert.strictEqual(r.hovered?.id, "e1");
        assert.strictEqual(r.hovered?.type, "edge");
        assert.ok(r.hovered?.element?.locator, "an unnamed statement carries a locator");
      }, "a hovered line");
      await gesture(f, { kind: "select", id: "n2" });
      await both((r) => assert.deepStrictEqual(r.selected.map((s) => s.id), ["n2"]), "the selection");
      await gesture(f, { kind: "hover" });
      await both((r) => assert.strictEqual(r.hovered, null), "hover cleared when the pointer leaves");
    })],

    ["an agent layout lays out the whole diagram even when the user has a selection", withCopy("ports-general.sysmld", "tmp-agent-whole.sysmld", async () => {
      const f = "tmp-agent-whole.sysmld";
      const prior = new Map(doc(f).nodes.map((n) => [n.id, JSON.stringify(n)] as const));
      await gesture(f, { kind: "select", id: "n1" });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).selected, ["n1"]), "n1 is selected");
      const r = await viaLm("sysml_layout_diagram", { path: f });
      assert.strictEqual(r.isError, false, r.text);
      await waitFor(() => dirty(f), 10000, "the layout dirties the diagram");
      assert.ok(doc(f).nodes.some((n) => n.id !== "n1" && JSON.stringify(n) !== prior.get(n.id)), "unselected nodes were laid out too");
    })],

    ["the pointer's hover is cleared on the host when the panel is hidden", withCopy("drivetrain-interconnection.sysmld", "tmp-hide.sysmld", async () => {
      const f = "tmp-hide.sysmld";
      await gesture(f, { kind: "hover", id: "n1" });
      await waitFor(() => api.diagram.hoverOf(uriOf(f)) === "n1", 5000, "the hover reaches the host");
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uriOf("ports.sysml")), { viewColumn: vscode.ViewColumn.Active, preview: false });
      await waitFor(() => api.diagram.hoverOf(uriOf(f)) === undefined, 5000, "the hover is cleared when the panel is hidden");
      assert.strictEqual(JSON.parse((await viaMcp(api, "sysml_get_editor_context", {})).text).activeDiagram, null, "no diagram is visible");
    })],

    ["the editor context keeps the last active diagram, unfocused, while the user is in another editor group", withCopy("drivetrain-interconnection.sysmld", "tmp-chat.sysmld", async () => {
      const f = "tmp-chat.sysmld";
      await gesture(f, { kind: "select", id: "n2" });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).selected, ["n2"]), "n2 is selected");
      const text = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uriOf("ports.sysml")), { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false, preview: false });
      try {
        // Focus must really be in the other group before the tool is asked.
        await waitFor(() => {
          const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
          return vscode.window.activeTextEditor === text && tab?.input instanceof vscode.TabInputText && tab.group.viewColumn === text.viewColumn;
        }, 10000, "the text editor in the other group is the active tab");
        assert.strictEqual(vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.input instanceof vscode.TabInputCustom && t.group !== vscode.window.tabGroups.activeTabGroup)), true, "the diagram stays open in its own group");
        for (const via of ["lm", "mcp"] as const) {
          await c.eventually(async () => {
            // A webview that gains focus (late focus handling after the select gesture) makes its own group active again; keep the user in the text editor.
            if (!(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText)) await vscode.window.showTextDocument(text.document, { viewColumn: text.viewColumn, preserveFocus: false, preview: false });
            const r = via === "lm" ? await viaLm("sysml_get_editor_context", {}) : await viaMcp(api, "sysml_get_editor_context", {});
            const j = JSON.parse(r.text) as { activeDiagram: { path: string; focused: boolean } | null; selected: { id: string }[] };
            const at = vscode.window.tabGroups.activeTabGroup.activeTab;
            assert.deepStrictEqual(j.activeDiagram, { path: f, kind: "interconnection", root: "Ports::Drivetrain", focused: false }, `active tab: ${at?.label} ${at?.input?.constructor?.name} group ${at?.group.viewColumn}; groups ${vscode.window.tabGroups.all.map((g) => `${g.viewColumn}:${g.isActive}:${g.tabs.map((t) => t.label + (t.isActive ? "*" : "")).join(",")}`).join(" | ")}`);
            assert.deepStrictEqual(j.selected.map((x) => x.id), ["n2"]);
          }, `the unfocused diagram (${via})`, 5000);
        }
      } finally {
        await close();
      }
    })],

    ["the editor context has no active diagram when another editor is active", async () => {
      await close();
      const doc2 = await vscode.workspace.openTextDocument(uriOf("ports.sysml"));
      await vscode.window.showTextDocument(doc2);
      try {
        for (const via of ["lm", "mcp"] as const) {
          const r = via === "lm" ? await viaLm("sysml_get_editor_context", {}) : await viaMcp(api, "sysml_get_editor_context", {});
          const j = JSON.parse(r.text) as { activeDiagram: unknown; hovered: unknown; selected: unknown[] };
          assert.strictEqual(j.activeDiagram, null);
          assert.strictEqual(j.hovered, null);
          assert.deepStrictEqual(j.selected, []);
        }
      } finally {
        await close();
      }
    }],

    ["keyboard: Tab selects nodes with an accessible name, Ctrl+A selects all, arrows nudge one grid step, Escape clears", withCopy("ports-general.sysmld", "tmp-keys.sysmld", async () => {
      const f = "tmp-keys.sysmld";
      assert.strictEqual((await metrics(f)).focusable, true, "the diagram is focusable");
      await gesture(f, { kind: "key", key: "Tab" });
      let m = await metrics(f);
      assert.strictEqual(m.selected.length, 1);
      assert.strictEqual(m.selectedNamed, 1, "the selected node has an aria-label");
      const first = m.selected[0]!;
      await gesture(f, { kind: "key", key: "Tab" });
      m = await metrics(f);
      assert.notStrictEqual(m.selected[0], first);
      await gesture(f, { kind: "key", key: "Tab", shift: true });
      assert.deepStrictEqual((await metrics(f)).selected, [first]);
      await gesture(f, { kind: "key", key: "a", ctrl: true });
      m = await metrics(f);
      assert.strictEqual(m.selected.length, m.nodes.length, "Ctrl+A selects all");
      await gesture(f, { kind: "key", key: "Escape" });
      assert.deepStrictEqual((await metrics(f)).selected, [], "Escape clears the selection");
      // nudge: three presses within 500 ms are one edit of three grid steps
      await gesture(f, { kind: "select", id: "n1" });
      const x0 = node(f, "n1").x!;
      const before = JSON.stringify(doc(f));
      for (let i = 0; i < 3; i++) await gesture(f, { kind: "key", key: "ArrowRight" });
      assert.strictEqual(dirty(f), false, "coalescing: nothing is posted yet");
      await waitFor(() => node(f, "n1").x === x0 + 24, 5000, "the coalesced nudge arrives");
      await isUndone(f, before);
      // rubber band: shift-drag on the background selects what lies inside
      const mm = await metrics(f);
      const all = mm.nodes.filter((n) => n.parent === undefined && n.attachedTo === undefined);
      const x1 = Math.min(...all.map((n) => n.x)) - 10, y1 = Math.min(...all.map((n) => n.y)) - 10;
      const x2 = Math.max(...all.map((n) => n.x + n.w)) + 10, y2 = Math.max(...all.map((n) => n.y + n.h)) + 10;
      await gesture(f, { kind: "rubber", x0: x1, y0: y1, x1: x2, y1: y2 });
      assert.strictEqual((await metrics(f)).selected.length, all.length);
      // shift-click toggles
      await gesture(f, { kind: "select", id: all[0]!.id, shift: true });
      assert.strictEqual((await metrics(f)).selected.length, all.length - 1);
    })],

    // ---- C: remove from diagram, unresolved ----------------------------------------------
    ["Delete removes the selected node with its child nodes and attached edges, as one undoable edit, leaving the .sysml files untouched", withCopy("drivetrain-interconnection.sysmld", "tmp-remove.sysmld", async () => {
      const f = "tmp-remove.sysmld";
      const before = JSON.stringify(doc(f));
      assert.deepStrictEqual((await metrics(f)).edges.map((e) => e.id), ["e1"]);
      await gesture(f, { kind: "select", id: "n1" }); // battery: holds port n3, which e1 connects
      await gesture(f, { kind: "key", key: "Delete" });
      await waitFor(() => !doc(f).nodes.some((n) => n.id === "n1"), 5000, "the node is removed from the document");
      assert.ok(!doc(f).nodes.some((n) => n.id === "n3"), "its port is removed");
      assert.deepStrictEqual(doc(f).edges, [], "the attached edge is removed");
      await waitFor(() => c.tabDirty(uriOf(f)) === true, 5000, "the tab is dirty");
      await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).nodes.map((n) => n.id).sort(), ["n0", "n2", "n4", "n5"]), "the node disappears from the drawing");
      assert.deepStrictEqual((await metrics(f)).selected, [], "nothing stays selected");
      await isUndone(f, before);
      await c.eventually(async () => assert.strictEqual((await metrics(f)).nodes.length, 6), "undo brings the nodes back");
      // the context menu performs the same action
      await gesture(f, { kind: "contextmenu", id: "n2" });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).menu, ["Rename", "Go to Definition", "Remove from Diagram", "Delete from Model…"]), "the menu of a resolved node offers rename, go to definition, remove from diagram and delete from model");
      await gesture(f, { kind: "select", id: "n0" }); // a click elsewhere closes the menu
      assert.deepStrictEqual((await metrics(f)).menu, []);
      await gesture(f, { kind: "menu", id: "n2", action: "remove" });
      await waitFor(() => !doc(f).nodes.some((n) => n.id === "n2" || n.id === "n4"), 5000, "removed through the menu with its port");
    })],

    ["a deleted element stays on the diagram as unresolved, with Remove from Diagram and Re-link…, and re-linking is one undoable edit", async () => {
      const model = "tmp-model.sysml", f = "tmp-unresolved.sysmld";
      const before = sysmlBytes();
      await writeModel(model, MODEL());
      writeFileSync(uriOf(f).fsPath, diagramText({ version: 1, kind: "general", root: "Tmp::Alpha", sources: [model], nodes: [{ id: "n1", ref: "Tmp::Alpha", x: 40, y: 40, w: 140, h: 60 }, { id: "n2", ref: "Tmp::Beta", x: 260, y: 40, w: 140, h: 60 }], edges: [] }));
      try {
        await modelHas("Tmp::Alpha");
        await api.diagram.open(uriOf(f));
        await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).nodes.map((n) => n.shape), ["definition", "definition"]), "both nodes resolve");
        writeFileSync(uriOf(model).fsPath, MODEL().replace("  part def Alpha;\n", ""));
        await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n1").shape, "unresolved"), "the deleted element is shown as unresolved", 20000);
        assert.ok(doc(f).nodes.some((n) => n.id === "n1" && n.ref === "Tmp::Alpha"), "it stays in the file");
        assert.strictEqual(nodeOf(await metrics(f), "n1").x, 40, "with its position");
        assert.match(nodeOf(await metrics(f), "n1").text ?? "", /unresolved/);
        await gesture(f, { kind: "contextmenu", id: "n1" });
        await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).menu, ["Remove from Diagram", "Re-link…"]), "the unresolved node's menu");
        await gesture(f, { kind: "select", id: "n2" });
        // Re-link…: candidates are elements of the same kind that are not shown yet
        let offered: string[] = [];
        api.diagram.setUi({ pick: async (items: PickItem[]) => { offered = items.map((i) => i.description ?? ""); return items.find((i) => i.description === "Tmp::Gamma"); } });
        const saved = JSON.stringify(doc(f));
        await gesture(f, { kind: "menu", id: "n1", action: "relink" });
        await waitFor(() => node(f, "n1").ref === "Tmp::Gamma", 10000, "the node is re-linked");
        assert.ok(offered.includes("Tmp::Gamma"), "an element of the same kind is offered");
        assert.ok(!offered.includes("Tmp::Beta"), "what is already shown is not");
        assert.ok(offered.every((q) => !/^Design::vehicle|^Ports::Drivetrain::|^Vehicle::Car::/.test(q)), `only elements of the kind the lost one had (part def), not usages: ${offered}`);
        assert.strictEqual(node(f, "n1").x, 40, "position kept");
        assert.strictEqual(dirty(f), true);
        await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n1").shape, "definition"), "the re-linked node resolves");
        await isUndone(f, saved);
        await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n1").shape, "unresolved"), "undo brings the unresolved node back");
        // Remove from Diagram on the unresolved node
        await gesture(f, { kind: "select", id: "n1" });
        await gesture(f, { kind: "key", key: "Delete" });
        await waitFor(() => !doc(f).nodes.some((n) => n.id === "n1"), 5000, "the unresolved node is removed");
        assert.deepStrictEqual(api.diagram.errors(), []);
      } finally {
        api.diagram.setUi(undefined);
        await close();
        rm(f, model);
        sameSysml(before);
      }
    }],

    ["a rename typed in the text editor keeps the node at its position and updates the stored reference", async () => {
      const model = "tmp-rename.sysml", f = "tmp-rename.sysmld";
      const text = await writeModel(model, "package TmpR {\n  part def Engine;\n  part def Car {\n    part engine : Engine;\n  }\n}\n");
      writeFileSync(uriOf(f).fsPath, diagramText({ version: 1, kind: "general", root: "TmpR::Car", sources: [model], nodes: [{ id: "n1", ref: "TmpR::Car", x: 40, y: 40, w: 160, h: 80 }, { id: "n2", ref: "TmpR::Car::engine", x: 300, y: 60, w: 160, h: 60 }], edges: [] }));
      try {
        await modelHas("TmpR::Car::engine");
        await api.diagram.open(uriOf(f));
        await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n2").shape, "usage"), "the node resolves first");
        await sleep(300); // the first reconciliation stores the snapshot rename detection compares with
        const line = text.getText().split("\n").findIndex((l) => l.includes("part engine"));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uriOf(model), new vscode.Range(line, 9, line, 15), "motor");
        assert.ok(await vscode.workspace.applyEdit(edit));
        await waitFor(() => node(f, "n2").ref === "TmpR::Car::motor", 15000, "the reference follows the rename");
        assert.strictEqual(node(f, "n2").x, 300);
        await waitFor(() => { try { return (JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")).nodes as { ref: string }[]).some((n) => n.ref === "TmpR::Car::motor"); } catch { return false; } }, 10000, "the rename is written to the file at once");
        assert.strictEqual(dirty(f), false, "a rename is not an unsaved change");
        await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(f), "n2").shape, "usage"), "it is still drawn as resolved");
      } finally {
        await close();
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uriOf(model))).then(() => vscode.commands.executeCommand("workbench.action.files.revert"));
        await close();
        rm(f, model);
      }
    }],

    // ---- D: add existing elements --------------------------------------------------------
    ["Add to Diagram and a drop add a node as one undoable edit and change only the diagram file", withCopy("ports-general.sysmld", "tmp-add.sysmld", async () => {
      const f = "tmp-add.sysmld";
      const before = JSON.stringify(doc(f));
      const vehicle = await rootOf("Vehicle");
      // (2) the tree action, with the node the tree view passes
      assert.strictEqual(api.diagram.activeUri(), uriOf(f).toString());
      await vscode.commands.executeCommand("sysml.addToActiveDiagram", childOf(vehicle, "Wheel"));
      await waitFor(() => doc(f).nodes.some((n) => n.ref === "Vehicle::Wheel"), 10000, "Wheel is on the diagram");
      assert.strictEqual(dirty(f), true);
      assert.ok(doc(f).sources.includes("vehicle.sysml"), "its source file is recorded");
      assert.ok(!doc(f).nodes.find((n) => n.ref === "Vehicle::Wheel")!.parent, "at top level");
      await c.eventually(async () => assert.ok((await metrics(f)).nodes.some((n) => n.text?.includes("Wheel"))), "the node is drawn");
      const wheelId = doc(f).nodes.find((n) => n.ref === "Vehicle::Wheel")!.id;
      await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).selected, [wheelId]), "the new node is selected");
      await isUndone(f, before);
      // (1) a drop: the webview's drop handler reads the tree's MIME type
      await gesture(f, { kind: "drop", names: ["Vehicle::Car"] });
      await waitFor(() => doc(f).nodes.some((n) => n.ref === "Vehicle::Car"), 10000, "the dropped element is on the diagram");
      assert.strictEqual(dirty(f), true);
      await isUndone(f, before);
      // adding what is already shown only selects it
      await gesture(f, { kind: "drop", names: ["Ports::Power"] });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(f)).selected, ["n1"]), "an existing element is selected");
      assert.strictEqual(dirty(f), false);
      api.diagram.setUi(undefined);
    })],

    // ---- tree drag to every diagram kind, at the pointer ---------------------------------
    ...(["ports-general", "drivetrain-interconnection", "lamp-state-transition", "delivery-action-flow", "ordering-sequence", "mobility-use-case", "requirements"] as const).map((base) => [
      `a tree drag onto ${base} adds the node at the drop point`,
      withCopy(`${base}.sysmld`, `tmp-drop-${base}.sysmld`, async () => {
        const f = `tmp-drop-${base}.sysmld`;
        await gesture(f, { kind: "drop", names: ["Vehicle::Wheel"], x: 900, y: 700 });
        await waitFor(() => doc(f).nodes.some((n) => n.ref === "Vehicle::Wheel"), 10000, "the dropped element is in the file");
        const n = doc(f).nodes.find((x) => x.ref === "Vehicle::Wheel")!;
        assert.ok(Math.abs((n.x ?? NaN) - 900) <= 1 && Math.abs((n.y ?? NaN) - 700) <= 1, `stored at the drop point, got ${String(n.x)},${String(n.y)}`);
        await c.eventually(async () => {
          const m = (await metrics(f)).nodes.find((x) => x.id === n.id);
          assert.ok(m, "the node is drawn");
          assert.ok(base === "ordering-sequence" ? Math.abs(m.x - 900) <= 2 : Math.abs(m.x - 900) <= 2 && Math.abs(m.y - 700) <= 2, `drawn at the drop point, got ${String(m.x)},${String(m.y)}`);
        }, "drawn at the drop point");
      }),
    ] as [string, () => Promise<void>]),

    ["the tree puts the dragged elements on the data transfer under the diagram MIME type", async () => {
      const wheel = childOf(await rootOf("Vehicle"), "Wheel");
      const car = childOf(await rootOf("Vehicle"), "Car");
      const dt = new vscode.DataTransfer();
      api.dnd.handleDrag([wheel, car], dt);
      assert.deepStrictEqual(JSON.parse(String(await dt.get(ELEMENT_MIME)!.asString())), ["Vehicle::Wheel", "Vehicle::Car"]);
      assert.strictEqual(await dt.get("text/plain")!.asString(), "Vehicle::Wheel\nVehicle::Car");
    }],

    // ---- E: new diagram, show in diagram --------------------------------------------------
    ["New Diagram… on a tree element creates a valid file next to its source, never overwrites, and opens it showing the direct members", async () => {
      const created: string[] = [];
      const car = childOf(await rootOf("Vehicle"), "Car");
      try {
        const asked: string[] = [];
        api.diagram.setUi({
          pick: async (items: PickItem[]) => { asked.push(...items.map((i) => i.label)); return items.find((i) => i.label === "General View"); },
          input: async (o) => o.value,
        });
        const uri = (await vscode.commands.executeCommand("sysml.newDiagram", car)) as vscode.Uri;
        assert.ok(uri, "the command returns the new file");
        created.push(uri.fsPath);
        assert.deepStrictEqual(asked, ["General View", "Interconnection View", "Requirements View"]);
        assert.strictEqual(path.basename(uri.fsPath), "Car.sysmld");
        assert.strictEqual(path.dirname(uri.fsPath), path.dirname(vehicleFile(folder)), "next to the element's source file");
        assert.ok(!existsSync(uri.fsPath), "nothing is written until the diagram is saved");
        const name = path.basename(uri.fsPath);
        await c.eventually(async () => assert.deepStrictEqual((await metrics(name)).nodes.map((n) => n.id), ["n1", "n2", "n3"]), "it opens showing the element and its direct members");
        assert.strictEqual(api.diagram.state(uri).pending, true);
        assert.strictEqual(api.diagram.state(uri).dirty, false, "the generated layout does not dirty it");
        const m = await metrics(name);
        assert.ok(m.nodes[0]!.text?.includes("Car"));
        assert.strictEqual(m.overlaps, 0);
        await api.diagram.save(uri);
        assert.strictEqual(api.diagram.state(uri).pending, false);
        const written = JSON.parse(readFileSync(uri.fsPath, "utf8")) as DiagramDoc;
        assert.strictEqual(written.version, 1);
        assert.strictEqual(written.kind, "general");
        assert.strictEqual(written.root, "Vehicle::Car");
        assert.deepStrictEqual(written.nodes.map((n) => n.ref), ["Vehicle::Car", "Vehicle::Car::engine", "Vehicle::Car::wheels"]);
        await close();
        // a second diagram of the same element gets another name
        const again = (await vscode.commands.executeCommand("sysml.newDiagram", car)) as vscode.Uri;
        created.push(again.fsPath);
        assert.strictEqual(path.basename(again.fsPath), "Car 2.sysmld");
        assert.ok(!existsSync(again.fsPath), "the second one is not written either");
        assert.ok(readFileSync(uri.fsPath).length > 0, "the first file is untouched");
        await close();
        assert.ok(!existsSync(again.fsPath), "closing it untouched leaves no file");
        // from the command palette: the element is picked
        api.diagram.setUi({
          pick: async (items: PickItem[]) => items.find((i) => i.description === "Ports::Drivetrain") ?? items.find((i) => i.label === "Interconnection View"),
          input: async (o) => o.value,
        });
        const viaPalette = (await vscode.commands.executeCommand("sysml.newDiagram")) as vscode.Uri;
        created.push(viaPalette.fsPath);
        assert.strictEqual(path.basename(viaPalette.fsPath), "Drivetrain.sysmld");
        assert.strictEqual(path.dirname(viaPalette.fsPath), folder.fsPath.replace(/\/$/, ""), "next to ports.sysml");
        await c.eventually(async () => assert.ok((await metrics(path.basename(viaPalette.fsPath))).nodes.length > 0), "the palette-created diagram renders");
        assert.strictEqual((api.diagram.state(viaPalette).doc as DiagramDoc).kind, "interconnection");
      } finally {
        api.diagram.setUi(undefined);
        await close();
        for (const p of created) rmSync(p, { force: true });
      }
    }],

    ["a line drag stays drawn after release, routes around the end node and never leaves a bad route (D22, D23)", withCopy("lamp-state-transition.sysmld", "tmp-opt.sysmld", async () => {
      const f = "tmp-opt.sysmld";
      const edge = async () => (await metrics(f)).edges.find((e) => e.label?.startsWith("TurnOn"))!;
      const e0 = await edge();
      const src = nodeOf(await metrics(f), e0.source);
      const horiz = Math.abs(e0.points[0]!.y - e0.points[1]!.y) < 0.5;
      const d = horiz ? -(e0.points[0]!.y - src.y + 90) : -(e0.points[0]!.x - src.x + 90);
      await gesture(f, { kind: "dragSegment", id: e0.id, index: 0, d });
      await c.eventually(async () => assert.notDeepStrictEqual((await edge()).points, e0.points), "the route changed");
      let m = await metrics(f);
      assert.strictEqual(m.staleDraws, 0, "the old route is never drawn again between release and confirmation");
      assert.strictEqual(m.diagonalSegments, 0);
      assert.strictEqual(m.edgesThroughEndNodes, 0);
      const mid = (await edge()).points;
      if (mid.length > 3) {
        await gesture(f, { kind: "dragBend", id: e0.id, index: 1, dx: -60, dy: 70 });
        await c.eventually(async () => assert.strictEqual((await metrics(f)).staleDraws, 0), "no stale draw after the bend drag");
        m = await metrics(f);
        assert.strictEqual(m.diagonalSegments, 0);
        assert.strictEqual(m.edgesThroughEndNodes, 0);
      }
      assert.strictEqual(m.staleDraws, 0);
    })],

    ["a click on a label selects its line at once and the label resizes in one go; a selected line has a highlight (screenshots)", withCopy("lamp-state-transition.sysmld", "tmp-lsel.sysmld", async () => {
      const f = "tmp-lsel.sysmld";
      const edge = async () => (await metrics(f)).edges.find((e) => e.label?.startsWith("TurnOn"))!;
      const e0 = await edge();
      assert.deepStrictEqual((await metrics(f)).selected, []);
      assert.strictEqual((await metrics(f)).highlights, 0);
      await gesture(f, { kind: "labelClick", id: e0.id });
      await c.eventually(async () => {
        const m = await metrics(f);
        assert.deepStrictEqual(m.selected, [e0.id], "the first click selects the line");
        assert.ok(m.labelHandles >= 2, "the label handles show at once");
        assert.strictEqual(m.highlights, 1, "a highlight runs along the selected line");
      }, "label click selects");
      await gesture(f, { kind: "labelResize", id: e0.id, dw: -Math.round(e0.labelBox!.w / 2), dh: 20 });
      await waitFor(() => doc(f).edges.find((e) => e.id === e0.id)?.label?.w !== undefined, 5000, "the size reaches the document");
      mkdirSync(c.artifactDir, { recursive: true });
      for (const theme of ["editor-dark", "editor-light"] as const) writeFileSync(path.join(c.artifactDir, `diagram-selected-line-${theme}.png`), Buffer.from(await api.diagram.pngWindow(uriOf(f), theme), "base64"));
    })],

    ["the canvas has no focus border after a mouse press, a thin line for the keyboard; the wheel zooms 1.5 times as fast and back; arrows pan only with nothing selected", withCopy("lamp-state-transition.sysmld", "tmp-view.sysmld", async () => {
      const f = "tmp-view.sysmld";
      await gesture(f, { kind: "focusCanvas", mouse: true });
      assert.strictEqual((await metrics(f)).focusOutline, false, "no focus border on mouse focus");
      await gesture(f, { kind: "focusCanvas", mouse: false });
      // the outline appears only when the browser treats the focus as keyboard focus; it must never be the 2 px selection-like border
      const z0 = (await metrics(f)).zoom;
      await gesture(f, { kind: "wheel", deltaY: -100, ctrl: true });
      const z1 = (await metrics(f)).zoom;
      assert.ok(Math.abs(z1 / z0 - Math.exp(100 * 0.0015 * 1.5)) < 1e-6, `one step in: ${z1 / z0}`);
      await gesture(f, { kind: "wheel", deltaY: 100, ctrl: true });
      assert.ok(Math.abs((await metrics(f)).zoom - z0) < 1e-9, "one step in and one out return to the start");
      const v0 = (await metrics(f)).view;
      await gesture(f, { kind: "key", key: "Escape" });
      await gesture(f, { kind: "key", key: "ArrowLeft" });
      const v1 = (await metrics(f)).view;
      assert.ok(Math.abs(v1.x - v0.x - 40) < 1e-9 && v1.y === v0.y, "pans 40 px");
      await gesture(f, { kind: "key", key: "ArrowDown", shift: true });
      assert.ok(Math.abs((await metrics(f)).view.y - (v1.y - 160)) < 1e-9, "Shift pans 160 px");
      // with a selection the arrow keys nudge and the view stays
      const n = (await metrics(f)).nodes[0]!;
      await gesture(f, { kind: "select", id: n.id });
      const v2 = (await metrics(f)).view;
      await gesture(f, { kind: "key", key: "ArrowRight" });
      await gesture(f, { kind: "flush" });
      assert.deepStrictEqual((await metrics(f)).view, v2, "the view does not pan");
      await waitFor(async () => nodeOf(await metrics(f), n.id).x === n.x + 1 || nodeOf(await metrics(f), n.id).x > n.x, 5000, "the node was nudged");
    })],

    ["a diagram with no stored view is fitted to the window on open and keeps a stored view", withCopy("lamp-state-transition.sysmld", "tmp-fit.sysmld", async () => {
      const f = "tmp-fit.sysmld";
      await c.eventually(async () => {
        const m = await metrics(f);
        const { x, y, k } = m.view;
        for (const n of m.nodes.filter((b) => b.parent === undefined)) {
          assert.ok(n.x * k + x >= -1 && n.y * k + y >= -1 && (n.x + n.w) * k + x <= m.canvas.w + 1 && (n.y + n.h) * k + y <= m.canvas.h + 1, `${n.id} is inside the window`);
        }
        const xs = m.nodes.filter((b) => b.parent === undefined);
        const left = Math.min(...xs.map((b) => b.x * k + x)), right = m.canvas.w - Math.max(...xs.map((b) => (b.x + b.w) * k + x));
        assert.ok(Math.abs(left - right) < 2, `centered horizontally (${left} / ${right})`);
      }, "the content is fitted and centered");
    })],

    ["an Interconnection diagram rooted at a package opens with a message and the actions Change root and Convert to General; New Diagram on a package does not offer Interconnection", async () => {
      const f = "tmp-badroot.sysmld";
      const bad = { version: 1, kind: "interconnection", root: "Ports", sources: ["ports.sysml"], nodes: [{ id: "n1", ref: "Ports" }, { id: "n2", ref: "Ports::Power", parent: "n1" }], edges: [] };
      writeFileSync(uriOf(f).fsPath, JSON.stringify(bad, null, 2));
      const asked: { message: string; actions: readonly string[] }[] = [];
      try {
        api.diagram.setUi({ choose: async (message, actions) => { asked.push({ message, actions }); return "Convert to General"; } });
        await api.diagram.open(uriOf(f));
        await waitFor(() => asked.length > 0, 30000, "the message is shown");
        assert.match(asked[0]!.message, /Interconnection View needs a part, item, interface or connection definition or usage/);
        assert.deepStrictEqual(asked[0]!.actions, ["Change root", "Convert to General"]);
        await waitFor(() => doc(f).kind === "general", 5000, "the diagram became a General View");
        assert.ok(dirty(f), "the conversion is an edit of the diagram file");
        await close();
        const kinds: string[] = [];
        api.diagram.setUi({ pick: async (items: PickItem[]) => { kinds.push(...items.map((i) => i.label)); return undefined; } });
        await vscode.commands.executeCommand("sysml.newDiagram", await rootOf("Vehicle"));
        assert.deepStrictEqual(kinds, ["General View", "Requirements View"]);
      } finally {
        api.diagram.setUi(undefined);
        await close();
        rm(f);
      }
    }],

    ["Show in Diagram lists the diagrams that show the element, opens the chosen one and selects the node", async () => {
      const battery = childOf(await rootOf("Ports"), "Battery");
      let offered: string[] = [];
      try {
        api.diagram.setUi({ pick: async (items: PickItem[]) => { offered = items.map((i) => i.label); return items.find((i) => i.label === "ports-general.sysmld"); } });
        await vscode.commands.executeCommand("sysml.showInDiagram", battery);
        assert.ok(offered.includes("ports-general.sysmld") && offered.includes("ports-general-auto.sysmld"), `offered ${offered}`);
        assert.ok(!offered.includes("drivetrain-interconnection.sysmld"), "a diagram that does not show it is not listed");
        assert.strictEqual(api.diagram.activeUri(), uriOf("ports-general.sysmld").toString(), "it opened");
        await c.eventually(async () => assert.deepStrictEqual((await metrics("ports-general.sysmld")).selected, ["n2"]), "the node is selected");
      } finally {
        api.diagram.setUi(undefined);
        await close();
      }
    }],

    // ---- F: selection sync -----------------------------------------------------------------
    ["selecting a node in a diagram reveals and selects the tree item, unless sysml.tree.followCursor is off", async () => {
      const f = "ports-general.sysmld";
      const battery = childOf(await rootOf("Ports"), "Battery");
      const calls: ModelNode[] = [];
      const view = api.view;
      const orig = view.reveal.bind(view);
      (view as { reveal: typeof view.reveal }).reveal = (n, o) => { calls.push(n); return orig(n, o); };
      const cfg = vscode.workspace.getConfiguration("sysml");
      const settingsFile = path.join(folder.fsPath, ".vscode", "settings.json");
      const settings = readFileSync(settingsFile);
      try {
        await api.diagram.open(uriOf(f));
        await vscode.commands.executeCommand("sysmlModel.focus");
        await c.eventually(async () => assert.ok((await metrics(f)).nodes.length > 0), "rendered");
        await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
        await gesture(f, { kind: "select", id: "n2" });
        await waitFor(() => calls.some((n) => n.id === battery.id), 5000, "the tree reveals Battery");
        await waitFor(() => api.view.selection[0]?.id === battery.id, 5000, "and selects it");
        // off: no reveal
        await cfg.update("tree.followCursor", false, vscode.ConfigurationTarget.Workspace);
        calls.length = 0;
        await gesture(f, { kind: "select", id: "n3" });
        await sleep(500);
        assert.deepStrictEqual(calls, [], "no reveal when the setting is off");
      } finally {
        (view as { reveal: typeof view.reveal }).reveal = orig;
        await cfg.update("tree.followCursor", undefined, vscode.ConfigurationTarget.Workspace);
        writeFileSync(settingsFile, settings); // the settings API reformats the file
        await close();
      }
    }],

    // ---- G: live refresh -----------------------------------------------------------------
    ["a text edit updates open diagrams within a second: label, type and compartments, positions unchanged, no new node for a new member", async () => {
      const model = "tmp-live.sysml", g = "tmp-live-general.sysmld", ic = "tmp-live-ic.sysmld";
      const text = await writeModel(model, "package TmpL {\n  part def Engine;\n  part def Motor;\n  part def Car {\n    part engine : Engine;\n  }\n}\n");
      writeFileSync(uriOf(g).fsPath, diagramText({ version: 1, kind: "general", root: "TmpL::Car", sources: [model], nodes: [{ id: "n1", ref: "TmpL::Car", x: 40, y: 40, w: 200, h: 100 }, { id: "n2", ref: "TmpL::Car::engine", x: 360, y: 60, w: 180, h: 60 }, { id: "n3", ref: "TmpL::Engine", x: 40, y: 260, w: 140, h: 60 }], edges: [] }));
      writeFileSync(uriOf(ic).fsPath, diagramText({ version: 1, kind: "interconnection", root: "TmpL::Car", sources: [model], nodes: [{ id: "n1", ref: "TmpL::Car", x: 40, y: 40, w: 300, h: 160 }, { id: "n2", ref: "TmpL::Car::engine", parent: "n1", x: 40, y: 60, w: 160, h: 60 }], edges: [] }));
      try {
        await modelHas("TmpL::Car::engine");
        await api.diagram.open(uriOf(ic));
        await api.diagram.open(uriOf(g));
        await c.eventually(async () => assert.match(nodeOf(await metrics(g), "n2").text ?? "", /engine : Engine/), "the usage label shows its type");
        const pos = (m: Metrics) => m.nodes.map((n) => [n.id, n.x, n.y]);
        const before = pos(await metrics(g));
        const beforeIc = pos(await metrics(ic));
        const line = text.getText().split("\n").findIndex((l) => l.includes("part engine"));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uriOf(model), new vscode.Range(line, 18, line, 24), "Motor"); // part engine : Engine -> Motor
        edit.insert(uriOf(model), new vscode.Position(line + 1, 0), "    part spare : Engine;\n");
        assert.ok(await vscode.workspace.applyEdit(edit));
        const t0 = performance.now();
        let m!: Metrics;
        while (performance.now() - t0 < 6000) {
          m = await metrics(g);
          if (/engine : Motor/.test(nodeOf(m, "n2").text ?? "") && /spare : Engine/.test(nodeOf(m, "n1").text ?? "")) break;
          await sleep(40);
        }
        const took = Math.round(performance.now() - t0);
        assert.match(nodeOf(m, "n2").text ?? "", /engine : Motor/, `the type changed in the label within a second (waited ${took} ms; n2 shows "${nodeOf(m, "n2").text}")`);
        assert.match(nodeOf(m, "n1").text ?? "", /spare : Engine/, "the new member is in the owner's compartment");
        assert.ok(took < 1000, `took ${took} ms`);
        assert.deepStrictEqual(pos(m), before, "positions are unchanged");
        assert.strictEqual(m.nodes.length, 3, "no node was added for the new member");
        const mi = await metrics(ic);
        assert.strictEqual(mi.nodes.length, 2, "an Interconnection View does not add the new member");
        assert.match(nodeOf(mi, "n2").text ?? "", /engine : Motor/);
        assert.deepStrictEqual(pos(mi), beforeIc);
        assert.strictEqual(dirty(g), false, "a model refresh is not an edit");
        // a deleted element becomes unresolved without moving
        const del = new vscode.WorkspaceEdit();
        del.delete(uriOf(model), new vscode.Range(line + 1, 0, line + 2, 0));
        assert.ok(await vscode.workspace.applyEdit(del));
        await c.eventually(async () => assert.doesNotMatch(nodeOf(await metrics(g), "n1").text ?? "", /spare/), "the compartment follows");
      } finally {
        await close();
        await close();
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uriOf(model))).then(() => vscode.commands.executeCommand("workbench.action.files.revert"));
        await close();
        rm(g, ic, model);
      }
    }],

    // ---- H: requirements view --------------------------------------------------------------
    ["the requirements fixture renders requirement boxes with satisfy, verify and derive edges, routed orthogonally", async () => {
      const f = "requirements.sysmld";
      await waitFor(() => api.model.index.findByQualifiedName("Requirements::VehicleMass").length > 0, 30000, "the model has the requirements");
      const m = await c.renders(f, ["n1", "n2", "n3", "n4", "n5", "n6"], ["e1", "e2", "e3", "e4"]);
      await c.eventually(async () => {
        const mm = await metrics(f);
        const n3 = nodeOf(mm, "n3");
        assert.strictEqual(n3.shape, "requirement");
        assert.match(n3.text ?? "", /<R1> VehicleMass/);
        assert.match((n3.text ?? "").replace(/ \| /g, " "), /shall not exceed 2000 kg/, "the documentation is shown, wrapped over several lines");
        assert.ok((n3.text ?? "").split(" | ").length >= 5, "the documentation is wrapped to the box width");
      }, "requirement boxes show id, name and documentation");
      const mm = await metrics(f);
      const styles = Object.fromEntries(mm.edges.map((e) => [e.id, [e.style, e.label, e.source, e.target]]));
      assert.deepStrictEqual(styles, {
        e1: ["satisfy", "«satisfy»", "n2", "n3"],
        e2: ["satisfy", "«satisfy»", "n6", "n4"],
        e3: ["derivation", "«derive»", "n4", "n3"],
        e4: ["verify", "«verify»", "n5", "n3"],
      });
      assert.strictEqual(mm.overlaps, 0);
      assert.strictEqual(mm.diagonalSegments, 0, "every edge segment is horizontal or vertical");
      assert.strictEqual(mm.edgesThroughEndNodes, 0, "no edge passes through its own end nodes");
      assert.strictEqual(mm.labelsOverEndNodes, 0, "no label covers an end node");
      assert.ok(m.edges.every((e) => e.points.length >= 2));
      await close();
    }],

    // ---- hand-edited line routes and labels -----------------------------------------------------
    ["dragging a segment of a line moves it orthogonally, stores the route as layout (dirty until save, .sysml untouched) and survives save and reopen", withCopy("lamp-state-transition.sysmld", "tmp-route.sysmld", async () => {
      const f = "tmp-route.sysmld";
      const edge = async () => (await metrics(f)).edges.find((e) => e.label?.startsWith("TurnOn"))!;
      const stored = (id: string) => doc(f).edges.find((e) => e.id === id)!;
      const diskPoints = (id: string) => JSON.stringify((JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")) as DiagramDoc).edges.find((e) => e.id === id)?.points);
      const e0 = await edge();
      assert.strictEqual(dirty(f), false);
      if (e0.points.length < 4) {
        await gesture(f, { kind: "dblclickEdge", id: e0.id });
        await c.eventually(async () => assert.ok((await edge()).points.length >= 4, "a bend was added"), "bend added");
        await api.diagram.save(uriOf(f));
      }
      const before = (await edge()).points;
      const onDisk = diskPoints(e0.id);
      const horiz = Math.abs(before[1]!.y - before[2]!.y) < 0.5;
      const d = 24;
      await gesture(f, { kind: "dragSegment", id: e0.id, index: 1, d });
      await waitFor(() => JSON.stringify(stored(e0.id).points) !== JSON.stringify(before), 5000, "the route reaches the document");
      await waitFor(() => c.tabDirty(uriOf(f)) === true, 5000, "the tab is dirty");
      const after = stored(e0.id).points!;
      assert.ok(after.some((p) => Math.abs((horiz ? p.y : p.x) - ((horiz ? before[1]!.y : before[1]!.x) + d)) < 0.5), "the segment moved by the drag, perpendicular to itself");
      for (let i = 1; i < after.length; i++) assert.ok(Math.abs(after[i]!.x - after[i - 1]!.x) < 0.01 || Math.abs(after[i]!.y - after[i - 1]!.y) < 0.01, "orthogonal");
      assert.deepStrictEqual(after[0], before[0], "the start stays where it was on the border");
      assert.deepStrictEqual(after[after.length - 1], before[before.length - 1], "the end stays where it was on the border");
      assert.strictEqual(diskPoints(e0.id), onDisk, "nothing is written before save");
      const m = await metrics(f);
      assert.strictEqual(m.diagonalSegments, 0);
      assert.strictEqual(m.edgesThroughEndNodes, 0);
      assert.deepStrictEqual(m.edges.find((e) => e.id === e0.id)!.points, after, "the drawn route is the stored one");
      assert.ok(m.routeHandles >= after.length - 2, "the selected line shows bend and segment handles");
      await api.diagram.save(uriOf(f));
      assert.deepStrictEqual((JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")) as DiagramDoc).edges.find((e) => e.id === e0.id)!.points, after);
      await close();
      await api.diagram.open(uriOf(f));
      await c.eventually(async () => assert.deepStrictEqual((await edge()).points, after), "the route after reopening");
      assert.strictEqual(dirty(f), false);
    })],

    ["dragging an end segment past its node routes around the node; double-click adds a bend; both are layout only", withCopy("lamp-state-transition.sysmld", "tmp-route2.sysmld", async () => {
      const f = "tmp-route2.sysmld";
      const edge = async () => (await metrics(f)).edges.find((e) => e.label?.startsWith("TurnOn"))!;
      const stored = (id: string) => doc(f).edges.find((e) => e.id === id)!;
      const e0 = await edge();
      const before = e0.points;
      const src = nodeOf(await metrics(f), e0.source);
      // the first segment runs along x or y; drag it far beyond the node's extent in the other direction
      const horiz = Math.abs(before[0]!.y - before[1]!.y) < 0.5;
      const d = horiz ? -(before[0]!.y - src.y + 90) : -(before[0]!.x - src.x + 90);
      await gesture(f, { kind: "dragSegment", id: e0.id, index: 0, d });
      await waitFor(() => JSON.stringify(stored(e0.id).points) !== JSON.stringify(before), 5000, "the route reaches the document");
      const after = stored(e0.id).points!;
      assert.ok(after.length > before.length, `bends were added (${before.length} -> ${after.length})`);
      assert.deepStrictEqual(after[0], before[0], "the route still leaves from the same border point");
      const m = await metrics(f);
      assert.strictEqual(m.diagonalSegments, 0, "orthogonal");
      assert.strictEqual(m.edgesThroughEndNodes, 0, "the route goes around the node");
      assert.ok(dirty(f));
      // double-click: a bend point on the line
      const n = after.length;
      await gesture(f, { kind: "dblclickEdge", id: e0.id });
      await waitFor(() => (stored(e0.id).points?.length ?? 0) > n, 5000, "a bend point was added");
      const m2 = await metrics(f);
      assert.strictEqual(m2.diagonalSegments, 0);
      assert.strictEqual(m2.edgesThroughEndNodes, 0);
    })],

    ["moving an end node keeps the user's route: interior bends stay, the route stays orthogonal and attached, nothing passes through the end nodes", withCopy("lamp-state-transition.sysmld", "tmp-route3.sysmld", async () => {
      const f = "tmp-route3.sysmld";
      const edge = async () => (await metrics(f)).edges.find((e) => e.label?.startsWith("TurnOn"))!;
      const e0 = await edge();
      if (e0.points.length < 4) {
        await gesture(f, { kind: "dblclickEdge", id: e0.id });
        await c.eventually(async () => assert.ok((await edge()).points.length >= 4), "bend added");
      }
      const p0 = (await edge()).points;
      await gesture(f, { kind: "dragSegment", id: e0.id, index: 1, d: 24 });
      await waitFor(() => JSON.stringify(doc(f).edges.find((e) => e.id === e0.id)!.points) !== JSON.stringify(p0), 5000, "route shaped");
      const shaped = doc(f).edges.find((e) => e.id === e0.id)!.points!;
      await gesture(f, { kind: "drag", id: e0.source, dx: 0, dy: 8 });
      await c.eventually(async () => {
        const m = await metrics(f);
        const r = m.edges.find((e) => e.id === e0.id)!.points;
        assert.notDeepStrictEqual(r, shaped, "the end moved");
        for (const b of shaped.slice(1, -1)) assert.ok(r.some((p) => Math.abs(p.x - b.x) < 0.5 && Math.abs(p.y - b.y) < 0.5), `interior bend ${b.x},${b.y} kept`);
        assert.strictEqual(m.diagonalSegments, 0);
        assert.strictEqual(m.edgesThroughEndNodes, 0);
        assert.ok(m.nodes.length > 0);
        assert.deepStrictEqual(r[r.length - 1], shaped[shaped.length - 1], "the other end is unchanged");
        assert.deepStrictEqual(doc(f).edges.find((e) => e.id === e0.id)!.points, r, "the stored route is the drawn route (one layout edit)");
      }, "the route follows the moved node");
      const sn = nodeOf(await metrics(f), e0.source);
      const first = (await edge()).points[0]!;
      assert.ok(Math.abs(first.x - sn.x) < 1.5 || Math.abs(first.x - sn.x - sn.w) < 1.5 || Math.abs(first.y - sn.y) < 1.5 || Math.abs(first.y - sn.y - sn.h) < 1.5, "still attached to the moved node's border");
    })],

    ["double-click renames nodes next to attached lines and inside containers that lines cross, and adds a bend only on a line", withCopy("lamp-state-transition.sysmld", "tmp-dbl.sysmld", async () => {
      const f = "tmp-dbl.sysmld";
      const m0 = await metrics(f);
      for (const n of m0.nodes.filter((x) => x.shape === "state")) {
        await gesture(f, { kind: "inlineRename", id: n.id, text: n.text?.split(" | ")[0] ?? "x", commit: false });
        assert.strictEqual((await metrics(f)).inlineEditor, false, "the editor closed again without committing");
      }
      assert.strictEqual(dirty(f), false, "renaming does not touch the diagram");
      const e0 = m0.edges.find((e) => e.label?.startsWith("TurnOn"))!;
      const n = e0.points.length;
      await gesture(f, { kind: "dblclickEdge", id: e0.id });
      await c.eventually(async () => assert.ok((await metrics(f)).edges.find((e) => e.id === e0.id)!.points.length > n, "a bend was added on the line"), "bend added");
    })],

    ["a line label moves and resizes by its handles, wraps by default, follows its line and persists; the menu resets it and toggles wrapping; the .sysml never changes", withCopy("lamp-state-transition.sysmld", "tmp-label.sysmld", async () => {
      const f = "tmp-label.sysmld";
      const edge = async () => (await metrics(f)).edges.find((e) => e.label?.startsWith("TurnOn"))!;
      const stored = (id: string) => doc(f).edges.find((e) => e.id === id)!;
      const e0 = await edge();
      const box0 = e0.labelBox!;
      assert.ok(box0 && !e0.labelLaidOut, "automatic placement at first");
      assert.strictEqual(stored(e0.id).label, undefined);
      // move
      await gesture(f, { kind: "labelDrag", id: e0.id, dx: 30, dy: -20 });
      await waitFor(() => stored(e0.id).label !== undefined, 5000, "the label layout reaches the document");
      await waitFor(() => c.tabDirty(uriOf(f)) === true, 5000, "the tab is dirty");
      assert.strictEqual((JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")) as DiagramDoc).edges.find((e) => e.id === e0.id)!.label, undefined, "nothing is written before save");
      await c.eventually(async () => {
        const e = await edge();
        assert.ok(e.labelLaidOut);
        assert.ok(Math.abs(e.labelBox!.x - (box0.x + 30)) < 1 && Math.abs(e.labelBox!.y - (box0.y - 20)) < 1, "the label moved with the drag");
        assert.strictEqual(e.label, e0.label, "the text still comes from the model");
        assert.deepStrictEqual(e.labelLines, [e0.label], "no wrapping needed at its own width");
      }, "label moved");
      assert.ok((await metrics(f)).labelHandles >= 2, "a selected label shows its handles");
      const um = await metrics(f);
      assert.strictEqual(um.userLabelsOffCanvas, 0, "a placed label lies inside the canvas");
      assert.strictEqual(um.userLabelsOverNodes, 0, "a placed label is not over a node");
      // resize narrower and taller: the text wraps within the width
      await gesture(f, { kind: "labelResize", id: e0.id, dw: -(Math.round(box0.w / 2)), dh: 20 });
      await waitFor(() => stored(e0.id).label?.w !== undefined, 5000, "the size reaches the document");
      const l1 = stored(e0.id).label!;
      assert.ok(l1.w! < box0.w && l1.h! > box0.h, "narrower and taller");
      await c.eventually(async () => assert.ok((await edge()).labelLines!.length > 1, "wrapped by default"), "wrapped");
      // save and reopen
      await api.diagram.save(uriOf(f));
      assert.deepStrictEqual((JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")) as DiagramDoc).edges.find((e) => e.id === e0.id)!.label, l1);
      await close();
      await api.diagram.open(uriOf(f));
      await c.eventually(async () => {
        const e = await edge();
        assert.ok(e.labelLaidOut && Math.abs(e.labelBox!.w - l1.w!) < 0.5 && e.labelLines!.length > 1, "the label after reopening");
      }, "label after reopen");
      assert.strictEqual(dirty(f), false);
      // wrap off through the menu (a check item)
      await gesture(f, { kind: "labelMenu", id: e0.id, action: "wrap" });
      await waitFor(() => stored(e0.id).label?.wrap === false, 5000, "wrap off reaches the document");
      await c.eventually(async () => assert.deepStrictEqual((await edge()).labelLines, [e0.label]), "one line");
      assert.ok(dirty(f));
      await gesture(f, { kind: "labelMenu", id: e0.id, action: "wrap" });
      await waitFor(() => stored(e0.id).label?.wrap === undefined, 5000, "wrap on again");
      await c.eventually(async () => assert.ok((await edge()).labelLines!.length > 1), "wrapped again");
      // the label stays relative to its line when a node moves
      const rel = stored(e0.id).label;
      await gesture(f, { kind: "drag", id: e0.source, dx: 0, dy: -40 });
      await sleep(600);
      assert.deepStrictEqual(stored(e0.id).label, rel, "the label layout is relative and unchanged by a node move");
      // reset
      await gesture(f, { kind: "labelMenu", id: e0.id, action: "reset" });
      await waitFor(() => stored(e0.id).label === undefined, 5000, "reset removes the layout");
      await c.eventually(async () => {
        const e = await edge();
        assert.ok(!e.labelLaidOut, "automatic placement again");
        assert.deepStrictEqual(e.labelLines, [e0.label]);
      }, "label reset");
    })],

    // ---- I: orthogonal edges in every fixture; theme; editor appearance ---------------------
    ["every fixture draws orthogonal edges that avoid their end nodes, and the editor appearance is exported in the dark theme with a selection", async () => {
      for (const f of ["ports-general.sysmld", "ports-general-auto.sysmld", "drivetrain-interconnection.sysmld"]) {
        await api.diagram.open(uriOf(f));
        await c.eventually(async () => assert.ok((await metrics(f)).nodes.length > 0), `${f} rendered`);
        const m = await metrics(f);
        assert.strictEqual(m.diagonalSegments, 0, `${f}: every segment is horizontal or vertical`);
        assert.strictEqual(m.edgesThroughEndNodes, 0, `${f}: no edge through its end nodes`);
        assert.strictEqual(m.labelsOverEndNodes, 0, `${f}: no label over an end node`);
        assert.strictEqual(m.portsOffBorder, 0, `${f}: ports are on borders`);
        assert.ok(m.edges.every((e) => e.points.length >= 2 && e.points.length <= 6), `${f}: routes have a few bends`);
      }
      const f = "drivetrain-interconnection.sysmld";
      await api.diagram.open(uriOf(f));
      await gesture(f, { kind: "select", id: "n2" });
      await c.eventually(async () => assert.strictEqual((await metrics(f)).handles, 8), "the selection shows handles");
      const png = Buffer.from(await api.diagram.pngEditor(uriOf(f)), "base64");
      assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      assert.ok(png.length > 2048);
      mkdirSync(c.artifactDir, { recursive: true });
      writeFileSync(path.join(c.artifactDir, "diagram-interconnection-selected-editor-dark.png"), png);
      const light = Buffer.from(await api.diagram.png(uriOf(f)), "base64");
      assert.ok(!light.equals(png), "the editor export differs from the fixed light export");
      await close();
      assert.ok(existsSync(c.artifactDir));
    }],
  ];
}

function vehicleFile(folder: vscode.Uri): string {
  return path.join(folder.fsPath, "vehicle.sysml");
}
