import { describe, expect, it } from "vitest";
import { FakeHost } from "../model-service/fake-host.js";
import { ModelService } from "../model-service/service.js";
import { ToolError, invokeTool, type ToolContext } from "./index.js";

const ROOT = "file:///w/";
const URI = ROOT + "m.sysml";
const MODEL = `package VehicleModel {
  part def Engine;
  part def Vehicle {
    part transmission;
  }
  part vehicle1 : Vehicle;
  part def Car :> Vehicle {
    part engine : Engine;
    port drive;
    part gearbox;
    connect engine to gearbox;
  }
  part car1 : Car {
    part spare;
  }
  requirement def Speed;
}
`;
const DIAGRAM = JSON.stringify({ version: 1, kind: "general", root: "VehicleModel", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "VehicleModel::Vehicle" }], edges: [] });

function setup(opts: { trusted?: boolean } = {}) {
  const host = new FakeHost();
  host.addDocument(URI, MODEL);
  host.addDiagram(ROOT + "d.sysmld", DIAGRAM);
  const service = new ModelService(host);
  const ctx: ToolContext = {
    index: host.index,
    uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
    pathToUri: (p) => (host.index.getDocument(ROOT + p) ? ROOT + p : undefined),
    edits: {
      service,
      isTrusted: () => opts.trusted ?? true,
      diagramUri: async (p) => {
        if (!host.diagramDisk.has(ROOT + p)) throw new ToolError(`No diagram file "${p}".`);
        return ROOT + p;
      },
    },
  };
  return { host, service, ctx };
}
const call = async (ctx: ToolContext, name: string, input: unknown) => {
  const r = await invokeTool(name, input, ctx);
  return { ...r, json: r.isError ? undefined : JSON.parse(r.text) };
};

describe("edit tools", () => {
  it("Agent adds a part: the same text edit the palette produces", async () => {
    const { host, ctx, service } = setup();
    const r = await call(ctx, "sysml_create_element", { owner: "VehicleModel::Car", kind: "part", name: "wheel", type: "Engine" });
    expect(r.isError).toBeUndefined();
    expect(r.json.created.qualifiedName).toBe("VehicleModel::Car::wheel");
    expect(r.json.filesChanged).toEqual(["m.sysml"]);
    // GUI path on identical text
    const g = new FakeHost();
    g.addDocument(URI, MODEL);
    const gs = new ModelService(g);
    await gs.addElement(g.index.findByQualifiedName("VehicleModel::Car")[0]!, { kind: "part", name: "wheel", type: "Engine" });
    expect(host.buffers.get(URI)).toBe(g.buffers.get(URI));
    expect(host.disk.get(URI)).toBe(host.buffers.get(URI));
    void service;
  });

  it("Create and place: the declaration is added and a node appears on the diagram file", async () => {
    const { host, ctx } = setup();
    const r = await call(ctx, "sysml_create_element", { owner: "VehicleModel::Vehicle", kind: "part", name: "battery", type: "Engine", diagram: "d.sysmld" });
    expect(r.isError).toBeUndefined();
    expect(host.buffers.get(URI)).toContain("part battery : Engine;");
    const nodes = host.diagramOnDisk(ROOT + "d.sysmld").nodes;
    expect(nodes.some((n) => n.ref === "VehicleModel::Vehicle::battery")).toBe(true);
    expect(r.json.diagram).toEqual({ path: "d.sysmld", placed: true });
    expect(r.json.diagramFilesChanged).toEqual(["d.sysmld"]);
  });

  it("Delete versus remove: delete-element removes the declaration; the result lists the files", async () => {
    const { host, ctx } = setup();
    const r = await call(ctx, "sysml_delete_element", { element: "VehicleModel::Car::engine" });
    expect(r.isError).toBeUndefined();
    expect(host.buffers.get(URI)).not.toContain("part engine : Engine;");
    expect(r.json.filesChanged).toEqual(["m.sysml"]);
  });

  it("Delete warns about references that remain, with locations (review finding 8)", async () => {
    const { ctx } = setup();
    const r = await call(ctx, "sysml_delete_element", { element: "VehicleModel::Engine" });
    expect(r.isError).toBeUndefined();
    expect(r.json.remainingReferences).toBe(1);
    expect(r.json.remainingReferenceLocations).toEqual(["m.sysml:8:19"]);
    expect(String(r.json.warning)).toMatch(/no longer resolve/);
  });

  it("Agent edit refused: the inherited engine of car1 cannot be deleted; the error names the definition and nothing changes", async () => {
    const { host, ctx } = setup();
    const r = await call(ctx, "sysml_delete_element", { element: "VehicleModel::car1::engine" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/inherited from Car/);
    expect(r.text).toContain("VehicleModel::Car");
    expect(host.applied).toHaveLength(0);
    expect(host.buffers.get(URI)).toBe(MODEL);
    const ren = await call(ctx, "sysml_rename_element", { element: "VehicleModel::car1::engine", newName: "motor" });
    expect(ren.isError).toBe(true);
    const prop = await call(ctx, "sysml_set_element_properties", { element: "VehicleModel::car1::engine", type: "Engine" });
    expect(prop.isError).toBe(true);
    expect(host.applied).toHaveLength(0);
  });

  it("rename reports references updated and not judged", async () => {
    const { host, ctx } = setup();
    const r = await call(ctx, "sysml_rename_element", { element: "VehicleModel::Engine", newName: "Motor" });
    expect(r.isError).toBeUndefined();
    expect(r.json).toMatchObject({ oldQualifiedName: "VehicleModel::Engine", qualifiedName: "VehicleModel::Motor", referencesUpdated: 1, couldNotJudge: 0 });
    expect(host.buffers.get(URI)).toContain("part engine : Motor;");
  });

  it("set properties changes several in one edit; an empty string removes one", async () => {
    const { host, ctx } = setup();
    const r = await call(ctx, "sysml_set_element_properties", { element: "VehicleModel::Car::gearbox", type: "Engine", multiplicity: "2" });
    expect(r.isError).toBeUndefined();
    expect(host.applied).toHaveLength(1);
    expect(host.buffers.get(URI)).toMatch(/part gearbox : Engine ?\[2\];/);
    const r2 = await call(ctx, "sysml_set_element_properties", { element: "VehicleModel::Car::gearbox", multiplicity: "" });
    expect(r2.isError).toBeUndefined();
    expect(host.buffers.get(URI)).toContain("part gearbox : Engine;");
    expect((await call(ctx, "sysml_set_element_properties", { element: "VehicleModel::Car::gearbox" })).isError).toBe(true);
  });

  it("create-relationship adds a connection and a satisfy", async () => {
    const { host, ctx } = setup();
    const c = await call(ctx, "sysml_create_relationship", { kind: "connection", owner: "VehicleModel::Car", source: "VehicleModel::Car::engine", target: "VehicleModel::Car::gearbox" });
    expect(c.isError).toBeUndefined();
    expect(host.buffers.get(URI)).toMatch(/connect engine to gearbox;\n[^]*connect engine to gearbox;/);
    const s = await call(ctx, "sysml_create_relationship", { kind: "satisfy", requirement: "VehicleModel::Speed", by: "VehicleModel::Car", owner: "VehicleModel" });
    expect(s.isError).toBeUndefined();
    expect(host.buffers.get(URI)).toContain("satisfy Speed by Car;");
    expect((await call(ctx, "sysml_create_relationship", { kind: "connection", owner: "VehicleModel::Car" })).isError).toBe(true);
  });

  it("untrusted workspaces refuse every write tool and change nothing", async () => {
    const { host, ctx } = setup({ trusted: false });
    for (const [name, input] of [
      ["sysml_create_element", { owner: "VehicleModel", kind: "part def", name: "X" }],
      ["sysml_delete_element", { element: "VehicleModel::Engine" }],
      ["sysml_rename_element", { element: "VehicleModel::Engine", newName: "Z" }],
      ["sysml_set_element_properties", { element: "VehicleModel::Engine", documentation: "d" }],
      ["sysml_create_relationship", { kind: "satisfy", requirement: "VehicleModel::Speed", by: "VehicleModel::Car" }],
    ] as const) {
      const r = await call(ctx, name, input);
      expect(r.isError, name).toBe(true);
      expect(r.text, name).toMatch(/not trusted/);
    }
    expect(host.applied).toHaveLength(0);
  });

  it("a file with a syntax error is refused with the planner's reason", async () => {
    const { host, ctx } = setup();
    host.addDocument(ROOT + "bad.sysml", "package Bad { part def A { part } ");
    const r = await call(ctx, "sysml_create_element", { owner: "Bad", kind: "part", name: "x" });
    expect(r.isError).toBe(true);
  });

  it("creates with short name and documentation", async () => {
    const { host, ctx } = setup();
    const r = await call(ctx, "sysml_create_element", { owner: "VehicleModel::Vehicle", kind: "part", name: "brake", shortName: "b", documentation: "Stops the car." });
    expect(r.isError, r.text).toBeUndefined();
    const t = host.buffers.get(URI)!;
    expect(t).toMatch(/part <b> brake \{\n\s+doc \/\* Stops the car\. \*\/\n\s+\}/);
  });
});

describe("parity: GUI path and agent path give identical text", () => {
  const cases: { name: string; gui: (s: ModelService, h: FakeHost) => Promise<unknown>; tool: [string, Record<string, unknown>] }[] = [
    { name: "add", gui: (s, h) => s.addElement(h.index.findByQualifiedName("VehicleModel::Vehicle")[0]!, { kind: "port", name: "p1", multiplicity: "2" }), tool: ["sysml_create_element", { owner: "VehicleModel::Vehicle", kind: "port", name: "p1", multiplicity: "2" }] },
    { name: "delete", gui: (s, h) => s.deleteElement({ element: h.index.findByQualifiedName("VehicleModel::Car::gearbox")[0]! }), tool: ["sysml_delete_element", { element: "VehicleModel::Car::gearbox" }] },
    { name: "rename", gui: (s, h) => s.rename({ element: h.index.findByQualifiedName("VehicleModel::Engine")[0]! }, "Motor"), tool: ["sysml_rename_element", { element: "VehicleModel::Engine", newName: "Motor" }] },
    { name: "set properties", gui: (s, h) => s.setProperties({ element: h.index.findByQualifiedName("VehicleModel::Car::gearbox")[0]! }, { type: "Engine", documentation: "Gears." }), tool: ["sysml_set_element_properties", { element: "VehicleModel::Car::gearbox", type: "Engine", documentation: "Gears." }] },
    { name: "connect", gui: (s, h) => s.connect(h.index.findByQualifiedName("VehicleModel::Car")[0]!, { element: h.index.findByQualifiedName("VehicleModel::Car::gearbox")[0]! }, { element: h.index.findByQualifiedName("VehicleModel::Car::engine")[0]! }), tool: ["sysml_create_relationship", { kind: "connection", owner: "VehicleModel::Car", source: "VehicleModel::Car::gearbox", target: "VehicleModel::Car::engine" }] },
    { name: "satisfy", gui: (s, h) => s.satisfy(h.index.findByQualifiedName("VehicleModel::Speed")[0]!, h.index.findByQualifiedName("VehicleModel::Car")[0]!), tool: ["sysml_create_relationship", { kind: "satisfy", requirement: "VehicleModel::Speed", by: "VehicleModel::Car" }] },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const g = new FakeHost();
      g.addDocument(URI, MODEL);
      const r = (await c.gui(new ModelService(g), g)) as { ok: boolean; reason?: string };
      expect(r.ok, r.reason).toBe(true);
      const { host, ctx } = setup();
      const t = await call(ctx, c.tool[0], c.tool[1]);
      expect(t.isError, t.text).toBeUndefined();
      expect(host.buffers.get(URI)).toBe(g.buffers.get(URI));
      expect(host.buffers.get(URI)).not.toBe(MODEL);
    });
  }
});

describe("edit tools: inherited rule below inherited members", () => {
  const DEEP = `package M {
  part def Vehicle {
    part engine {
      part cylinder {
        part bolt;
      }
    }
  }
  part vehicle1 : Vehicle;
}
`;
  const deep = () => {
    const host = new FakeHost();
    host.addDocument(URI, DEEP);
    const service = new ModelService(host);
    const ctx: ToolContext = {
      index: host.index,
      uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
      pathToUri: (p) => (host.index.getDocument(ROOT + p) ? ROOT + p : undefined),
      edits: { service, isTrusted: () => true, diagramUri: async (p) => ROOT + p },
    };
    return { host, ctx };
  };

  for (const path of ["M::vehicle1::engine", "M::vehicle1::engine::cylinder", "M::vehicle1::engine::cylinder::bolt"]) {
    it(`${path} is refused by all four tools, naming the declaring definition`, async () => {
      const { host, ctx } = deep();
      const calls: [string, unknown][] = [
        ["sysml_delete_element", { element: path }],
        ["sysml_rename_element", { element: path, newName: "other" }],
        ["sysml_set_element_properties", { element: path, documentation: "x" }],
        ["sysml_create_element", { owner: path, kind: "part", name: "extra" }],
      ];
      for (const [name, input] of calls) {
        const r = await invokeTool(name, input, ctx);
        expect(r.isError, `${name} ${path}`).toBe(true);
        expect(r.text).toMatch(/inherited/);
        expect(r.text).toMatch(/M::Vehicle/);
      }
      expect(host.applied).toHaveLength(0);
      expect(host.buffers.get(URI)).toBe(DEEP);
    });
  }
});

describe("edit tools: failed saves and kinds", () => {
  it("an applied edit whose save failed reports success with exactly which files are unsaved, never 'No files were changed'", async () => {
    const { host, ctx } = setup();
    host.failSave = true;
    const r = await call(ctx, "sysml_create_element", { owner: "VehicleModel::Car", kind: "part", name: "wheel" });
    expect(r.isError).toBeUndefined();
    expect(r.json.filesChanged).toEqual(["m.sysml"]);
    expect(r.json.filesNotSaved).toEqual(["m.sysml"]);
    expect(r.json.filesSaved).toEqual([]);
    expect(r.text).not.toMatch(/No files were changed/);
    expect(r.json.note).toMatch(/WAS applied/);
    expect(host.buffers.get(URI)).toContain("part wheel;");
  });

  it("a kind that is not allowed for the owner is refused (and so is arbitrary text)", async () => {
    const { host, ctx } = setup();
    for (const kind of ["package", "part def", "connect", "part; part x"]) {
      const r = await invokeTool("sysml_create_element", { owner: "VehicleModel::Car", kind, name: "z" }, ctx);
      expect(r.isError, kind).toBe(true);
    }
    expect(host.applied).toHaveLength(0);
  });
});

import { dottedPath } from "./edit-tools.js";
describe("dottedPath", () => {
  it("reads quoted names that contain dots", () => {
    expect(dottedPath("operating.high")).toEqual(["operating", "high"]);
    expect(dottedPath("'a.b'.c")).toEqual(["a.b", "c"]);
    expect(dottedPath("a..b")).toEqual([]);
  });
});
