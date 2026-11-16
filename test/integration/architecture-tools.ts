import * as assert from "node:assert";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { DiagramDoc, PickItem } from "./index.js";
import type { Ctx } from "./diagram-interaction.js";

type Test = [name: string, fn: () => Promise<void>];

const FLEET = `package Fleet {
  port def Radar;
  part def Engine;
  part def Ship { port beacon : Radar; }
  part def Frigate :> Ship {
    attribute mass;
    part engine : Engine;
    port radarPort : Radar;
  }
  part def Destroyer :> Frigate;
}
`;

/** Architecture tools: showing content (parts and ports, related elements, copy and paste) and layout and style (align, compartments, legend, aspects). */
export function architectureTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const doc = (name: string): DiagramDoc => api.diagram.state(uriOf(name)).doc as DiagramDoc;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (cond: () => boolean, ms: number, what: string) => {
    const end = performance.now() + ms;
    while (!cond()) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(25);
    }
  };
  const sysmlBytes = () => new Map(readdirSync(folder.fsPath).filter((f) => f.endsWith(".sysml") && !f.startsWith("tmp-")).map((f) => [f, readFileSync(path.join(folder.fsPath, f))] as const));
  const diagramText = (d: object) => JSON.stringify(d, null, 2) + "\n";
  const has = (f: string, ref: string) => doc(f).nodes.some((n) => n.ref === ref);
  const close = async () => {
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  };

  /** Run `fn` with a model file and the given diagrams written; everything is removed afterwards and the real model files must be unchanged. */
  const withFleet = (diagrams: Record<string, object>, fn: () => Promise<void>, opts: { model?: string; changesModel?: boolean } = {}) => async () => {
    const before = sysmlBytes();
    const model = "tmp-fleet.sysml";
    const text = opts.model ?? FLEET;
    writeFileSync(uriOf(model).fsPath, text);
    await vscode.workspace.openTextDocument(uriOf(model));
    // The previous test's Fleet::Frigate may still be indexed: wait for this test's own text.
    await waitFor(() => [...text.matchAll(/\bdef (\w+)/g)].every((m) => api.model.index.findByQualifiedName(`Fleet::${m[1]}`).length > 0), 30000, "every definition of this test's model is indexed");
    for (const [name, d] of Object.entries(diagrams)) writeFileSync(uriOf(name).fsPath, diagramText({ version: 1, sources: [model], edges: [], ...d }));
    try {
      await fn();
      assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
      if (!opts.changesModel) assert.strictEqual(readFileSync(uriOf(model).fsPath, "utf8"), text, "the model text is unchanged");
    } finally {
      api.diagram.setUi(undefined);
      await close();
      for (const name of [...Object.keys(diagrams), model]) rmSync(uriOf(name).fsPath, { force: true });
      const now = sysmlBytes();
      assert.deepStrictEqual([...now.keys()], [...before.keys()]);
    }
  };
  const open = async (f: string) => {
    await api.diagram.open(uriOf(f));
    await c.eventually(async () => assert.ok((await api.diagram.metrics(uriOf(f))).nodes.length > 0), `${f} rendered`);
  };
  const dirty = (f: string) => api.diagram.state(uriOf(f)).dirty;
  const selectNodes = async (f: string, ids: string[]) => {
    await api.diagram.gesture(uriOf(f), { kind: "select", id: ids[0]! });
    for (const id of ids.slice(1)) await api.diagram.gesture(uriOf(f), { kind: "select", id, shift: true });
    await waitFor(() => doc(f) !== undefined, 1000, "doc");
  };
  const selectionKey = () => Promise.resolve(api.diagram.selectionKey());
  const nodeBox = async (f: string, id: string) => (await api.diagram.metrics(uriOf(f))).nodes.find((n) => n.id === id)!;
  const pngWidth = (b64: string) => Buffer.from(b64, "base64").readUInt32BE(16);

  return [
    ["Show/Hide Parts and Ports ticks a port onto the border of the node and unticking a part removes only its node, with the model text unchanged", withFleet({
      "tmp-fleet-ic.sysmld": { kind: "interconnection", root: "Fleet::Frigate", nodes: [{ id: "n1", ref: "Fleet::Frigate", x: 40, y: 40, w: 300, h: 220 }, { id: "n2", ref: "Fleet::Frigate::engine", parent: "n1", x: 20, y: 60, w: 120, h: 60 }] },
    }, async () => {
      const f = "tmp-fleet-ic.sysmld";
      await open(f);
      let offered: PickItem[] = [];
      let tick = ["engine", "radarPort"];
      api.diagram.setUi({ pickMany: async (items: PickItem[]) => { offered = items; return items.filter((i) => tick.includes(i.label)); } });
      await api.diagram.gesture(uriOf(f), { kind: "select", id: "n1" });
      await api.diagram.gesture(uriOf(f), { kind: "menu", id: "n1", action: "showHideMembers" });
      await waitFor(() => has(f, "Fleet::Frigate::radarPort"), 10000, "radarPort is drawn");
      assert.deepStrictEqual(offered.map((i) => [i.label, (i as { picked?: boolean }).picked]), [["engine", true], ["radarPort", false], ["beacon", false]], "own and inherited ones are listed, the drawn one ticked");
      assert.match(offered[2]!.description ?? "", /inherited from Ship/);
      assert.strictEqual(doc(f).nodes.find((n) => n.ref === "Fleet::Frigate::radarPort")!.parent, "n1");
      assert.strictEqual(dirty(f), true, "a layout edit dirties the diagram");
      await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uriOf(f))).portsOffBorder, 0, "the port sits on the border"), "ports on the border");
      assert.ok((await api.diagram.metrics(uriOf(f))).nodes.some((n) => n.shape === "port"), "drawn as a port");
      // Hide a part: unticked.
      tick = ["radarPort"];
      await api.diagram.gesture(uriOf(f), { kind: "menu", id: "n1", action: "showHideMembers" });
      await waitFor(() => !has(f, "Fleet::Frigate::engine"), 10000, "engine leaves the diagram");
      assert.ok(has(f, "Fleet::Frigate::radarPort") && has(f, "Fleet::Frigate"));
      assert.strictEqual(api.model.index.findByQualifiedName("Fleet::Frigate::engine").length, 1, "engine stays in the model");
    })],

    ["Display Related Elements adds only the picked kind, and says so when everything related is already drawn", withFleet({
      "tmp-fleet-gen.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Frigate", x: 40, y: 40, w: 160, h: 60 }] },
    }, async () => {
      const f = "tmp-fleet-gen.sysmld";
      await open(f);
      const messages: string[] = [];
      let offered: string[] = [];
      api.diagram.setUi({
        notify: (m: string) => { messages.push(m); },
        pickMany: async (items: PickItem[]) => { offered = items.map((i) => i.label); return items.filter((i) => i.label === "Specialization"); },
      });
      await api.diagram.gesture(uriOf(f), { kind: "select", id: "n1" });
      await api.diagram.gesture(uriOf(f), { kind: "menu", id: "n1", action: "displayRelated" });
      await waitFor(() => has(f, "Fleet::Ship") && has(f, "Fleet::Destroyer"), 10000, "the general and specific definitions are added");
      assert.ok(offered.includes("Specialization"), `the kinds present are offered: ${offered}`);
      assert.ok(!has(f, "Fleet::Engine") && !has(f, "Fleet::Radar"), "only the picked kind is followed");
      await c.eventually(async () => {
        const m = await api.diagram.metrics(uriOf(f));
        assert.ok(m.edges.length >= 2, "lines are drawn between them");
      }, "specialization lines");
      // Nothing to add: take every kind, then ask again.
      api.diagram.setUi({ notify: (m: string) => { messages.push(m); }, pickMany: async (items: PickItem[]) => items });
      await api.diagram.gesture(uriOf(f), { kind: "menu", id: "n1", action: "displayRelated" });
      await waitFor(() => has(f, "Fleet::Frigate::engine"), 10000, "the other kinds are added when asked");
      const settled = JSON.stringify(doc(f));
      await api.diagram.gesture(uriOf(f), { kind: "menu", id: "n1", action: "displayRelated" });
      await waitFor(() => messages.some((m) => /already drawn/.test(m)), 10000, "a message says everything related is drawn");
      assert.strictEqual(JSON.stringify(doc(f)), settled, "nothing changed");
    })],

    ["copying two nodes and pasting in another diagram adds nodes for the same elements; elements already drawn are skipped", withFleet({
      "tmp-fleet-a.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 }, { id: "n2", ref: "Fleet::Frigate", x: 40, y: 200, w: 160, h: 60 }] },
      "tmp-fleet-b.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Engine", x: 40, y: 40, w: 160, h: 60 }] },
      "tmp-fleet-c.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Ship", x: 300, y: 40, w: 160, h: 60 }] },
    }, async () => {
      const a = "tmp-fleet-a.sysmld", b = "tmp-fleet-b.sysmld", cc = "tmp-fleet-c.sysmld";
      await open(a);
      await api.diagram.gesture(uriOf(a), { kind: "select", id: "n1" });
      await api.diagram.gesture(uriOf(a), { kind: "select", id: "n2", shift: true });
      await api.diagram.gesture(uriOf(a), { kind: "key", key: "c", ctrl: true });
      await sleep(200);
      await open(b);
      await api.diagram.gesture(uriOf(b), { kind: "key", key: "v", ctrl: true });
      await waitFor(() => has(b, "Fleet::Ship") && has(b, "Fleet::Frigate"), 10000, "both elements are pasted");
      assert.strictEqual(doc(b).nodes.length, 3);
      const ship = doc(b).nodes.find((n) => n.ref === "Fleet::Ship")!;
      assert.strictEqual(ship.x, 80, "offset from the copied position");
      assert.strictEqual(dirty(b), true);
      assert.ok(!dirty(a), "the source diagram is untouched");
      await open(cc);
      await api.diagram.gesture(uriOf(cc), { kind: "key", key: "v", ctrl: true });
      await waitFor(() => has(cc, "Fleet::Frigate"), 10000, "the missing one is pasted");
      assert.strictEqual(doc(cc).nodes.filter((n) => n.ref === "Fleet::Ship").length, 1, "the drawn one is not duplicated");
      assert.strictEqual(doc(cc).nodes.length, 2);
    })],
    ["Align Left puts the left edges of three selected nodes at the leftmost as one layout edit, and the distribute commands need three nodes", withFleet({
      "tmp-fleet-align.sysmld": { kind: "general", root: "Fleet", nodes: [
        { id: "n1", ref: "Fleet::Ship", x: 120, y: 40, w: 160, h: 60 },
        { id: "n2", ref: "Fleet::Frigate", x: 40, y: 200, w: 160, h: 60 },
        { id: "n3", ref: "Fleet::Destroyer", x: 300, y: 360, w: 160, h: 60 },
      ] },
    }, async () => {
      const f = "tmp-fleet-align.sysmld";
      await open(f);
      await selectNodes(f, ["n1", "n2", "n3"]);
      await c.eventually(async () => assert.strictEqual(await selectionKey(), 3, "the selection size is a context key"), "three selected");
      await vscode.commands.executeCommand("sysml.diagram.alignLeft");
      await waitFor(() => doc(f).nodes.every((n) => n.x === 40), 10000, "left edges are equal");
      assert.deepStrictEqual(doc(f).nodes.map((n) => n.y), [40, 200, 360], "only x changes");
      assert.strictEqual(dirty(f), true, "a layout edit");
      for (const id of ["n1", "n2", "n3"]) assert.strictEqual((await nodeBox(f, id)).x, 40);
      // Two selected: align is available, distribute is not (its enablement needs three).
      await selectNodes(f, ["n1", "n2"]);
      await c.eventually(async () => assert.strictEqual(await selectionKey(), 2), "two selected");
      const before = JSON.stringify(doc(f));
      await vscode.commands.executeCommand("sysml.diagram.distributeVertically");
      await sleep(400);
      assert.strictEqual(JSON.stringify(doc(f)), before, "distribute does nothing with two nodes");
      const pkg = vscode.extensions.all.map((e) => (e.packageJSON as { contributes?: { commands?: { command: string; enablement?: string }[] } }).contributes?.commands ?? []).find((cs) => cs.some((x) => x.command === "sysml.diagram.alignLeft"))!;
      assert.match(pkg.find((x) => x.command === "sysml.diagram.distributeVertically")!.enablement!, /diagramSelection >= 3/);
      assert.match(pkg.find((x) => x.command === "sysml.diagram.alignTop")!.enablement!, /diagramSelection >= 2/);
    })],

    ["hiding the attributes compartment shrinks the node, keeps the model text, survives save and reopen, and an old file loads with everything shown", withFleet({
      "tmp-fleet-comp.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Frigate", x: 40, y: 40, w: 300, h: 260 }] },
    }, async () => {
      const f = "tmp-fleet-comp.sysmld";
      await open(f);
      const first = await nodeBox(f, "n1");
      assert.match(first.text ?? "", /mass/, "the attributes compartment is drawn");
      assert.strictEqual((await api.diagram.metrics(uriOf(f))).legend, undefined, "an old file has no legend");
      await api.diagram.gesture(uriOf(f), { kind: "contextmenu", id: "n1" });
      assert.ok((await api.diagram.metrics(uriOf(f))).menu.some((m) => /Attributes/.test(m)), "the menu offers the compartment");
      await api.diagram.gesture(uriOf(f), { kind: "menu", id: "n1", action: "compartment:attributes" });
      await waitFor(() => (doc(f).nodes[0]!.style as { hiddenCompartments?: string[] } | undefined)?.hiddenCompartments?.[0] === "attributes", 10000, "the style holds the hidden compartment");
      await c.eventually(async () => {
        const n = await nodeBox(f, "n1");
        assert.ok(!/mass/.test(n.text ?? ""), "the compartment is gone");
        assert.ok(n.h < first.h, `the node is smaller (${n.h} < ${first.h})`);
      }, "the node shrinks");
      assert.strictEqual(dirty(f), true, "held in memory until the diagram is saved");
      await api.diagram.save(uriOf(f));
      assert.deepStrictEqual(JSON.parse(readFileSync(uriOf(f).fsPath, "utf8")).nodes[0].style, { hiddenCompartments: ["attributes"] });
      await close();
      await open(f);
      assert.ok(!/mass/.test((await nodeBox(f, "n1")).text ?? ""), "still hidden after reopening");
      await api.diagram.gesture(uriOf(f), { kind: "menu", id: "n1", action: "compartment:attributes" });
      await c.eventually(async () => assert.match((await nodeBox(f, "n1")).text ?? "", /mass/), "shown again");
    })],

    ["the legend lists the kinds drawn, updates with the content and widens an exported image", withFleet({
      "tmp-fleet-legend.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 }, { id: "n2", ref: "Fleet::Frigate", x: 40, y: 200, w: 160, h: 60 }] },
    }, async () => {
      const f = "tmp-fleet-legend.sysmld";
      await open(f);
      const plain = pngWidth(await api.diagram.png(uriOf(f)));
      await vscode.commands.executeCommand("sysml.diagram.toggleLegend");
      await c.eventually(async () => assert.deepStrictEqual((await api.diagram.metrics(uriOf(f))).legend, ["Part def", "Specialization"]), "the legend lists the kinds drawn");
      assert.deepStrictEqual((doc(f).style as object), { legend: true });
      assert.strictEqual(dirty(f), true);
      assert.ok(pngWidth(await api.diagram.png(uriOf(f))) > plain, "the exported image carries the legend");
      await api.diagram.gesture(uriOf(f), { kind: "drop", names: ["Fleet::Engine"] });
      await c.eventually(async () => assert.ok((await api.diagram.metrics(uriOf(f))).legend!.includes("Part def")), "dropped");
      await vscode.commands.executeCommand("sysml.diagram.toggleLegend");
      await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uriOf(f))).legend, undefined), "legend off");
      assert.strictEqual(doc(f).style, undefined);
    })],

    ["applying an aspect draws only its nodes and the lines among them, clearing shows all again, and saving one stores the nodes drawn", withFleet({
      "tmp-fleet-aspect.sysmld": { kind: "general", root: "Fleet", style: { aspects: { Power: ["n1", "n2", "n3", "gone"] } }, nodes: [
        { id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 },
        { id: "n2", ref: "Fleet::Frigate", x: 40, y: 200, w: 160, h: 60 },
        { id: "n3", ref: "Fleet::Destroyer", x: 40, y: 360, w: 160, h: 60 },
        { id: "n4", ref: "Fleet::Engine", x: 400, y: 40, w: 160, h: 60 },
      ] },
    }, async () => {
      const f = "tmp-fleet-aspect.sysmld";
      await open(f);
      api.diagram.setUi({ pick: async (items: PickItem[]) => items.find((i) => i.label === "Power"), input: async () => "Everything", notify: () => {} });
      const ids = async () => (await api.diagram.metrics(uriOf(f))).nodes.map((n) => n.id).sort();
      assert.deepStrictEqual(await ids(), ["n1", "n2", "n3", "n4"]);
      await vscode.commands.executeCommand("sysml.diagram.applyAspect");
      await c.eventually(async () => assert.deepStrictEqual(await ids(), ["n1", "n2", "n3"]), "only the aspect's nodes are drawn");
      assert.ok((await api.diagram.metrics(uriOf(f))).edges.length >= 2, "the lines among them are drawn");
      assert.strictEqual(doc(f).nodes.length, 4, "the nodes stay in the diagram file");
      await vscode.commands.executeCommand("sysml.diagram.clearAspect");
      await c.eventually(async () => assert.deepStrictEqual(await ids(), ["n1", "n2", "n3", "n4"]), "every node is drawn again");
      assert.strictEqual((doc(f).style as { activeAspect?: string }).activeAspect, undefined);
      await vscode.commands.executeCommand("sysml.diagram.saveAspect");
      await waitFor(() => (doc(f).style as { aspects: Record<string, string[]> }).aspects.Everything !== undefined, 10000, "the aspect is saved");
      assert.deepStrictEqual((doc(f).style as { aspects: Record<string, string[]> }).aspects.Everything, ["n1", "n2", "n3", "n4"]);
      await vscode.commands.executeCommand("sysml.diagram.deleteAspect");
      await waitFor(() => (doc(f).style as { aspects: Record<string, string[]> }).aspects.Power === undefined, 10000, "Power is deleted");
    })],
    ["Save as Image writes a valid SVG of the whole diagram or a PNG by the chosen extension, and a write failure shows an error", withFleet({
      "tmp-fleet-img.sysmld": { kind: "general", root: "Fleet", style: { legend: true }, nodes: [{ id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 }, { id: "n2", ref: "Fleet::Frigate", x: 40, y: 3000, w: 160, h: 60 }] },
    }, async () => {
      const f = "tmp-fleet-img.sysmld";
      await open(f);
      const svgOut = uriOf("tmp-ship.svg");
      const pngOut = uriOf("tmp-ship.png");
      const errors: string[] = [];
      let dest = svgOut;
      api.diagram.setUi({ saveImage: async () => dest, error: (m: string) => { errors.push(m); } });
      try {
        await vscode.commands.executeCommand("sysml.diagram.saveImage");
        const svg = readFileSync(svgOut.fsPath, "utf8");
        assert.ok(/^<svg[\s>]/.test(svg) && svg.trimEnd().endsWith("</svg>"), "a valid SVG document");
        assert.ok(svg.includes("Frigate") && svg.includes("Ship"), "every node is drawn, including one far from the view");
        assert.ok(svg.includes("Part def"), "the legend is part of the image");
        dest = pngOut;
        await vscode.commands.executeCommand("sysml.diagram.saveImage");
        assert.ok(readFileSync(pngOut.fsPath).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "a PNG file");
        // A path under a file cannot be written: an error is shown and nothing is thrown.
        dest = vscode.Uri.joinPath(uriOf("tmp-fleet.sysml"), "x.svg");
        await vscode.commands.executeCommand("sysml.diagram.saveImage");
        assert.strictEqual(errors.length, 1, `one error shown: ${errors}`);
        assert.ok(/could not be written/.test(errors[0]!));
      } finally {
        rmSync(svgOut.fsPath, { force: true });
        rmSync(pngOut.fsPath, { force: true });
      }
    })],

    ["Copy as Image puts a PNG on the clipboard, or offers to save the PNG as a file when the webview may not write it", withFleet({
      "tmp-fleet-copy.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 }] },
    }, async () => {
      const f = "tmp-fleet-copy.sysmld";
      await open(f);
      const out = uriOf("tmp-copy.png");
      const offered: string[] = [];
      api.diagram.setUi({
        choose: async (m: string) => { offered.push(m); return "Save as Image..."; },
        saveImage: async () => out,
        error: (m: string) => assert.fail(`unexpected error: ${m}`),
      });
      try {
        const r = await vscode.commands.executeCommand<string>("sysml.diagram.copyImage");
        if (r === "copied") assert.deepStrictEqual(offered, [], "no fallback when the clipboard took it");
        else {
          assert.strictEqual(r, "saved", "the fallback saves the image");
          assert.strictEqual(offered.length, 1);
          assert.ok(readFileSync(out.fsPath).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "the fallback file is a PNG");
        }
      } finally {
        rmSync(out.fsPath, { force: true });
      }
    })],

    ["the specialization tool writes :> on the source definition and draws the line; a cycle writes nothing and says why", withFleet({
      "tmp-fleet-spec.sysmld": { kind: "general", root: "Fleet", nodes: [
        { id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 },
        { id: "n2", ref: "Fleet::Frigate", x: 40, y: 220, w: 160, h: 60 },
        { id: "n3", ref: "Fleet::Cargo", x: 400, y: 40, w: 160, h: 60 },
      ] },
    }, async () => {
      const f = "tmp-fleet-spec.sysmld";
      const modelPath = uriOf("tmp-fleet.sysml").fsPath;
      await open(f);
      const messages: string[] = [];
      api.diagram.setUi({ notify: (m: string) => { messages.push(m); }, fail: async (x: { reason: string }) => { messages.push(x.reason); } });
      await api.diagram.gesture(uriOf(f), { kind: "connect", source: "n2", target: "n1", relation: "specialization" });
      await waitFor(() => /part def Frigate :> Ship/.test(readFileSync(modelPath, "utf8")), 15000, "`:> Ship` is written and saved");
      await c.eventually(async () => assert.ok((await api.diagram.metrics(uriOf(f))).edges.length >= 1, "a specialization line is drawn"), "specialization line");
      const written = readFileSync(modelPath, "utf8");
      await api.diagram.gesture(uriOf(f), { kind: "connect", source: "n1", target: "n2", relation: "specialization" });
      await waitFor(() => messages.some((m) => /cycle|already specializes/.test(m)), 10000, "a reason is shown for the cycle");
      assert.strictEqual(readFileSync(modelPath, "utf8"), written, "nothing is written for the cycle");
      await api.diagram.gesture(uriOf(f), { kind: "connect", source: "n2", target: "n3", relation: "specialization" });
      await waitFor(() => messages.some((m) => /can only specialize another part def/.test(m)), 10000, "a kind mismatch is refused with a reason");
      assert.ok(messages.some((m) => /can only specialize another part def/.test(m)), `a kind mismatch is refused with a reason (saw: ${JSON.stringify(messages)})`);
      assert.strictEqual(readFileSync(modelPath, "utf8"), written);
    }, { model: "package Fleet {\n  part def Ship;\n  part def Frigate {\n    attribute mass;\n  }\n  part def Engine;\n  item def Cargo;\n}\n", changesModel: true })],

    ["the dependency tool writes a dependency statement and draws a dependency line", withFleet({
      "tmp-fleet-dep.sysmld": { kind: "general", root: "Fleet", nodes: [
        { id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 },
        { id: "n2", ref: "Fleet::Engine", x: 400, y: 40, w: 160, h: 60 },
      ] },
    }, async () => {
      const f = "tmp-fleet-dep.sysmld";
      const modelPath = uriOf("tmp-fleet.sysml").fsPath;
      await open(f);
      await api.diagram.gesture(uriOf(f), { kind: "connect", source: "n1", target: "n2", relation: "dependency" });
      await waitFor(() => /dependency from Ship to Engine;/.test(readFileSync(modelPath, "utf8")), 15000, "the dependency is written and saved");
      await c.eventually(async () => {
        assert.ok(doc(f).edges.length === 1, "the statement is placed on the diagram");
        assert.ok((await api.diagram.metrics(uriOf(f))).edges.length >= 1, "a line is drawn");
      }, "dependency line");
    }, { changesModel: true })],

    ["Back and Forward move between the diagrams opened in a tab group, and opening a new one clears the forward entries", withFleet({
      "tmp-nav-a.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Ship", x: 40, y: 40, w: 160, h: 60 }] },
      "tmp-nav-b.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Engine", x: 40, y: 40, w: 160, h: 60 }] },
      "tmp-nav-c.sysmld": { kind: "general", root: "Fleet", nodes: [{ id: "n1", ref: "Fleet::Radar", x: 40, y: 40, w: 160, h: 60 }] },
    }, async () => {
      const [a, b, cc] = ["tmp-nav-a.sysmld", "tmp-nav-b.sysmld", "tmp-nav-c.sysmld"];
      const notes: string[] = [];
      api.diagram.setUi({ notify: (m: string) => { notes.push(m); } });
      await open(a!);
      await open(b!);
      const active = () => api.diagram.activeUri();
      await waitFor(() => active() === uriOf(b!).toString(), 10000, "B is active");
      await vscode.commands.executeCommand("sysml.diagram.back");
      await waitFor(() => active() === uriOf(a!).toString(), 10000, "Back shows A");
      await vscode.commands.executeCommand("sysml.diagram.forward");
      await waitFor(() => active() === uriOf(b!).toString(), 10000, "Forward shows B");
      // Back to A, then a new diagram: nothing is left to go forward to.
      await vscode.commands.executeCommand("sysml.diagram.back");
      await waitFor(() => active() === uriOf(a!).toString(), 10000, "Back shows A again");
      await open(cc!);
      await waitFor(() => active() === uriOf(cc!).toString(), 10000, "C is active");
      await vscode.commands.executeCommand("sysml.diagram.forward");
      await waitFor(() => notes.some((m) => /no later diagram/.test(m)), 10000, "there is nothing to go forward to");
      assert.strictEqual(active(), uriOf(cc!).toString());
      // A diagram whose file is gone is skipped by Back.
      rmSync(uriOf(a!).fsPath);
      await vscode.commands.executeCommand("sysml.diagram.back");
      await waitFor(() => active() === uriOf(a!).toString() || notes.some((m) => /no earlier diagram/.test(m)) || active() === uriOf(b!).toString(), 10000, "Back skips or reaches");
      assert.notStrictEqual(active(), uriOf(a!).toString(), "the missing diagram is not shown");
    })],
  ];
}
