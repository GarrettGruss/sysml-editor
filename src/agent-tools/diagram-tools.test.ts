import { describe, expect, it } from "vitest";
import { LIBRARY_URI_SCHEME, ModelIndex } from "../model/index.js";
import { serializeDiagram, type DiagramDocument } from "../diagram/format.js";
import { callTool, DIAGRAM_ELEMENT_CAP, DIAGRAM_FILE_CAP, toolDefinitions, validateDiagramPath, type ToolContext } from "./index.js";
import { FakeDiagrams, fixtureDiagram, fixtureText } from "./test-support.js";

const text = fixtureText;
const diagram = fixtureDiagram;

function setup() {
  const index = new ModelIndex();
  index.setDocument("file:///w/ports.sysml", text("ports.sysml"));
  index.setDocument("file:///w/vehicle.sysml", text("vehicle.sysml"));
  index.setDocument(`${LIBRARY_URI_SCHEME}:///Lib.sysml`, "standard library package Lib { part def LibPart; }");
  const diagrams = new FakeDiagrams();
  diagrams.files.set("ports-general.sysmld", diagram("ports-general.sysmld"));
  const ctx: ToolContext = { index, uriToPath: (u) => (u.startsWith("file:///w/") ? u.slice(10) : undefined), pathToUri: () => undefined, diagrams };
  return { ctx, diagrams };
}
const ok = async (ctx: ToolContext, name: string, input: unknown = {}) => {
  const r = await callTool(name, input, ctx);
  expect(r.isError, r.text).toBeUndefined();
  return JSON.parse(r.text);
};
const fails = async (ctx: ToolContext, name: string, input: unknown = {}) => {
  const r = await callTool(name, input, ctx);
  expect(r.isError).toBe(true);
  return r.text;
};

describe("diagram tool definitions", () => {
  it("the write tools are marked not read-only, the others read-only", () => {
    const writes = toolDefinitions.filter((t) => !t.readOnly).map((t) => t.name).sort();
    expect(writes).toEqual(["sysml_add_to_diagram", "sysml_create_diagram", "sysml_create_element", "sysml_create_relationship", "sysml_create_requirement", "sysml_delete_element", "sysml_layout_diagram", "sysml_remove_from_diagram", "sysml_rename_element", "sysml_set_element_properties", "sysml_set_transition"]);
    expect(toolDefinitions.filter((t) => t.readOnly).map((t) => t.name)).toEqual(["sysml_list_files", "sysml_get_element_tree", "sysml_get_element", "sysml_validate", "sysml_list_diagrams", "sysml_read_diagram", "sysml_get_editor_context", "sysml_read_requirements_document", "sysml_read_verification_matrix"]);
    for (const t of toolDefinitions) expect(t.description.length).toBeGreaterThan(80);
  });
  it("validates paths", () => {
    expect(validateDiagramPath("a/b.sysmld")).toBeUndefined();
    for (const bad of ["", "a.sysml", ".sysmld", "../a.sysmld", "a/../../b.sysmld", "/etc/x.sysmld", "C:/x.sysmld", "a\\b.sysmld", "a//b.sysmld", "./a.sysmld"]) expect(validateDiagramPath(bad), bad).toBeDefined();
  });
  it("reports a missing service", async () => {
    const { ctx } = setup();
    expect(await fails({ ...ctx, diagrams: undefined }, "sysml_list_diagrams")).toContain("not available");
  });
});

describe("sysml_list_diagrams", () => {
  it("lists kind, root, node count, whether it parses and whether it is open", async () => {
    const { ctx, diagrams } = setup();
    diagrams.files.set("broken.sysmld", "invalid");
    diagrams.open.add("ports-general.sysmld");
    const r = await ok(ctx, "sysml_list_diagrams");
    expect(r.diagrams).toEqual([
      { path: "broken.sysmld", parses: false, open: false, problems: ["not valid"] },
      { path: "ports-general.sysmld", kind: "general", root: "Ports", nodeCount: 5, parses: true, open: true },
    ]);
  });
  it("caps the list with a note", async () => {
    const { ctx, diagrams } = setup();
    for (let i = 0; i < DIAGRAM_FILE_CAP + 3; i++) diagrams.files.set(`d${String(i).padStart(4, "0")}.sysmld`, diagram("ports-general.sysmld"));
    const r = await ok(ctx, "sysml_list_diagrams");
    expect(r.diagrams).toHaveLength(DIAGRAM_FILE_CAP);
    expect(r.note).toContain(`${DIAGRAM_FILE_CAP + 4}`);
  });
});

describe("sysml_read_diagram", () => {
  it("describes nodes with resolved names, types, containment and positions", async () => {
    const { ctx } = setup();
    const r = await ok(ctx, "sysml_read_diagram", { path: "ports-general.sysmld" });
    expect(r).toMatchObject({ path: "ports-general.sysmld", open: false, unsaved: false, kind: "general", root: "Ports" });
    const n5 = r.nodes.find((n: { id: string }) => n.id === "n5");
    expect(n5).toMatchObject({ resolved: true, x: 380, y: 60, element: { name: "battery", qualifiedName: "Ports::Drivetrain::battery", kind: "part", types: ["Battery"] } });
    expect(r.edges.map((e: { id: string }) => e.id)).toEqual([]);
    expect(r.unresolved).toEqual([]);
  });
  it("lists an unresolved reference", async () => {
    const { ctx, diagrams } = setup();
    const d = diagram("ports-general.sysmld");
    diagrams.files.set("gone.sysmld", { ...d, nodes: d.nodes.map((n) => (n.id === "n2" ? { ...n, ref: "Ports::Gone" } : n)) });
    const r = await ok(ctx, "sysml_read_diagram", { path: "gone.sysmld" });
    expect(r.unresolved).toEqual([{ id: "n2", ref: "Ports::Gone" }]);
    expect(r.nodes.find((n: { id: string }) => n.id === "n2")).toMatchObject({ resolved: false });
  });
  it("reports the in-memory state of an open diagram", async () => {
    const { ctx, diagrams } = setup();
    diagrams.open.add("ports-general.sysmld");
    diagrams.unsaved.add("ports-general.sysmld");
    expect(await ok(ctx, "sysml_read_diagram", { path: "ports-general.sysmld" })).toMatchObject({ open: true, unsaved: true });
  });
  it("returns an image only when asked, and a note instead of an error when it cannot be rendered", async () => {
    const { ctx, diagrams } = setup();
    const plain = await callTool("sysml_read_diagram", { path: "ports-general.sysmld" }, ctx);
    expect(plain.image).toBeUndefined();
    expect(JSON.parse(plain.text).image).toBeUndefined();
    const withImage = await callTool("sysml_read_diagram", { path: "ports-general.sysmld", includeImage: true }, ctx);
    expect(withImage.image?.mimeType).toBe("image/png");
    expect([...withImage.image!.data]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(withImage.text).toBe(plain.text);
    diagrams.image = { ok: false, reason: "timed out" };
    const failed = await callTool("sysml_read_diagram", { path: "ports-general.sysmld", includeImage: true }, ctx);
    expect(failed.isError).toBeUndefined();
    expect(failed.image).toBeUndefined();
    expect(JSON.parse(failed.text).image).toEqual({ available: false, reason: "timed out" });
  });
  it("rejects a bad path, a missing file and an invalid file", async () => {
    const { ctx, diagrams } = setup();
    diagrams.files.set("bad.sysmld", "invalid");
    expect(await fails(ctx, "sysml_read_diagram", { path: "../x.sysmld" })).toContain("Invalid diagram path");
    expect(await fails(ctx, "sysml_read_diagram", { path: "x.sysml" })).toContain(".sysmld");
    expect(await fails(ctx, "sysml_read_diagram", { path: "nope.sysmld" })).toContain("No diagram file");
    expect(await fails(ctx, "sysml_read_diagram", { path: "bad.sysmld" })).toContain("not a valid");
  });
});

describe("sysml_create_diagram", () => {
  it("creates a general view of the root's direct members and returns path and description", async () => {
    const { ctx, diagrams } = setup();
    const r = await ok(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "general" });
    expect(r).toMatchObject({ path: "Vehicle.sysmld", applied: "file", created: true });
    expect(r.diagram.kind).toBe("general");
    expect(r.diagram.root).toBe("Vehicle");
    const names = r.diagram.nodes.map((n: { element: { name: string } }) => n.element.name);
    expect(names).toEqual(expect.arrayContaining(["Vehicle", "Engine", "Car", "Wheel"]));
    expect(r.diagram.nodes.every((n: { x?: number }) => n.x === undefined)).toBe(true);
    expect(diagrams.files.has("Vehicle.sysmld")).toBe(true);
  });
  it("restricts members, reports unknown ones, and never overwrites", async () => {
    const { ctx } = setup();
    const r = await ok(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "general", elements: ["Vehicle::Car", "Vehicle::Nope"], path: "views/car.sysmld" });
    expect(r.path).toBe("views/car.sysmld");
    expect(r.diagram.nodes.map((n: { element: { name: string } }) => n.element.name).sort()).toEqual(["Car", "Vehicle"]);
    expect(r.notFound).toEqual(["Vehicle::Nope"]);
    expect(await fails(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "general", path: "views/car.sysmld" })).toContain("already exists");
  });
  it("rejects paths outside the workspace, other extensions, unknown roots and library roots", async () => {
    const { ctx } = setup();
    expect(await fails(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "general", path: "../out.sysmld" })).toContain("Invalid diagram path");
    expect(await fails(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "general", path: "/tmp/out.sysmld" })).toContain("Invalid diagram path");
    expect(await fails(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "general", path: "out.json" })).toContain(".sysmld");
    expect(await fails(ctx, "sysml_create_diagram", { root: "Zzz", kind: "general" })).toContain("No element");
    expect(await fails(ctx, "sysml_create_diagram", { root: "Lib", kind: "general" })).toContain("standard library");
    expect(await fails(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "bogus" })).toContain("one of");
  });
  it("caps the number of elements", async () => {
    const { ctx } = setup();
    const many = Array.from({ length: DIAGRAM_ELEMENT_CAP + 1 }, (_, i) => `Vehicle::E${i}`);
    expect(await fails(ctx, "sysml_create_diagram", { root: "Vehicle", kind: "general", elements: many })).toContain("At most");
  });
});

describe("sysml_add_to_diagram, sysml_remove_from_diagram and sysml_layout_diagram", () => {
  it("add changes only the diagram, as an editor edit when open and a file write when not", async () => {
    const { ctx, diagrams } = setup();
    let r = await ok(ctx, "sysml_add_to_diagram", { path: "ports-general.sysmld", elements: ["Ports::Drivetrain::motor", "Ports::Nope"] });
    expect(r).toMatchObject({ applied: "file" });
    expect(r.notFound).toEqual(["Ports::Nope"]);
    const names = (d: DiagramDocument) => d.nodes.length;
    expect(names(diagrams.files.get("ports-general.sysmld") as DiagramDocument)).toBeGreaterThanOrEqual(5);
    diagrams.open.add("ports-general.sysmld");
    r = await ok(ctx, "sysml_add_to_diagram", { path: "ports-general.sysmld", elements: ["Ports::Power"] });
    expect(r.applied).toBe("none"); // already shown
    expect(r.added).toBe(0);
    await fails(ctx, "sysml_add_to_diagram", { path: "ports-general.sysmld", elements: ["Nothing::Here"] });
  });
  it("remove takes node ids, removes attached edges, reports unknown ids and fails when none is known", async () => {
    const { ctx, diagrams } = setup();
    diagrams.open.add("ports-general.sysmld");
    const r = await ok(ctx, "sysml_remove_from_diagram", { path: "ports-general.sysmld", ids: ["n3", "zz"] });
    expect(r).toMatchObject({ applied: "editor", removed: 1, unknownIds: ["zz"] });
    expect(r.diagram.nodes.map((n: { id: string }) => n.id)).not.toContain("n3");
    expect(diagrams.unsaved.has("ports-general.sysmld")).toBe(true);
    expect(await fails(ctx, "sysml_remove_from_diagram", { path: "ports-general.sysmld", ids: ["qq"] })).toContain("No node or edge");
  });
  it("layout goes to the service", async () => {
    const { ctx, diagrams } = setup();
    expect(await ok(ctx, "sysml_layout_diagram", { path: "ports-general.sysmld" })).toMatchObject({ applied: "file" });
    expect(diagrams.laidOut).toEqual(["ports-general.sysmld"]);
  });
  it("all four write tools refuse in an untrusted workspace, and the read tools still work", async () => {
    const { ctx, diagrams } = setup();
    diagrams.trusted = false;
    const calls: [string, object][] = [
      ["sysml_create_diagram", { root: "Vehicle", kind: "general" }],
      ["sysml_add_to_diagram", { path: "ports-general.sysmld", elements: ["Ports::Power"] }],
      ["sysml_remove_from_diagram", { path: "ports-general.sysmld", ids: ["n1"] }],
      ["sysml_layout_diagram", { path: "ports-general.sysmld" }],
    ];
    for (const [name, input] of calls) expect(await fails(ctx, name, input), name).toContain("not trusted");
    expect(diagrams.files.size).toBe(1);
    expect(diagrams.laidOut).toEqual([]);
    await ok(ctx, "sysml_list_diagrams");
    await ok(ctx, "sysml_read_diagram", { path: "ports-general.sysmld" });
    expect(serializeDiagram(diagrams.files.get("ports-general.sysmld") as DiagramDocument)).toBe(serializeDiagram(diagram("ports-general.sysmld")));
  });
});

describe("sysml_get_editor_context", () => {
  it("is none when no diagram editor is active, and still lists open diagrams", async () => {
    const { ctx, diagrams } = setup();
    diagrams.editor = { open: ["b.sysmld"] };
    expect(await ok(ctx, "sysml_get_editor_context")).toEqual({ activeDiagram: null, hovered: null, selected: [], openDiagrams: ["b.sysmld"] });
  });
  it("identifies the hovered and selected items of the active diagram", async () => {
    const { ctx, diagrams } = setup();
    const d = diagram("ports-general.sysmld");
    const [a, b] = d.nodes;
    diagrams.open.add("ports-general.sysmld");
    diagrams.editor = { active: { path: "ports-general.sysmld", focused: true, hover: a!.id, selection: [b!.id, "gone"] }, open: ["z.sysmld", "y.sysmld"] };
    const r = await ok(ctx, "sysml_get_editor_context");
    expect(r.activeDiagram).toEqual({ path: "ports-general.sysmld", kind: d.kind, root: d.root, focused: true });
    expect(r.hovered).toMatchObject({ id: a!.id, type: "node", resolved: true });
    expect(r.hovered.element.qualifiedName).toBeTruthy();
    expect(r.selected.map((x: any) => x.id)).toEqual([b!.id, "gone"]);
    expect(r.selected[1]).toEqual({ id: "gone", resolved: false });
    expect(r.openDiagrams).toEqual(["y.sysmld", "z.sysmld"]);
  });
  it("reports a hovered line as an edge", async () => {
    const { ctx, diagrams } = setup();
    const e = diagram("ports-general.sysmld").edges[0];
    if (!e) return;
    diagrams.editor = { active: { path: "ports-general.sysmld", focused: true, hover: e.id, selection: [] }, open: [] };
    expect((await ok(ctx, "sysml_get_editor_context")).hovered).toMatchObject({ id: e.id, type: "edge" });
  });
});

describe("sysml_get_editor_context, derived lines", () => {
  it("describes a derived line by its relationship and ends", async () => {
    const { ctx, diagrams } = setup();
    diagrams.editor = { active: { path: "ports-general.sysmld", focused: true, hover: "d:composition:n4:n5", selection: [] }, open: [] };
    expect((await ok(ctx, "sysml_get_editor_context")).hovered).toEqual({ id: "d:composition:n4:n5", type: "edge", derived: true, relationship: "composition", source: "n4", target: "n5", resolved: true });
  });
});

describe("sysml_get_editor_context, focus and unknown ids", () => {
  it("reports focused false for a visible diagram that is not in the active tab", async () => {
    const { ctx, diagrams } = setup();
    diagrams.editor = { active: { path: "ports-general.sysmld", focused: false, selection: [] }, open: [] };
    expect((await ok(ctx, "sysml_get_editor_context")).activeDiagram).toMatchObject({ path: "ports-general.sysmld", focused: false });
  });
  it("answers resolved false for ids that are not in the view", async () => {
    const { ctx, diagrams } = setup();
    diagrams.editor = { active: { path: "ports-general.sysmld", focused: true, hover: "d:composition:n9:n8", selection: ["nope"] }, open: [] };
    const r = await ok(ctx, "sysml_get_editor_context");
    expect(r.hovered).toEqual({ id: "d:composition:n9:n8", resolved: false });
    expect(r.selected).toEqual([{ id: "nope", resolved: false }]);
  });
});
