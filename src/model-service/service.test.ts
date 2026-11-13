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

  test("the undo entry is recorded as soon as the text changed, before the diagram files are updated, and settles to the result", async () => {
    const { host, svc, q } = setup(true);
    const force = host.forceDiagramChange.bind(host);
    let entriesWhileForcing = -1;
    host.forceDiagramChange = async (change, mode) => {
      entriesWhileForcing = host.entries.length;
      return force(change, mode);
    };
    const r = ok(await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" }, { placement: { diagram: "file:///w/d.sysmld", parentNode: "n1", x: 30, y: 40 }, diagram: "file:///w/d.sysmld" }));
    expect(entriesWhileForcing).toBe(1);
    expect(host.entries[0]!.description).toBe(r.description);
    expect(await host.entries[0]!.result).toBe(r);
  });

  test("undo and redo issued while the operation is still finishing wait for it, then revert and repeat text and diagram", async () => {
    const { host, svc, q } = setup(true);
    const force = host.forceDiagramChange.bind(host);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    host.forceDiagramChange = async (change, mode) => {
      if (first) {
        first = false;
        await gate;
      }
      return force(change, mode);
    };
    const wheelOnDiagram = () => host.diagramOnDisk("file:///w/d.sysmld").nodes.some((n) => n.ref?.endsWith("wheel"));
    const op = svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" }, { placement: { diagram: "file:///w/d.sysmld", x: 1, y: 2 }, diagram: "file:///w/d.sysmld" });
    while (host.entries.length === 0) await new Promise((r) => setTimeout(r, 0));
    expect(host.buffers.get(URI)).toContain("part wheel;"); // the text is changed, the diagram not yet
    expect(wheelOnDiagram()).toBe(false);
    const entry = host.entries[0]!;
    const undone = entry.result.then((r) => svc.undo(r));
    const redone = undone.then(() => entry.result).then((r) => svc.redo(r));
    release();
    ok(await op);
    expect((await undone).textReverted).toBe(true);
    expect((await redone).textApplied).toBe(true);
    expect(host.buffers.get(URI)).toContain("part wheel;");
    expect(wheelOnDiagram()).toBe(true);
    expect((await svc.undo(await entry.result)).textReverted).toBe(true);
    expect(host.buffers.get(URI)).toBe(MODEL);
    expect(host.disk.get(URI)).toBe(MODEL);
    expect(wheelOnDiagram()).toBe(false);
  });

  test("an operation that fails after the text was saved still leaves an entry whose undo reverts the text, with a warning", async () => {
    const { host, svc, q } = setup(true);
    host.forceDiagramChange = async () => {
      throw new Error("disk full");
    };
    await expect(svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" }, { placement: { diagram: "file:///w/d.sysmld", x: 1, y: 2 }, diagram: "file:///w/d.sysmld" })).rejects.toThrow("disk full");
    expect(host.buffers.get(URI)).toContain("part wheel;");
    expect(host.warnings.some((w) => /diagrams could not be updated \(disk full\)/.test(w.message))).toBe(true);
    expect(host.entries).toHaveLength(1);
    const r = await host.entries[0]!.result;
    expect(r.diagramChange).toBeUndefined();
    expect((await svc.undo(r)).textReverted).toBe(true);
    expect(host.buffers.get(URI)).toBe(MODEL);
    expect(host.disk.get(URI)).toBe(MODEL);
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
    // the text revert was refused: the diagram part is NOT reverted either, and the user is warned
    expect(host.diagramOnDisk("file:///w/d.sysmld").nodes.some((n) => n.ref?.endsWith("wheel"))).toBe(true);
    expect(host.warnings.some((w) => /Undo: .*Nothing was undone/.test(w.message))).toBe(true);
  });

  test("undo after the text was already reverted in the text editor still undoes the diagram part, without a warning", async () => {
    const { host, svc, q } = setup(true);
    const r = ok(await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "wheel" }, { placement: { diagram: "file:///w/d.sysmld" } }));
    host.buffers.set(URI, MODEL); // Undo in the text editor
    const u = await svc.undo(r);
    expect(u).toEqual({ textReverted: true });
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

  test("a file with a syntax error is refused with a Go to error location", async () => {
    const host = new FakeHost();
    host.addDocument(URI, "package P { part def A { part }\n");
    const svc = new ModelService(host);
    const r = await svc.addElement(host.index.findByQualifiedName("P")[0] ?? ({ uri: URI, kind: "package", members: [], range: { start: { offset: 0, line: 0, column: 0 }, end: { offset: 0, line: 0, column: 0 } } } as never), { kind: "part", name: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("review fixes surfaced by the service", () => {
  test("Delete reports the references that remain, with locations", async () => {
    const { svc } = setup();
    const r = ok(await svc.deleteElement(svc.find("Model::Engine")!));
    expect(r.remainingReferences?.count).toBe(1);
    expect(r.remainingReferences?.locations[0]).toMatchObject({ uri: URI });
  });

  test("Rename lists diagram files that could not be parsed", async () => {
    const { host, svc } = setup();
    host.addDiagram("file:///w/broken.sysmld", "{ not json");
    const r = ok(await svc.rename(svc.find("Model::Engine")!, "Motor"));
    expect(r.skippedDiagrams).toEqual(["file:///w/broken.sysmld"]);
  });

  test("the host refuses plan sources that do not match the buffer (one staleness mechanism)", async () => {
    const { host, svc } = setup();
    const plan = (await import("../edit/index.js")).planInsertMember(host.index, host.index.findByQualifiedName("Model::Vehicle")[0]!, "part w;");
    if (!plan.ok) throw new Error(plan.reason);
    host.buffers.set(URI, "// x\n" + host.buffers.get(URI)!);
    expect(await host.applyAndSave(plan.edits, plan.sources!)).toEqual({ ok: false, stale: true });
    void svc;
  });

  test("a rename updates a closed diagram whose names are quoted", async () => {
    const { host, svc } = setup();
    host.addDiagram("file:///w/q.sysmld", DIAGRAM(`[{"id":"n1","ref":"'Model'::'Engine'"}]`));
    ok(await svc.rename(svc.find("Model::Engine")!, "Motor"));
    expect(host.diagramOnDisk("file:///w/q.sysmld").nodes[0]!.ref).toBe("Model::Motor");
  });
});

describe("inherited rule below inherited members (depths 1 to 3)", () => {
  const DEEP = `package M {
  part def Engine { part piston; }
  part def Vehicle {
    part engine : Engine {
      part cylinder {
        part bolt;
      }
    }
  }
  part vehicle1 : Vehicle;
}
`;
  const paths = ["M::vehicle1::engine", "M::vehicle1::engine::cylinder", "M::vehicle1::engine::cylinder::bolt", "M::vehicle1::engine::piston"];

  for (const path of paths) {
    test(`${path}: delete, rename, set properties and add are refused and change nothing`, async () => {
      const host = new FakeHost();
      host.addDocument(URI, DEEP);
      const svc = new ModelService(host);
      const t = svc.find(path)!;
      expect(t.context, path).toBeDefined();
      for (const r of [
        await svc.deleteElement(t),
        await svc.rename(t, "other"),
        await svc.setProperties(t, { documentation: "x" }),
        await svc.setProperties(t, { name: "other" }),
        await svc.addElement(t.element, { kind: "part", name: "extra" }, { context: t.context! }),
      ]) {
        expect(r.ok, path).toBe(false);
        if (r.ok) continue;
        expect(r.reason).toMatch(/inherited/);
        expect(r.goToDefinition?.name).toMatch(/^M::(Vehicle|Engine)$/);
      }
      expect(host.applied).toHaveLength(0);
      expect(host.buffers.get(URI)).toBe(DEEP);
    });
  }

  test("the same elements reached through the definition are editable", async () => {
    const host = new FakeHost();
    host.addDocument(URI, DEEP);
    const svc = new ModelService(host);
    const t = svc.find("M::Vehicle::engine::cylinder::bolt")!;
    expect(t.context).toBeUndefined();
    ok(await svc.rename(t, "screw"));
  });
});

const URI2 = "file:///w/n.sysml";

describe("a save that fails after the edit was applied", () => {
  function two() {
    const host = new FakeHost();
    host.addDocument(URI, MODEL);
    host.addDocument(URI2, "package Other {\n  part def Wheel;\n}\n");
    host.addDiagram("file:///w/d.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle"},{"id":"n2","ref":"Model::Vehicle::engine","parent":"n1"}]`), true);
    host.addDiagram("file:///w/closed.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle::engine"}]`));
    return { host, svc: new ModelService(host), q: (qn: string) => host.index.findByQualifiedName(qn)[0]! };
  }

  test("is a success with saveError per document; diagrams, closed diagrams and the undo entry are still handled", async () => {
    const { host, svc, q } = two();
    host.failSave = new Set([URI]);
    const r = ok(await svc.deleteElement({ element: q("Model::Vehicle::engine") }, { diagram: "file:///w/d.sysmld" }));
    expect(r.saveError?.unsaved).toEqual([URI]);
    expect(host.buffers.get(URI)).not.toContain("part engine");
    expect(host.disk.get(URI)).toBe(MODEL); // not saved
    expect(host.diagramOnDisk("file:///w/closed.sysmld").nodes).toHaveLength(0);
    expect(host.diagramOnDisk("file:///w/d.sysmld").nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(host.entries).toHaveLength(1);
    const w = host.warnings.find((x) => /could not be saved/.test(x.message))!;
    expect(w.message).toContain("m.sysml");
    expect(w.action).toEqual({ label: "Save All", command: "workbench.action.files.saveAll" });
  });

  test("one of two documents fails: the result names exactly the unsaved one and the saved one is on disk", async () => {
    const host = new FakeHost();
    host.addDocument(URI, "package Model {\n  part def Engine;\n}\n");
    host.addDocument(URI2, "package Other {\n  part e : Model::Engine;\n}\n");
    const svc = new ModelService(host);
    host.failSave = new Set([URI2]);
    const r = ok(await svc.rename({ element: host.index.findByQualifiedName("Model::Engine")[0]! }, "Motor"));
    expect([...r.files].sort()).toEqual([URI, URI2]);
    expect(r.saveError?.unsaved).toEqual([URI2]);
    expect(host.disk.get(URI)).toContain("part def Motor");
    expect(host.disk.get(URI2)).toContain("Model::Engine"); // not saved
    expect(host.buffers.get(URI2)).toContain("Model::Motor");
    expect(r.saveError?.message).toContain("n.sysml");
    expect(r.saveError?.message).not.toContain("m.sysml");
  });
});

describe("kinds", () => {
  test("a kind outside allowedChildKinds(owner) is refused, whatever its form", async () => {
    const { host, svc, q } = setup();
    for (const kind of ["package", "part def", "connect", "part; part x", "", "   ", "x".repeat(100)]) {
      const r = await svc.addElement(q("Model::Vehicle"), { kind, name: "z" });
      expect(r.ok, kind).toBe(false);
    }
    const r = await svc.addElement(q("Model::Vehicle"), { kind: "part def", name: "z" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Allowed: part, port/);
    expect((await svc.addElement(q("Model"), { kind: "part def", name: "Z" })).ok).toBe(true);
    expect(host.applied).toHaveLength(1);
  });

  test("the tree list, the palette and the agent enum are all drawn from one list", async () => {
    const { ADD_KINDS } = await import("./support.js");
    const { paletteFor } = await import("../diagram/palette.js");
    const { CREATABLE_KINDS } = await import("./kinds.js");
    expect(ADD_KINDS.map((k) => k.kind)).toEqual([...CREATABLE_KINDS]);
    const { RELATIONSHIP_KINDS: relationships } = await import("../agent-tools/edit-tools.js");
    for (const dk of ["general", "interconnection", "requirements", "actionFlow", "stateTransition", "sequence"] as const)
      for (const p of paletteFor(dk)) expect(relationships.includes(p.kind) ? relationships : CREATABLE_KINDS, p.kind).toContain(p.kind);
  });
});

describe("read-only guard in the service", () => {
  test("library, non-file and host-blocked documents are refused for every operation", async () => {
    const host = new FakeHost();
    host.addDocument("sysml-library:///Lib.sysml", "package Lib { part def Thing { part x; } }");
    host.addDocument("untitled:Untitled-1", "package U { part def A { part y; } }");
    host.addDocument(URI, MODEL);
    host.blocked.set(URI, "m.sysml is excluded by sysml.exclude, so it is not edited.");
    const svc = new ModelService(host);
    const q = (qn: string) => host.index.findByQualifiedName(qn)[0]!;
    for (const qn of ["Lib::Thing", "U::A", "Model::Vehicle"]) {
      const t = { element: q(qn) };
      for (const r of [await svc.deleteElement(t), await svc.rename(t, "Q"), await svc.setProperties(t, { documentation: "d" }), await svc.addElement(t.element, { kind: "part", name: "n" })]) {
        expect(r.ok, qn).toBe(false);
        if (!r.ok) expect(r.reason, qn).toMatch(/read-only|not a file|excluded/);
      }
    }
    expect(host.applied).toHaveLength(0);
    expect(svc.blockedReason("sysml-library:///Lib.sysml")).toMatch(/read-only/);
    expect(svc.blockedReason(URI)).toMatch(/excluded/);
    expect(svc.blockedReason(URI2)).toBeUndefined();
  });

  test("a plan that would edit a blocked document is refused", async () => {
    const host = new FakeHost();
    host.addDocument(URI, MODEL);
    host.addDocument(URI2, "package Other { part def Wheel; }");
    host.blocked.set(URI2, "n.sysml lies outside every workspace folder, so it is not edited.");
    const svc = new ModelService(host);
    const q = (qn: string) => host.index.findByQualifiedName(qn)[0]!;
    // typing the usage with a type from the blocked file would only edit m.sysml (allowed)
    expect((await svc.addElement(q("Model::Vehicle"), { kind: "part", name: "w", type: "Other::Wheel" })).ok).toBe(true);
    // renaming Wheel edits n.sysml
    const r = await svc.rename({ element: q("Other::Wheel") }, "Tyre");
    expect(r.ok).toBe(false);
  });
});

describe("diagram follow-up problems", () => {
  test("failed and skipped diagrams are reported in the result and warned about", async () => {
    const host = new FakeHost();
    host.addDocument(URI, MODEL);
    host.addDiagram("file:///w/ok.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle::engine"}]`));
    host.addDiagram("file:///w/bad.sysmld", "{ not json");
    host.addDiagram("file:///w/throws.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle::engine"}]`));
    host.failDiagrams.add("file:///w/throws.sysmld");
    const svc = new ModelService(host);
    const r = ok(await svc.deleteElement({ element: host.index.findByQualifiedName("Model::Vehicle::engine")[0]! }));
    expect(r.diagramProblems).toEqual({ failed: ["file:///w/throws.sysmld"], skipped: ["file:///w/bad.sysmld"] });
    expect(r.diagramFiles).toEqual(["file:///w/ok.sysmld"]);
    const w = host.warnings.find((x) => /could not be updated/.test(x.message))!;
    expect(w.message).toMatch(/bad.sysmld/);
    expect(w.message).toMatch(/throws.sysmld/);
  });
});

describe("closed diagrams are read inside the plan and checked before writing", () => {
  test("a closed diagram that changed after planning is not overwritten; the user is warned", async () => {
    const host = new FakeHost();
    host.addDocument(URI, MODEL);
    const diag = DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle::engine"}]`);
    host.addDiagram("file:///w/c.sysmld", diag);
    const svc = new ModelService(host);
    const orig = host.writeDiagramFiles.bind(host);
    // the file changes on disk between applying the text and writing the diagram
    const origApply = host.applyAndSave.bind(host);
    const changed = diag.replace('"n1"', '"n7"');
    host.applyAndSave = async (e, s) => {
      const r = await origApply(e, s);
      host.diagramDisk.set("file:///w/c.sysmld", changed);
      return r;
    };
    host.writeDiagramFiles = orig;
    const r = ok(await svc.rename({ element: host.index.findByQualifiedName("Model::Vehicle::engine")[0]! }, "motor"));
    expect(host.diagramDisk.get("file:///w/c.sysmld")).toBe(changed);
    expect(r.diagramsChangedMeanwhile).toEqual(["file:///w/c.sysmld"]);
    expect(host.warnings.some((w) => /changed on disk/.test(w.message))).toBe(true);
  });

  test("a re-plan reads the closed diagrams again", async () => {
    const host = new FakeHost();
    host.addDocument(URI, MODEL);
    host.addDiagram("file:///w/c.sysmld", DIAGRAM(`[{"id":"n1","ref":"Model::Vehicle::engine"}]`));
    const svc = new ModelService(host);
    let reads = 0;
    const orig = host.closedDiagrams.bind(host);
    host.closedDiagrams = async () => {
      reads++;
      return orig();
    };
    host.beforeApply = () => host.buffers.set(URI, "// header\n" + host.buffers.get(URI)!);
    ok(await svc.rename({ element: host.index.findByQualifiedName("Model::Vehicle::engine")[0]! }, "motor"));
    expect(reads).toBe(2);
    expect(host.diagramOnDisk("file:///w/c.sysmld").nodes[0]!.ref).toBe("Model::Vehicle::motor");
  });
});
