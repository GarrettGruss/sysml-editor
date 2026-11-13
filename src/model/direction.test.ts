import { describe, expect, it } from "vitest";
import { ModelIndex } from "./index.js";
import { invokeTool, type ToolContext, type ToolResult } from "../agent-tools/index.js";
import type { DiagramDocument } from "../diagram/format.js";
import { resolveDiagram } from "../diagram/resolve.js";
import { buildViewModel } from "../diagram/view-model.js";

const TEXT = `package P { item def ShipCommand; part def Frigate {
  in scanCommand : ShipCommand;
  out defenseStatus : ShipCommand;
  inout both : ShipCommand;
  in part drive : ShipCommand;
  attribute plain : ShipCommand;
} }`;
const index = new ModelIndex();
index.setDocument("file:///w/p.sysml", TEXT);
const frigate = index.findByQualifiedName("P::Frigate")[0]!;

describe("feature direction", () => {
  const dir = (n: string) => frigate.members.find((m) => m.name === n)?.direction;
  it("is recorded on features", () => {
    expect(dir("scanCommand")).toBe("in");
    expect(dir("defenseStatus")).toBe("out");
    expect(dir("both")).toBe("inout");
    expect(dir("drive")).toBe("in");
    expect(dir("plain")).toBeUndefined();
    expect(frigate.direction).toBeUndefined();
  });

  it("a directed feature compartment is titled parameters and shows the direction", () => {
    const doc: DiagramDocument = { version: 1, kind: "general", root: "P::Frigate", sources: ["p.sysml"], nodes: [{ id: "n1", ref: "P::Frigate" }], edges: [] };
    const node = buildViewModel(doc, resolveDiagram(doc, index), index).nodes[0]!;
    const c = node.compartments!.find((x) => x.title === "parameters")!;
    expect(c.lines).toEqual(["in scanCommand : ShipCommand", "out defenseStatus : ShipCommand", "inout both : ShipCommand", "in drive : ShipCommand"]);
    expect(node.compartments!.find((x) => x.title === "attributes")!.lines).toEqual(["plain : ShipCommand"]);
  });

  it("agent read tools report it", () => {
    const ctx: ToolContext = { index, uriToPath: (u) => u.slice("file:///w/".length), pathToUri: (p) => "file:///w/" + p };
    const r = JSON.parse((invokeTool("sysml_get_element", { qualifiedName: "P::Frigate" }, ctx) as ToolResult).text);
    expect(r.elements[0].ownedMembers.find((m: { name: string }) => m.name === "defenseStatus").direction).toBe("out");
    const m = JSON.parse((invokeTool("sysml_get_element", { qualifiedName: "P::Frigate::defenseStatus" }, ctx) as ToolResult).text);
    expect(m.elements[0].direction).toBe("out");
  });
});
