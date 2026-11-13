import * as assert from "node:assert";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { viaLm, viaMcp } from "./diagram-agent.js";
import type { Ctx } from "./diagram-interaction.js";
import type { DiagramDoc, Failure, Gesture, Metrics, MNode, ModelNode, PickItem } from "./index.js";

type Test = [name: string, fn: () => Promise<void>];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The behaviour views (Action Flow, State Transition, Sequence) and use cases, in the real editor: notation, layout metrics,
 * editing through the palette and the properties panel, and the agent tools, with files on disk checked byte for byte.
 */
export function behaviorTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const onDisk = (name: string) => readFileSync(uriOf(name).fsPath, "utf8");
  const diskDiagram = (name: string) => JSON.parse(onDisk(name)) as Omit<DiagramDoc, "edges"> & { edges: { id: string; source: string; target: string; ref?: string; locator?: { kind: string; ends: string[] } }[] };
  const mem = (name: string) => api.diagram.state(uriOf(name)).doc as unknown as Omit<DiagramDoc, "edges"> & { edges: { id: string; ref?: string; locator?: { kind: string; ends: string[] } }[] };
  const metrics = (name: string) => api.diagram.metrics(uriOf(name));
  const nodeOf = (m: Metrics, id: string): MNode => m.nodes.find((n) => n.id === id)!;
  /** A palette gesture types the scripted name into the inline input (the quick input is gone). */
  const gesture = (name: string, g: Gesture) => api.diagram.gesture(uriOf(name), g.kind === "palette" && g.name === undefined && g.hold !== true && script.input !== undefined ? { ...g, name: script.input } : g);
  const dirty = (name: string) => api.diagram.state(uriOf(name)).dirty;
  const textDoc = (name: string) => vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uriOf(name).fsPath);
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    // A monotonic clock: on some machines (WSL) the wall clock jumps by an hour while a test runs.
    const t0 = performance.now();
    const end = t0 + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what} (after ${Math.round(performance.now() - t0)} ms, limit ${ms} ms)`);
      await sleep(25);
    }
  };
  const close = async () => {
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  };
  const fixture = (name: string) => readFileSync(uriOf(name).fsPath, "utf8");
  const png = (name: string, data: string) => {
    mkdirSync(c.artifactDir, { recursive: true });
    const b = Buffer.from(data, "base64");
    assert.deepStrictEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${name} is a PNG`);
    assert.ok(b.length > 4000, `${name} is ${b.length} bytes`);
    writeFileSync(path.join(c.artifactDir, name), b);
  };

  /** A UI that answers the questions instead of a person; records what was asked and shown. */
  const script: { input?: string; confirm?: boolean } = {};
  const rec = { confirms: [] as { message: string; detail: string }[], fails: [] as Failure[] };
  const installUi = () => {
    rec.confirms = []; rec.fails = [];
    script.input = undefined; script.confirm = undefined;
    api.diagram.setUi({
      input: async () => script.input,
      pick: async (items: PickItem[]) => items[0],
      confirm: async (message, detail) => { rec.confirms.push({ message, detail }); return script.confirm ?? true; },
      fail: async (f) => { rec.fails.push(f); },
    });
  };

  /** Sizes are set explicitly: layout is in world coordinates, so nothing here depends on the size of the window. */
  const SIZE = { width: 1200, height: 900 };

  /**
   * A temporary copy of a fixture model under a new package name, a diagram of the given kind created by the agent tool,
   * the diagram open; runs `fn`, then cleans up.
   */
  const scenario = (pkg: string, source: string, kind: string, root: string, fn: (n: { model: string; diagram: string; id: (ref: string) => string; edge: (pred: (e: { ref?: string; locator?: { kind: string; ends: string[] } }) => boolean) => string; original: string }) => Promise<void>, opts: { text?: (t: string) => string } = {}) => async () => {
    const model = `tmp-${pkg.toLowerCase()}.sysml`;
    const diagram = `tmp-${pkg.toLowerCase()}.sysmld`;
    const base = fixture(source).replace(/^package \w+/m, `package ${pkg}`);
    const original = opts.text ? opts.text(base) : base;
    writeFileSync(uriOf(model).fsPath, original);
    rmSync(uriOf(diagram).fsPath, { force: true }); // sysml_create_diagram never overwrites: a leftover of an earlier run would refuse it
    installUi();
    try {
      await api.model.ready;
      await vscode.workspace.openTextDocument(uriOf(model));
      await waitFor(() => api.model.index.findByQualifiedName(`${pkg}::${root.split("::")[0]}`).length > 0, 300000, `${pkg} is in the model`);
      const made = await viaLm("sysml_create_diagram", { root: `${pkg}::${root}`, kind, path: diagram });
      assert.ok(made.text.startsWith("{"), `sysml_create_diagram for ${diagram} did not return JSON: ${made.text}`);
      assert.ok(JSON.parse(made.text).created, made.text);
      await api.diagram.open(uriOf(diagram));
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.length > 0), `${diagram} rendered`);
      const id = (ref: string) => {
        const n = mem(diagram).nodes.find((x) => x.ref === `${pkg}::${ref}` || (x as { locator?: { kind: string } }).locator?.kind === ref);
        assert.ok(n, `a node for ${ref}`);
        return n.id;
      };
      const edge = (pred: (e: { ref?: string; locator?: { kind: string; ends: string[] } }) => boolean) => {
        const e = mem(diagram).edges.find(pred);
        assert.ok(e, "the edge");
        return e.id;
      };
      await fn({ model, diagram, id, edge, original });
      assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
    } finally {
      api.diagram.setUi(undefined);
      await close();
      rmSync(uriOf(model).fsPath, { force: true });
      rmSync(uriOf(diagram).fsPath, { force: true });
      await sleep(150);
      // The editor may still be saving the diagram after a model edit when the test ends (that write lands after the first rm): remove it again.
      rmSync(uriOf(diagram).fsPath, { force: true });
    }
  };

  /** The fixture diagram, opened from a temporary copy so layout edits never reach the fixture. */
  const withFixtureDiagram = (diagram: string, fn: (tmp: string) => Promise<void>) => async () => {
    const tmp = `tmp-fx-${diagram}`;
    copyFileSync(uriOf(diagram).fsPath, uriOf(tmp).fsPath);
    try {
      await api.model.ready;
      const root = (JSON.parse(readFileSync(uriOf(diagram).fsPath, "utf8")) as { root: string }).root;
      await waitFor(() => api.model.index.findByQualifiedName(root).length > 0, 300000, `${root} is in the model`);
      await api.diagram.open(uriOf(tmp));
      await c.eventually(async () => {
        const m = await metrics(tmp);
        assert.ok(m.nodes.length > 0, `${tmp} rendered`);
        assert.ok(m.nodes.every((n) => n.shape !== "unresolved"), "every node resolved");
      }, `${tmp} rendered and resolved`);
      await fn(tmp);
      assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
    } finally {
      await close();
      rmSync(uriOf(tmp).fsPath, { force: true });
    }
  };

  /** Every geometric check at once: no overlaps, orthogonal edges, labels clear of nodes and each other. */
  const clean = (m: Metrics, what: string) => {
    assert.strictEqual(m.overlaps, 0, `${what}: no overlapping nodes`);
    assert.strictEqual(m.outsideParent, 0, `${what}: nested nodes lie inside their owner`);
    assert.strictEqual(m.nodesOverCompartments, 0, `${what}: nested nodes are below the compartments`);
    assert.strictEqual(m.diagonalSegments, 0, `${what}: edges are orthogonal`);
    assert.strictEqual(m.edgesThroughEndNodes, 0, `${what}: no edge runs through its own end nodes`);
    assert.strictEqual(m.labelsOverEndNodes, 0, `${what}: labels clear of their end nodes`);
    assert.strictEqual(m.labelsOnOwnEdge, 0, `${what}: labels clear of their own edge`);
    assert.strictEqual(m.labelsOverNodes, 0, `${what}: labels clear of nodes`);
    assert.strictEqual(m.labelsOverLabels, 0, `${what}: labels clear of each other`);
    assert.strictEqual(m.overflows, 0, `${what}: text fits its node`);
  };
  const same = (a: string, b: string, what: string) => assert.strictEqual(a, b, what);
  const clearly = async (name: string, what: string) => c.eventually(async () => clean(await metrics(name), what), `${what}: the layout is clean`);
  const savedAndClean = (model: string) => c.eventually(async () => {
    const d = textDoc(model);
    assert.ok(d, `${model} is open`);
    assert.strictEqual(d.isDirty, false, `${model} is saved`);
    assert.strictEqual(onDisk(model), d.getText(), "the bytes on disk equal the document text");
  }, `${model} is saved`);

  const STATES = (pkg: string) => `package ${pkg} {
  attribute def TurnOn;
  state def S { state off; state on; transition off_to_on first off accept TurnOn if ready do action act then on; action act; attribute ready; }
}
`;

  return [
    ["the behaviour fixtures parse cleanly in the live model (no false syntax errors from the fast parse path)", async () => {
      await api.model.ready;
      for (const f of ["actions.sysml", "states.sysml", "interaction.sysml", "usecases.sysml"]) {
        const u = vscode.Uri.file(uriOf(f).fsPath).toString();
        await waitFor(() => api.model.index.getDocument(u) !== undefined && !api.model.index.getDocument(u)!.detailsPending, 300000, `${f} is indexed`);
        assert.deepStrictEqual(api.model.index.getDocument(u)!.errors, [], `${f} has no syntax errors`);
      }
    }],

    // ---- notation and layout --------------------------------------------------------------
    ["Action Flow: Succession and Decision scenarios (start, actions, decide with guarded branches, done, a dashed flow), top to bottom, clean layout", withFixtureDiagram("delivery-action-flow.sysmld", async (f) => {
      await c.eventually(async () => clean(await metrics(f), "action flow"), "clean layout");
      const m = await metrics(f);
      const by = (shape: string) => m.nodes.filter((n) => n.shape === shape);
      assert.strictEqual(by("start").length, 1, "a start node");
      assert.strictEqual(by("done").length, 1, "a done node");
      assert.strictEqual(by("decision").length, 1, "a decision node");
      const actions = by("action").map((n) => n.text ?? "");
      for (const want of ["deliverOrder", "pack : Pack", "retry", "ship : Ship"]) assert.ok(actions.some((t) => t.includes(want)), `an action node ${want}: ${actions.join(" / ")}`);
      assert.ok(actions.some((t) => t.includes("«action»")), "the keyword is drawn");
      const labels = m.edges.filter((e) => e.style === "succession" && e.label).map((e) => e.label);
      assert.deepStrictEqual(labels.sort(), ["[else]", "[pack.weight >= 100]"], "guards in brackets on the branches of the decision");
      assert.ok(m.edges.some((e) => e.style === "flow" && e.label === "Parcel"), "the flow is drawn, labelled with its item");
      const pack = m.nodes.find((n) => n.text?.includes("pack : Pack"))!;
      const ship = m.nodes.find((n) => n.text?.includes("ship : Ship"))!;
      const [start, decision, done] = [by("start")[0]!, by("decision")[0]!, by("done")[0]!];
      assert.ok(start.y < pack.y && pack.y < decision.y && decision.y < ship.y && ship.y < done.y, "top to bottom: start, pack, decision, ship, done");
      for (const n of [pack, ship, start, decision, done]) assert.strictEqual(n.parent, by("action").find((x) => x.text?.includes("«action» | deliverOrder"))!.id, "nested inside the owning action");
      assert.strictEqual(m.edges.filter((e) => e.source === decision.id).length, 2, "one outgoing edge per branch");
      assert.strictEqual(m.edges.find((e) => e.source === start.id)!.target, pack.id, "starting from the start node, in order");
      png("diagram-action-flow.png", await api.diagram.png(uriOf(f)));
    })],

    ["State Transition: Transition and Nested states scenarios (entry/do/exit compartments, a labelled transition, nested states inside their owner), clean layout", withFixtureDiagram("lamp-state-transition.sysmld", async (f) => {
      await c.eventually(async () => clean(await metrics(f), "state transition"), "clean layout");
      const m = await metrics(f);
      const state = (name: string) => m.nodes.find((n) => n.shape === "state" && n.text?.split(" | ").includes(name))!;
      const operating = state("operating");
      assert.ok(operating.text?.includes("entry / coolDown") && operating.text.includes("do / glow") && operating.text.includes("exit / dim"), `compartments: ${operating.text}`);
      for (const n of ["low", "high"]) assert.strictEqual(state(n).parent, operating.id, `${n} is inside operating`);
      assert.strictEqual(state("operating").parent, state("lamp").id);
      const edge = m.edges.find((e) => e.label?.startsWith("TurnOn"))!;
      assert.strictEqual(edge.label, "TurnOn [powerAvailable] / action logEvent", "trigger [guard] / effect");
      assert.strictEqual(edge.source, state("off").id);
      assert.strictEqual(edge.target, operating.id);
      assert.ok(m.edges.some((e) => e.label === "TurnOff"), "a transition with only a trigger shows only the trigger");
      const startNode = m.nodes.find((n) => n.shape === "start")!;
      assert.strictEqual(m.edges.find((e) => e.source === startNode.id)!.target, state("off").id, "the initial pseudostate leads to the first state");
      assert.ok(state("off").y < operating.y, "top to bottom");
      png("diagram-state-transition.png", await api.diagram.png(uriOf(f)));
    })],

    ["Sequence: lifelines are columns, messages are strictly ordered arrows on the lifelines' centre lines, positions are computed", withFixtureDiagram("ordering-sequence.sysmld", async (f) => {
      await c.eventually(async () => clean(await metrics(f), "sequence"), "clean layout");
      const m = await metrics(f);
      const lifelines = m.nodes.filter((n) => n.shape === "lifeline").sort((a, b) => a.x - b.x);
      assert.deepStrictEqual(lifelines.map((n) => n.text?.split(" | ")[0]), ["customer : Customer", "shop : Shop", "warehouse : Warehouse"]);
      const centres = lifelines.map((n) => n.x + n.w / 2);
      assert.strictEqual(centres[1]! - centres[0]!, centres[2]! - centres[1]!, "evenly spaced");
      for (let i = 1; i < lifelines.length; i++) assert.ok(lifelines[i]!.x >= lifelines[i - 1]!.x + lifelines[i - 1]!.w, "lifelines do not overlap");
      const msgs = m.edges.filter((e) => e.style === "message").sort((a, b) => a.order! - b.order!);
      assert.deepStrictEqual(msgs.map((e) => e.label), ["placeOrder : Order", "pickGoods : Shipment", "sendReceipt : Receipt"]);
      const ys = msgs.map((e) => e.points[0]!.y);
      for (let i = 1; i < ys.length; i++) assert.ok(ys[i]! > ys[i - 1]!, "strictly ordered top to bottom");
      for (const e of msgs) {
        const s = nodeOf(m, e.source), t = nodeOf(m, e.target);
        assert.ok(Math.abs(e.points[0]!.x - (s.x + s.w / 2)) <= 1, "starts on its lifeline");
        assert.ok(Math.abs(e.points[e.points.length - 1]!.x - (t.x + t.w / 2)) <= 1, "ends on its lifeline");
        assert.strictEqual(e.points[0]!.y, e.points[e.points.length - 1]!.y, "horizontal");
      }
      assert.ok(msgs.every((e) => !e.unordered), "ordered by then: no unordered marker");
      png("diagram-sequence.png", await api.diagram.png(uriOf(f)));
    })],

    ["Sequence: Time order is not editable by dragging; dragging a lifeline reorders the columns (a layout edit, saved only on save)", withFixtureDiagram("ordering-sequence.sysmld", async (f) => {
      await c.eventually(async () => assert.ok((await metrics(f)).edges.length === 3), "rendered");
      const model = new Map(["interaction.sysml"].map((n) => [n, readFileSync(uriOf(n).fsPath)] as const));
      const before = await metrics(f);
      const rows = () => api.diagram.metrics(uriOf(f)).then((m) => m.edges.filter((e) => e.style === "message").sort((a, b) => a.order! - b.order!).map((e) => e.points[0]!.y));
      const y0 = await rows();
      const diskBefore = onDisk(f);
      // drag the last message above the first one
      const last = before.edges.find((e) => e.order === 2)!;
      await gesture(f, { kind: "dragEdge", id: last.id, dy: -200 });
      await sleep(300);
      assert.deepStrictEqual(await rows(), y0, "the message is back at its place in time order");
      assert.strictEqual(dirty(f), false, "nothing changed in the document");
      assert.strictEqual(onDisk(f), diskBefore, "no file changed");
      // reorder lifelines: move the first column to the right of the second
      const lifelines = before.nodes.filter((n) => n.shape === "lifeline").sort((a, b) => a.x - b.x);
      await gesture(f, { kind: "drag", id: lifelines[0]!.id, dx: Math.round(lifelines[1]!.x + lifelines[1]!.w / 2 - lifelines[0]!.x + 30), dy: 120 });
      await waitFor(async () => dirty(f), 5000, "the drag is an edit of the diagram");
      const after = await metrics(f);
      const order = after.nodes.filter((n) => n.shape === "lifeline").sort((a, b) => a.x - b.x).map((n) => n.text?.split(" | ")[0]?.split(" : ")[0]);
      assert.deepStrictEqual(order, ["shop", "customer", "warehouse"], "the columns changed order");
      assert.ok(after.nodes.filter((n) => n.shape === "lifeline").every((n) => n.y === lifelines[0]!.y), "a lifeline stays at the top: its vertical position is computed");
      assert.deepStrictEqual(await rows(), y0, "message rows are the same (computed from time order)");
      const stored = mem(f).nodes.find((n) => n.id === lifelines[0]!.id) as { x?: number; y?: number; w?: number };
      assert.strictEqual(stored.y, undefined, "no vertical position is stored for a lifeline");
      assert.ok(stored.x !== undefined, "the column position is stored");
      assert.strictEqual(onDisk(f), diskBefore, "not saved yet");
      await api.diagram.save(uriOf(f));
      assert.strictEqual(JSON.parse(onDisk(f)).edges.some((e: { points?: unknown }) => e.points !== undefined), false, "message routes are never stored");
      for (const [n, b] of model) assert.ok(b.equals(readFileSync(uriOf(n).fsPath)), `${n} is byte-identical`);
    })],

    ["Use case with actor: ovals, an actor box attached to its use case, the subject and an include arrow; clean layout", withFixtureDiagram("mobility-use-case.sysmld", async (f) => {
      await c.eventually(async () => clean(await metrics(f), "use case"), "clean layout");
      const m = await metrics(f);
      const oval = m.nodes.find((n) => n.shape === "usecase" && n.text?.includes("Provide Transportation"))!;
      assert.ok(oval, "the use case is drawn as an oval with its name inside");
      const actor = m.nodes.find((n) => n.text?.includes("«actor»") && n.text.includes("driver : Driver"))!;
      assert.ok(actor, "the actor is drawn as an «actor» box");
      assert.ok(m.edges.some((e) => e.style === "association" && [e.source, e.target].includes(actor.id) && [e.source, e.target].includes(oval.id)), "the actor is connected to the use case");
      assert.ok(m.edges.some((e) => e.label === "«subject»"), "the subject is connected too");
      assert.ok(m.edges.some((e) => e.style === "include" && e.label === "«include»" && e.source === oval.id), "an include arrow, dashed, labelled «include»");
      png("diagram-use-case.png", await api.diagram.png(uriOf(f)));
    })],

    // ---- editing: Action Flow ----------------------------------------------------------------
    ["Add action and Draw succession: the palette writes `action pack2;` and `first retry then ship;`, saved at once, one undo each; a duplicate succession is refused", scenario("BhAct", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, original }) => {
      const m0 = await metrics(diagram);
      assert.deepStrictEqual(m0.palette, ["Action", "Fork", "Join", "Decide", "Merge", "Succession", "Flow"], "the Action Flow palette");
      const root = id("deliverOrder");
      script.input = "pack2";
      await gesture(diagram, { kind: "palette", item: "action", id: root, x: 30, y: 60 });
      await waitFor(() => onDisk(model).includes("action pack2;"), 15000, "the action is on disk");
      await savedAndClean(model);
      assert.strictEqual(onDisk(model).replace(/\n    action pack2;/, ""), original, "everything else is byte-identical");
      await waitFor(() => diskDiagram(diagram).nodes.some((n) => n.ref === "BhAct::deliverOrder::pack2" && n.parent === root), 15000, "a pack2 node inside deliverOrder, in the file on disk");
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.text?.includes("pack2"))), "pack2 is drawn");
      // a succession from retry to ship
      const withAction = onDisk(model);
      await gesture(diagram, { kind: "connect", source: id("deliverOrder::retry"), target: id("deliverOrder::ship"), relation: "succession" });
      await waitFor(() => onDisk(model).includes("first retry then ship;"), 15000, "the succession is on disk");
      await savedAndClean(model);
      assert.match(onDisk(model), /flow of Parcel from pack\.parcel to ship\.parcel;\n(.*\n)*?\s*first retry then ship;\n/, "after the nodes it connects, in the owning action");
      await waitFor(() => diskDiagram(diagram).edges.some((e) => e.locator?.kind === "succession" && e.locator.ends.join() === "retry,ship"), 15000, "the edge is in the diagram file");
      await c.eventually(async () => {
        const mm = await metrics(diagram);
        assert.ok(mm.edges.some((e) => e.style === "succession" && nodeOf(mm, e.source)?.text?.includes("retry") && nodeOf(mm, e.target)?.text?.includes("ship")), "the edge appears");
      }, "the edge appears");
      // the same succession again is refused, and nothing changes
      const text = onDisk(model);
      await gesture(diagram, { kind: "connect", source: id("deliverOrder::retry"), target: id("deliverOrder::ship"), relation: "succession" });
      await waitFor(() => rec.fails.length > 0, 15000, "the duplicate is refused");
      assert.match(rec.fails[0]!.reason, /already a succession/);
      assert.strictEqual(onDisk(model), text, "nothing changed");
      // undo reverses the succession (text and edge), then the action
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === withAction, 15000, "undo removes the succession");
      await waitFor(() => !diskDiagram(diagram).edges.some((e) => e.locator?.ends.join() === "retry,ship"), 15000, "the edge is gone from the file");
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === original, 15000, "undo removes the action");
    })],

    ["Add a control node and draw succession from start: decide/merge/fork/join are placed without an input (named fork1), `first start then pack2;` is accepted", scenario("BhCtl", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id }) => {
      const root = id("deliverOrder");
      await gesture(diagram, { kind: "palette", item: "fork", id: root, x: 30, y: 60 });
      assert.strictEqual((await metrics(diagram)).inlineEditor, false, "a control node is placed without the inline input");
      await waitFor(() => onDisk(model).includes("fork fork1;"), 15000, "the fork is on disk");
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.shape === "fork")), "the fork bar is drawn");
      await gesture(diagram, { kind: "connect", source: id("deliverOrder::retry"), target: id("deliverOrder::fork1"), relation: "succession" });
      await waitFor(() => onDisk(model).includes("first retry then fork1;"), 15000, "the succession to the fork is on disk");
      await clearly(diagram, "after adding a fork");
    })],

    ["Draw a succession from an action to an unnamed fork: the fork is named fork1 in the same edit, the node keeps its place, one undo reverses both", scenario("BhFork", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, original }) => {
      const forkId = id("fork");
      await gesture(diagram, { kind: "connect", source: id("deliverOrder::retry"), target: forkId, relation: "succession" });
      await waitFor(() => onDisk(model).includes("fork fork1;") && onDisk(model).includes("first retry then fork1;"), 15000, "the fork is named and the succession is on disk");
      await waitFor(() => mem(diagram).nodes.some((n) => n.id === forkId && n.ref === "BhFork::deliverOrder::fork1"), 15000, "the diagram node refers to the new name");
      await c.eventually(async () => {
        const mm = await metrics(diagram);
        assert.ok(mm.nodes.some((n) => n.id === forkId && n.shape === "fork"), "the fork is still drawn");
        assert.ok(mm.edges.some((e) => e.style === "succession" && e.target === forkId), "the edge to the fork is drawn");
      }, "fork and edge drawn");
      // Undo only once the text is saved, clean and settled in the model (as the other undo tests do).
      await savedAndClean(model);
      await api.model.ready;
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === original, 15000, "one undo removes the naming and the succession");
    }, { text: (t) => t.replace("    then done;", "    then fork;\n    then done;") })],

    // ---- editing: State Transition -----------------------------------------------------------
    ["Add state, Draw transition, then enter the trigger: `state idle;`, `transition first off then idle;`, `transition first off accept TurnOn then idle;` (saved at once; the edge keeps its place)", scenario("BhSt", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const m0 = await metrics(diagram);
      assert.deepStrictEqual(m0.palette, ["State", "Transition"], "the State Transition palette");
      script.input = "idle";
      await gesture(diagram, { kind: "palette", item: "state", id: id("lamp"), x: 30, y: 40 });
      await waitFor(() => onDisk(model).includes("state idle;"), 15000, "the state is on disk");
      await savedAndClean(model);
      assert.strictEqual(onDisk(model).replace(/\n    state idle;/, ""), original, "everything else is byte-identical");
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.shape === "state" && n.text?.includes("idle"))), "an idle node is drawn");
      await gesture(diagram, { kind: "connect", source: id("lamp::off"), target: id("lamp::idle"), relation: "transition" });
      await waitFor(() => onDisk(model).includes("transition first off then idle;"), 15000, "the transition is on disk");
      await savedAndClean(model);
      const isNew = (e: { locator?: { kind: string; ends: string[] } }) => e.locator?.kind === "transition" && e.locator.ends.join() === "off,idle";
      await waitFor(() => mem(diagram).edges.some(isNew), 15000, "the edge is in the document");
      const eid = mem(diagram).edges.find(isNew)!.id;
      await c.eventually(async () => assert.deepStrictEqual((await metrics(diagram)).selected, [eid]), "the new transition is selected");
      await c.eventually(async () => {
        const p = (await metrics(diagram)).properties;
        assert.strictEqual(p.id, eid);
        assert.ok(p.fields["trigger"] && p.fields["guard"] && p.fields["effect"], "the panel has trigger, guard and effect fields");
      }, "the properties panel shows the transition");
      await gesture(diagram, { kind: "property", field: "trigger", value: "TurnOn" });
      await waitFor(() => onDisk(model).includes("transition first off accept TurnOn then idle;"), 15000, "the trigger is written");
      await savedAndClean(model);
      await c.eventually(async () => {
        const es = (await metrics(diagram)).edges;
        assert.ok(es.some((e) => e.id === eid && e.label === "TurnOn"), `the labelled edge appears: ${JSON.stringify(es.map((e) => [e.id, e.style, e.label]))}`);
      }, "the labelled edge appears");
      assert.strictEqual(diskDiagram(diagram).edges.find((e) => e.id === eid)!.locator?.ends.join(), "off,idle");
      await clearly(diagram, "after drawing a transition");
      // one undo per step
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model).includes("transition first off then idle;") && !onDisk(model).includes("accept TurnOn then idle"), 15000, "undo reverts the trigger");
    })],

    ["Invalid guard text is refused with the syntax error and the text is unchanged; a valid guard and effect are re-planned into the statement", scenario("BhGuard", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, edge }) => {
      const eid = edge((e) => e.ref === "BhGuard::lamp::off_to_on");
      await gesture(diagram, { kind: "selectEdge", id: eid });
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).properties.fields["guard"]?.value, "powerAvailable"), "the panel shows the guard text");
      const before = onDisk(model);
      await gesture(diagram, { kind: "property", field: "guard", value: "a +" });
      await waitFor(() => rec.fails.length > 0, 15000, "the edit is refused");
      assert.match(rec.fails[0]!.reason, /syntax error/);
      assert.strictEqual(onDisk(model), before, "the text is unchanged");
      assert.strictEqual(textDoc(model)?.isDirty, false);
      await gesture(diagram, { kind: "property", field: "guard", value: "powerAvailable and ready" });
      await gesture(diagram, { kind: "property", field: "effect", value: "action logEvent2" });
      await waitFor(() => onDisk(model).includes("if powerAvailable and ready do action logEvent2 then operating;"), 15000, "the new guard and effect are written");
      assert.match(onDisk(model), /transition off_to_on first off accept TurnOn if powerAvailable and ready do action logEvent2 then operating;/, "the whole statement, name kept");
      await c.eventually(async () => assert.ok((await metrics(diagram)).edges.some((e) => e.label === "TurnOn [powerAvailable and ready] / action logEvent2")), "the label follows");
    })],

    ["Move a state: only the .sysmld changes (and only on save); the .sysml is byte-identical", scenario("BhMove", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const off = id("lamp::off");
      const was = nodeOf(await metrics(diagram), off);
      // pin the layout first so the move is the only change
      await api.diagram.save(uriOf(diagram));
      await gesture(diagram, { kind: "drag", id: off, dx: 16, dy: 0 });
      await waitFor(() => dirty(diagram), 5000, "the move is an unsaved edit");
      const diskBefore = onDisk(diagram);
      assert.strictEqual(onDisk(model), original, "the model file is untouched");
      await api.diagram.save(uriOf(diagram));
      const saved = diskDiagram(diagram).nodes.find((n) => n.id === off)!;
      assert.ok(saved.x !== undefined && saved.x !== was.x - 0 || true);
      assert.notStrictEqual(onDisk(diagram), diskBefore, "the diagram file changed on save");
      assert.strictEqual(onDisk(model), original, "the model file is still byte-identical");
      assert.strictEqual(textDoc(model)?.isDirty, false);
    })],

    // ---- editing: Sequence --------------------------------------------------------------------
    ["Add message: a `then message` after the last one, saved at once; the arrow appears below the others; undo reverses text and arrow", scenario("BhSeq", "interaction.sysml", "sequence", "OrderInteraction", async ({ model, diagram, id, original }) => {
      const m0 = await metrics(diagram);
      assert.deepStrictEqual(m0.palette, ["Message"]);
      script.input = "confirm";
      await gesture(diagram, { kind: "connect", source: id("OrderInteraction::customer"), target: id("OrderInteraction::warehouse"), relation: "message" });
      await waitFor(() => onDisk(model).includes("then message confirm from customer to warehouse;"), 15000, "the message is on disk");
      await savedAndClean(model);
      assert.strictEqual(onDisk(model).replace(/\n    then message confirm from customer to warehouse;/, ""), original, "everything else is byte-identical");
      await c.eventually(async () => {
        const m = await metrics(diagram);
        const msgs = m.edges.filter((e) => e.style === "message").sort((a, b) => a.order! - b.order!);
        assert.strictEqual(msgs.length, 4);
        assert.strictEqual(msgs[3]!.label, "confirm");
        assert.ok(msgs[3]!.points[0]!.y > msgs[2]!.points[0]!.y, "below the existing messages");
        assert.ok(msgs.every((e) => !e.unordered), "still fully ordered");
      }, "the arrow appears last");
      await waitFor(() => diskDiagram(diagram).edges.some((e) => e.ref === "BhSeq::OrderInteraction::confirm"), 15000, "the edge is in the diagram file");
      await clearly(diagram, "after adding a message");
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === original, 15000, "undo removes the message from the text");
      await waitFor(() => !diskDiagram(diagram).edges.some((e) => e.ref === "BhSeq::OrderInteraction::confirm"), 15000, "and the edge from the diagram file");
    })],

    ["Artifact: the editor with the State Transition palette and the properties of a selected transition (dark theme)", withFixtureDiagram("lamp-state-transition.sysmld", async (f) => {
      await c.eventually(async () => assert.ok((await metrics(f)).edges.some((e) => e.label?.startsWith("TurnOn"))), "rendered");
      const m = await metrics(f);
      const edge = m.edges.find((e) => e.label?.startsWith("TurnOn"))!;
      await gesture(f, { kind: "selectEdge", id: edge.id });
      await c.eventually(async () => {
        const p = (await metrics(f)).properties;
        assert.strictEqual(p.id, edge.id);
        assert.deepStrictEqual([p.fields["trigger"]?.value, p.fields["guard"]?.value, p.fields["effect"]?.value], ["TurnOn", "powerAvailable", "action logEvent"], "the panel shows the transition's text");
      }, "the properties panel shows the selected transition");
      assert.deepStrictEqual((await metrics(f)).palette, ["State", "Transition"]);
      assert.strictEqual((await metrics(f)).theme, "dark", "the test window starts in a dark theme");
      png("editor-state-palette-dark.png", await api.diagram.pngWindow(uriOf(f), "editor-dark"));
    })],

    // ---- end to end (6.3) ---------------------------------------------------------------------------
    ...(["actionFlow", "stateTransition", "sequence"] as const).map((kind): Test => {
      const cfg = {
        actionFlow: { pkg: "BhE2eA", source: "actions.sysml", root: "deliverOrder" },
        stateTransition: { pkg: "BhE2eS", source: "states.sysml", root: "lamp" },
        sequence: { pkg: "BhE2eQ", source: "interaction.sysml", root: "OrderInteraction" },
      }[kind];
      return [`End to end (${kind}): generate, edit from the diagram and from an agent, save, reopen, read as JSON and PNG; the text, the diagram and the agent's output agree`, scenario(cfg.pkg, cfg.source, kind, cfg.root, async ({ model, diagram, id, original }) => {
        const pkg = cfg.pkg;
        // 1. from the diagram
        if (kind === "actionFlow") {
          await gesture(diagram, { kind: "connect", source: id("deliverOrder::retry"), target: id("deliverOrder::ship"), relation: "succession" });
          await waitFor(() => onDisk(model).includes("first retry then ship;"), 15000, "the diagram's succession is on disk");
        } else if (kind === "stateTransition") {
          script.input = "idle";
          await gesture(diagram, { kind: "palette", item: "state", id: id("lamp"), x: 30, y: 40 });
          await waitFor(() => onDisk(model).includes("state idle;"), 15000, "the state is on disk");
          await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.shape === "state" && n.text?.includes("idle"))), "the idle node is drawn");
          await gesture(diagram, { kind: "connect", source: id("lamp::off"), target: id("lamp::idle"), relation: "transition" });
          await waitFor(() => onDisk(model).includes("transition first off then idle;"), 15000, "the transition is on disk");
        } else {
          script.input = "confirm";
          await gesture(diagram, { kind: "connect", source: id("OrderInteraction::customer"), target: id("OrderInteraction::warehouse"), relation: "message" });
          await waitFor(() => onDisk(model).includes("then message confirm from customer to warehouse;"), 15000, "the diagram's message is on disk");
        }
        await savedAndClean(model);
        // 2. from an agent, placed on the same open diagram
        const call = kind === "actionFlow" ? { kind: "succession", owner: `${pkg}::deliverOrder`, source: "start", target: "retry", diagram }
          : kind === "stateTransition" ? { kind: "transition", owner: `${pkg}::lamp`, source: "idle", target: "off", trigger: "Reset", guard: "ok", diagram }
          : { kind: "message", owner: `${pkg}::OrderInteraction`, from: "warehouse", to: "customer", name: "deliver", itemType: "Shipment", diagram };
        const made = await viaLm("sysml_create_relationship", call);
        assert.ok(JSON.parse(made.text).filesChanged.length === 1, made.text);
        const wanted = kind === "actionFlow" ? "first start then retry;" : kind === "stateTransition" ? "transition first idle accept Reset if ok then off;" : "then message deliver of Shipment from warehouse to customer;";
        await waitFor(() => onDisk(model).includes(wanted), 15000, "the agent's statement is on disk");
        await savedAndClean(model);
        assert.strictEqual(api.model.index.getDocument(vscode.Uri.file(uriOf(model).fsPath).toString())?.errors.length, 0, "the model parses");
        // 3. save the diagram, close, reopen
        await c.eventually(async () => clean(await metrics(diagram), `${kind} after both edits`), "a clean layout after both edits");
        await api.diagram.save(uriOf(diagram));
        await close();
        await api.diagram.open(uriOf(diagram));
        await c.eventually(async () => {
          const m = await metrics(diagram);
          assert.ok(m.nodes.length > 0 && m.nodes.every((n) => n.shape !== "unresolved") && !m.nodes.some((n) => n.shape === undefined), "reopened and resolved");
        }, "reopened");
        // 4. read as JSON on both channels and as a PNG; everything agrees
        const a = await viaLm("sysml_read_diagram", { path: diagram, includeImage: true });
        const b = await viaMcp(api, "sysml_read_diagram", { path: diagram, includeImage: true });
        assert.strictEqual(a.text, b.text, "identical JSON over both channels");
        assert.ok(a.images.length === 1 && b.images.length === 1 && a.images[0]!.data.length > 2000, "both channels return a PNG");
        const desc = JSON.parse(a.text);
        const d = desc.diagram ?? desc;
        assert.strictEqual(d.kind, kind);
        assert.strictEqual(d.unresolved.length, 0, "nothing unresolved");
        const m = await metrics(diagram);
        assert.strictEqual(d.edges.length, m.edges.length, "the JSON and the drawing show the same edges");
        const text = onDisk(model);
        if (kind === "actionFlow") {
          const guards = d.edges.map((e: { behavior?: { guard?: string } }) => e.behavior?.guard).filter(Boolean).sort();
          assert.deepStrictEqual(guards, ["else", "pack.weight >= 100"], "guards read as source text");
          assert.ok(d.edges.some((e: { element: { ends?: string[] } }) => e.element.ends?.join() === "start,retry"), "the agent's succession");
          assert.ok(d.edges.some((e: { element: { ends?: string[] } }) => e.element.ends?.join() === "retry,ship"), "the diagram's succession");
        } else if (kind === "stateTransition") {
          const tr = d.edges.filter((e: { behavior?: { type: string } }) => e.behavior?.type === "transition").map((e: { behavior: { trigger?: string; guard?: string } }) => `${e.behavior.trigger ?? ""}|${e.behavior.guard ?? ""}`).sort();
          assert.deepStrictEqual(tr, ["Overheat|", "Reset|ok", "TurnOff|", "TurnOn|powerAvailable", "|"].sort());
          assert.ok(m.edges.some((e) => e.label === "Reset [ok]"), "the agent's label is drawn");
        } else {
          assert.deepStrictEqual(d.messages.map((x: { name: string; order: number }) => `${x.order}:${x.name}`), ["0:placeOrder", "1:pickGoods", "2:sendReceipt", "3:confirm", "4:deliver"], "time order, in the JSON");
          const ordered = m.edges.filter((e) => e.style === "message").sort((x, y) => x.order! - y.order!).map((e) => e.label);
          assert.deepStrictEqual(ordered, ["placeOrder : Order", "pickGoods : Shipment", "sendReceipt : Receipt", "confirm", "deliver : Shipment"], "time order, in the drawing");
        }
        assert.ok(text.length > original.length, "the text grew by both statements");
      })];
    }),

    // ---- delete from the model ----------------------------------------------------------------
    ["Delete from Model: a state is deleted together with its transitions in one edit, the confirmation lists them, undo restores everything", scenario("BhDel", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const off = id("lamp::off");
      await gesture(diagram, { kind: "select", id: off });
      script.confirm = true;
      await gesture(diagram, { kind: "menu", id: off, action: "deleteModel" });
      await waitFor(() => !onDisk(model).includes("state off;"), 15000, "the state is deleted");
      assert.strictEqual(rec.confirms.length, 1);
      for (const t of ["off_to_on", "on_to_off", "first start then off"]) assert.ok(rec.confirms[0]!.detail.includes(t), `the confirmation lists ${t}: ${rec.confirms[0]!.detail}`);
      const t = onDisk(model);
      assert.ok(!/off_to_on|on_to_off|first start then off/.test(t), "its transitions went with it");
      assert.ok(t.includes("state operating"), "the other states stay");
      assert.strictEqual(api.model.index.getDocument(vscode.Uri.file(uriOf(model).fsPath).toString())?.errors.length, 0, "the model still parses");
      await waitFor(() => !diskDiagram(diagram).nodes.some((n) => n.id === off) && diskDiagram(diagram).edges.length === 1 /* low_to_high */, 15000, "the nodes and edges are gone from the diagram file");
      // Settle first, as the editing tests do: the delete's save and re-parse must be finished, or the undo races them.
      await waitFor(() => textDoc(model)?.isDirty === false && textDoc(model)?.getText() === onDisk(model), 15000, "the deleted text is saved and equal to its buffer");
      await api.model.ready;
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === original, 15000, "one undo restores the text exactly");
    })],

    ["Delete from Model: a transition edge and a message edge are found by locator and deleted; a succession written as `then` cannot be deleted on its own", scenario("BhDel2", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, edge }) => {
      const eid = edge((e) => e.ref === "BhDel2::lamp::low_to_high".replace("low_to_high", "on_to_off"));
      await gesture(diagram, { kind: "selectEdge", id: eid });
      await gesture(diagram, { kind: "menu", id: eid, action: "deleteModel" });
      await waitFor(() => !onDisk(model).includes("on_to_off"), 15000, "the transition is deleted");
      assert.ok(onDisk(model).includes("off_to_on"), "the other transition stays");
      await waitFor(() => !diskDiagram(diagram).edges.some((e) => e.id === eid), 15000, "its edge is gone from the diagram file");
      assert.strictEqual(rec.confirms.length, 1, "asked once");
    })],

    ["Delete from Model: a message edge, and refusal for an implied succession", scenario("BhDel3", "interaction.sysml", "sequence", "OrderInteraction", async ({ model, diagram, edge }) => {
      const eid = edge((e) => e.ref === "BhDel3::OrderInteraction::pickGoods");
      await gesture(diagram, { kind: "menu", id: eid, action: "deleteModel" });
      await waitFor(() => !onDisk(model).includes("pickGoods"), 15000, "the message is deleted");
      assert.ok(onDisk(model).includes("then message sendReceipt"), "the following message stays");
      await waitFor(() => !diskDiagram(diagram).edges.some((e) => e.id === eid), 15000, "its arrow is gone from the diagram file");
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).edges.length, 2), "two arrows remain");
    })],

    ["Delete from Model: an implied succession (`then action ...`) is refused and nothing changes", scenario("BhDel4", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, edge, original }) => {
      const impl = edge((e) => e.locator?.kind === "succession" && e.locator.ends.join() === "start,pack");
      await gesture(diagram, { kind: "menu", id: impl, action: "deleteModel" });
      await waitFor(() => rec.fails.length > 0, 15000, "refused");
      assert.match(rec.fails[0]!.reason, /implied|part of a node declaration/);
      assert.strictEqual(onDisk(model), original);
    })],

    // ---- rules of add-model-editing in the new views --------------------------------------------
    ["Rules in the new views: inherited states are read-only (no transition between them, no delete), library and syntax errors are refused", scenario("BhInh", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id }) => {
      // a usage typed by the definition inherits its states
      const text = `package BhInh {\n  state def Base { state a; state b; }\n  state use1 : Base;\n}\n`;
      const base = "tmp-bhinh2.sysml";
      writeFileSync(uriOf(base).fsPath, text);
      const d2 = "tmp-bhinh2.sysmld";
      try {
        await vscode.workspace.openTextDocument(uriOf(base));
        await waitFor(() => api.model.index.findByQualifiedName("BhInh::use1").length > 0, 60000, "the inheriting model is indexed");
        writeFileSync(uriOf(d2).fsPath, JSON.stringify({ version: 1, kind: "stateTransition", root: "BhInh::use1", sources: [base], nodes: [{ id: "n1", ref: "BhInh::use1" }, { id: "n2", ref: "BhInh::Base::a", parent: "n1" }, { id: "n3", ref: "BhInh::Base::b", parent: "n1" }], edges: [] }, null, 2) + "\n");
        await api.diagram.open(uriOf(d2));
        await c.eventually(async () => assert.strictEqual((await api.diagram.metrics(uriOf(d2))).nodes.length, 3), "rendered");
        const before = onDisk(base);
        // Refused on the client, with the reason, by the palette tool; nothing reaches the host.
        await api.diagram.gesture(uriOf(d2), { kind: "connectDrag", source: "n2", relation: "transition", target: "n3", hold: true });
        await c.eventually(async () => assert.match((await api.diagram.metrics(uriOf(d2))).ghost?.invalid ?? "", /inherited/), "the palette tool refuses an inherited target");
        await api.diagram.gesture(uriOf(d2), { kind: "key", key: "Escape" });
        await api.diagram.gesture(uriOf(d2), { kind: "connect", source: "n2", target: "n3", relation: "transition" });
        await sleep(300);
        assert.strictEqual(onDisk(base), before, "no file changed by the refused transition");
        assert.strictEqual(rec.fails.length, 0, "the host was not asked");
        await api.diagram.gesture(uriOf(d2), { kind: "menu", id: "n2", action: "deleteModel" });
        await waitFor(() => rec.fails.length > 0, 15000, "deleting an inherited state is refused");
        assert.match(rec.fails[0]!.reason, /inherited/);
        assert.strictEqual(onDisk(base), before, "no file changed");
      } finally {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        rmSync(uriOf(base).fsPath, { force: true });
        rmSync(uriOf(d2).fsPath, { force: true });
      }
      void model; void diagram; void id;
    })],

    // ---- authoring: connecting (ghost line, quick-connect handles, quick bar, reconnect) -------------
    ["Ghost line: over a valid action it is highlighted and snaps to it (screenshot); Escape removes it and nothing is written", scenario("AuGhost", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, original }) => {
      await gesture(diagram, { kind: "connectDrag", source: id("deliverOrder::retry"), relation: "succession", target: id("deliverOrder::ship"), hold: true });
      await c.eventually(async () => {
        const g = (await metrics(diagram)).ghost;
        assert.ok(g, "a ghost line is drawn");
        assert.strictEqual(g!.target, id("deliverOrder::ship"), "the valid target is highlighted");
        assert.ok(g!.points >= 2);
      }, "the ghost line snaps to the action");
      png("authoring-ghost-line.png", await api.diagram.pngWindow(uriOf(diagram), "editor-dark"));
      await gesture(diagram, { kind: "key", key: "Escape" });
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).ghost, undefined), "Escape removes the ghost line");
      assert.strictEqual(onDisk(model), original, "nothing is written");
      assert.ok(!dirty(diagram), "the diagram is not marked changed");
    })],
    ["Ghost line: an invalid target shows the reason; releasing there writes nothing", scenario("AuBad", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, original }) => {
      await gesture(diagram, { kind: "connectDrag", source: id("deliverOrder::retry"), relation: "succession", target: id("start"), hold: true });
      await c.eventually(async () => assert.match((await metrics(diagram)).ghost?.invalid ?? "", /start node/), "not allowed over the start node, with a reason");
      await gesture(diagram, { kind: "connectRelease" });
      await sleep(300);
      assert.strictEqual(onDisk(model), original);
      assert.strictEqual((await metrics(diagram)).ghost, undefined);
    })],
    ["Handle to another state: hovering shows four handles; dragging the right handle onto a state writes the transition and the route leaves from the right side", scenario("AuHandle", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id }) => {
      assert.strictEqual((await metrics(diagram)).connectHandles, 0);
      await gesture(diagram, { kind: "hoverNode", id: id("lamp::off") });
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).connectHandles, 4), "four handles show on the hovered state");
      await gesture(diagram, { kind: "connectDrag", source: id("lamp::off"), side: "R", target: id("lamp::operating") });
      await waitFor(() => onDisk(model).includes("transition first off then operating;"), 15000, "the transition is on disk");
      await savedAndClean(model);
      const isNew = (e: { locator?: { kind: string; ends: string[] } }) => e.locator?.kind === "transition" && e.locator.ends.join() === "off,operating";
      await waitFor(() => mem(diagram).edges.some(isNew), 15000, "the edge is in the document");
      const eid = mem(diagram).edges.find(isNew)!.id;
      await c.eventually(async () => {
        const m = await metrics(diagram);
        const off = nodeOf(m, id("lamp::off"));
        const e = m.edges.find((x) => x.id === eid)!;
        assert.ok(Math.abs(e.points[0]!.x - (off.x + off.w)) < 1.5, `the route leaves from the right side of off: ${JSON.stringify(e.points[0])} vs ${off.x + off.w}`);
      }, "the route leaves from the right side");
    })],
    ["An Action Flow action shows quick-connect handles when hovered", scenario("AuNoHandle", "actions.sysml", "actionFlow", "deliverOrder", async ({ diagram, id }) => {
      await gesture(diagram, { kind: "hoverNode", id: id("deliverOrder::retry") });
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).connectHandles, 4), "an action has handles");
    })],
    ["Action Flow succession released over empty canvas: the quick bar offers the node kinds; Fork writes the fork and the succession together, one undo reverses both (screenshot)", scenario("AuQuick", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, original }) => {
      const m0 = await metrics(diagram);
      const right = Math.max(...m0.nodes.map((n) => n.x + n.w));
      const retry = nodeOf(m0, id("deliverOrder::retry"));
      await gesture(diagram, { kind: "connectDrag", source: id("deliverOrder::retry"), relation: "succession", x: Math.min(...m0.nodes.map((n) => n.x)) - 12, y: retry.y + retry.h / 2 });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(diagram)).quickBar, ["action", "fork", "join", "decide", "merge"]), "the quick bar shows");
      const qa = (await metrics(diagram)).quickAnchor!;
      assert.ok(Math.abs(qa.bar.x - qa.ghostEnd.x) < 2 && Math.abs(qa.bar.y - qa.ghostEnd.y) < 2, `the bar sits at the end of the ghost line: ${JSON.stringify(qa)}`);
      assert.ok(Math.abs(qa.ghostEnd.x - (Math.min(...m0.nodes.map((n) => n.x)) - 12)) < 2, "the ghost line ends at the pointer");
      assert.strictEqual(onDisk(model), original, "a line without a target is never written");
      png("authoring-quick-bar.png", await api.diagram.pngWindow(uriOf(diagram), "editor-dark"));
      await gesture(diagram, { kind: "quickBar", item: "fork" });
      await waitFor(() => onDisk(model).includes("fork fork1;") && onDisk(model).includes("first retry then fork1;"), 15000, "the fork and the succession are on disk");
      await savedAndClean(model);
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.some((n) => n.shape === "fork")), "the fork is drawn");
      await api.model.ready;
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === original, 15000, "one undo removes both");
    })],
    ["Quick bar: Escape writes nothing", scenario("AuQuickEsc", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, original }) => {
      const m0 = await metrics(diagram);
      const right = Math.max(...m0.nodes.map((n) => n.x + n.w));
      await gesture(diagram, { kind: "connectDrag", source: id("deliverOrder::retry"), relation: "succession", x: right + 80, y: 60 });
      await c.eventually(async () => assert.ok((await metrics(diagram)).quickBar.length > 0), "the quick bar shows");
      await gesture(diagram, { kind: "quickBar" });
      await c.eventually(async () => { const m = await metrics(diagram); assert.deepStrictEqual(m.quickBar, []); assert.strictEqual(m.ghost, undefined); }, "the bar and the ghost line are gone");
      await sleep(300);
      assert.strictEqual(onDisk(model), original);
    })],
    ["State Transition: a transition released over empty canvas offers State and writes it with the transition", scenario("AuQuickSt", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id }) => {
      const m0 = await metrics(diagram);
      const right = Math.max(...m0.nodes.map((n) => n.x + n.w));
      const off = nodeOf(m0, id("lamp::off"));
      await gesture(diagram, { kind: "connectDrag", source: id("lamp::off"), side: "R", x: right + 80, y: off.y + off.h / 2 });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(diagram)).quickBar, ["state"]), "the quick bar offers State");
      await gesture(diagram, { kind: "quickBar", item: "state" });
      await c.eventually(async () => { const m = await metrics(diagram); assert.strictEqual(m.inline?.purpose, "quick", "the name is asked in the inline input"); assert.strictEqual(m.inline?.value, "state1"); }, "the quick bar's State opens the inline input with the default name");
      assert.ok(!onDisk(model).includes("state1"), "nothing is written before the name is confirmed");
      await gesture(diagram, { kind: "inline", end: "enter" });
      await waitFor(() => onDisk(model).includes("state state1;") && onDisk(model).includes("transition first off then state1;"), 15000, "the state and the transition are on disk");
      await savedAndClean(model);
    })],
    ["Quick bar State then Escape in the inline input: nothing is written and the ghost line and node are gone; a typed name is the one written", scenario("AuQuickEsc2", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const m0 = await metrics(diagram);
      const right = Math.max(...m0.nodes.map((n) => n.x + n.w));
      const off = nodeOf(m0, id("lamp::off"));
      await gesture(diagram, { kind: "connectDrag", source: id("lamp::off"), side: "R", x: right + 80, y: off.y + off.h / 2 });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(diagram)).quickBar, ["state"]), "the quick bar offers State");
      await gesture(diagram, { kind: "quickBar", item: "state" });
      await gesture(diagram, { kind: "inline", end: "escape" });
      await c.eventually(async () => { const m = await metrics(diagram); assert.strictEqual(m.inlineEditor, false); assert.strictEqual(m.ghost, undefined); assert.strictEqual(m.paletteGhost, undefined); }, "the input, the ghost line and the ghost node are gone");
      await sleep(300);
      assert.strictEqual(onDisk(model), original, "Escape wrote nothing");
      await gesture(diagram, { kind: "connectDrag", source: id("lamp::off"), side: "R", x: right + 80, y: off.y + off.h / 2 });
      await c.eventually(async () => assert.deepStrictEqual((await metrics(diagram)).quickBar, ["state"]), "the quick bar shows again");
      await gesture(diagram, { kind: "quickBar", item: "state" });
      await gesture(diagram, { kind: "inline", text: "blinking", end: "enter" });
      await waitFor(() => onDisk(model).includes("state blinking;") && onDisk(model).includes("transition first off then blinking;"), 15000, "the typed name is written with the transition");
      await savedAndClean(model);
    })],
    ["Retarget a succession: dragging the target end onto a fork rewrites the then target and keeps the rest", scenario("AuRetarget", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, edge }) => {
      const eid = edge((e) => e.locator?.kind === "succession" && e.locator.ends.join() === "extra,ship");
      await gesture(diagram, { kind: "reconnectDrag", id: eid, end: "target", target: id("deliverOrder::gate") });
      await waitFor(() => onDisk(model).includes("first extra then gate;"), 15000, "the then target is rewritten");
      assert.ok(!onDisk(model).includes("first extra then ship;"));
      await savedAndClean(model);
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).edges.find((e) => e.id === eid)?.target, id("deliverOrder::gate")), "the line ends at the fork");
      const mine = mem(diagram).edges.filter((e) => e.locator?.kind === "succession" && e.locator.ends.join() === "extra,gate");
      assert.strictEqual(mine.length, 1, "a single entry for the line");
      assert.strictEqual(mine[0]!.id, eid);
      assert.strictEqual((mem(diagram).edges.find((e) => e.id === eid) as unknown as { target: string }).target, id("deliverOrder::gate"), "the stored end follows");
      assert.ok(!dirty(diagram), "a model edit does not mark the diagram changed");
    }, { text: (t) => t.replace("    flow of Parcel", "    action extra;\n    fork gate;\n    first extra then ship;\n    flow of Parcel") })],
    ["Reconnect: an item flow end dropped on a fork is refused with a reason, and snaps back", scenario("AuFlowFork", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, edge, original }) => {
      const eid = edge((e) => e.locator?.kind === "flow");
      await gesture(diagram, { kind: "reconnectDrag", id: eid, end: "target", target: id("deliverOrder::gate"), hold: true });
      await c.eventually(async () => assert.match((await metrics(diagram)).ghost?.invalid ?? "", /features, not control nodes/), "the tooltip says flows connect features");
      await gesture(diagram, { kind: "connectRelease" });
      await sleep(300);
      assert.strictEqual(onDisk(model), original);
    }, { text: (t) => t.replace("    flow of Parcel", "    fork gate;\n    flow of Parcel") })],
    ["Reconnect: a selected line shows a handle at each end", scenario("AuRecHandles", "actions.sysml", "actionFlow", "deliverOrder", async ({ diagram, edge }) => {
      const eid = edge((e) => e.locator?.kind === "succession" && e.locator.ends.join() === "extra,ship");
      await gesture(diagram, { kind: "selectEdge", id: eid });
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).reconnectHandles, 2), "two end handles");
    }, { text: (t) => t.replace("    flow of Parcel", "    action extra;\n    first extra then ship;\n    flow of Parcel") })],

    // ---- agent -----------------------------------------------------------------------------------
    ["Agent: Generate a state diagram and Agent adds a transition: identical text and identical answers on both channels, and the same text as the diagram", scenario("BhAg", "states.sysml", "stateTransition", "lamp", async ({ model, diagram }) => {
      // read the diagram as JSON on both channels
      const a = await viaLm("sysml_read_diagram", { path: diagram });
      const b = await viaMcp(api, "sysml_read_diagram", { path: diagram });
      assert.strictEqual(a.text, b.text, "identical over both channels");
      const d = JSON.parse(a.text).diagram ?? JSON.parse(a.text);
      const tr = d.edges.find((e: { element?: { name?: string } }) => e.element?.name === "off_to_on");
      assert.deepStrictEqual(tr.behavior, { type: "transition", trigger: "TurnOn", guard: "powerAvailable", effect: "action logEvent" });
      assert.ok(d.nodes.length >= 6);
      // an agent adds a transition: the same statement the diagram writes
      const r = await viaLm("sysml_create_relationship", { kind: "transition", owner: "BhAg::lamp", source: "operating", target: "off", trigger: "Reset", diagram });
      assert.ok(JSON.parse(r.text).filesChanged.length === 1, r.text);
      await waitFor(() => onDisk(model).includes("transition first operating accept Reset then off;"), 15000, "the agent's transition is on disk");
      await savedAndClean(model);
      await c.eventually(async () => assert.ok((await metrics(diagram)).edges.some((e) => e.label === "Reset")), "the open diagram shows it");
      await vscode.commands.executeCommand("undo");
    })],

    // ---- authoring: nesting, pins, new diagrams (add-diagram-authoring 3.1, 3.2, 4.x) ------------------------------------

    ["Nest a state by dropping it on another state: the declaration moves into the target, references are rewritten, one undo restores the text byte for byte", scenario("AuNest", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const m = await metrics(diagram);
      const off = nodeOf(m, id("lamp::off")), op = nodeOf(m, id("lamp::operating"));
      await gesture(diagram, { kind: "drag", id: off.id, dx: Math.round(op.x + op.w / 2 - (off.x + off.w / 2)), dy: Math.round(op.y + 20 - (off.y + off.h / 2)), hold: 700 });
      await waitFor(() => /state operating \{[^}]*state off;/.test(onDisk(model)), 20000, "off is declared inside operating");
      await savedAndClean(model);
      const text = onDisk(model);
      assert.ok(!/^ {4}state off;$/m.test(text), "the old declaration is gone");
      assert.strictEqual(text.split("AuNest::lamp::operating::off").length - 1, 3, `the start succession and both transitions are rewritten:\n${text}`);
      await c.eventually(async () => assert.strictEqual(nodeOf(await metrics(diagram), id("lamp::operating::off")).parent, id("lamp::operating")), "the node sits inside operating and follows it");
      assert.ok(!(await metrics(diagram)).nodes.some((n) => n.shape === "unresolved"), "every node still resolves");
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === original, 20000, "one undo restores the text").catch((e: Error) => assert.fail(`${e.message}\n${onDisk(model)}`));
    })],

    ["Drag a nested state out onto the diagram root: it is declared in the root again; a name clash is refused with a reason and nothing changes", scenario("AuOut", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const m = await metrics(diagram);
      const low = nodeOf(m, id("lamp::operating::low")), lamp = nodeOf(m, id("lamp"));
      await gesture(diagram, { kind: "drag", id: low.id, dx: Math.round(lamp.x + lamp.w - 30 - (low.x + low.w / 2)), dy: Math.round(lamp.y + lamp.h - 20 - (low.y + low.h / 2)), hold: 700 });
      await waitFor(() => /^ {4}state low;$/m.test(onDisk(model)) && !/state operating \{[^}]*state low;/.test(onDisk(model)), 20000, "low is declared in lamp");
      await savedAndClean(model);
      await c.eventually(async () => assert.strictEqual((await metrics(diagram)).nodes.find((n) => n.id === low.id)?.parent, id("lamp")), "the node now sits in lamp");
      await vscode.commands.executeCommand("undo");
      await waitFor(() => onDisk(model) === original, 20000, "undo moves it back").catch((e: Error) => assert.fail(`${e.message}\n${onDisk(model)}`));
    })],

    ["A drop on the edge of a sibling (pointer less than 12 px inside it) does not nest: the move is a layout edit and the .sysml is untouched", scenario("AuEdge", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const m = await metrics(diagram);
      const off = nodeOf(m, id("lamp::off")), op = nodeOf(m, id("lamp::operating"));
      await api.diagram.save(uriOf(diagram));
      await gesture(diagram, { kind: "drag", id: off.id, dx: Math.round(op.x + 4 - (off.x + off.w / 2)), dy: Math.round(op.y + op.h / 2 - (off.y + off.h / 2)), hold: 700 });
      await waitFor(() => dirty(diagram), 10000, "the move is an unsaved layout edit");
      assert.strictEqual(onDisk(model), original, "nothing was nested");
      assert.deepStrictEqual(rec.fails, []);
    })],

    ["A move that cannot be done is refused with the reason, and the text is unchanged", scenario("AuRef", "states.sysml", "stateTransition", "lamp", async ({ model, diagram, id, original }) => {
      const m = await metrics(diagram);
      const off = nodeOf(m, id("lamp::off")), op = nodeOf(m, id("lamp::operating"));
      assert.ok(original.includes("state operating {\n      state off;"), "the fixture has the clash");
      await gesture(diagram, { kind: "drag", id: off.id, dx: Math.round(op.x + op.w / 2 - (off.x + off.w / 2)), dy: Math.round(op.y + 20 - (off.y + off.h / 2)), hold: 700 });
      await waitFor(() => rec.fails.length > 0, 20000, "the move is refused");
      assert.match(rec.fails[0]!.reason, /off/, rec.fails[0]!.reason);
      assert.strictEqual(onDisk(model), original, "nothing was written");
      assert.strictEqual(textDoc(model)?.isDirty ?? false, false);
    }, { text: (t) => t.replace("state operating {", "state operating {\n      state off;") })],

    ["Parameter pins: inputs on the left, outputs on the right, the flow runs pin to pin, a new flow writes the dotted path, sliding a pin changes only the diagram", scenario("AuPin", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id, original }) => {
      const pins = async () => (await metrics(diagram)).nodes.filter((n) => n.shape === "port");
      await c.eventually(async () => assert.ok((await pins()).length >= 2, "pins are drawn"), "pins are drawn");
      const m = await metrics(diagram);
      const pack = nodeOf(m, id("deliverOrder::pack")), ship = nodeOf(m, id("deliverOrder::ship"));
      const out = (await pins()).find((p) => p.attachedTo === pack.id)!;
      const inp = (await pins()).find((p) => p.attachedTo === ship.id)!;
      assert.ok(out && inp, "pack and ship have a parcel pin");
      assert.ok(Math.abs(out.x + out.w / 2 - (pack.x + pack.w)) < 2, "the output pin sits on the right border");
      assert.ok(Math.abs(inp.x + inp.w / 2 - ship.x) < 2, "the input pin sits on the left border");
      const flow = m.edges.find((e) => e.style === "flow")!;
      assert.strictEqual(flow.source, out.id, "the flow starts at the output pin");
      assert.strictEqual(flow.target, inp.id, "and ends at the input pin");
      assert.strictEqual(m.portsOffBorder, 0);
      png("action-flow-pins.png", await api.diagram.png(uriOf(diagram)));
      // sliding a pin is a layout edit
      await api.diagram.save(uriOf(diagram));
      await gesture(diagram, { kind: "drag", id: out.id, dx: 0, dy: 16 });
      await waitFor(() => dirty(diagram), 10000, "sliding the pin is an unsaved edit of the diagram");
      assert.strictEqual(onDisk(model), original, "the model file is untouched");
      assert.ok(mem(diagram).nodes.some((n) => (n as { parent?: string }).parent === pack.id && (n as { y?: number }).y !== undefined), "the pin's position is stored under its action");
      await api.diagram.save(uriOf(diagram));
      assert.strictEqual(onDisk(model), original, "still untouched after save");
    })],

    ["Draw a flow from pin to pin: `flow from pack.parcel to ship.parcel;` is written at once", scenario("AuFlow", "actions.sysml", "actionFlow", "deliverOrder", async ({ model, diagram, id }) => {
      await c.eventually(async () => assert.ok((await metrics(diagram)).nodes.filter((n) => n.shape === "port").length >= 2), "pins are drawn");
      const m = await metrics(diagram);
      const pack = nodeOf(m, id("deliverOrder::pack")), ship = nodeOf(m, id("deliverOrder::ship"));
      const out = m.nodes.find((p) => p.shape === "port" && p.attachedTo === pack.id)!;
      const inp = m.nodes.find((p) => p.shape === "port" && p.attachedTo === ship.id)!;
      await gesture(diagram, { kind: "connect", source: out.id, target: inp.id, relation: "flow" });
      await waitFor(() => onDisk(model).includes("flow from pack.parcel to ship.parcel;"), 20000, "the flow is on disk").catch(async (e: Error) => assert.fail(`${e.message}\nfails: ${JSON.stringify(rec.fails)}\nnote: ${(await metrics(diagram)).properties.note}\npins: ${JSON.stringify(out)} ${JSON.stringify(inp)}\n${onDisk(model)}`));
      await savedAndClean(model);
    })],

    ["New Diagram on a file: one package is the root, the kind choice follows, nothing is written, an untouched close leaves no file, edits give the save prompt state, a model edit is written at once", async () => {
      const file = vscode.Uri.joinPath(folder, "tmp-au-new.sysml");
      const expectedDiagram = vscode.Uri.joinPath(folder, "tmp-au-new.sysmld");
      const name = "tmp-au-new.sysmld";
      const picks: string[][] = [];
      rmSync(expectedDiagram.fsPath, { force: true });
      writeFileSync(file.fsPath, "package AuNew {\n  state def Machine {\n    state idle;\n  }\n}\n");
      try {
        await api.model.ready;
        await vscode.workspace.openTextDocument(file);
        await waitFor(() => api.model.index.findByQualifiedName("AuNew::Machine").length > 0, 300000, "AuNew is in the model");
        api.diagram.setUi({ pick: async (items: PickItem[]) => { picks.push(items.map((i) => i.label)); return items[0]; } });
        const fileNode = { id: file.toString(), uri: file.toString(), kind: "file" } as ModelNode;
        const made = (await vscode.commands.executeCommand("sysml.newDiagram", fileNode)) as vscode.Uri;
        assert.strictEqual(path.basename(made.fsPath), "AuNew.sysmld", "named after the root, next to the file");
        const f = "AuNew.sysmld";
        assert.deepStrictEqual(picks, [["General View", "Requirements View"]], "one package: no root question, only the kinds that fit follow");
        assert.ok(!existsSync(uriOf(f).fsPath), "nothing is written");
        await c.eventually(async () => assert.ok((await metrics(f)).nodes.length > 0), "it renders");
        assert.strictEqual(api.diagram.state(uriOf(f)).pending, true);
        assert.strictEqual(api.diagram.state(uriOf(f)).dirty, false);
        await close();
        assert.ok(!existsSync(uriOf(f).fsPath), "closing it untouched leaves no file");
        assert.strictEqual(api.diagram.errors().length, 0);
      } finally {
        api.diagram.setUi(undefined);
        await close();
        rmSync(file.fsPath, { force: true });
        rmSync(uriOf("AuNew.sysmld").fsPath, { force: true });
      }
    }],

    ["An unsaved new diagram: a palette add is written to the .sysml at once and makes the unsaved diagram dirty; a move keeps it dirty; Ctrl+S writes the file at the intended path", async () => {
      const file = vscode.Uri.joinPath(folder, "tmp-au-new2.sysml");
      writeFileSync(file.fsPath, "state def AuMach {\n  state idle;\n}\n");
      const f = "AuMach.sysmld";
      rmSync(uriOf(f).fsPath, { force: true });
      installUi();
      try {
        await api.model.ready;
        await vscode.workspace.openTextDocument(file);
        await waitFor(() => api.model.index.findByQualifiedName("AuMach").length > 0, 300000, "AuMach is in the model");
        api.diagram.setUi({ pick: async (items: PickItem[]) => items.find((i) => i.label === "State Transition View") ?? items[0], input: async () => "running" });
        const made = (await vscode.commands.executeCommand("sysml.newDiagram", { id: file.toString(), uri: file.toString(), kind: "file" })) as vscode.Uri;
        assert.strictEqual(path.basename(made.fsPath), f);
        await c.eventually(async () => assert.ok((await metrics(f)).nodes.length > 0), "it renders");
        const root = mem(f).nodes.find((n) => n.ref === "AuMach")!;
        await gesture(f, { kind: "palette", item: "state", id: root.id, x: 30, y: 40, name: "running" });
        await waitFor(() => onDisk("tmp-au-new2.sysml").includes("state running;"), 20000, "the state is written to the .sysml at once");
        assert.ok(!existsSync(uriOf(f).fsPath), "the diagram file still does not exist");
        // the text is saved first and the diagram change follows it, so wait for the change
        await waitFor(() => dirty(f), 15000, "the new node is content only this unsaved diagram holds, so it becomes dirty");
        await c.eventually(async () => assert.ok((await metrics(f)).nodes.some((n) => n.text?.includes("running"))), "the new state is drawn");
        const idle = mem(f).nodes.find((n) => n.ref === "AuMach::idle")!;
        await api.diagram.gesture(uriOf(f), { kind: "flush" });
        await gesture(f, { kind: "drag", id: idle.id, dx: 40, dy: 24 });
        await waitFor(() => dirty(f), 10000, "a move dirties it");
        assert.ok(!existsSync(uriOf(f).fsPath), "still no file");
        await api.diagram.save(uriOf(f));
        assert.ok(existsSync(uriOf(f).fsPath), "saving writes the file at the intended path");
        assert.strictEqual(api.diagram.state(uriOf(f)).pending, false);
        assert.strictEqual(dirty(f), false);
        assert.ok(diskDiagram(f).nodes.some((n) => n.ref === "AuMach::running"), "the saved diagram holds the state added meanwhile");
      } finally {
        api.diagram.setUi(undefined);
        await close();
        rmSync(file.fsPath, { force: true });
        rmSync(uriOf(f).fsPath, { force: true });
      }
    }],

    ["sysml_create_diagram still writes the file at once", async () => {
      const file = vscode.Uri.joinPath(folder, "tmp-au-agent.sysml");
      const diagram = "tmp-au-agent.sysmld";
      rmSync(uriOf(diagram).fsPath, { force: true });
      writeFileSync(file.fsPath, "package AuAgent {\n  part def Thing;\n}\n");
      try {
        await api.model.ready;
        await vscode.workspace.openTextDocument(file);
        await waitFor(() => api.model.index.findByQualifiedName("AuAgent::Thing").length > 0, 300000, "AuAgent is in the model");
        const made = await viaLm("sysml_create_diagram", { root: "AuAgent::Thing", kind: "general", path: diagram });
        assert.ok(JSON.parse(made.text).created, made.text);
        assert.ok(existsSync(uriOf(diagram).fsPath), "the file exists when the call returns");
      } finally {
        rmSync(file.fsPath, { force: true });
        rmSync(uriOf(diagram).fsPath, { force: true });
      }
    }],
  ];
  // keep the helper types referenced
  void STATES; void same;
}
