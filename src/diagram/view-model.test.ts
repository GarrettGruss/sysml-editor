import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "./format.js";
import { reconcile } from "./reconcile.js";
import { resolveDiagram } from "./resolve.js";
import { DiagramState, applyLayout, decideSave, followRename, hashViewModel, noteExternalChange, refresh, validBox } from "./session.js";
import { buildViewModel } from "./view-model.js";

const dir = new URL("../../test/fixtures/workspace-basic/", import.meta.url);
const read = (n: string) => readFileSync(new URL(n, dir), "utf8");
function fixtureIndex(): ModelIndex {
  const ix = new ModelIndex();
  ix.setDocument("file:///ws/ports.sysml", read("ports.sysml"));
  return ix;
}
function vmOf(file: string, ix = fixtureIndex()) {
  const r = parseDiagram(read(file));
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return buildViewModel(r.doc, resolveDiagram(r.doc, ix), ix);
}

describe("fixture diagrams", () => {
  it("are canonical, so open and save is byte-identical", () => {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sysmld") && n !== "invalid.sysmld")) {
      const r = parseDiagram(read(f));
      expect(r.ok, f).toBe(true);
      if (r.ok) expect(serializeDiagram(r.doc), f).toBe(read(f));
    }
  });
  it("invalid.sysmld does not parse", () => {
    expect(parseDiagram(read("invalid.sysmld")).ok).toBe(false);
  });
});

describe("view model: general view", () => {
  const vm = vmOf("ports-general.sysmld");
  const node = (id: string) => vm.nodes.find((n) => n.id === id)!;

  it("shapes, keywords and labels", () => {
    expect(node("n2")).toMatchObject({ shape: "definition", keyword: "«part def»", label: "Battery", resolved: true });
    expect(node("n5")).toMatchObject({ shape: "usage", keyword: "«part»", label: "battery : Battery" });
    expect(node("n2").geometry).toEqual({ x: 40, y: 260 });
  });
  it("compartments list members that are not shown as nodes", () => {
    expect(node("n4").compartments).toEqual([
      { title: "parts", lines: ["motor : Motor"] },
      { title: "ports", lines: ["supply : Power"] },
    ]);
    expect(node("n2").compartments).toEqual([{ title: "ports", lines: ["output : Power"] }]);
  });
  it("derives composition and typing edges that are not stored", () => {
    const keys = vm.edges.map((e) => `${e.style} ${e.source}->${e.target}`).sort();
    expect(keys).toEqual(["composition n4->n5", "typing n5->n2"]);
    expect(vm.edges.every((e) => e.derived)).toBe(true);
  });
});

describe("view model: specialization and unresolved", () => {
  it("derives specialization between shown definitions and marks unresolved items", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/m.sysml", "package P { part def A; part def B :> A; }");
    const doc: DiagramDocument = {
      version: 1, kind: "general", root: "P", sources: ["m.sysml"],
      nodes: [{ id: "n1", ref: "P::A" }, { id: "n2", ref: "P::B" }, { id: "n3", ref: "P::Gone" }],
      edges: [],
    };
    const vm = buildViewModel(doc, resolveDiagram(doc, ix), ix);
    expect(vm.edges.map((e) => `${e.style} ${e.source}->${e.target}`)).toEqual(["specialization n2->n1"]);
    expect(vm.nodes[2]).toMatchObject({ shape: "unresolved", resolved: false, unresolvedRef: "P::Gone", label: "Gone" });
  });
  it("requirements show <short> name and documentation", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/m.sysml", "package P { requirement def <R1> MaxMass { doc /* Mass shall be low */ } }");
    const doc: DiagramDocument = { version: 1, kind: "requirements", root: "P", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "P::MaxMass" }], edges: [] };
    const n = buildViewModel(doc, resolveDiagram(doc, ix), ix).nodes[0]!;
    expect(n).toMatchObject({ shape: "requirement", label: "<R1> MaxMass", keyword: "«requirement def»" });
    expect(n.doc).toContain("Mass shall be low");
  });
});

describe("view model: descriptions (D35)", () => {
  const text = "package P { part def Engine { doc /* Burns *\\/ fuel */ } part engine : Engine; }";
  const build = (style?: Record<string, unknown>) => {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/m.sysml", text);
    const doc: DiagramDocument = { version: 1, kind: "general", root: "P", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "P::Engine" }, { id: "n2", ref: "P::engine" }], edges: [], ...(style ? { style } : {}) };
    return buildViewModel(doc, resolveDiagram(doc, ix), ix);
  };
  it("shows the first doc of any node, with the star-slash convention undone", () => {
    const vm = build();
    expect(vm.descriptions).toBe(true);
    expect(vm.nodes[0]!.doc).toBe("Burns */ fuel");
    expect(vm.nodes[0]!.props?.documentation).toBe("Burns */ fuel");
    expect(vm.nodes[1]!.doc).toBeUndefined();
  });
  it("hides them when the diagram style says so, the element keeps its documentation", () => {
    const vm = build({ descriptions: false });
    expect(vm.descriptions).toBe(false);
    expect(vm.nodes[0]!.doc).toBeUndefined();
    expect(vm.nodes[0]!.props?.documentation).toBe("Burns */ fuel");
  });
});

describe("view model: interconnection view", () => {
  const vm = vmOf("drivetrain-interconnection.sysmld");
  it("ports attach to their owner and the connection ends on the port nodes", () => {
    const port = vm.nodes.find((n) => n.id === "n3")!;
    expect(port).toMatchObject({ shape: "port", attachedTo: "n1" });
    expect(port.parent).toBeUndefined();
    expect(vm.nodes.find((n) => n.id === "n1")).toMatchObject({ shape: "usage", parent: "n0" });
    expect(vm.edges).toEqual([expect.objectContaining({ id: "e1", style: "connection", source: "n3", target: "n4", derived: false })]);
  });
  it("a connection end falls back to the part node when its port is not shown", () => {
    const r = parseDiagram(read("drivetrain-interconnection.sysmld"));
    if (!r.ok) throw new Error();
    const doc = { ...r.doc, nodes: r.doc.nodes.filter((n) => n.id !== "n3" && n.id !== "n4"), edges: r.doc.edges.map((e) => ({ ...e, source: "n1", target: "n2" })) };
    const ix = fixtureIndex();
    const e = buildViewModel(doc, resolveDiagram(doc, ix), ix).edges[0]!;
    expect([e.source, e.target]).toEqual(["n1", "n2"]);
  });
});

describe("ports without an owner on the diagram", () => {
  it("are labelled boxes, not bare port rectangles", () => {
    const r = parseDiagram(read("drivetrain-interconnection.sysmld"));
    if (!r.ok) throw new Error("fixture");
    const doc = { ...r.doc, nodes: r.doc.nodes.filter((n) => n.id !== "n1") };
    const ix = fixtureIndex();
    const vm = buildViewModel(doc, resolveDiagram(doc, ix), ix);
    const n3 = vm.nodes.find((n) => n.id === "n3")!;
    expect(n3.shape).not.toBe("port");
    expect(n3.attachedTo).toBeUndefined();
    expect(n3.label).toContain("output");
    expect(n3.label).toContain(":");
  });
});

describe("session", () => {
  it("tracks dirty state, undo and redo", () => {
    const s = new DiagramState(read("ports-general-auto.sysmld"));
    expect(s.dirty).toBe(false);
    const edit = s.apply(applyLayout(s.doc!, [{ id: "n1", x: 1, y: 2, w: 3, h: 4 }])!);
    expect(s.dirty).toBe(true);
    edit.undo();
    expect(s.dirty).toBe(false);
    edit.redo();
    expect(s.dirty).toBe(true);
    s.markSaved();
    expect(s.dirty).toBe(false);
  });
  it("a file that does not parse keeps its text and is never rewritten", () => {
    const s = new DiagramState(read("invalid.sysmld"));
    expect(s.doc).toBeUndefined();
    expect(s.problems?.length).toBeGreaterThan(0);
    expect(s.text()).toBe(read("invalid.sysmld"));
  });
  it("layout fills only nodes without positions", () => {
    const s = new DiagramState(read("ports-general.sysmld"));
    const next = applyLayout(s.doc!, [{ id: "n1", x: 999, y: 999, w: 10, h: 10 }]);
    expect(next).toBeUndefined();
    const auto = new DiagramState(read("ports-general-auto.sysmld"));
    const placed = applyLayout(auto.doc!, [{ id: "n1", x: 5, y: 6, w: 7, h: 8 }])!;
    expect(placed.nodes.find((n) => n.id === "n1")).toMatchObject({ x: 5, y: 6, w: 7, h: 8 });
  });
  it("a rename typed in the text editor becomes one proposed edit, using the kept snapshot", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/ports.sysml", read("ports.sysml"));
    const s = new DiagramState(read("ports-general.sysmld"));
    expect(refresh(s, ix)!.renamed).toBeUndefined();
    ix.setDocument("file:///ws/ports.sysml", read("ports.sysml").replace("part def Battery", "part def Accumulator"));
    const r = refresh(s, ix)!;
    expect(r.renamed?.nodes.find((n) => n.id === "n2")?.ref).toBe("Ports::Accumulator");
    expect(r.viewModel.nodes.find((n) => n.id === "n2")?.label).toBe("Accumulator");
    expect(reconcile(r.renamed!, ix).unresolved).toEqual([]);
  });

  const renamedIndex = () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/ports.sysml", read("ports.sysml"));
    return ix;
  };
  const rename = (ix: ModelIndex) => ix.setDocument("file:///ws/ports.sysml", read("ports.sysml").replace("part def Battery", "part def Accumulator"));

  it("undo and redo do nothing after a reload, and the dirty state stays correct", () => {
    const s = new DiagramState(read("ports-general-auto.sysmld"));
    const edit = s.apply(applyLayout(s.doc!, [{ id: "n1", x: 1, y: 2, w: 3, h: 4 }])!);
    expect(s.dirty).toBe(true);
    s.load(read("ports-general.sysmld"));
    const before = s.doc;
    expect(s.dirty).toBe(false);
    expect(edit.undo()).toBe(false);
    expect(edit.redo()).toBe(false);
    expect(s.doc).toBe(before);
    expect(s.dirty).toBe(false);
  });
  it("layout merges in memory without dirtying or creating an undo entry", () => {
    const s = new DiagramState(read("ports-general-auto.sysmld"));
    expect(s.mergeLayout([{ id: "n1", x: 5, y: 6, w: 7, h: 8 }])).toBe(true);
    expect(s.dirty).toBe(false);
    expect(s.doc!.nodes.find((n) => n.id === "n1")).toMatchObject({ x: 5, y: 6 });
    expect(s.disk).toBe(read("ports-general-auto.sysmld"));
  });
  it("rename follow writes only the reference change to disk; memory keeps pending layout; dirty is unchanged", () => {
    const ix = renamedIndex();
    const s = new DiagramState(read("ports-general-auto.sysmld"));
    refresh(s, ix);
    s.mergeLayout([{ id: "n1", x: 5, y: 6, w: 7, h: 8 }]);
    rename(ix);
    const r = refresh(s, ix)!;
    const f = followRename(s, r.updates!, s.disk);
    expect(f.kind).toBe("write");
    if (f.kind !== "write") return;
    const onDisk = parseDiagram(f.text);
    if (!onDisk.ok) throw new Error("disk text");
    expect(onDisk.doc.nodes.find((n) => n.id === "n2")?.ref).toBe("Ports::Accumulator");
    expect(onDisk.doc.nodes.every((n) => n.x === undefined)).toBe(true);
    expect(s.doc!.nodes.find((n) => n.id === "n2")?.ref).toBe("Ports::Accumulator");
    expect(s.doc!.nodes.find((n) => n.id === "n1")).toMatchObject({ x: 5, y: 6 });
    expect(s.dirty).toBe(false);
    expect(s.disk).toBe(f.text);
    expect(noteExternalChange(s, f.text)).toBe("ignore");
  });
  it("rename follow applies to the file as it is on disk after an external change", () => {
    const ix = renamedIndex();
    const s = new DiagramState(read("ports-general.sysmld"));
    refresh(s, ix);
    rename(ix);
    const r = refresh(s, ix)!;
    const external = read("ports-general-auto.sysmld");
    // clean document: reload and detect again
    expect(followRename(s, r.updates!, external).kind).toBe("reloaded");
    expect(s.disk).toBe(external);
    // dirty document: apply on top of the external text and flag the conflict
    const d = new DiagramState(read("ports-general.sysmld"));
    refresh(d, ix);
    d.apply({ ...d.doc!, nodes: d.doc!.nodes.map((n) => (n.id === "n1" ? { ...n, x: 9 } : n)) });
    const ix2 = renamedIndex();
    refresh(d, ix2);
    rename(ix2);
    const r2 = refresh(d, ix2)!;
    const f = followRename(d, r2.updates!, external);
    expect(f.kind).toBe("write");
    expect(d.conflicted).toBe(true);
    expect(d.dirty).toBe(true);
  });
  it("external changes: reload when clean, conflict once when dirty", () => {
    const s = new DiagramState(read("ports-general.sysmld"));
    expect(noteExternalChange(s, read("ports-general.sysmld"))).toBe("ignore");
    expect(noteExternalChange(s, read("ports-general-auto.sysmld"))).toBe("reload");
    expect(s.disk).toBe(read("ports-general-auto.sysmld"));
    s.apply({ ...s.doc!, nodes: s.doc!.nodes.map((n) => (n.id === "n1" ? { ...n, x: 9 } : n)) });
    expect(noteExternalChange(s, read("ports-general.sysmld"))).toBe("conflict");
    expect(noteExternalChange(s, read("drivetrain-interconnection.sysmld"))).toBe("ignore");
    expect(s.dirty).toBe(true);
  });
  it("save decisions: conflict when the disk changed, unparsed never writes, missing file writes", () => {
    const s = new DiagramState(read("ports-general.sysmld"));
    expect(decideSave(s, read("ports-general.sysmld"))).toBe("write");
    expect(decideSave(s, read("ports-general-auto.sysmld"))).toBe("conflict");
    expect(decideSave(s, undefined)).toBe("write");
    s.markSaved();
    expect(s.conflicted).toBe(false);
    const bad = new DiagramState("");
    bad.loadDirty("{ not json", read("ports-general.sysmld"));
    expect(bad.dirty).toBe(true);
    expect(decideSave(bad, read("ports-general.sysmld"))).toBe("unparsed");
    expect(new DiagramState(read("invalid.sysmld")).doc).toBeUndefined();
  });
  it("validates boxes from the webview", () => {
    const ok = { id: "n1", x: 1, y: 2, w: 3, h: 4 };
    expect(validBox(ok)).toBe(true);
    for (const bad of [{ ...ok, x: NaN }, { ...ok, y: Infinity }, { ...ok, w: 0 }, { ...ok, h: -1 }, { ...ok, x: 1e12 }, { ...ok, w: "3" as never }]) expect(validBox(bad)).toBe(false);
    const s = new DiagramState(read("ports-general-auto.sysmld"));
    expect(s.mergeLayout([{ id: "zzz", x: 1, y: 2, w: 3, h: 4 }, { ...ok, w: 0 }, { ...ok, x: NaN }])).toBe(false);
    expect(s.doc!.nodes.find((n) => n.id === "n1")!.x).toBeUndefined();
  });
  it("hashes view models stably", () => {
    expect(hashViewModel(vmOf("ports-general.sysmld"))).toBe(hashViewModel(vmOf("ports-general.sysmld")));
    expect(hashViewModel(vmOf("ports-general.sysmld"))).not.toBe(hashViewModel(vmOf("ports-general-auto.sysmld")));
  });
});
