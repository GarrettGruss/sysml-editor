import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "./format.js";
import { reconcile } from "./reconcile.js";
import { resolveDiagram } from "./resolve.js";
import { DiagramState, applyLayout, refresh } from "./session.js";
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
});
