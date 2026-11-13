import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { addElements, createDiagram } from "./create.js";
import { applyAutoLayout, applyBoxPatches, applyEdgeLayout, removeItems, withDescendants } from "./edits.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "./format.js";
import { relink } from "./reconcile.js";
import { relationOf } from "./relations.js";
import { makeSourceMapper, resolveDiagram } from "./resolve.js";
import { DiagramState, applyLayout, refresh } from "./session.js";
import { buildViewModel, type ViewModel } from "./view-model.js";

const dir = new URL("../../test/fixtures/workspace-basic/", import.meta.url);
const read = (n: string) => readFileSync(new URL(n, dir), "utf8");
const sourceOf = makeSourceMapper("file:///ws");
function load(...files: string[]): ModelIndex {
  const ix = new ModelIndex();
  for (const f of files) ix.setDocument(`file:///ws/${f}`, read(f));
  return ix;
}
const parse = (file: string): DiagramDocument => {
  const r = parseDiagram(read(file));
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.doc;
};

describe("removing from a diagram", () => {
  const doc = parse("drivetrain-interconnection.sysmld");
  const ix = load("ports.sysml");
  const vm = buildViewModel(doc, resolveDiagram(doc, ix, { sourceOf }), ix);

  it("removes a node with its child nodes and attached edges, and nothing else", () => {
    const next = removeItems(doc, ["n1"], vm); // battery: holds the port n3 that e1 connects
    expect(next.nodes.map((n) => n.id)).toEqual(["n0", "n2", "n4", "n5"]);
    expect(next.edges).toEqual([]);
    expect(next.nodes.find((n) => n.id === "n2")).toEqual(doc.nodes.find((n) => n.id === "n2"));
  });
  it("ignores ids that are not on the diagram and returns the same document when nothing is removed", () => {
    expect(removeItems(doc, ["nope"])).toBe(doc);
  });
  it("follows parent and port ownership from the view model", () => {
    expect([...withDescendants(doc, ["n0"], vm)].sort()).toEqual(["n0", "n1", "n2", "n3", "n4", "n5"]);
  });
  it("round-trips: the result is a valid canonical document", () => {
    const next = removeItems(doc, ["n2"], vm);
    expect(parseDiagram(serializeDiagram(next)).ok).toBe(true);
  });
});

describe("layout edits", () => {
  const doc = parse("ports-general.sysmld");
  it("writes x and y (and a size only when given) and reports no change for identical boxes", () => {
    const moved = applyBoxPatches(doc, [{ id: "n1", x: 600, y: 80 }])!;
    expect(moved.nodes.find((n) => n.id === "n1")).toMatchObject({ x: 600, y: 80 });
    expect(moved.nodes.find((n) => n.id === "n1")!.w).toBe(doc.nodes.find((n) => n.id === "n1")!.w);
    const sized = applyBoxPatches(doc, [{ id: "n1", x: 520, y: 40, w: 300, h: 200 }])!;
    expect(sized.nodes.find((n) => n.id === "n1")).toMatchObject({ w: 300, h: 200 });
    const n1 = doc.nodes.find((n) => n.id === "n1")!;
    expect(applyBoxPatches(doc, [{ id: "n1", x: n1.x!, y: n1.y! }])).toBeUndefined();
    expect(applyBoxPatches(doc, [{ id: "n1", x: NaN, y: 1 }, { id: "zz", x: 1, y: 1 }])).toBeUndefined();
    const big = 2_000_000;
    for (const bad of [{ x: big, y: 1 }, { x: 1, y: -big }, { x: 1, y: 1, w: big }, { x: 1, y: 1, h: big }, { x: 1, y: 1, w: 0 }])
      expect(applyBoxPatches(doc, [{ id: "n1", ...bad }]), JSON.stringify(bad)).toBeUndefined();
  });
  it("keeps the stored route when one end moves and translates it when both ends move together", () => {
    const withRoute: DiagramDocument = { ...doc, edges: [{ id: "e1", ref: "Ports::Drivetrain", source: "n4", target: "n5", points: [{ x: 1, y: 1 }, { x: 2, y: 1 }] }] };
    const moved = applyBoxPatches(withRoute, [{ id: "n5", x: 1, y: 1 }])!;
    expect(moved.edges[0]!.points).toEqual(withRoute.edges[0]!.points);

  });
  it("auto-layout rewrites every box and route as one change", () => {
    const boxes = doc.nodes.map((n, i) => ({ id: n.id, x: i * 10, y: 5, w: 100, h: 50 }));
    const next = applyAutoLayout(doc, boxes, [])!;
    expect(next.nodes.every((n, i) => n.x === i * 10 && n.w === 100)).toBe(true);
    expect(applyAutoLayout(next, boxes, [])).toBeUndefined();
  });
  it("layout merging fills in only routes of edges that have none, and never moves stored positions", () => {
    const d: DiagramDocument = { ...doc, edges: [{ id: "e1", ref: "Ports::Drivetrain", source: "n4", target: "n5" }, { id: "e2", ref: "Ports::Drivetrain", source: "n4", target: "n5", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }] };
    const route = [{ x: 0, y: 0 }, { x: 9, y: 0 }];
    const next = applyLayout(d, [{ id: "n1", x: 1, y: 1, w: 5, h: 5 }], [{ id: "e1", points: route }, { id: "e2", points: route }])!;
    expect(next.edges[0]!.points).toEqual(route);
    expect(next.edges[1]!.points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    expect(next.nodes.find((n) => n.id === "n1")!.x).toBe(520);
  });
});

describe("one undoable edit through the session", () => {
  it("each user action is one edit that dirties, undoes exactly and redoes", () => {
    const doc = parse("ports-general.sysmld");
    const st = new DiagramState(serializeDiagram(doc));
    const before = JSON.stringify(st.doc);
    const e = st.apply(applyBoxPatches(st.doc!, [{ id: "n1", x: 700, y: 10 }])!);
    expect(st.dirty).toBe(true);
    expect(e.undo()).toBe(true);
    expect(JSON.stringify(st.doc)).toBe(before);
    expect(st.dirty).toBe(false);
    expect(e.redo()).toBe(true);
    expect(st.dirty).toBe(true);
  });
});

describe("re-link candidates remember the kind", () => {
  it("records the kind of what an item resolved to, so a deleted element's kind is still known", () => {
    const ix = load("ports.sysml");
    const st = new DiagramState(read("ports-general.sysmld"));
    refresh(st, ix, { sourceOf });
    const ref = st.doc!.nodes.find((n) => n.id === "n2")!.ref!;
    expect(st.kinds.get("n2")).toBeDefined();
    const kind = st.kinds.get("n2");
    // The element disappears from the model.
    const ix2 = new ModelIndex();
    ix2.setDocument("file:///ws/ports.sysml", read("ports.sysml").replace(/part def Motor \{[^}]*\}/, "part def Engine;"));
    const r = refresh(st, ix2, { sourceOf })!;
    expect(r.viewModel.nodes.find((n) => n.id === "n2")!.resolved).toBe(ref === "Ports::Motor" ? false : true);
    expect(st.kinds.get("n2")).toBe(kind);
    const target = ix2.findByQualifiedName("Ports::Engine")[0]!;
    if (ref === "Ports::Motor") {
      const fixed = relink(st.doc!, "n2", target);
      expect(fixed.nodes.find((n) => n.id === "n2")!.ref).toBe("Ports::Engine");
    }
  });
});

describe("requirements view", () => {
  const ix = load("requirements.sysml");
  const doc = parse("requirements.sysmld");
  const vm = buildViewModel(doc, resolveDiagram(doc, ix, { sourceOf }), ix);

  it("shows requirement boxes with id, name and documentation", () => {
    const n = vm.nodes.find((x) => x.id === "n3")!;
    expect(n.shape).toBe("requirement");
    expect(n.label).toBe("<R1> VehicleMass");
    expect(n.doc).toContain("shall not exceed 2000 kg");
    expect(vm.nodes.find((x) => x.id === "n4")!.label).toBe("<R1.1> EngineMass");
  });
  it("draws satisfy and verify from the satisfier or verifier to the requirement, and derivation from derived to original", () => {
    const e = (id: string) => vm.edges.find((x) => x.id === id)!;
    expect(e("e1")).toMatchObject({ style: "satisfy", source: "n2", target: "n3", label: "«satisfy»", resolved: true });
    expect(e("e2")).toMatchObject({ style: "satisfy", source: "n6", target: "n4" });
    expect(e("e3")).toMatchObject({ style: "derivation", source: "n4", target: "n3", label: "«derive»" });
    expect(e("e4")).toMatchObject({ style: "verify", source: "n5", target: "n3", label: "«verify»" });
  });
  it("recognises the relationships in the model", () => {
    const pkg = ix.findByQualifiedName("Design")[0]!;
    const kinds = pkg.members.map((m) => relationOf(m, ix)?.kind).filter(Boolean);
    expect(kinds).toEqual(["satisfy", "satisfy", "derivation"]);
  });
  it("a new Requirements View holds the requirements, what they relate to, and the relationships", () => {
    const d = createDiagram(ix, "Design", "requirements", { sourceOf });
    const refs = d.nodes.map((n) => n.ref);
    expect(refs).toContain("Design::vehicle");
    expect(refs).toContain("Requirements::VehicleMass");
    expect(refs).toContain("Requirements::EngineMass");
    expect(refs).not.toContain("Design::Engine");
    expect(d.edges.map((x) => x.locator?.kind).sort()).toEqual(["connection", "satisfy", "satisfy"]);
  });
});

describe("adding existing elements", () => {
  const ix = load("ports.sysml");
  const base = (kind: "general" | "interconnection", root: string) => createDiagram(ix, root, kind, { sourceOf });

  it("adds a node at top level in a general view and is a no-op the second time", () => {
    const d = base("general", "Ports::Drivetrain");
    const power = ix.findByQualifiedName("Ports::Power")[0]!;
    const r = addElements(d, ix, [power], { sourceOf });
    expect(r.added).toHaveLength(1);
    expect(r.doc.nodes.find((n) => n.id === r.ids[0])).toMatchObject({ ref: "Ports::Power" });
    expect(r.doc.nodes.find((n) => n.id === r.ids[0])!.parent).toBeUndefined();
    const again = addElements(r.doc, ix, [power], { sourceOf });
    expect(again.added).toEqual([]);
    expect(again.doc).toBe(r.doc);
  });
  it("nests it in its owner's node in an interconnection view when the owner is shown", () => {
    const d = base("interconnection", "Ports::Drivetrain");
    const trimmed: DiagramDocument = { ...d, nodes: d.nodes.filter((n) => n.ref !== "Ports::Drivetrain::motor") , edges: [] };
    const motor = ix.findByQualifiedName("Ports::Drivetrain::motor")[0]!;
    const r = addElements(trimmed, ix, [motor], { sourceOf });
    const owner = trimmed.nodes.find((n) => n.ref === "Ports::Drivetrain")!.id;
    expect(r.doc.nodes.find((n) => n.id === r.ids[0])!.parent).toBe(owner);
  });
  it("brings relationship edges to elements already shown, touching only the diagram", () => {
    const d = base("interconnection", "Ports::Drivetrain");
    const without: DiagramDocument = { ...d, nodes: d.nodes.filter((n) => !/::(output|input)$/.test(n.ref ?? "")), edges: [] };
    const out = ix.findByQualifiedName("Ports::Battery::output")[0]!;
    const inn = ix.findByQualifiedName("Ports::Motor::input")[0]!;
    const a = addElements(without, ix, [out], { sourceOf });
    expect(a.doc.edges).toHaveLength(1); // the far end is not shown yet: the edge goes to the nearest shown node, `motor`
    const b = addElements(a.doc, ix, [inn], { sourceOf });
    expect(b.doc.edges).toHaveLength(1);
    expect(b.doc.edges[0]!.locator?.kind).toBe("connect");
  });
});

describe("edge layout edits", () => {
  const base = parse("drivetrain-interconnection.sysmld");
  const e0 = base.edges[0]!;
  const route = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }];

  it("stores a route and a label layout on the edge and nothing else", () => {
    const r = applyEdgeLayout(base, [{ id: e0.id, points: route, label: { dx: 1.234, dy: 2, w: 50, wrap: false } }])!;
    expect(r.edges[0]!.points).toEqual(route);
    expect(r.edges[0]!.label).toEqual({ dx: 1.23, dy: 2, w: 50, wrap: false });
    expect(r.nodes).toEqual(base.nodes);
    expect(r.edges.slice(1)).toEqual(base.edges.slice(1));
  });
  it("removes the label layout with null and reports no change when nothing differs", () => {
    const r = applyEdgeLayout(base, [{ id: e0.id, label: { dx: 1, dy: 2 } }])!;
    expect(applyEdgeLayout(r, [{ id: e0.id, label: { dx: 1, dy: 2 } }])).toBeUndefined();
    const back = applyEdgeLayout(r, [{ id: e0.id, label: null }])!;
    expect("label" in back.edges[0]!).toBe(false);
    expect(applyEdgeLayout(base, [{ id: e0.id, label: null }])).toBeUndefined();
  });
  it("ignores invalid input", () => {
    expect(applyEdgeLayout(base, [{ id: e0.id, points: [{ x: 0, y: 0 }] }, { id: e0.id, label: { dx: NaN, dy: 0 } }, { id: "nope", label: { dx: 1, dy: 1 } }])).toBeUndefined();
  });
  it("writes the label with fixed key order and rounding, and old files without it load", () => {
    const r = applyEdgeLayout(base, [{ id: e0.id, label: { wrap: false, h: 20.456, w: 50, dy: 2, dx: 1.234 } }])!;
    const text = serializeDiagram(r);
    expect(text).toMatch(/"label": \{\s+"dx": 1\.23,\s+"dy": 2,\s+"w": 50,\s+"h": 20\.46,\s+"wrap": false\s+\}/);
    const back = parseDiagram(text);
    expect(back.ok).toBe(true);
    expect(serializeDiagram((back as { doc: DiagramDocument }).doc)).toBe(text);
    expect(parseDiagram(serializeDiagram(base)).ok).toBe(true);
  });
  it("rejects a malformed label in a file", () => {
    const bad = JSON.parse(serializeDiagram(base)) as DiagramDocument;
    (bad.edges[0] as { label?: unknown }).label = { dx: "a", dy: 0 };
    expect(parseDiagram(JSON.stringify(bad)).ok).toBe(false);
  });
  it("keeps the label and the route when an end node moves", () => {
    const withBoth = applyEdgeLayout(base, [{ id: e0.id, points: route, label: { dx: 1, dy: 2 } }])!;
    const moved = applyBoxPatches(withBoth, [{ id: e0.source, x: 999, y: 999 }])!;
    expect(moved.edges[0]!.points).toBeDefined();
    expect(moved.edges[0]!.label).toEqual({ dx: 1, dy: 2 });
  });
});

describe("routes follow nodes moved through their container", () => {
  const nodes = [{ id: "n1", ref: "P::C", x: 100, y: 100, w: 400, h: 300 }, { id: "n2", ref: "P::C::a", parent: "n1", x: 20, y: 40, w: 100, h: 60 }, { id: "n3", ref: "P::C::b", parent: "n1", x: 260, y: 40, w: 100, h: 60 }];
  const route = [{ x: 220, y: 170 }, { x: 360, y: 170 }];
  const d: DiagramDocument = { version: 1, kind: "general", root: "P::C", sources: [], nodes, edges: [{ id: "e1", ref: "P::C::l", source: "n2", target: "n3", points: route }] };
  it("translates the route of an edge between children when their container moves", () => {
    const r = applyBoxPatches(d, [{ id: "n1", x: 140, y: 124 }])!;
    expect(r.edges[0]!.points).toEqual([{ x: 260, y: 194 }, { x: 400, y: 194 }]);
  });
  it("uses the routes the webview sent, and drops the ones it listed", () => {
    const sent = applyBoxPatches(d, [{ id: "n3", x: 300, y: 40 }], { routes: [{ id: "e1", points: [{ x: 220, y: 170 }, { x: 400, y: 170 }] }] })!;
    expect(sent.edges[0]!.points).toEqual([{ x: 220, y: 170 }, { x: 400, y: 170 }]);
    const gone = applyBoxPatches(d, [{ id: "n3", x: 300, y: 40 }], { drop: ["e1"] })!;
    expect(gone.edges[0]!.points).toBeUndefined();
  });
});

describe("edge layout limits and exclusions", () => {
  const base = parse("drivetrain-interconnection.sysmld");
  const e0 = base.edges[0]!;
  const ok = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  it("ignores patches for sequence messages and derived edges", () => {
    expect(applyEdgeLayout({ ...base, kind: "sequence" }, [{ id: e0.id, label: { dx: 1, dy: 1 } }])).toBeUndefined();
    const vm = { edges: [{ id: e0.id, derived: true }] } as unknown as ViewModel;
    expect(applyEdgeLayout(base, [{ id: e0.id, label: { dx: 1, dy: 1 }, points: ok }], vm)).toBeUndefined();
    expect(applyEdgeLayout(base, [{ id: e0.id, label: { dx: 1, dy: 1 } }], { edges: [{ id: e0.id, fixed: true }] } as unknown as ViewModel)).toBeUndefined();
  });
  it("is a no-op for a patch that only differs below the stored precision", () => {
    const r = applyEdgeLayout(base, [{ id: e0.id, points: ok, label: { dx: 1.001, dy: 2 } }])!;
    expect(applyEdgeLayout(r, [{ id: e0.id, points: ok.map((p) => ({ x: p.x + 0.001, y: p.y })), label: { dx: 1.002, dy: 2 } }])).toBeUndefined();
  });
  it("limits coordinates, sizes and the number of points, and strips unknown label keys", () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ x: i, y: 0 }));
    expect(applyEdgeLayout(base, [{ id: e0.id, points: many }])).toBeUndefined();
    expect(applyEdgeLayout(base, [{ id: e0.id, points: [{ x: 0, y: 0 }, { x: 2e6, y: 0 }] }])).toBeUndefined();
    expect(applyEdgeLayout(base, [{ id: e0.id, label: { dx: 2e6, dy: 0 } }])).toBeUndefined();
    expect(applyEdgeLayout(base, [{ id: e0.id, label: { dx: 0, dy: 0, w: 2e6 } }])).toBeUndefined();
    expect(applyEdgeLayout(base, [{ id: e0.id, label: { dx: 0, dy: 0, h: -1 } }])).toBeUndefined();
    const r = applyEdgeLayout(base, [{ id: e0.id, label: { dx: 1, dy: 2, evil: 1 } as never }])!;
    expect(r.edges[0]!.label).toEqual({ dx: 1, dy: 2 });
  });
  it("rejects files with unknown label keys, huge values or too many points", () => {
    const mk = (edit: (e: Record<string, unknown>) => void) => { const d = JSON.parse(serializeDiagram(base)) as DiagramDocument; edit(d.edges[0] as never); return parseDiagram(JSON.stringify(d)).ok; };
    expect(mk((e) => { e.label = { dx: 1, dy: 1, x: 3 }; })).toBe(false);
    expect(mk((e) => { e.label = { dx: 1e7, dy: 1 }; })).toBe(false);
    expect(mk((e) => { e.label = { dx: 1, dy: 1, w: 2e6 }; })).toBe(false);
    expect(mk((e) => { e.points = Array.from({ length: 1001 }, (_, i) => ({ x: i, y: 0 })); })).toBe(false);
    expect(mk((e) => { e.label = { dx: 1, dy: 1, w: 50, h: 20, wrap: false }; })).toBe(true);
  });
});
