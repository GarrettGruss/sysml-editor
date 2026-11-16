import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "./format.js";
import { DiagramState } from "./session.js";
import { serializeDiagram } from "./format.js";
import { activeAspect, applyAspect, applyCompartments, aspectsOf, deleteAspect, keepNewNodesVisible, saveAspect, visibleDocument } from "./style.js";

const doc: DiagramDocument = {
  version: 1, kind: "general", root: "P", sources: [],
  nodes: [{ id: "n1", ref: "P::A", x: 0, y: 0, w: 100, h: 90 }, { id: "n2", ref: "P::B" }, { id: "n3", ref: "P::C" }, { id: "n4", ref: "P::A::x", parent: "n1" }],
  edges: [{ id: "e1", ref: "P::r", source: "n1", target: "n2" }, { id: "e2", ref: "P::s", source: "n2", target: "n3" }],
};

describe("compartments", () => {
  it("hides compartments of one node, drops its stored height and keeps other keys", () => {
    const d = applyCompartments({ ...doc, nodes: [{ ...doc.nodes[0]!, style: { fill: "red" } }, ...doc.nodes.slice(1)] }, "n1", ["attributes"])!;
    expect(d.nodes[0]).toEqual({ id: "n1", ref: "P::A", x: 0, y: 0, w: 100, style: { fill: "red", hiddenCompartments: ["attributes"] } });
    const back = applyCompartments(d, "n1", [])!;
    expect(back.nodes[0]!.style).toEqual({ fill: "red" });
    expect(applyCompartments(back, "n1", [])).toBeUndefined();
    expect(applyCompartments(doc, "nope", ["parts"])).toBeUndefined();
  });
  it("removes an empty node style", () => {
    const d = applyCompartments(doc, "n1", ["doc"])!;
    expect("style" in applyCompartments(d, "n1", [])!.nodes[0]!).toBe(false);
  });
});

describe("aspects", () => {
  it("saves, applies, clears and deletes", () => {
    const saved = saveAspect(doc, "Power", ["n1", "n2", "gone"])!;
    expect(aspectsOf(saved)).toEqual({ Power: ["n1", "n2"] });
    expect(saveAspect(doc, " ", ["n1"])).toBeUndefined();
    const on = applyAspect(saved, "Power")!;
    expect(activeAspect(on)).toBe("Power");
    expect(applyAspect(on, "Power")).toBeUndefined();
    expect(applyAspect(saved, "Nope")).toBeUndefined();
    const off = applyAspect(on, undefined)!;
    expect(activeAspect(off)).toBeUndefined();
    expect(applyAspect(off, undefined)).toBeUndefined();
    expect(off.style).toEqual({ aspects: { Power: ["n1", "n2"] } });
    const gone = deleteAspect(on, "Power")!;
    expect("style" in gone).toBe(false);
  });
  it("shows only the listed nodes and the lines among them, and ignores ids that vanished", () => {
    const on = applyAspect(saveAspect(doc, "A", ["n1", "n2", "n4", "vanished"])!, "A")!;
    const v = visibleDocument(on);
    expect(v.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n4"]);
    expect(v.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(visibleDocument(applyAspect(saveAspect(doc, "B", ["n4"])!, "B")!).nodes).toEqual([]);
    expect(visibleDocument(doc)).toBe(doc);
  });
});

describe("a node added while an aspect is applied", () => {
  it("joins the applied aspect and stays visible", () => {
    const applied = applyAspect(saveAspect(doc, "Power", ["n1", "n2"])!, "Power")!;
    const added = { ...applied, nodes: [...applied.nodes, { id: "n9", ref: "P::New" }] };
    const kept = keepNewNodesVisible(applied, added);
    expect(aspectsOf(kept).Power).toEqual(["n1", "n2", "n9"]);
    expect(visibleDocument(kept).nodes.map((n) => n.id)).toEqual(["n1", "n2", "n9"]);
    // Clearing shows everything, and the other aspects are untouched.
    expect(applyAspect(kept, undefined)!.nodes).toHaveLength(5);
  });
  it("changes nothing without an applied aspect or a new node", () => {
    const added = { ...doc, nodes: [...doc.nodes, { id: "n9", ref: "P::New" }] };
    expect(keepNewNodesVisible(doc, added)).toBe(added);
    const applied = applyAspect(saveAspect(doc, "Power", ["n1"])!, "Power")!;
    expect(keepNewNodesVisible(applied, applied)).toBe(applied);
  });
  it("applies to an edit of the document state, and survives undo and redo", () => {
    const applied = applyAspect(saveAspect(doc, "Power", ["n1", "n2"])!, "Power")!;
    const st = new DiagramState(serializeDiagram(applied));
    const e = st.apply({ ...st.doc!, nodes: [...st.doc!.nodes, { id: "n9", ref: "P::New" }] });
    expect(aspectsOf(st.doc!).Power).toContain("n9");
    e.undo();
    expect(st.doc!.nodes.some((n) => n.id === "n9")).toBe(false);
    e.redo();
    expect(aspectsOf(st.doc!).Power).toContain("n9");
  });
});
