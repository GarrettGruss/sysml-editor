import { readFileSync } from "node:fs";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { createDiagram, diagramKindsFor, rootProblem } from "./create.js";
import { DIAGRAM_KINDS, parseDiagram, serializeDiagram, type DiagramDocument, type DiagramKind } from "./format.js";
import { resolveDiagram, resolveReference } from "./resolve.js";
import { buildViewModel } from "./view-model.js";
import { absoluteBoxes, countOutsideParent, countOverCompartments, countOverlaps, type Measure } from "../webview/diagram/geometry.js";
import { layoutDiagram, type ElkLike } from "../webview/diagram/layout.js";
import { checkEdges } from "../webview/diagram/metrics.js";
import { SEQ_FIRST, SEQ_ROW } from "../webview/diagram/sequence-layout.js";
import { LIGHT_PALETTE, buildSvg, wrapStandalone } from "../webview/diagram/svg.js";

const measure: Measure = (t, s) => t.length * (s === "small" ? 5.5 : 6.5);
const elk = new ELK() as unknown as ElkLike;
const REL = "fixtures/sysml-v2-release/sysml/src/";
const WS = "test/fixtures/workspace-basic/";

function load(path: string) {
  const index = new ModelIndex();
  index.setDocument("file:///w/m.sysml", readFileSync(path, "utf8"));
  expect(index.getDocument("file:///w/m.sysml")!.errors).toEqual([]);
  return index;
}

/** Build, resolve, draw and measure one diagram; the checks every behaviour view must pass. */
async function build(index: ModelIndex, root: string, kind: DiagramKind) {
  const doc = createDiagram(index, root, kind);
  const parsed = parseDiagram(serializeDiagram(doc));
  expect(parsed.ok).toBe(true);
  const res = resolveDiagram(doc, index);
  for (const i of [...doc.nodes, ...doc.edges]) expect(res.get(i.id), `${kind} ${root}: ${JSON.stringify(i)}`).toBeDefined();
  const vm = buildViewModel(doc, res, index);
  const layout = await layoutDiagram(vm, elk, measure);
  const abs = absoluteBoxes(vm, layout.boxes);
  const svg = buildSvg(vm, layout.boxes, measure, { palette: LIGHT_PALETTE }, { routes: layout.routes });
  wrapStandalone(svg, { palette: LIGHT_PALETTE });
  const edges = checkEdges(vm, abs, svg.routes, svg.labels);
  return { doc, res, vm, layout, abs, svg, edges, overlaps: countOverlaps(vm, abs), outside: countOutsideParent(vm, abs), overCompartments: countOverCompartments(vm, abs, measure) };
}

const CASES: { name: string; file: string; root: string; kind: DiagramKind; nodes: number; edges: number }[] = [
  { name: "Decision Example", file: REL + "training/17. Control/Decision Example.sysml", root: "'Decision Example'::ChargeBattery", kind: "actionFlow", nodes: 8, edges: 7 },
  { name: "Fork Join Example", file: REL + "training/17. Control/Fork Join Example.sysml", root: "'Fork Join Example'::Brake", kind: "actionFlow", nodes: 8, edges: 10 },
  { name: "Conditional Succession", file: REL + "training/16. Conditional Succession/Conditional Succession Example-1.sysml", root: "'Conditional Succession Example-1'::takePicture", kind: "actionFlow", nodes: 3, edges: 2 },
  { name: "Transition Actions", file: REL + "training/25. Transitions/Transition Actions.sysml", root: "'Transition Actions'::vehicleStates", kind: "stateTransition", nodes: 5, edges: 4 },
  { name: "State Decomposition", file: REL + "training/24. States/State Decomposition-1.sysml", root: "'State Decomposition-1'::vehicleStates", kind: "stateTransition", nodes: 5, edges: 4 },
  { name: "ServerSequenceRealization serverBehavior", file: REL + "examples/Interaction Sequencing Examples/ServerSequenceRealization-2.sysml", root: "ServerSequenceRealization_2::Configuration::server_2::serverBehavior", kind: "stateTransition", nodes: 4, edges: 3 },
  { name: "Interaction Example-1", file: REL + "training/27. Occurrences/Interaction Example-1.sysml", root: "'Interaction Example-1'::CruiseControlInteraction", kind: "sequence", nodes: 2, edges: 3 },
  { name: "Message Payload Example", file: REL + "training/27. Occurrences/Message Payload Example.sysml", root: "'Message Payload Example'::CruiseControlInteraction", kind: "sequence", nodes: 2, edges: 4 },
  { name: "ServerSequenceModel", file: REL + "examples/Interaction Sequencing Examples/ServerSequenceModel.sysml", root: "ServerSequenceModel::PubSubSequence", kind: "sequence", nodes: 3, edges: 3 },
  { name: "workspace actions", file: WS + "actions.sysml", root: "Delivery::deliverOrder", kind: "actionFlow", nodes: 7, edges: 7 },
  { name: "workspace states", file: WS + "states.sysml", root: "Lamp::lamp", kind: "stateTransition", nodes: 6, edges: 4 },
  { name: "workspace interaction", file: WS + "interaction.sysml", root: "Ordering::OrderInteraction", kind: "sequence", nodes: 3, edges: 3 },
];

describe("diagrams of real release fixtures and the workspace fixtures", () => {
  for (const c of CASES) {
    it(`${c.name}: every node and edge resolves, the layout has no overlaps and the edges are orthogonal`, async () => {
      const index = load(c.file);
      const r = await build(index, c.root, c.kind);
      if (process.env.DUMP) console.log(c.name, r.vm.nodes.length, r.vm.edges.length, JSON.stringify(r.edges), r.overlaps, r.outside);
      expect(r.vm.nodes.length, "nodes").toBe(c.nodes);
      expect(r.vm.edges.length, "edges").toBe(c.edges);
      expect(r.overlaps).toBe(0);
      expect(r.outside).toBe(0);
      expect(r.overCompartments).toBe(0);
      expect(r.edges.diagonalSegments).toBe(0);
      expect(r.edges.edgesThroughEndNodes).toBe(0);
      expect(r.edges.labelsOverEndNodes).toBe(0);
      expect(r.edges.labelsOnOwnEdge).toBe(0);
      expect(r.edges.labelsOverLabels).toBe(0);
      for (const e of r.vm.edges) if (!e.derived) expect(r.svg.routes.get(e.id), e.id).toBeDefined();
    });
  }
});

describe("diagram kinds", () => {
  it("the format knows the three new kinds and the existing diagrams still validate", () => {
    expect(DIAGRAM_KINDS).toEqual(["general", "interconnection", "requirements", "actionFlow", "stateTransition", "sequence"]);
    for (const f of ["ports-general.sysmld", "ports-general-auto.sysmld", "drivetrain-interconnection.sysmld", "requirements.sysmld"]) expect(parseDiagram(readFileSync(WS + f, "utf8")).ok, f).toBe(true);
    expect(parseDiagram(JSON.stringify({ version: 1, kind: "nonsense", root: "A", sources: [], nodes: [], edges: [] })).ok).toBe(false);
  });
  it("a root that does not fit the kind is a clear error", () => {
    const index = load(WS + "states.sysml");
    expect(() => createDiagram(index, "Lamp::lamp", "actionFlow")).toThrow(/needs an action or an action definition/);
    expect(() => createDiagram(index, "Lamp::logEvent", "stateTransition")).toThrow(/needs a state or a state definition/);
    expect(() => createDiagram(index, "Lamp::lamp", "sequence")).toThrow(/owns no `message`/);
    expect(rootProblem("stateTransition", index.findByQualifiedName("Lamp::lamp")[0]!)).toBeUndefined();
  });
  it("New Diagram offers a behaviour kind only for an element that fits it", () => {
    const states = load(WS + "states.sysml");
    const k = (qn: string, idx = states) => diagramKindsFor(idx.findByQualifiedName(qn)[0]!);
    expect(k("Lamp::lamp")).toContain("stateTransition");
    expect(k("Lamp::lamp")).not.toContain("actionFlow");
    expect(k("Lamp::lamp")).not.toContain("sequence");
    expect(k("Lamp::LampStates")).toContain("stateTransition");
    expect(k("Lamp::logEvent")).toContain("actionFlow");
    expect(k("Lamp")).toEqual(["general", "interconnection", "requirements"]);
    const inter = load(WS + "interaction.sysml");
    expect(k("Ordering::OrderInteraction", inter)).toContain("sequence");
    expect(k("Ordering::OrderInteraction", inter)).not.toContain("stateTransition");
  });
});

describe("structural locators of successions, transitions and messages (design D3)", () => {
  const text = (p: string) => readFileSync(p, "utf8");
  /** Add an unrelated statement (and a twin-free reordering) to the owner, then resolve every stored reference again. */
  async function survives(path: string, root: string, kind: DiagramKind, ownerQn: string, insert: string) {
    const before = load(path);
    const doc = createDiagram(before, root, kind);
    const locators = [...doc.nodes, ...doc.edges].filter((i) => i.locator);
    expect(locators.length).toBeGreaterThan(0);
    const src = text(path);
    const at = src.indexOf("{", src.indexOf(ownerQn.split("::").pop()!.replace(/'/g, ""))) + 1;
    const after = new ModelIndex();
    after.setDocument("file:///w/m.sysml", src.slice(0, at) + "\n" + insert + "\n" + src.slice(at));
    expect(after.getDocument("file:///w/m.sysml")!.errors).toEqual([]);
    for (const i of locators) expect(resolveReference(i, doc, after), JSON.stringify(i.locator)).toBeDefined();
    expect(locators.length).toBe(locators.filter((i) => resolveReference(i, doc, after)).length);
    return locators.length;
  }
  it("unnamed successions, start/done, control nodes and implied successions", async () => {
    expect(await survives(WS + "actions.sysml", "Delivery::deliverOrder", "actionFlow", "deliverOrder", "    action extra;")).toBeGreaterThanOrEqual(6);
  });
  it("unnamed and implied transitions of the shorthand form", async () => {
    expect(await survives(REL + "training/25. Transitions/Transition Actions.sysml", "'Transition Actions'::vehicleStates", "stateTransition", "vehicleStates", "    state extra;")).toBeGreaterThanOrEqual(4);
  });
  it("messages without names", async () => {
    const path = "/tmp/claude-1000/-home-garre-development-sysml-editor/af101c4b-0cdd-4e3e-990e-64139f3592b0/scratchpad/unnamed-messages.sysml";
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, "package P { item def T; part def Pt { part a; part b; message of T from a to b; message of T from b to a; message of T from a to b; } }");
    expect(await survives(path, "P::Pt", "sequence", "Pt", "    attribute extra;")).toBe(3);
  });
  it("twin statements are told apart by index", () => {
    const index = new ModelIndex();
    index.setDocument("file:///w/m.sysml", "package P { part def Pt { part a; part b; message from a to b; message from a to b; } }");
    const doc = createDiagram(index, "P::Pt", "sequence");
    const idx = doc.edges.map((e) => e.locator?.index);
    expect(idx).toEqual([0, 1]);
    const els = doc.edges.map((e) => resolveReference(e, doc, index)!);
    expect(els[0]).not.toBe(els[1]);
  });
});

describe("sequence views", () => {
  it("message rows are computed from the order and are strictly increasing; lifelines are evenly spaced", async () => {
    const r = await build(load(WS + "interaction.sysml"), "Ordering::OrderInteraction", "sequence");
    const ys = r.vm.edges.sort((a, b) => a.order! - b.order!).map((e) => r.svg.routes.get(e.id)![0]!.y);
    expect(ys).toEqual([ys[0]!, ys[0]! + SEQ_ROW, ys[0]! + 2 * SEQ_ROW]);
    expect(ys[0]).toBeGreaterThan(SEQ_FIRST);
    const cols = r.vm.nodes.map((n) => r.abs.get(n.id)!).sort((a, b) => a.x - b.x);
    const centres = cols.map((b) => b.x + b.w / 2);
    expect(centres[1]! - centres[0]!).toBe(centres[2]! - centres[1]!);
    for (const e of r.vm.edges) {
      const p = r.svg.routes.get(e.id)!;
      const s = r.abs.get(e.source)!, t = r.abs.get(e.target)!;
      expect(p[0]!.x).toBe(Math.round(s.x + s.w / 2));
      expect(p[p.length - 1]!.x).toBe(Math.round(t.x + t.w / 2));
    }
  });
  it("stored columns keep their order and width; positions never overlap and no vertical position is stored", async () => {
    const index = load(WS + "interaction.sysml");
    const doc = createDiagram(index, "Ordering::OrderInteraction", "sequence");
    const stored: DiagramDocument = { ...doc, nodes: doc.nodes.map((n, i) => (n.ref?.endsWith("shop") ? { ...n, x: 10, w: 200 } : n.ref?.endsWith("customer") ? { ...n, x: 40 + i } : n)) };
    const vm = buildViewModel(stored, resolveDiagram(stored, index), index);
    const layout = await layoutDiagram(vm, elk, measure);
    const boxes = vm.nodes.map((n) => ({ n, b: layout.boxes.get(n.id)! })).sort((a, b) => a.b.x - b.b.x);
    expect(boxes[0]!.n.label).toMatch(/^shop/);
    expect(boxes[0]!.b.w).toBe(200);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.b.x).toBeGreaterThanOrEqual(boxes[i - 1]!.b.x + boxes[i - 1]!.b.w);
    expect(boxes.every((x) => x.b.y === 0)).toBe(true);
  });
  it("messages the model leaves unordered keep source order and are marked", async () => {
    const r = await build(load(REL + "examples/Interaction Sequencing Examples/ServerSequenceModel.sysml"), "ServerSequenceModel::PubSubSequence", "sequence");
    expect(r.vm.edges.map((e) => e.order)).toEqual([0, 1, 2]);
    expect(r.vm.edges.every((e) => e.unordered)).toBe(true);
    expect(r.svg.content).toContain('data-unordered="true"');
  });
});

describe("notation", () => {
  it("action flow: guards in brackets, control nodes, start and done, a dashed flow", async () => {
    const r = await build(load(WS + "actions.sysml"), "Delivery::deliverOrder", "actionFlow");
    expect(r.vm.edges.filter((e) => e.style === "succession").map((e) => e.label ?? "")).toEqual(expect.arrayContaining(["[pack.weight >= 100]", "[else]"]));
    expect(r.vm.nodes.map((n) => n.shape).sort()).toEqual(["action", "action", "action", "action", "decision", "done", "start"]);
    expect(r.svg.content).toContain('data-style="flow"');
    expect(r.vm.nodes.find((n) => n.shape === "action" && n.label === "pack : Pack")?.keyword).toBe("«action»");
  });
  it("state transition: compartments, nested states and transition labels", async () => {
    const r = await build(load(WS + "states.sysml"), "Lamp::lamp", "stateTransition");
    const op = r.vm.nodes.find((n) => n.label === "operating")!;
    expect(op.compartments?.[0]?.lines).toEqual(["entry / coolDown", "do / glow", "exit / dim"]);
    expect(r.vm.nodes.find((n) => n.label === "low")!.parent).toBe(op.id);
    expect(r.vm.edges.map((e) => e.label).filter(Boolean)).toEqual(expect.arrayContaining(["TurnOn [powerAvailable] / action logEvent", "TurnOff", "Overheat"]));
  });
  it("use cases: ovals, actor and subject connected to the use case, include edges", async () => {
    const index = load(WS + "usecases.sysml");
    // The package: both use case definitions, and the include from one to the other.
    const pkg = createDiagram(index, "Mobility", "general");
    const vm = buildViewModel(pkg, resolveDiagram(pkg, index), index);
    expect(vm.nodes.filter((n) => n.shape === "usecase").map((n) => n.label).sort()).toEqual(["Enter Vehicle", "Provide Transportation"]);
    expect(vm.edges.some((e) => e.style === "include" && e.label === "\u00abinclude\u00bb")).toBe(true);
    // The use case itself: its subject and actor are nodes, connected to it.
    const uc = createDiagram(index, "Mobility::'Provide Transportation'", "general");
    const v2 = buildViewModel(uc, resolveDiagram(uc, index), index);
    const root = v2.nodes.find((n) => n.shape === "usecase" && n.label === "Provide Transportation")!;
    const actor = v2.nodes.find((n) => n.keyword === "\u00abactor\u00bb")!;
    expect(actor.label).toBe("driver : Driver");
    expect(v2.edges.some((e) => e.style === "association" && e.source === root.id && e.target === actor.id)).toBe(true);
    expect(v2.edges.some((e) => e.style === "association" && e.label === "\u00absubject\u00bb")).toBe(true);
    const layout = await layoutDiagram(v2, elk, measure);
    expect(countOverlaps(v2, absoluteBoxes(v2, layout.boxes))).toBe(0);
  });
});
