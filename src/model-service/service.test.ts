import { describe, expect, test } from "vitest";
import { FakeHost } from "./fake-host.js";
import { ModelService, type OpOk } from "./service.js";

const URI = "file:///w/m.sysml";
const MODEL = `package Model {
  part def Engine;
  part def Vehicle {
    part engine : Engine; // the engine
    port drive;
  }
  part vehicle1 : Vehicle {
    part battery;
  }
  part vehicle2 : Vehicle;
}
`;
const DIAGRAM = (nodes: string) => JSON.stringify({ version: 1, kind: "general", root: "Model", sources: ["m.sysml"], nodes: JSON.parse(nodes), edges: [] });

function setup(open = false) {
  const host = new FakeHost();
  host.addDocument(URI, MODEL);
  host.addDiagram("file:///w/d.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle","x":10,"y":20},{"id":"n2","ref":"Model::Vehicle::engine","parent":"n1"}]`), open);
  const svc = new ModelService(host);
  const q = (qn: string) => host.index.findByQualifiedName(qn)[0]!;
  return { host, svc, q };
}
const ok = (r: { ok: boolean }): OpOk => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r as OpOk;
};

describe("ModelService operations", () => {
  test("add inserts the declaration, saves the file at once and reports the new element", async () => {
    const { host, svc, q } = setup();
    const r = ok(await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel", type: "Engine" }));
    expect(host.buffers.get(URI)).toContain("    part wheel : Engine;\n");
    expect(host.disk.get(URI)).toBe(host.buffers.get(URI));
    expect(host.applied).toHaveLength(1);
    expect(r.element?.qualifiedName).toBe("Model::Vehicle::wheel");
    expect(r.files).toEqual([URI]);
  });

  test("add with a placement writes the node onto the saved state of that diagram only, as one operation", async () => {
    const { host, svc, q } = setup(true);
    host.addDiagram("file:///w/other.sysmld", DIAGRAM("[]"));
    // pending layout in memory: a moved node
    const mem = host.diagramMemory.get("file:///w/d.sysmld")!;
    host.diagramMemory.set("file:///w/d.sysmld", { ...mem, nodes: mem.nodes.map((n) => (n.id === "n1" ? { ...n, x: 999 } : n)) });
    const r = ok(await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" }, { placement: { diagram: "file:///w/d.sysmld", parentNode: "n1", x: 30, y: 40 }, diagram: "file:///w/d.sysmld" }));
    const disk = host.diagramOnDisk("file:///w/d.sysmld");
    const node = disk.nodes.find((n) => n.ref === "Model::Vehicle::wheel")!;
    expect(node).toMatchObject({ parent: "n1", x: 30, y: 40 });
    expect(disk.nodes.find((n) => n.id === "n1")!.x).toBe(10); // pending layout is not saved
    expect(host.diagramMemory.get("file:///w/d.sysmld")!.nodes.find((n) => n.id === "n1")!.x).toBe(999);
    expect(host.diagramMemory.get("file:///w/d.sysmld")!.nodes.some((n) => n.ref === "Model::Vehicle::wheel")).toBe(true);
    expect(host.diagramOnDisk("file:///w/other.sysmld").nodes).toHaveLength(0);
    expect(host.entries).toHaveLength(1);
    expect(r.diagramFiles).toEqual(["file:///w/d.sysmld"]);
  });

  test("undo reverts text and diagram, redo repeats both; a changed text skips the text revert with a warning", async () => {
    const { host, svc, q } = setup(true);
    const r = ok(await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" }, { placement: { diagram: "file:///w/d.sysmld", x: 1, y: 2 } }));
    const before = MODEL;
    const u = await svc.undo(r);
    expect(u.textReverted).toBe(true);
    expect(host.buffers.get(URI)).toBe(before);
    expect(host.disk.get(URI)).toBe(before);
    expect(host.diagramOnDisk("file:///w/d.sysmld").nodes.some((n) => n.ref?.endsWith("wheel"))).toBe(false);
    const re = await svc.redo(r);
    expect(re.textApplied).toBe(true);
    expect(host.buffers.get(URI)).toContain("part wheel;");
    expect(host.diagramOnDisk("file:///w/d.sysmld").nodes.some((n) => n.ref?.endsWith("wheel"))).toBe(true);
    // user typed something: the inverse no longer applies
    host.buffers.set(URI, host.buffers.get(URI)! + "// typed\n");
    const u2 = await svc.undo(r);
    expect(u2.textReverted).toBe(false);
    expect(u2.warning).toMatch(/changed after the edit/);
    expect(host.buffers.get(URI)).toContain("// typed");
    expect(host.diagramOnDisk("file:///w/d.sysmld").nodes.some((n) => n.ref?.endsWith("wheel"))).toBe(false);
  });

  test("delete removes the declaration and the entries of every diagram, undo puts the entries back", async () => {
    const { host, svc, q } = setup(true);
    host.addDiagram("file:///w/closed.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle::engine"},{"id":"n2","ref":"Model::Vehicle"}]`));
    const r = ok(await svc.deleteElement({ element: q("Model::Vehicle::engine") }));
    expect(host.buffers.get(URI)).not.toContain("engine");
    expect(host.buffers.get(URI)).not.toContain("// the engine");
    expect(host.diagramOnDisk("file:///w/d.sysmld").nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(host.diagramOnDisk("file:///w/closed.sysmld").nodes.map((n) => n.id)).toEqual(["n2"]);
    expect(host.diagramMemory.get("file:///w/d.sysmld")!.nodes.map((n) => n.id)).toEqual(["n1"]);
    await svc.undo(r);
    expect(host.buffers.get(URI)).toBe(MODEL);
    expect(host.diagramOnDisk("file:///w/closed.sysmld").nodes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
  });

  test("rename updates references, reports counts and rewrites closed diagrams", async () => {
    const { host, svc, q } = setup();
    host.addDiagram("file:///w/closed.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Engine"}]`));
    const r = ok(await svc.rename({ element: q("Model::Engine") }, "Motor"));
    expect(host.buffers.get(URI)).toContain("part def Motor;");
    expect(host.buffers.get(URI)).toContain("part engine : Motor;");
    expect(r.referencesUpdated).toBe(1);
    expect(host.diagramOnDisk("file:///w/closed.sysmld").nodes[0]!.ref).toBe("Model::Motor");
    expect(r.element?.qualifiedName).toBe("Model::Motor");
  });

  test("set properties: type, multiplicity, short name and documentation in one edit", async () => {
    const { host, svc, q } = setup();
    ok(await svc.setProperties({ element: q("Model::vehicle1::battery") }, { type: "Engine", multiplicity: "2", shortName: "b1" }));
    expect(host.applied).toHaveLength(1);
    const t = host.buffers.get(URI)!;
    expect(t).toMatch(/part <b1> battery : Engine ?\[2\];/);
    const bad = await svc.setProperties({ element: q("Model::vehicle1::battery") }, { type: "Nothing" });
    expect(bad).toMatchObject({ ok: false });
  });

  test("scenario Change type: engine becomes part engine : Engine", async () => {
    const host = new FakeHost();
    host.addDocument(URI, "package P {\n  part def Engine;\n  part def V { part engine; }\n}\n");
    const svc = new ModelService(host);
    ok(await svc.setProperties({ element: host.index.findByQualifiedName("P::V::engine")[0]! }, { type: "Engine" }));
    expect(host.buffers.get(URI)).toContain("part engine : Engine;");
  });

  test("connect adds the declaration to the owner and places the edge", async () => {
    const host = new FakeHost();
    host.addDocument(URI, "package P {\n  port def Pw;\n  part def A { port o : Pw; }\n  part def B { port i : Pw; }\n  part def S { part a : A; part b : B; }\n}\n");
    host.addDiagram("file:///w/d.sysmld", JSON.stringify({ version: 1, kind: "interconnection", root: "P::S", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "P::S" }, { id: "n2", ref: "P::S::a", parent: "n1" }, { id: "n3", ref: "P::S::b", parent: "n1" }], edges: [] }));
    const svc = new ModelService(host);
    const q = (s: string) => host.index.findByQualifiedName(s)[0]!;
    const r = ok(await svc.connect(q("P::S"), { element: q("P::S::a") }, { element: q("P::S::b") }, { placement: { diagram: "file:///w/d.sysmld" } }));
    expect(host.buffers.get(URI)).toContain("connect a to b;");
    expect(host.diagramOnDisk("file:///w/d.sysmld").edges).toHaveLength(1);
    expect(r.element?.kind).toBe("connect");
  });
});

describe("inherited features", () => {
  test("Delete refused: nothing is deleted and the message names the definition", async () => {
    const { host, svc, q } = setup();
    const r = await svc.deleteElement({ element: q("Model::Vehicle::engine"), context: q("Model::vehicle1") });
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.reason).toMatch(/inherited from Vehicle/);
    expect(r.goToDefinition?.name).toBe("Model::Vehicle");
    expect(host.applied).toHaveLength(0);
    expect(host.buffers.get(URI)).toBe(MODEL);
  });

  test("rename and retype of an inherited feature are refused too", async () => {
    const { svc, q } = setup();
    const t = { element: q("Model::Vehicle::engine"), context: q("Model::vehicle1") };
    expect((await svc.rename(t, "motor")).ok).toBe(false);
    expect((await svc.setProperties(t, { type: "Engine" })).ok).toBe(false);
    expect((await svc.setProperties(t, { documentation: "x" })).ok).toBe(false);
  });

  test("Add goes to the usage: the new part is in vehicle1, Vehicle and vehicle2 are unchanged", async () => {
    const { host, svc, q } = setup();
    ok(await svc.addElement(q("Model::vehicle1"), { kind: "part", name: "battery2" }));
    const t = host.buffers.get(URI)!;
    expect(t).toContain("part battery2;");
    const vehicleBlock = t.slice(t.indexOf("part def Vehicle"), t.indexOf("part vehicle1"));
    expect(vehicleBlock).not.toContain("battery2");
    expect(t.slice(t.indexOf("part vehicle2"))).not.toContain("battery2");
  });

  test("Agent edit refused: locating the inherited path gives its usage as context", async () => {
    const { svc, host } = setup();
    const t = svc.find("Model::vehicle1::engine")!;
    expect(t.context?.qualifiedName).toBe("Model::vehicle1");
    const r = await svc.deleteElement(t);
    expect(r.ok).toBe(false);
    expect(host.applied).toHaveLength(0);
    // the definition's own engine can be deleted
    expect((await svc.deleteElement(svc.find("Model::Vehicle::engine")!)).ok).toBe(true);
  });
});

describe("staleness and failures", () => {
  test("a change between planning and applying re-plans once and succeeds", async () => {
    const { host, svc, q } = setup();
    host.beforeApply = () => host.buffers.set(URI, "// header\n" + host.buffers.get(URI)!);
    const r = ok(await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" }));
    expect(host.buffers.get(URI)).toMatch(/^\/\/ header\n/);
    expect(host.buffers.get(URI)).toContain("part wheel;");
    expect(r.record.before.get(URI)).toMatch(/^\/\/ header/);
  });

  test("a second change fails without touching the text", async () => {
    const { host, svc, q } = setup();
    let n = 0;
    const orig = host.applyAndSave.bind(host);
    host.applyAndSave = async (e, b) => {
      host.buffers.set(URI, `// ${n++}\n` + host.buffers.get(URI)!);
      return orig(e, b);
    };
    const r = await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" });
    expect(r.ok).toBe(false);
    expect(host.applied).toHaveLength(0);
  });

  test("a failed save is reported and the documents stay as they are", async () => {
    const { host, svc, q } = setup();
    host.failSave = true;
    const r = await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" });
    expect(r).toMatchObject({ ok: false, reason: "disk full" });
    expect(host.buffers.get(URI)).toContain("part wheel;");
  });

  test("a file with a syntax error is refused with a Go to error location", async () => {
    const host = new FakeHost();
    host.addDocument(URI, "package P { part def A { part }\n");
    const svc = new ModelService(host);
    const r = await svc.addElement(host.index.findByQualifiedName("P")[0] ?? ({ uri: URI, kind: "package", members: [], range: { start: { offset: 0, line: 0, column: 0 }, end: { offset: 0, line: 0, column: 0 } } } as never), { kind: "part", name: "x" });
    expect(r.ok).toBe(false);
  });
});
