import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import type { DiagramDocument } from "./format.js";
import { resolveDiagram } from "./resolve.js";
import { buildViewModel } from "./view-model.js";

const MODEL = `package M {
  port def Pw;
  part def Vehicle {
    part engine;
    port drive : Pw;
  }
  part vehicle1 : Vehicle {
    part battery;
  }
}`;

function vm(doc: DiagramDocument) {
  const ix = new ModelIndex();
  ix.setDocument("file:///w/m.sysml", MODEL);
  return buildViewModel(doc, resolveDiagram(doc, ix), ix);
}

describe("inherited features in the view model", () => {
  it("an Interconnection View of a usage marks the inherited parts and ports on the diagram, not its own parts", () => {
    const doc: DiagramDocument = {
      version: 1, kind: "interconnection", root: "M::vehicle1", sources: ["m.sysml"],
      nodes: [
        { id: "n1", ref: "M::vehicle1" },
        { id: "n2", ref: "M::Vehicle::engine", parent: "n1" },
        { id: "n3", ref: "M::vehicle1::battery", parent: "n1" },
        { id: "n4", ref: "M::Vehicle::drive", parent: "n1" },
      ],
      edges: [],
    };
    const nodes = vm(doc).nodes;
    expect(nodes.find((n) => n.id === "n2")!.inherited).toEqual({ from: "M::Vehicle" });
    expect(nodes.find((n) => n.id === "n4")!.inherited).toEqual({ from: "M::Vehicle" });
    expect(nodes.find((n) => n.id === "n3")!.inherited).toBeUndefined();
    expect(nodes.find((n) => n.id === "n1")!.inherited).toBeUndefined();
  });

  it("the definition's own view marks nothing as inherited and does not auto-add inherited nodes", () => {
    const doc: DiagramDocument = { version: 1, kind: "interconnection", root: "M::Vehicle", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "M::Vehicle" }, { id: "n2", ref: "M::Vehicle::engine", parent: "n1" }], edges: [] };
    const nodes = vm(doc).nodes;
    expect(nodes.every((n) => n.inherited === undefined)).toBe(true);
    expect(nodes).toHaveLength(2);
  });

  it("a usage node in a General View lists its inherited features in compartments, flagged", () => {
    const doc: DiagramDocument = { version: 1, kind: "general", root: "M", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "M::vehicle1" }], edges: [] };
    const c = vm(doc).nodes[0]!.compartments!;
    const parts = c.find((x) => x.title === "parts")!;
    expect(parts.lines).toEqual(["engine"]);
    expect(parts.inherited).toEqual({ 0: "M::Vehicle" });
    expect(c.find((x) => x.title === "ports")!.lines).toEqual(["drive : Pw"]);
  });
});
