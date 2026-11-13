import { describe, expect, it } from "vitest";
import { ModelIndex, LIBRARY_URI_SCHEME } from "../model/index.js";
import { invokeTool, toolDefinitions, NODE_CAP, type ToolContext, type ToolResult } from "./index.js";

/** The existing tools are synchronous. */
const callTool = (name: string, input: unknown, ctx: ToolContext) => invokeTool(name, input, ctx) as ToolResult;

const ROOT = "file:///w/";
function setup(files: Record<string, string>): ToolContext {
  const index = new ModelIndex();
  for (const [p, t] of Object.entries(files)) index.setDocument(ROOT + p, t);
  index.setDocument(`${LIBRARY_URI_SCHEME}:///Lib.sysml`, "standard library package Lib { part def LibPart { part inner; } }");
  return {
    index,
    uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
    pathToUri: (p) => (index.getDocument(ROOT + p) ? ROOT + p : undefined),
  };
}
const run = (ctx: ToolContext, name: string, input: unknown = {}) => callTool(name, input, ctx);
const ok = (r: ToolResult) => {
  expect(r.isError).toBeUndefined();
  return JSON.parse(r.text);
};

const VEHICLE = `package VehicleModel {
  private import Lib::*;
  doc /* A vehicle model */
  part def Engine;
  part def Vehicle {
    doc /* The vehicle */
    part engine : Engine [1];
    part wheels : Wheel [4];
    connect engine to wheels;
    part { part deep; }
  }
  part def Wheel;
}`;

describe("tool definitions", () => {
  it("are snake_case and described; the model tools are read-only", () => {
    expect(toolDefinitions.map((t) => t.name)).toEqual([
      "sysml_list_files", "sysml_get_element_tree", "sysml_get_element", "sysml_validate",
      "sysml_list_diagrams", "sysml_read_diagram", "sysml_create_diagram", "sysml_add_to_diagram", "sysml_remove_from_diagram", "sysml_layout_diagram", "sysml_get_editor_context",
      "sysml_create_element", "sysml_delete_element", "sysml_rename_element", "sysml_set_element_properties", "sysml_create_relationship", "sysml_set_transition",
      "sysml_read_requirements_document", "sysml_create_requirement", "sysml_read_verification_matrix",
    ]);
    for (const t of toolDefinitions) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      if (!/diagram|requirements_document|verification_matrix|_create_|_delete_|_rename_|_set_/.test(t.name)) expect(t.readOnly).toBe(true);
      if (/_create_element|_delete_element|_rename_element|_set_element|_create_relationship/.test(t.name)) expect(t.readOnly).toBe(false);
      expect(t.description.length).toBeGreaterThan(80);
      expect(t.inputSchema.type).toBe("object");
    }
  });
  it("reports unknown tools and bad input as errors", () => {
    const ctx = setup({});
    const u = run(ctx, "nope");
    expect(u.isError).toBe(true);
    expect(u.text).toContain("Unknown tool");
    expect(u.text).toContain("sysml_list_files");
    expect(run(ctx, "sysml_get_element", {}).text).toContain("qualifiedName is required");
    expect(run(ctx, "sysml_get_element_tree", { depth: 0 }).text).toContain(">= 1");
    expect(run(ctx, "sysml_get_element_tree", { depth: 11 }).text).toContain("<= 10");
    expect(run(ctx, "sysml_get_element_tree", { depth: "2" }).text).toContain("must be a number");
    expect(run(ctx, "sysml_validate", { bogus: 1 }).text).toContain("not a known property");
    expect(run(ctx, "sysml_list_files", "x").isError).toBe(true);
  });
});

describe("sysml_list_files", () => {
  it("lists workspace files with root packages and syntax-error flag, not library files", () => {
    const ctx = setup({ "b/v.sysml": VEHICLE, "a.sysml": "package A { part def X;", "c.sysml": "package C1 {} package C2 {}" });
    expect(ok(run(ctx, "sysml_list_files")).files).toEqual([
      { path: "a.sysml", rootPackages: [], hasSyntaxErrors: true },
      { path: "b/v.sysml", rootPackages: ["VehicleModel"], hasSyntaxErrors: false },
      { path: "c.sysml", rootPackages: ["C1", "C2"], hasSyntaxErrors: false },
    ]);
  });
});

describe("sysml_get_element_tree", () => {
  const ctx = () => setup({ "v.sysml": VEHICLE });
  it("defaults to workspace roots, depth 2, no imports/docs, no library", () => {
    const { nodes } = ok(run(ctx(), "sysml_get_element_tree"));
    expect(nodes).toHaveLength(1);
    const p = nodes[0];
    expect(p.qualifiedName).toBe("VehicleModel");
    expect(p.children.map((c: any) => c.name)).toEqual(["Engine", "Vehicle", "Wheel"]);
    expect(JSON.stringify(nodes)).not.toContain("LibPart");
    expect(JSON.stringify(nodes)).not.toContain("import");
  });
  it("Depth limit: truncated elements say how many members they have", () => {
    const { nodes } = ok(run(ctx(), "sysml_get_element_tree"));
    const vehicle = nodes[0].children.find((c: any) => c.name === "Vehicle");
    expect(vehicle.truncated).toBe(true);
    expect(vehicle.childCount).toBe(4);
    expect(vehicle.children).toBeUndefined();
    const engine = nodes[0].children.find((c: any) => c.name === "Engine");
    expect(engine.truncated).toBeUndefined();
  });
  it("honours depth and returns a subtree by qualified name", () => {
    expect(ok(run(ctx(), "sysml_get_element_tree", { depth: 1 })).nodes[0]).toMatchObject({ truncated: true, childCount: 3 });
    const { nodes } = ok(run(ctx(), "sysml_get_element_tree", { root: "VehicleModel::Vehicle", depth: 3 }));
    expect(nodes).toHaveLength(1);
    const kids = nodes[0].children;
    expect(kids.map((k: any) => k.kind)).toEqual(["part", "part", "connect", "part"]);
    expect(kids[0]).toMatchObject({ qualifiedName: "VehicleModel::Vehicle::engine", name: "engine", type: "Engine" });
    expect(nodes[0].truncated).toBeUndefined();
  });
  it("describes unnamed elements with a locator", () => {
    const { nodes } = ok(run(ctx(), "sysml_get_element_tree", { root: "VehicleModel::Vehicle" }));
    const unnamed = nodes[0].children.filter((c: any) => c.qualifiedName === undefined);
    expect(unnamed.map((c: any) => c.locator)).toEqual([
      { kind: "connect", ends: ["engine", "wheels"], owner: "VehicleModel::Vehicle" },
      { kind: "part", ends: [], owner: "VehicleModel::Vehicle" },
    ]);
    expect(unnamed[0].name).toBeUndefined();
  });
  it("returns library content only when root names it", () => {
    const { nodes } = ok(run(ctx(), "sysml_get_element_tree", { root: "Lib" }));
    expect(nodes[0].qualifiedName).toBe("Lib");
    expect(nodes[0].children[0].name).toBe("LibPart");
  });
  it("caps the number of nodes and says so", () => {
    const parts = Array.from({ length: NODE_CAP + 50 }, (_, i) => `part p${i};`).join("\n");
    const c = setup({ "big.sysml": `package Big { ${parts} }` });
    const r = ok(run(c, "sysml_get_element_tree"));
    expect(r.nodes[0].children).toHaveLength(NODE_CAP - 1);
    expect(r.nodes[0]).toMatchObject({ truncated: true, childCount: NODE_CAP + 50 });
    expect(r.note).toMatch(/cap of 500.*subtree/);
    expect(ok(run(ctx(), "sysml_get_element_tree")).note).toBeUndefined();
  });
  it("errors for a missing root with the closest existing prefix", () => {
    const r = run(ctx(), "sysml_get_element_tree", { root: "VehicleModel::Nope" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Closest existing prefix: "VehicleModel"');
  });
});

describe("sysml_get_element", () => {
  it("Inspect element: kind, owned members, relationships, file and lines", () => {
    const c = setup({ "m/v.sysml": VEHICLE });
    const { elements } = ok(run(c, "sysml_get_element", { qualifiedName: "VehicleModel::Vehicle" }));
    expect(elements).toHaveLength(1);
    const e = elements[0];
    expect(e).toMatchObject({
      kind: "part def", name: "Vehicle", qualifiedName: "VehicleModel::Vehicle", owner: "VehicleModel",
      documentation: "The vehicle", file: "m/v.sysml", startLine: 5, endLine: 11, readOnly: false,
    });
    expect(e.ownedMembers.slice(0, 2)).toEqual([
      { name: "engine", kind: "part", type: "Engine" },
      { name: "wheels", kind: "part", type: "Wheel" },
    ]);
    expect(e.relationships).toMatchObject([{ kind: "connect", ends: ["engine", "wheels"], startLine: 9 }]);
    const eng = ok(run(c, "sysml_get_element", { qualifiedName: "VehicleModel::Vehicle::wheels" })).elements[0];
    expect(eng).toMatchObject({ types: ["Wheel"], multiplicity: "[4]" });
  });
  it("returns every declaration of a package declared in several files", () => {
    const c = setup({ "a.sysml": "package P { part def A; }", "b.sysml": "package P { part def B; }" });
    const { elements } = ok(run(c, "sysml_get_element", { qualifiedName: "P" }));
    expect(elements.map((e: any) => e.file).sort()).toEqual(["a.sysml", "b.sysml"]);
  });
  it("flags library content as read-only", () => {
    const c = setup({});
    const e = ok(run(c, "sysml_get_element", { qualifiedName: "Lib::LibPart" })).elements[0];
    expect(e.readOnly).toBe(true);
    expect(e.file).toContain("Lib.sysml");
  });
  it("names the closest existing prefix when nothing matches", () => {
    const c = setup({ "v.sysml": VEHICLE });
    const r = run(c, "sysml_get_element", { qualifiedName: "VehicleModel::Vehicle::nothing::deeper" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Closest existing prefix: "VehicleModel::Vehicle"');
    expect(run(c, "sysml_get_element", { qualifiedName: "Zzz" }).text).toContain("No prefix");
  });
});

describe("sysml_validate", () => {
  it("Agent checks its own edit: reports the syntax error with its line", () => {
    const c = setup({ "e.sysml": "package P {\n  part def A {\n    part x;\n}\n" });
    const { problems } = ok(run(c, "sysml_validate", { file: "e.sysml" }));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatchObject({ file: "e.sysml", severity: "error" });
    expect(problems[0].line).toBeGreaterThanOrEqual(4);
    expect(problems[0].column).toBeGreaterThanOrEqual(1);
  });
  it("Unresolved name: reports `part engine : Engin;` at its position", () => {
    const c = setup({ "u.sysml": "package P {\n  part def Engine;\n  part engine : Engin;\n}\n" });
    const { problems } = ok(run(c, "sysml_validate"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: "u.sysml", line: 3, column: 17, severity: "warning" });
    expect(problems[0].message).toContain("'Engin'");
  });
  it("reports a misspelled import target and supertype", () => {
    const c = setup({ "i.sysml": "package P {\n  package Q;\n  private import Qq::*;\n  part def A :> Missing;\n}\n" });
    const { problems } = ok(run(c, "sysml_validate", { file: "i.sysml" }));
    expect(problems.map((p: any) => [p.line, p.column])).toEqual([[3, 18], [4, 17]]);
    expect(problems[0].message).toContain("import target");
  });
  it("Clean model: returns an empty list", () => {
    const c = setup({ "v.sysml": VEHICLE.replace("part wheels : Wheel [4];\n    connect engine to wheels;", "") });
    expect(ok(run(c, "sysml_validate"))).toEqual({ problems: [] });
  });
  it("does not flag names it cannot judge", () => {
    const c = setup({
      "x.sysml": `package P { part def Base { part inner; } part def D :> Base { part r :> inner; part s redefines inner; }
        part v : D { part w : D; part k = v.inner; } }`,
    });
    expect(ok(run(c, "sysml_validate")).problems).toEqual([]);
  });
  it("skips unresolved-name checks in a file with syntax errors but reports the syntax error", () => {
    const c = setup({ "s.sysml": "package P { part x : Nope; " });
    const { problems } = ok(run(c, "sysml_validate"));
    expect(problems.every((p: any) => p.severity === "error")).toBe(true);
  });
  it("errors for an unknown file", () => {
    const r = run(setup({}), "sysml_validate", { file: "zzz.sysml" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("sysml_list_files");
  });
  it("reflects the text the index currently holds", () => {
    const c = setup({ "u.sysml": "package P { part def E; part e : E; }" });
    expect(ok(run(c, "sysml_validate")).problems).toEqual([]);
    c.index.setDocument(ROOT + "u.sysml", "package P { part def E; part e : Ee; }");
    expect(ok(run(c, "sysml_validate")).problems).toHaveLength(1);
  });
});
