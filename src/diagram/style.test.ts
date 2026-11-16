import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "./format.js";
import { activeAspect, applyAspect, applyCompartments, aspectsOf, deleteAspect, saveAspect, visibleDocument } from "./style.js";

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
