import * as assert from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { viaLm, viaMcp } from "./diagram-agent.js";
import type { Ctx } from "./diagram-interaction.js";
import type { DiagramDoc, Failure, Gesture, Metrics, MNode, ModelNode, PickItem } from "./index.js";

type Test = [name: string, fn: () => Promise<void>];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Model edits from the tree, the diagram editor and agents, through the real extension, files and editors. */
export function editingTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const onDisk = (name: string) => readFileSync(uriOf(name).fsPath, "utf8");
  const diskDiagram = (name: string) => JSON.parse(onDisk(name)) as DiagramDoc;
  const mem = (name: string) => api.diagram.state(uriOf(name)).doc as DiagramDoc;
  const metrics = (name: string) => api.diagram.metrics(uriOf(name));
  const nodeOf = (m: Metrics, id: string): MNode => m.nodes.find((n) => n.id === id)!;
  const gesture = (name: string, g: Gesture) => api.diagram.gesture(uriOf(name), g);
  const dirty = (name: string) => api.diagram.state(uriOf(name)).dirty;
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    const end = performance.now() + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(25);
    }
  };
  const textDoc = (name: string) => vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uriOf(name).fsPath);
  const close = async () => {
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  };

  const MODEL = (pkg: string) => `package ${pkg} {
  // keep me
  part def Engine;
  part def Vehicle {
    part engine : Engine;
    port drive;
    part spare;
  }
  part vehicle1 : Vehicle {
    part battery;
  }
  part vehicle2 : Vehicle;
}
`;
  const gen = (pkg: string, extra: object[] = []) => ({
    version: 1, kind: "general", root: pkg, sources: [`tmp-${pkg.toLowerCase()}.sysml`],
    nodes: [
      { id: "n1", ref: pkg },
      { id: "n2", ref: `${pkg}::Vehicle`, parent: "n1" },
      { id: "n3", ref: `${pkg}::Engine`, parent: "n1" },
      { id: "n4", ref: `${pkg}::Vehicle::spare`, parent: "n2" },
      { id: "n5", ref: `${pkg}::Vehicle::engine`, parent: "n2" },
      ...extra,
    ],
    edges: [],
  });
  const ic = (pkg: string) => ({
    version: 1, kind: "interconnection", root: `${pkg}::vehicle1`, sources: [`tmp-${pkg.toLowerCase()}.sysml`],
    nodes: [
      { id: "n0", ref: `${pkg}::vehicle1` },
      { id: "n1", ref: `${pkg}::Vehicle::engine`, parent: "n0" },
      { id: "n2", ref: `${pkg}::vehicle1::battery`, parent: "n0" },
      { id: "n3", ref: `${pkg}::Vehicle::drive`, parent: "n0" },
    ],
    edges: [],
  });

  /** A UI that answers the questions instead of a person; records what was asked and shown. */
  interface Script { input?: string; pick?: string; confirm?: boolean }
  const rec = { confirms: [] as { message: string; detail: string }[], fails: [] as Failure[], inputs: [] as { validate?: string }[] };
  const script: Script = {};
  const installUi = () => {
    rec.confirms = []; rec.fails = []; rec.inputs = [];
    api.diagram.setUi({
      input: async (o) => { rec.inputs.push({ ...(o.validateInput && script.input !== undefined ? { validate: o.validateInput(script.input) } : {}) } as never); return script.input; },
      pick: async (items: PickItem[]) => items.find((i) => i.label === script.pick),
      confirm: async (message, detail) => { rec.confirms.push({ message, detail }); return script.confirm ?? true; },
      fail: async (f) => { rec.fails.push(f); },
    });
  };

  /** Write a model and diagram files, open the diagram, run, and clean up. */
  const scenario = (pkg: string, diagrams: Record<string, object>, fn: (names: { model: string; diagram: string }) => Promise<void>, opts: { model?: string; openAll?: boolean; probe?: string } = {}) => async () => {
    const model = `tmp-${pkg.toLowerCase()}.sysml`;
    const names = Object.keys(diagrams);
    writeFileSync(uriOf(model).fsPath, opts.model ?? MODEL(pkg));
    for (const [n, d] of Object.entries(diagrams)) writeFileSync(uriOf(n).fsPath, JSON.stringify(d, null, 2) + "\n");
    installUi();
    script.input = undefined; script.pick = undefined; script.confirm = undefined;
    try {
      await vscode.workspace.openTextDocument(uriOf(model));
      const started = performance.now();
      try {
        await waitFor(() => api.model.index.findByQualifiedName(`${pkg}::${opts.probe ?? "Vehicle"}`).length > 0, 300000, `${pkg} is in the model`);
      } catch (e) {
        console.log(`  waited ${performance.now() - started} ms`);
        const st = api.model.index.getDocument(vscode.Uri.file(uriOf(model).fsPath).toString());
        console.log(`  diagnostics: index state of ${model}: ${JSON.stringify(st ? { errors: st.errors, pending: st.detailsPending } : null)}; pending=${JSON.stringify(api.model.index.pendingDetails())}`);
        throw e;
      }
      for (const n of opts.openAll ? names : [names[0]!]) {
        await api.diagram.open(uriOf(n));
        await c.eventually(async () => assert.ok((await metrics(n)).nodes.length > 0), `${n} rendered`);
      }
      await fn({ model, diagram: names[0]! });
      assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
    } catch (e) {
      console.log(`  diagnostics: refusals=${JSON.stringify(rec.fails)} confirms=${rec.confirms.length} webview errors=${JSON.stringify(api.diagram.errors())} model text on disk=${JSON.stringify(onDisk(model)).slice(0, 300)}`);
      throw e;
    } finally {
      api.diagram.setUi(undefined);
      await close();
      rmSync(uriOf(model).fsPath, { force: true });
      for (const n of names) rmSync(uriOf(n).fsPath, { force: true });
      await sleep(150);
    }
  };

  /** The file text with the edit's inserted line removed must equal the original: nothing else changed. */
  const without = (text: string, inserted: RegExp) => text.replace(inserted, "");

  const undoActive = async () => { await vscode.commands.executeCommand("undo"); };

  /** After a model edit the document is saved: not dirty, and the bytes on disk are exactly the document text. */
  const clean = (name: string) => c.eventually(async () => {
    const d = textDoc(name);
    assert.ok(d, `${name} is open`);
    assert.strictEqual(d.isDirty, false, `${name} is not dirty`);
    assert.strictEqual(onDisk(name), d.getText(), `${name}: the bytes on disk equal the document text`);
  }, `${name} is saved and equal to its buffer`);

  return [
    ["Add part to a part def: palette click inserts the declaration, saves it and the new node at once, and Undo reverses both in one step", scenario("EdAdd", { "tmp-edadd.sysmld": gen("EdAdd") }, async ({ model, diagram }) => {
      const original = MODEL("EdAdd");
      script.input = "wheel";
      const m0 = await metrics(diagram);
      assert.deepStrictEqual(m0.palette, ["Part def", "Port def", "Attribute def", "Item def", "Action def", "Part", "Port", "Attribute", "Item", "Action"], "General palette");
      await gesture(diagram, { kind: "palette", item: "part", id: "n2", x: 10, y: 10 });
      await waitFor(() => onDisk(model).includes("part wheel;"), 15000, "the part is on disk without saving");
      assert.strictEqual(without(onDisk(model), /    part wheel;\n/), original, "unrelated text is byte-identical");
      assert.match(onDisk(model), /part spare;\n    part wheel;\n  \}/, "inserted after the last member with its indentation");
      await waitFor(() => textDoc(model)?.isDirty === false, 5000, "the text document is saved");
      await clean(model);
      await waitFor(() => diskDiagram(diagram).nodes.some((n) => n.ref === "EdAdd::Vehicle::wheel"), 15000, "the diagram file on disk lists the node");
      const node = diskDiagram(diagram).nodes.find((n) => n.ref === "EdAdd::Vehicle::wheel")!;
      assert.strictEqual(node.parent, "n2", "the node is inside Vehicle");
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.text?.includes("wheel") && n.parent === "n2")), "a node for wheel is drawn inside Vehicle");
      // The click was inside Vehicle's header and compartments; the new node is laid out BELOW them.
      await c.eventually(async () => {
        const mm = await metrics(diagram);
        assert.strictEqual(mm.nodesOverCompartments, 0, "no child node covers its parent's header or compartment text");
        assert.strictEqual(mm.outsideParent, 0);
      }, "the new node does not cover the compartments of Vehicle");
      console.log(`  info: tab dirty after the model edit (nothing else changed): ${String(c.tabDirty(uriOf(diagram)))}; document dirty: ${String(dirty(diagram))}`);
      // Undo from the diagram: one step
      await undoActive();
      await waitFor(() => onDisk(model) === original, 15000, "the text on disk is back");
      assert.strictEqual(textDoc(model)?.getText(), original, "the buffer is back too");
      await waitFor(() => !diskDiagram(diagram).nodes.some((n) => n.ref === "EdAdd::Vehicle::wheel"), 15000, "the node is gone from the file");
      assert.ok(!mem(diagram).nodes.some((n) => n.ref === "EdAdd::Vehicle::wheel"));
      // Redo repeats both
      await vscode.commands.executeCommand("redo");
      await waitFor(() => onDisk(model).includes("part wheel;") && diskDiagram(diagram).nodes.some((n) => n.ref === "EdAdd::Vehicle::wheel"), 15000, "redo repeats text and node");
    })],

    ["Diagram edit is on disk at once, and Pending layout is not saved by a model edit", scenario("EdLay", { "tmp-edlay.sysmld": gen("EdLay", []) }, async ({ model, diagram }) => {
      // give n2 a stored position, save it, then move it without saving
      api.diagram.edit(uriOf(diagram), [{ id: "n2", x: 40, y: 40 }]);
      await api.diagram.save(uriOf(diagram));
      assert.strictEqual(diskDiagram(diagram).nodes.find((n) => n.id === "n2")!.x, 40);
      api.diagram.edit(uriOf(diagram), [{ id: "n2", x: 500, y: 300 }]);
      assert.strictEqual(dirty(diagram), true);
      script.input = "pad";
      await gesture(diagram, { kind: "palette", item: "port", id: "n2", x: 12, y: 12 });
      await waitFor(() => onDisk(model).includes("port pad;"), 15000, ".sysml on disk has the new port");
      await clean(model);
      await waitFor(() => diskDiagram(diagram).nodes.some((n) => n.ref === "EdLay::Vehicle::pad"), 15000, ".sysmld on disk lists the new node");
      const d = diskDiagram(diagram);
      assert.strictEqual(d.nodes.find((n) => n.id === "n2")!.x, 40, "the moved node keeps its previous position on disk");
      assert.strictEqual(d.nodes.find((n) => n.id === "n2")!.y, 40);
      assert.strictEqual(mem(diagram).nodes.find((n) => n.id === "n2")!.x, 500, "the move is still in memory");
      assert.strictEqual(dirty(diagram), true, "the diagram still has unsaved changes");
      assert.strictEqual(c.tabDirty(uriOf(diagram)), true, "the tab is marked as modified");
    })],

    ["Undo in the text editor: the node disappears from the diagram and no unresolved placeholder is left", scenario("EdTxt", { "tmp-edtxt.sysmld": gen("EdTxt") }, async ({ model, diagram }) => {
      const original = MODEL("EdTxt");
      script.input = "wheel";
      await gesture(diagram, { kind: "palette", item: "part", id: "n2", x: 10, y: 10 });
      await waitFor(() => diskDiagram(diagram).nodes.some((n) => n.ref === "EdTxt::Vehicle::wheel"), 15000, "node placed");
      const doc = await vscode.workspace.openTextDocument(uriOf(model));
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      await vscode.commands.executeCommand("undo");
      await waitFor(() => doc.getText() === original, 5000, "the text editor undid the edit");
      await waitFor(() => !mem(diagram).nodes.some((n) => n.ref === "EdTxt::Vehicle::wheel"), 15000, "the entry is removed from the diagram");
      await c.eventually(async () => {
        const m = await metrics(diagram);
        assert.ok(!m.nodes.some((n) => n.shape === "unresolved"), "no unresolved placeholder");
        assert.ok(!m.nodes.some((n) => n.text?.includes("wheel")));
      }, "the view has no placeholder");
      await waitFor(() => !diskDiagram(diagram).nodes.some((n) => n.ref === "EdTxt::Vehicle::wheel"), 15000, "the file on disk has no entry either");
      assert.ok(diskDiagram(diagram).nodes.some((n) => n.ref === "EdTxt::Vehicle::spare"), "older entries stay");
      await vscode.commands.executeCommand("workbench.action.files.revert");
    })],

    ["Closing without saving: the text and the diagram on disk both have the edited element, unsaved layout is gone", scenario("EdClose", { "tmp-edclose.sysmld": gen("EdClose") }, async ({ model, diagram }) => {
      api.diagram.edit(uriOf(diagram), [{ id: "n3", x: 40, y: 40 }]);
      await api.diagram.save(uriOf(diagram));
      api.diagram.edit(uriOf(diagram), [{ id: "n3", x: 700, y: 700 }]); // unsaved layout
      script.input = "wheel";
      await gesture(diagram, { kind: "palette", item: "part", id: "n2", x: 10, y: 10 });
      await waitFor(() => onDisk(model).includes("part wheel;") && diskDiagram(diagram).nodes.some((n) => n.ref === "EdClose::Vehicle::wheel"), 15000, "both files have the element");
      await close(); // reverts and closes without saving anything
      assert.ok(onDisk(model).includes("part wheel;"), "the text has the element");
      const d = diskDiagram(diagram);
      assert.ok(d.nodes.some((n) => n.ref === "EdClose::Vehicle::wheel"), "the diagram has the node");
      assert.strictEqual(d.nodes.find((n) => n.id === "n3")!.x, 40, "unsaved layout changes are gone");
      await api.diagram.open(uriOf(diagram));
      assert.ok(mem(diagram).nodes.some((n) => n.ref === "EdClose::Vehicle::wheel"), "reopened: the diagram shows the element");
      assert.strictEqual(mem(diagram).nodes.find((n) => n.id === "n3")!.x, 40);
    })],

    ["Add connection: connect declaration in the common owner and an edge", scenario(
      "EdConn",
      {
        "tmp-edconn.sysmld": {
          version: 1, kind: "interconnection", root: "EdConn::Sys", sources: ["tmp-edconn.sysml"],
          nodes: [
            { id: "n0", ref: "EdConn::Sys" },
            { id: "n1", ref: "EdConn::Sys::a", parent: "n0" },
            { id: "n2", ref: "EdConn::Sys::b", parent: "n0" },
            { id: "n3", ref: "EdConn::A::o", parent: "n1" },
            { id: "n4", ref: "EdConn::B::i", parent: "n2" },
          ],
          edges: [],
        },
      },
      async ({ model, diagram }) => {
        const m0 = await metrics(diagram);
        assert.deepStrictEqual(m0.palette, ["Part", "Port", "Attribute", "Connection"], "Interconnection palette");
        await gesture(diagram, { kind: "connect", source: "n3", target: "n4" });
        await waitFor(() => /connect a\.o to b\.i;/.test(onDisk(model)), 15000, "the connection is on disk");
        assert.match(onDisk(model), /part b : B;\n    connect a\.o to b\.i;\n  \}/, "added to the common owner (Sys)");
        await clean(model);
        await c.eventually(async () => assert.strictEqual((await metrics(diagram)).edges.length, 1), "an edge is drawn");
        await waitFor(() => diskDiagram(diagram).edges.length === 1, 15000, "the edge is in the file on disk");
        await undoActive();
        await waitFor(() => !onDisk(model).includes("connect a.o"), 15000, "undo removes the connect");
        await c.eventually(async () => assert.strictEqual((await metrics(diagram)).edges.length, 0), "and the edge");
      },
      { probe: "Sys", model: "package EdConn {\n  port def Pw;\n  part def A { port o : Pw; }\n  part def B { port i : Pw; }\n  part def Sys {\n    part a : A;\n    part b : B;\n  }\n}\n" },
    )],

    ["Delete from model: confirmed, the declaration goes from the file and the node from every open diagram and from closed diagram files; Delete key removes from the diagram only", scenario(
      "EdDel",
      { "tmp-eddel.sysmld": gen("EdDel"), "tmp-eddel2.sysmld": gen("EdDel"), "tmp-eddel3.sysmld": gen("EdDel") },
      async ({ model, diagram }) => {
        const original = MODEL("EdDel");
        // Delete key: diagram only
        await gesture(diagram, { kind: "select", id: "n4" });
        await gesture(diagram, { kind: "key", key: "Delete" });
        await waitFor(() => !mem(diagram).nodes.some((n) => n.id === "n4"), 5000, "the node is removed from the diagram");
        assert.strictEqual(onDisk(model), original, "the .sysml file is unchanged by Delete");
        assert.ok(rec.confirms.length === 0);
        await undoActive();
        await waitFor(() => mem(diagram).nodes.some((n) => n.id === "n4"), 5000, "undo brings the node back");
        // Delete from Model on `engine` (n5), with two other diagrams: one open, one closed
        await api.diagram.open(uriOf("tmp-eddel2.sysmld"));
        await api.diagram.open(uriOf(diagram));
        await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.length > 0), "rendered");
        await gesture(diagram, { kind: "menu", id: "n5", action: "deleteModel" });
        await waitFor(() => !onDisk(model).includes("part engine : Engine;"), 15000, "the declaration is removed from the file");
        assert.strictEqual(rec.confirms.length, 0, "no owned members or other references: no confirmation needed");
        assert.strictEqual(onDisk(model), original.replace("    part engine : Engine;\n", ""), "only that line is removed");
        await clean(model);
        await waitFor(() => !mem(diagram).nodes.some((n) => n.ref === "EdDel::Vehicle::engine") && !mem("tmp-eddel2.sysmld").nodes.some((n) => n.ref === "EdDel::Vehicle::engine"), 15000, "gone from both open diagrams");
        await waitFor(() => !diskDiagram("tmp-eddel3.sysmld").nodes.some((n) => n.ref === "EdDel::Vehicle::engine"), 15000, "gone from the closed diagram file");
        await waitFor(() => !diskDiagram(diagram).nodes.some((n) => n.ref === "EdDel::Vehicle::engine"), 15000, "gone from the file of the open diagram");
        // Delete with owned members asks first
        script.confirm = false;
        await gesture(diagram, { kind: "menu", id: "n2", action: "deleteModel" });
        await waitFor(() => rec.confirms.length === 1, 5000, "a confirmation was asked");
        assert.match(rec.confirms[0]!.detail, /owns 2 elements/);
        await sleep(300);
        assert.ok(onDisk(model).includes("part def Vehicle"), "declined: nothing deleted");
      },
      { openAll: false },
    )],

    ["Change type from the properties panel, and the panel's fields", scenario("EdTyp", { "tmp-edtyp.sysmld": gen("EdTyp") }, async ({ model, diagram }) => {
      await gesture(diagram, { kind: "select", id: "n4" });
      await c.eventually(async () => {
        const p = (await metrics(diagram)).properties;
        assert.strictEqual(p.id, "n4");
        assert.strictEqual(p.kind, "part");
        assert.strictEqual(p.qualifiedName, "EdTyp::Vehicle::spare");
        assert.strictEqual(p.fields.name!.value, "spare");
        assert.strictEqual(p.fields.type!.value, "");
        assert.ok(Object.values(p.fields).every((f) => !f.disabled), "editable");
      }, "the properties panel shows the selection");
      await gesture(diagram, { kind: "property", field: "type", value: "Engine" });
      await waitFor(() => onDisk(model).includes("part spare : Engine;"), 90000, "the declaration became `part spare : Engine;`");
      assert.strictEqual(onDisk(model), MODEL("EdTyp").replace("part spare;", "part spare : Engine;"));
      await clean(model);
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).properties.fields.type!.value, "Engine"), "the panel shows the new type");
      await gesture(diagram, { kind: "property", field: "multiplicity", value: "2" });
      await waitFor(() => /part spare : Engine ?\[2\];/.test(onDisk(model)), 90000, "multiplicity");
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).properties.fields.multiplicity!.value, "[2]"), "the panel shows the multiplicity");
      await gesture(diagram, { kind: "property", field: "documentation", value: "A spare." });
      await waitFor(() => onDisk(model).includes("A spare."), 90000, "documentation");
      // The panel never shows two selected elements, and a definition has no type field to edit
      await gesture(diagram, { kind: "select", id: "n3" });
      await c.eventually(async () => {
        const p = (await metrics(diagram)).properties;
        assert.strictEqual(p.id, "n3");
        assert.strictEqual(p.fields.type!.disabled, true);
      }, "a definition's type field is disabled");
    })],

    ["Inline rename: double-click edits the name in place, Enter commits and updates references and diagrams, Escape cancels", scenario("EdRen", { "tmp-edren.sysmld": gen("EdRen"), "tmp-edren2.sysmld": gen("EdRen") }, async ({ model, diagram }) => {
      await gesture(diagram, { kind: "inlineRename", id: "n3", text: "Nope", commit: false });
      await sleep(400);
      assert.strictEqual(onDisk(model), MODEL("EdRen"), "Escape changes nothing");
      assert.strictEqual((await metrics(diagram)).inlineEditor, false);
      await gesture(diagram, { kind: "select", id: "n3" });
      await gesture(diagram, { kind: "key", key: "F2" });
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).inlineEditor, true), "F2 opens the inline editor");
      await gesture(diagram, { kind: "key", key: "Escape" });
      await gesture(diagram, { kind: "inlineRename", id: "n3", text: "Motor", commit: true });
      await waitFor(() => onDisk(model).includes("part def Motor;") && onDisk(model).includes("part engine : Motor;"), 15000, "declaration and references renamed");
      assert.strictEqual(onDisk(model), MODEL("EdRen").replace("part def Engine;", "part def Motor;").replace("part engine : Engine;", "part engine : Motor;"));
      await clean(model);
      await waitFor(() => diskDiagram(diagram).nodes.some((n) => n.ref === "EdRen::Motor") && diskDiagram("tmp-edren2.sysmld").nodes.some((n) => n.ref === "EdRen::Motor"), 15000, "diagram files follow the rename");
      await c.eventually(async () => assert.ok(!(await metrics(diagram)).nodes.some((n) => n.shape === "unresolved")), "no placeholder");
    })],

    ["Inherited features: drawn as inherited, Delete refused with Go to Definition, nothing changes; Add goes to the usage", scenario("EdInh", { "tmp-edinh.sysmld": ic("EdInh") }, async ({ model, diagram }) => {
      const original = MODEL("EdInh");
      let m = await metrics(diagram);
      assert.strictEqual(m.inheritedNodes, 2, "engine and drive are inherited");
      assert.ok(nodeOf(m, "n1").inherited && nodeOf(m, "n3").inherited && !nodeOf(m, "n2").inherited && !nodeOf(m, "n0").inherited);
      mkdirSync(c.artifactDir, { recursive: true });
      writeFileSync(path.join(c.artifactDir, "diagram-inherited.png"), Buffer.from(await api.diagram.png(uriOf(diagram)), "base64"));
      // Delete refused
      await gesture(diagram, { kind: "menu", id: "n1", action: "deleteModel" });
      await waitFor(() => rec.fails.length === 1, 5000, "a refusal is shown");
      assert.match(rec.fails[0]!.reason, /inherited from Vehicle/);
      assert.strictEqual(rec.fails[0]!.goToDefinition?.name, "EdInh::Vehicle");
      assert.strictEqual(rec.confirms.length, 0, "no confirmation for a refused delete");
      assert.strictEqual(onDisk(model), original, "nothing is deleted");
      // Rename refused, and the panel is disabled for it
      await gesture(diagram, { kind: "select", id: "n1" });
      await c.eventually(async () => {
        const p = (await metrics(diagram)).properties;
        assert.strictEqual(p.id, "n1");
        assert.ok(Object.values(p.fields).every((f) => f.disabled), "fields are disabled");
        assert.match(p.note ?? "", /Inherited from EdInh::Vehicle/);
      }, "properties are read-only with an explanation");
      await gesture(diagram, { kind: "inlineRename", id: "n1", text: "x", commit: true }).catch(() => undefined);
      assert.strictEqual((await metrics(diagram)).inlineEditor, false);
      assert.strictEqual(onDisk(model), original);
      // Add goes to the usage
      script.input = "battery2";
      await gesture(diagram, { kind: "palette", item: "part", id: "n0", x: 12, y: 12 });
      await waitFor(() => onDisk(model).includes("part battery2;"), 15000, "added");
      const t = onDisk(model);
      assert.ok(t.indexOf("part battery2;") > t.indexOf("part vehicle1"), "inside vehicle1");
      assert.ok(t.indexOf("part battery2;") < t.indexOf("part vehicle2"));
      assert.strictEqual(t.replace("    part battery2;\n", ""), original, "Vehicle and everything else is unchanged");
      await clean(model);
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.text?.includes("battery2"))), "battery2 is drawn");
    })],

    ["Tree: Add Child, Rename and Delete (with confirmation) edit the text and the tree", scenario("EdTree", { "tmp-edtree.sysmld": gen("EdTree") }, async ({ model }) => {
      const label = (n: ModelNode) => String(api.provider.getTreeItem(n).label);
      const child = (p: ModelNode | undefined, l: string) => api.provider.getChildren(p).find((n) => label(n) === l.replace(/ .*$/, "") || label(n) === l);
      const root = () => child(undefined, "EdTree")!;
      await waitFor(() => !!root(), 10000, "the tree has the package");
      const original = MODEL("EdTree");
      // Add Child: pick "Part", then a name
      script.pick = "Part"; script.input = "treechild";
      await vscode.commands.executeCommand("sysml.tree.addChild", child(root(), "vehicle2"));
      await waitFor(() => onDisk(model).includes("part treechild;"), 15000, "Add Child wrote the declaration");
      assert.ok(onDisk(model).includes("part vehicle2 : Vehicle {\n    part treechild;\n  }"), "a body was created under the usage");
      await waitFor(() => !!child(child(root(), "vehicle2"), "treechild"), 10000, "the tree shows it");
      // name validation
      script.input = "battery";
      await vscode.commands.executeCommand("sysml.tree.rename", child(child(root(), "vehicle1"), "battery"));
      // (the same name: nothing to do)
      // Rename
      script.input = "cell";
      await vscode.commands.executeCommand("sysml.tree.rename", child(child(root(), "vehicle1"), "battery"));
      await waitFor(() => onDisk(model).includes("part cell;"), 15000, "renamed");
      await clean(model);
      // Delete: confirmation, then gone from the text and the tree
      script.confirm = true;
      const before = onDisk(model);
      await vscode.commands.executeCommand("sysml.tree.delete", child(child(root(), "vehicle1"), "cell"));
      assert.strictEqual(rec.confirms.length, 1, "the tree asks for confirmation");
      await waitFor(() => !onDisk(model).includes("part cell;"), 15000, "the declaration is removed from the file");
      assert.strictEqual(before.replace("    part cell;\n", ""), onDisk(model));
      await clean(model);
      await waitFor(() => !child(child(root(), "vehicle1"), "cell"), 10000, "the node disappears from the tree");
      // declining changes nothing
      script.confirm = false;
      const kept = onDisk(model);
      await vscode.commands.executeCommand("sysml.tree.delete", child(root(), "vehicle2"));
      await sleep(300);
      assert.strictEqual(onDisk(model), kept);
      assert.notStrictEqual(kept, original);
    })],

    ["Syntax errors: an edit is refused with Go to error, and valid files with undisplayed constructs are edited", scenario("EdErr", { "tmp-ederr.sysmld": gen("EdErr") }, async ({ model, diagram }) => {
      const good = "package EdErrB {\n  part def A {\n    part x;\n  }\n}\n";
      const valid = "package EdOk {\n  part def A;\n  state def S;\n  calc def K { in x; }\n}\n";
      writeFileSync(uriOf("tmp-ederrb.sysml").fsPath, good);
      writeFileSync(uriOf("tmp-edok.sysml").fsPath, valid);
      try {
        const bdoc = await vscode.workspace.openTextDocument(uriOf("tmp-ederrb.sysml"));
        await vscode.workspace.openTextDocument(uriOf("tmp-edok.sysml"));
        await waitFor(() => api.model.index.findByQualifiedName("EdErrB::A").length > 0 && api.model.index.findByQualifiedName("EdOk::A").length > 0, 90000, "both files indexed");
        // break the first file in the editor (unsaved): its last good model is kept, the file has a syntax error
        const we = new vscode.WorkspaceEdit();
        we.replace(bdoc.uri, new vscode.Range(2, 4, 2, 11), "part x : ;");
        await vscode.workspace.applyEdit(we);
        const key = vscode.Uri.file(uriOf("tmp-ederrb.sysml").fsPath).toString();
        await waitFor(() => (api.model.index.getDocument(key)?.errors.length ?? 0) > 0, 60000, "the syntax error is known");
        const r = await api.agent.testCallToolOverMcp("sysml_create_element", { owner: "EdErrB::A", kind: "part", name: "y" });
        assert.strictEqual(r.isError, true);
        assert.match(r.text, /syntax error/);
        assert.strictEqual(readFileSync(uriOf("tmp-ederrb.sysml").fsPath, "utf8"), good, "no text was changed or saved");
        assert.ok(!bdoc.getText().includes("part y"));
        const ok = await api.agent.testCallToolOverMcp("sysml_create_element", { owner: "EdOk::A", kind: "part", name: "y" });
        assert.strictEqual(ok.isError, false, ok.text);
        assert.match(readFileSync(uriOf("tmp-edok.sysml").fsPath, "utf8"), /state def S;\n  calc def K \{ in x; \}/, "undisplayed constructs untouched");
        void model; void diagram;
      } finally {
        await close();
        rmSync(uriOf("tmp-ederrb.sysml").fsPath, { force: true });
        rmSync(uriOf("tmp-edok.sysml").fsPath, { force: true });
      }
    })],

    ["Agent: Create and place on an open diagram is one undo step from the diagram; the file and node are on disk at once", scenario("EdAg1", { "tmp-edag1.sysmld": gen("EdAg1") }, async ({ model, diagram }) => {
      const original = MODEL("EdAg1");
      const r = await viaLm("sysml_create_element", { owner: "EdAg1::Vehicle", kind: "part", name: "battery", type: "Engine", diagram });
      const j = JSON.parse(r.text) as { created: { qualifiedName: string }; filesChanged: string[]; diagram: { placed: boolean } };
      assert.strictEqual(j.created.qualifiedName, "EdAg1::Vehicle::battery");
      assert.deepStrictEqual(j.filesChanged, [model]);
      assert.strictEqual(j.diagram.placed, true);
      assert.match(onDisk(model), /part battery : Engine;/);
      await clean(model);
      assert.ok(diskDiagram(diagram).nodes.some((n) => n.ref === "EdAg1::Vehicle::battery"), "node on disk");
      assert.ok(mem(diagram).nodes.some((n) => n.ref === "EdAg1::Vehicle::battery"), "node in the open diagram");
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.text?.includes("battery"))), "drawn");
      await undoActive();
      await waitFor(() => onDisk(model) === original && !mem(diagram).nodes.some((n) => n.ref === "EdAg1::Vehicle::battery"), 15000, "one undo reverses text and node");
      await waitFor(() => !diskDiagram(diagram).nodes.some((n) => n.ref === "EdAg1::Vehicle::battery"), 15000, "and the file");
    })],

    ["Agent: an edit without a diagram is one undo step in the text editor; Delete versus remove; inherited delete refused; same results on both channels", scenario("EdAg2", { "tmp-edag2.sysmld": gen("EdAg2") }, async ({ model, diagram }) => {
      const original = MODEL("EdAg2");
      const bytesBefore = readFileSync(uriOf(model).fsPath);
      const a = await viaLm("sysml_create_element", { owner: "EdAg2::Vehicle", kind: "port", name: "p9" });
      assert.strictEqual(JSON.parse(a.text).created.qualifiedName, "EdAg2::Vehicle::p9");
      assert.ok(onDisk(model).includes("port p9;"), "saved to disk");
      const doc = await vscode.workspace.openTextDocument(uriOf(model));
      assert.strictEqual(doc.isDirty, false);
      await clean(model);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      await vscode.commands.executeCommand("undo");
      await waitFor(() => doc.getText() === original, 5000, "one undo in the text editor reverses the whole agent edit");
      // Save this document itself: the generic save command acts on whichever editor has focus.
      await doc.save();
      await waitFor(() => readFileSync(uriOf(model).fsPath).equals(bytesBefore), 5000, "the undone text is saved to disk");
      // identical results over both channels: refused calls give identical text, applied calls do too on identical starting text
      const refusal = { element: "EdAg2::vehicle1::engine" };
      const ra = await viaLm("sysml_delete_element", refusal);
      const rb = await viaMcp(api, "sysml_delete_element", refusal);
      assert.strictEqual(rb.isError, true);
      assert.strictEqual(ra.text, rb.text, "identical refusal");
      assert.match(rb.text, /inherited from Vehicle/);
      assert.strictEqual(onDisk(model), original, "no file changes");
      const call: [string, object] = ["sysml_rename_element", { element: "EdAg2::Engine", newName: "Motor" }];
      const l = await viaLm(...call);
      const afterLm = onDisk(model);
      writeFileSync(uriOf(model).fsPath, original);
      await waitFor(() => api.model.index.findByQualifiedName("EdAg2::Engine").length === 1, 15000, "restored");
      await sleep(300);
      const mcp = await viaMcp(api, ...call);
      assert.strictEqual(mcp.isError, false, mcp.text);
      assert.strictEqual(l.text, mcp.text, "identical result text");
      assert.strictEqual(onDisk(model), afterLm, "identical file text");
      assert.deepStrictEqual({ ...JSON.parse(l.text), x: 0 }, { ...JSON.parse(mcp.text), x: 0 });
      // delete versus remove
      writeFileSync(uriOf(model).fsPath, original);
      await waitFor(() => api.model.index.findByQualifiedName("EdAg2::Engine").length === 1 && api.model.index.findByQualifiedName("EdAg2::Vehicle::engine").length === 1, 15000, "restored again");
      await sleep(300);
      const rm = await viaLm("sysml_remove_from_diagram", { path: diagram, ids: ["n5"] });
      assert.ok(!rm.text.includes("error"));
      assert.strictEqual(onDisk(model), original, "remove-from-diagram changes only the diagram");
      const del = await viaLm("sysml_delete_element", { element: "EdAg2::Vehicle::spare" });
      assert.strictEqual(JSON.parse(del.text).deleted, "EdAg2::Vehicle::spare");
      assert.ok(!onDisk(model).includes("part spare;"), "delete-element removes the declaration");
      assert.ok(!mem(diagram).nodes.some((n) => n.ref === "EdAg2::Vehicle::spare"), "and its node");
    })],

    ["Parity: the same edit from the GUI (tree) and from the agent gives byte-identical text", scenario("EdPar", { "tmp-edpar.sysmld": gen("EdPar") }, async ({ model }) => {
      const original = MODEL("EdPar");
      const label = (n: ModelNode) => String(api.provider.getTreeItem(n).label);
      const child = (p: ModelNode | undefined, l: string) => api.provider.getChildren(p).find((n) => label(n) === l);
      await waitFor(() => !!child(undefined, "EdPar"), 10000, "tree");
      script.pick = "Port"; script.input = "px";
      await vscode.commands.executeCommand("sysml.tree.addChild", child(child(undefined, "EdPar"), "vehicle1"));
      await waitFor(() => onDisk(model).includes("port px;"), 15000, "GUI edit");
      const gui = onDisk(model);
      writeFileSync(uriOf(model).fsPath, original);
      await waitFor(() => !api.model.index.findByQualifiedName("EdPar::vehicle1::px").length, 15000, "reset");
      await sleep(400);
      const r = await viaLm("sysml_create_element", { owner: "EdPar::vehicle1", kind: "port", name: "px" });
      assert.ok(!r.text.includes("Invalid"), r.text);
      assert.strictEqual(onDisk(model), gui, "byte-identical");
    })],

    ["Undo then Redo in the text editor: the node is removed (no placeholder) and comes back at its position", scenario("EdRdo", { "tmp-edrdo.sysmld": gen("EdRdo") }, async ({ model, diagram }) => {
      const original = MODEL("EdRdo");
      script.input = "wheel";
      await gesture(diagram, { kind: "palette", item: "part", id: "n2", x: 10, y: 10 });
      await waitFor(() => diskDiagram(diagram).nodes.some((n) => n.ref === "EdRdo::Vehicle::wheel"), 15000, "node placed");
      const at = diskDiagram(diagram).nodes.find((n) => n.ref === "EdRdo::Vehicle::wheel")!;
      const doc = await vscode.workspace.openTextDocument(uriOf(model));
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      await vscode.commands.executeCommand("undo");
      await waitFor(() => doc.getText() === original, 5000, "undo in the text editor (a clean parse without the element)");
      await waitFor(() => !mem(diagram).nodes.some((n) => n.ref === "EdRdo::Vehicle::wheel"), 15000, "the node is removed");
      await c.eventually(async () => assert.ok(!(await metrics(diagram)).nodes.some((n) => n.shape === "unresolved")), "no placeholder");
      await vscode.commands.executeCommand("redo");
      await waitFor(() => doc.getText().includes("part wheel;"), 5000, "redo in the text editor");
      await waitFor(() => mem(diagram).nodes.some((n) => n.ref === "EdRdo::Vehicle::wheel"), 15000, "the node is back");
      const back = mem(diagram).nodes.find((n) => n.ref === "EdRdo::Vehicle::wheel")!;
      assert.deepStrictEqual({ x: back.x, y: back.y, parent: back.parent }, { x: at.x, y: at.y, parent: at.parent }, "restored at its previous position");
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.text?.includes("wheel") && n.shape !== "unresolved")), "drawn again");
      await vscode.commands.executeCommand("workbench.action.files.revert");
    })],

    ["Typing an incomplete statement never removes a created node and never writes to disk; fixing the file keeps it", scenario("EdTyping", { "tmp-edtyping.sysmld": gen("EdTyping") }, async ({ model, diagram }) => {
      script.input = "wheel";
      await gesture(diagram, { kind: "palette", item: "part", id: "n2", x: 10, y: 10 });
      await waitFor(() => diskDiagram(diagram).nodes.some((n) => n.ref === "EdTyping::Vehicle::wheel"), 15000, "node placed");
      await clean(model);
      const textOnDisk = onDisk(model);
      const diagramOnDisk = onDisk(diagram);
      const doc = await vscode.workspace.openTextDocument(uriOf(model));
      const key = vscode.Uri.file(uriOf(model).fsPath).toString();
      // type an incomplete statement right after the new part (unsaved)
      const at = doc.positionAt(doc.getText().indexOf("part wheel;") + "part wheel;".length);
      const we = new vscode.WorkspaceEdit();
      we.insert(doc.uri, at, "\n    part broken : ;");
      await vscode.workspace.applyEdit(we);
      await waitFor(() => (api.model.index.getDocument(key)?.errors.length ?? 0) > 0, 60000, "the syntax error is known");
      await sleep(800);
      assert.ok(mem(diagram).nodes.some((n) => n.ref === "EdTyping::Vehicle::wheel"), "the node stays while the file does not parse");
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.text?.includes("wheel"))), "and is drawn");
      assert.strictEqual(onDisk(model), textOnDisk, "the .sysml file on disk is unchanged");
      assert.strictEqual(onDisk(diagram), diagramOnDisk, "the diagram file on disk is unchanged");
      // fix it: remove the typed text
      const fix = new vscode.WorkspaceEdit();
      const start = doc.positionAt(doc.getText().indexOf("\n    part broken : ;"));
      fix.delete(doc.uri, new vscode.Range(start, doc.positionAt(doc.getText().indexOf("part broken : ;") + "part broken : ;".length)));
      await vscode.workspace.applyEdit(fix);
      await waitFor(() => (api.model.index.getDocument(key)?.errors.length ?? 0) === 0 && !api.model.index.getDocument(key)?.detailsPending, 60000, "the file parses again");
      await sleep(500);
      assert.ok(mem(diagram).nodes.some((n) => n.ref === "EdTyping::Vehicle::wheel"), "the node is still there after the fix");
      assert.ok(diskDiagram(diagram).nodes.some((n) => n.ref === "EdTyping::Vehicle::wheel"), "and on disk");
      assert.ok(!(await metrics(diagram)).nodes.some((n) => n.shape === "unresolved"), "no placeholder");
      await vscode.commands.executeCommand("workbench.action.files.revert");
    })],

    ["Inherited rule at depth 2 through the agent tools: delete, rename, set properties and create are refused; nothing changes; both channels agree", scenario(
      "EdDeep",
      { "tmp-eddeep.sysmld": { version: 1, kind: "general", root: "EdDeep", sources: ["tmp-eddeep.sysml"], nodes: [{ id: "n1", ref: "EdDeep" }], edges: [] } },
      async ({ model }) => {
        const original = onDisk(model);
        const calls = (path: string): [string, object][] => [
          ["sysml_delete_element", { element: path }],
          ["sysml_rename_element", { element: path, newName: "other" }],
          ["sysml_set_element_properties", { element: path, documentation: "x" }],
          ["sysml_create_element", { owner: path, kind: "part", name: "extra" }],
        ];
        // depth 2: an own member of the inherited `engine`, and a feature `engine` inherits from its type
        for (const path of ["EdDeep::vehicle1::engine::cylinder", "EdDeep::vehicle1::engine::piston"]) {
          for (const [name, input] of calls(path)) {
            const a = await viaLm(name, input);
            const b = await viaMcp(api, name, input);
            assert.strictEqual(b.isError, true, `${name} ${path}`);
            assert.match(b.text, /inherited/, `${name} ${path}`);
            assert.match(b.text, /EdDeep::(Vehicle|Engine)/);
            assert.strictEqual(a.text, b.text, `identical refusal over both channels: ${name} ${path}`);
          }
        }
        assert.strictEqual(onDisk(model), original, "no file was changed");
        assert.strictEqual(textDoc(model)?.isDirty, false);
      },
      { probe: "Vehicle", model: "package EdDeep {\n  part def Engine { part piston; }\n  part def Vehicle {\n    part engine : Engine {\n      part cylinder;\n    }\n  }\n  part vehicle1 : Vehicle;\n}\n" },
    )],

    ["Artifacts: the editor with the palette and the properties panel, in the dark and the light theme", scenario("EdPng", { "tmp-edpng.sysmld": gen("EdPng") }, async ({ diagram }) => {
      await gesture(diagram, { kind: "select", id: "n4" });
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).properties.id, "n4"), "the properties panel shows the selection");
      mkdirSync(c.artifactDir, { recursive: true });
      const save = async (theme: "editor-dark" | "editor-light", file: string) => {
        const png = Buffer.from(await api.diagram.pngWindow(uriOf(diagram), theme), "base64");
        assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${file} is a PNG`);
        assert.ok(png.length > 8000, `${file} is ${png.length} bytes`);
        writeFileSync(path.join(c.artifactDir, file), png);
      };
      assert.strictEqual((await metrics(diagram)).theme, "dark", "the test window starts in a dark theme");
      await save("editor-dark", "editor-palette-properties-dark.png");
      const cfg = vscode.workspace.getConfiguration();
      try {
        await cfg.update("workbench.colorTheme", "Default Light Modern", vscode.ConfigurationTarget.Global);
        await c.eventually(async () => assert.strictEqual((await metrics(diagram)).theme, "light"), "the webview follows the light theme", 30000);
        await save("editor-light", "editor-palette-properties-light.png");
      } finally {
        await cfg.update("workbench.colorTheme", undefined, vscode.ConfigurationTarget.Global);
      }
    })],

    ["End to end (add-model-editing 5.1): add, rename, connect and delete from a diagram, the tree and an agent in one copy; after each step the text, the tree, the open diagram and the agent's read tools agree, and again after a reload", scenario(
      "EdE2E",
      {
        "tmp-ede2e.sysmld": {
          version: 1, kind: "interconnection", root: "EdE2E::Sys", sources: ["tmp-ede2e.sysml"],
          nodes: [
            { id: "n0", ref: "EdE2E::Sys" },
            { id: "n1", ref: "EdE2E::Sys::a", parent: "n0" },
            { id: "n2", ref: "EdE2E::Sys::b", parent: "n0" },
            { id: "n3", ref: "EdE2E::A::o", parent: "n1" },
            { id: "n4", ref: "EdE2E::B::i", parent: "n2" },
          ],
          edges: [],
        },
      },
      async ({ model, diagram }) => {
        const CANDIDATES = ["a", "b", "c", "d", "gamma", "delta"];
        const label = (n: ModelNode) => String(api.provider.getTreeItem(n).label);
        const treeParts = (): string[] => {
          const pkg = api.provider.getChildren().find((r) => label(r) === "EdE2E");
          const sys = pkg && api.provider.getChildren(pkg).find((n) => label(n) === "Sys");
          return sys ? api.provider.getChildren(sys).map(label).filter((l) => CANDIDATES.includes(l)).sort() : [];
        };
        const textParts = (t: string): string[] => {
          const block = /part def Sys \{([^]*?)\n  \}/.exec(t)?.[1] ?? "";
          return [...block.matchAll(/^ {4}part (\w+)/gm)].map((m) => m[1]!).sort();
        };
        const agentTree = async (): Promise<string[]> => {
          const lm = await viaLm("sysml_get_element_tree", { root: "EdE2E::Sys", depth: 2 });
          const mcp = await viaMcp(api, "sysml_get_element_tree", { root: "EdE2E::Sys", depth: 2 });
          assert.strictEqual(lm.text, mcp.text, "the agent's read tool answers the same on both channels");
          const names = (JSON.parse(lm.text) as { nodes: { name?: string; children?: { name?: string }[] }[] }).nodes.flatMap((n) => [n.name, ...(n.children ?? []).map((x) => x.name)]);
          return names.filter((x): x is string => !!x && CANDIDATES.includes(x)).sort();
        };
        const agree = async (parts: string[], connected: boolean, step: string) => {
          const expected = [...parts].sort();
          await waitFor(() => JSON.stringify(textParts(onDisk(model))) === JSON.stringify(expected), 30000, `${step}: the text on disk has parts ${expected.join(",")}`);
          await waitFor(() => /connect a\.o to b\.i;/.test(onDisk(model)) === connected, 30000, `${step}: the connection is ${connected ? "" : "not "}in the text`);
          await clean(model);
          await waitFor(() => JSON.stringify(treeParts()) === JSON.stringify(expected), 30000, `${step}: the tree shows ${expected.join(",")} (has ${treeParts().join(",")})`);
          await waitFor(() => JSON.stringify(mem(diagram).nodes.map((n) => n.ref).filter((r): r is string => !!r && /^EdE2E::Sys::\w+$/.test(r)).map((r) => r.split("::")[2]!).sort()) === JSON.stringify(expected), 30000, `${step}: the open diagram has ${expected.join(",")}`);
          await waitFor(() => mem(diagram).edges.length === (connected ? 1 : 0), 30000, `${step}: the diagram has ${connected ? 1 : 0} edges`);
          await c.eventually(async () => {
            const m = await metrics(diagram);
            for (const p of expected) assert.ok(m.nodes.some((n) => n.text?.split(" | ").some((t) => t.startsWith(p))), `${step}: ${p} is drawn`);
            assert.strictEqual(m.edges.length, connected ? 1 : 0, `${step}: edges drawn`);
          }, `${step}: the diagram is drawn`);
          assert.deepStrictEqual(await agentTree(), expected, `${step}: the agent's read tool agrees`);
        };
        await agree(["a", "b"], false, "start");
        // 1. diagram: connect
        await gesture(diagram, { kind: "connect", source: "n3", target: "n4" });
        await agree(["a", "b"], true, "connect from the diagram");
        // 2. diagram: add c
        script.input = "c";
        await gesture(diagram, { kind: "palette", item: "part", id: "n0", x: 10, y: 200 });
        await agree(["a", "b", "c"], true, "add from the diagram");
        // 3. tree: rename c -> gamma
        script.input = "gamma";
        const sys = () => api.provider.getChildren(api.provider.getChildren().find((r) => label(r) === "EdE2E")).find((n) => label(n) === "Sys");
        await vscode.commands.executeCommand("sysml.tree.rename", api.provider.getChildren(sys()).find((n) => label(n) === "c"));
        await agree(["a", "b", "gamma"], true, "rename from the tree");
        // 4. agent: add delta (placed on the diagram)
        const created = await viaLm("sysml_create_element", { owner: "EdE2E::Sys", kind: "part", name: "delta", diagram });
        assert.strictEqual(JSON.parse(created.text).created.qualifiedName, "EdE2E::Sys::delta");
        await agree(["a", "b", "gamma", "delta"], true, "add from an agent");
        // 5. agent: delete gamma
        const del = await viaMcp(api, "sysml_delete_element", { element: "EdE2E::Sys::gamma" });
        assert.strictEqual(del.isError, false, del.text);
        await agree(["a", "b", "delta"], true, "delete from an agent");
        // 6. tree: delete delta (confirmation is scripted)
        script.confirm = true;
        await vscode.commands.executeCommand("sysml.tree.delete", api.provider.getChildren(sys()).find((n) => label(n) === "delta"));
        await agree(["a", "b"], true, "delete from the tree");
        // 7. diagram: add d, then Delete from Model on it
        script.input = "d";
        await gesture(diagram, { kind: "palette", item: "part", id: "n0", x: 10, y: 260 });
        await agree(["a", "b", "d"], true, "add d from the diagram");
        const dNode = (await metrics(diagram)).nodes.find((n) => n.text?.split(" | ").some((t) => t === "d" || t.startsWith("d ")));
        assert.ok(dNode, "the node of d is drawn");
        await gesture(diagram, { kind: "menu", id: dNode.id, action: "deleteModel" });
        await agree(["a", "b"], true, "delete from the diagram");
        // reload: close every editor, then read everything again from disk
        const finalText = onDisk(model);
        await close();
        await vscode.workspace.openTextDocument(uriOf(model));
        await api.diagram.open(uriOf(diagram));
        assert.strictEqual(onDisk(model), finalText, "nothing was written by closing");
        await agree(["a", "b"], true, "after the reload");
        assert.deepStrictEqual(diskDiagram(diagram).nodes.map((n) => n.ref).filter((r) => /^EdE2E::Sys::\w+$/.test(r ?? "")).sort(), ["EdE2E::Sys::a", "EdE2E::Sys::b"], "the diagram file on disk agrees");
        assert.strictEqual(diskDiagram(diagram).edges.length, 1);
      },
      { probe: "Sys", model: "package EdE2E {\n  port def Pw;\n  part def A { port o : Pw; }\n  part def B { port i : Pw; }\n  part def Sys {\n    part a : A;\n    part b : B;\n  }\n}\n" },
    )],

    ["Undo investigation (design D6): where each undo goes after a diagram-made model edit", scenario("EdUndo", { "tmp-edundo.sysmld": gen("EdUndo") }, async ({ model, diagram }) => {
      const log: string[] = [];
      const snap = (tag: string) => log.push(`${tag}: .sysml on disk has w1=${String(onDisk(model).includes("w1"))} w2=${String(onDisk(model).includes("w2"))}; buffer w1=${String(textDoc(model)?.getText().includes("w1"))} w2=${String(textDoc(model)?.getText().includes("w2"))} dirty=${String(textDoc(model)?.isDirty)}; diagram (memory) w1=${String(mem(diagram).nodes.some((n) => n.ref?.endsWith("w1")))} w2=${String(mem(diagram).nodes.some((n) => n.ref?.endsWith("w2")))}; tab dirty=${String(c.tabDirty(uriOf(diagram)))}; active=${vscode.window.activeTextEditor ? "text editor" : "custom editor"}`);
      script.input = "w1";
      await gesture(diagram, { kind: "palette", item: "part", id: "n2", x: 10, y: 10 });
      await waitFor(() => onDisk(model).includes("part w1;"), 15000, "edit 1");
      await sleep(500);
      script.input = "w2";
      await gesture(diagram, { kind: "palette", item: "part", id: "n2", x: 10, y: 10 });
      await waitFor(() => onDisk(model).includes("part w2;"), 15000, "edit 2");
      await sleep(500);
      snap("after two edits from the diagram");
      await undoActive();
      await sleep(2000);
      snap("after one undo with the diagram active");
      const doc = await vscode.workspace.openTextDocument(uriOf(model));
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      await vscode.commands.executeCommand("undo");
      await sleep(2000);
      snap("after one undo with the text editor active");
      await vscode.commands.executeCommand("undo");
      await sleep(2000);
      snap("after a second undo with the text editor active");
      await vscode.commands.executeCommand("workbench.action.files.revert");
      console.log("  D6 observations:\n    " + log.join("\n    "));
    })],
  ];
}
