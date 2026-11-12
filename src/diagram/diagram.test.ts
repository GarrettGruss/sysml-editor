import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateSchema } from "../agent-tools/schema.js";
import type { JsonSchema } from "../agent-tools/types.js";
import { ModelIndex } from "../model/index.js";
import { createDiagram, addElement, nextId } from "./create.js";
import { describeDiagram, MAX_DESCRIBED_NODES } from "./describe.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "./format.js";
import { applyUpdates, reconcile, relink, removeItem } from "./reconcile.js";
import { referenceFor, resolveDiagram, resolveReference } from "./resolve.js";

const schema = JSON.parse(readFileSync(new URL("../../schemas/sysmld.schema.json", import.meta.url), "utf8")) as JsonSchema;
const URI = "file:///ws/model/vehicle.sysml";

function model(text: string, uri = URI): ModelIndex {
  const ix = new ModelIndex();
  ix.setDocument(uri, text);
  return ix;
}
const el = (ix: ModelIndex, qn: string) => ix.findByQualifiedName(qn)[0]!;

const VEHICLE = `package VehicleModel {
  private import ScalarValues::*;
  part def Engine; part def Transmission;
  part def Vehicle {
    doc /* a vehicle */
    part engine : Engine;
    part transmission : Transmission;
    connect engine.drive to transmission.input;
  }
}`;

const CANONICAL = `{
  "version": 1,
  "kind": "general",
  "root": "VehicleModel::Vehicle",
  "sources": [
    "model/vehicle.sysml"
  ],
  "nodes": [
    {
      "id": "n1",
      "ref": "VehicleModel::Vehicle::engine",
      "x": 40,
      "y": 80.5,
      "w": 160,
      "h": 60,
      "collapsed": false,
      "parent": "n0"
    },
    {
      "id": "n2",
      "ref": "VehicleModel::Vehicle::transmission"
    },
    {
      "id": "n0",
      "ref": "VehicleModel::Vehicle"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "locator": {
        "owner": "VehicleModel::Vehicle",
        "kind": "connect",
        "ends": [
          "engine.drive",
          "transmission.input"
        ]
      },
      "source": "n1",
      "target": "n2"
    }
  ],
  "style": {}
}
`;
// n0 sorts before n1: write the canonical order explicitly
const canonical = (() => {
  const r = parseDiagram(CANONICAL);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return serializeDiagram(r.doc);
})();

describe("format", () => {
  it("serializes canonically and round-trips byte-identically", () => {
    expect(canonical.endsWith("}\n")).toBe(true);
    expect(canonical.indexOf('"id": "n0"')).toBeLessThan(canonical.indexOf('"id": "n1"'));
    const r = parseDiagram(canonical);
    expect(r.ok && serializeDiagram(r.doc)).toBe(canonical);
  });

  it("normalises non-canonical input, preserving unknown properties and rounding numbers", () => {
    const text = JSON.stringify({
      zzz: { b: 1, a: 2 }, version: 1, kind: "general", root: "A", sources: ["b.sysml", "a.sysml"],
      nodes: [{ x: 1.123456, ref: "A::b", id: "n2", extra: [1] }, { id: "n1", ref: "A", w: 10 }], edges: [],
    });
    const r = parseDiagram(text);
    if (!r.ok) throw new Error("parse");
    const out = serializeDiagram(r.doc);
    expect(out.indexOf('"id": "n1"')).toBeLessThan(out.indexOf('"id": "n2"'));
    expect(out).toContain('"x": 1.12');
    expect(out).toContain('"extra"');
    expect(out).toContain('"zzz": {\n    "a": 2,\n    "b": 1\n  }');
    expect(out.indexOf('"a.sysml"')).toBeLessThan(out.indexOf('"b.sysml"'));
    const again = parseDiagram(out);
    expect(again.ok && serializeDiagram(again.doc)).toBe(out);
  });

  const base = (): Record<string, unknown> => ({
    version: 1, kind: "general", root: "A", sources: ["a.sysml"],
    nodes: [{ id: "n1", ref: "A" }, { id: "n2", ref: "A::b", parent: "n1" }],
    edges: [{ id: "e1", locator: { owner: "A", kind: "connect", ends: ["x", "y"] }, source: "n1", target: "n2" }],
  });
  const mut = (f: (d: any) => void) => { const d = base(); f(d); return JSON.stringify(d); };
  // [name, text, schemaValid, parserValid, path fragment expected in problems]
  const samples: [string, string, boolean, boolean, string?][] = [
    ["valid", JSON.stringify(base()), true, true],
    ["no coordinates", mut((d) => { d.nodes = [{ id: "n1", ref: "A" }]; d.edges = []; }), true, true],
    ["with style, points", mut((d) => { d.style = { a: 1 }; d.edges[0].points = [{ x: 1, y: 2 }]; d.nodes[0].x = 5; }), true, true],
    ["wrong version", mut((d) => { d.version = 2; }), false, false, "$.version"],
    ["unknown kind", mut((d) => { d.kind = "bdd"; }), false, false, "$.kind"],
    ["missing root", mut((d) => { delete d.root; }), false, false, "$.root"],
    ["missing nodes", mut((d) => { delete d.nodes; }), false, false, "$.nodes"],
    ["both ref and locator", mut((d) => { d.nodes[0].locator = { owner: "A", kind: "part", ends: [] }; }), false, false, "$.nodes[0]"],
    ["neither ref nor locator", mut((d) => { delete d.nodes[0].ref; }), false, false, "$.nodes[0]"],
    ["bad locator", mut((d) => { d.edges[0].locator.ends = "x"; }), false, false, "$.edges[0].locator.ends"],
    ["bad x", mut((d) => { d.nodes[0].x = "1"; }), false, false, "$.nodes[0].x"],
    ["negative width", mut((d) => { d.nodes[0].w = -1; }), false, false, "$.nodes[0].w"],
    ["edge without target", mut((d) => { delete d.edges[0].target; }), false, false, "$.edges[0].target"],
    ["duplicate id", mut((d) => { d.nodes[1].id = "n1"; }), true, false, "$.nodes[1].id"],
    ["id shared by node and edge", mut((d) => { d.edges[0].id = "n1"; }), true, false, "$.edges[0].id"],
    ["dangling parent", mut((d) => { d.nodes[1].parent = "n9"; }), true, false, "$.nodes[1].parent"],
    ["dangling source", mut((d) => { d.edges[0].source = "n9"; }), true, false, "$.edges[0].source"],
    ["dangling target", mut((d) => { d.edges[0].target = "n9"; }), true, false, "$.edges[0].target"],
    ["parent cycle", mut((d) => { d.nodes[0].parent = "n2"; }), true, false, "parent"],
  ];
  it.each(samples)("schema and parser agree: %s", (_n, text, schemaOk, parserOk, path) => {
    expect(validateSchema(JSON.parse(text), schema, "$")).toEqual(schemaOk ? [] : expect.arrayContaining([expect.any(String)]));
    const r = parseDiagram(text);
    expect(r.ok).toBe(parserOk);
    if (!r.ok && path) expect(r.problems.some((p) => p.path.startsWith(path) || p.path.includes(path))).toBe(true);
    // the schema is never stricter than what the parser rejects only in one direction
    if (!schemaOk) expect(parserOk).toBe(false);
  });

  it("reports bad JSON with a path", () => {
    const r = parseDiagram("{nope");
    expect(!r.ok && r.problems[0]!.path).toBe("$");
    expect(parseDiagram("[]").ok).toBe(false);
  });
});

describe("resolve", () => {
  it("resolves a named element by qualified name", () => {
    const ix = model(VEHICLE);
    const e = resolveReference({ ref: "VehicleModel::Vehicle::engine" }, { sources: [] }, ix);
    expect(e?.kind).toBe("part");
    expect(resolveReference({ ref: "VehicleModel::Vehicle::nope" }, { sources: [] }, ix)).toBeUndefined();
  });

  it("prefers the declaration in a listed source", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/a.sysml", "package P { part def X; }");
    ix.setDocument("file:///ws/b.sysml", "package P { part def X; }");
    const doc = { sources: ["b.sysml"] };
    const r = resolveReference({ ref: "P::X" }, doc, ix, { sourceOf: (u) => u.replace("file:///ws/", "") });
    expect(r?.uri).toBe("file:///ws/b.sysml");
  });

  it("builds a locator for an unnamed connection and still resolves after unrelated additions", () => {
    const ix = model(VEHICLE);
    const conn = el(ix, "VehicleModel::Vehicle").members.find((m) => m.kind === "connect")!;
    const ref = referenceFor(conn)!;
    expect(ref).toEqual({ locator: { owner: "VehicleModel::Vehicle", kind: "connect", ends: ["engine.drive", "transmission.input"] } });
    ix.setDocument(URI, VEHICLE.replace("part engine", "attribute mass; part extra; connect extra.a to extra.b;\n part engine"));
    const again = resolveReference(ref, { sources: [] }, ix)!;
    expect(again.ends).toEqual(["engine.drive", "transmission.input"]);
  });

  it("normalises whitespace in ends", () => {
    const ix = model(VEHICLE);
    const r = resolveReference({ locator: { owner: "VehicleModel::Vehicle", kind: "connect", ends: ["engine . drive", "transmission.input"] } }, { sources: [] }, ix);
    expect(r?.kind).toBe("connect");
  });

  it("uses index only for identical siblings", () => {
    const ix = model("package P { part def V { part a; part b; connect a to b; attribute z; connect a to b; } }");
    const [c1, c2] = el(ix, "P::V").members.filter((m) => m.kind === "connect") as [any, any];
    const r1 = referenceFor(c1)!, r2 = referenceFor(c2)!;
    expect(r1.locator!.index).toBe(0);
    expect(r2.locator!.index).toBe(1);
    expect(resolveReference(r1, { sources: [] }, ix)).toBe(c1);
    expect(resolveReference(r2, { sources: [] }, ix)).toBe(c2);
    expect(resolveReference({ locator: { ...r2.locator!, index: 5 } }, { sources: [] }, ix)).toBeUndefined();
    // a distinct connection needs no index
    const ix2 = model("package P { part def V { part a; part b; connect a to b; } }");
    const c = el(ix2, "P::V").members.find((m) => m.kind === "connect")!;
    expect(referenceFor(c)!.locator!.index).toBeUndefined();
  });
});

describe("reconcile", () => {
  const SRC = "package P { part def Engine; part def V { part engine : Engine { attribute rpm; } part other : Engine; } }";
  const docFor = (): DiagramDocument => ({
    version: 1, kind: "general", root: "P::V", sources: ["model/vehicle.sysml"],
    nodes: [
      { id: "n1", ref: "P::V" },
      { id: "n2", ref: "P::V::engine", x: 10, y: 20, parent: "n1" },
      { id: "n3", ref: "P::V::engine::rpm", x: 1, y: 2, parent: "n2" },
      { id: "n4", ref: "P::V::other", parent: "n1" },
    ],
    edges: [],
  });

  it("keeps an externally deleted element as unresolved with its view state", () => {
    const ix = model(SRC);
    const doc = docFor();
    const first = reconcile(doc, ix);
    expect(first.unresolved).toEqual([]);
    ix.setDocument(URI, SRC.replace("part other : Engine;", ""));
    const r = reconcile(doc, ix, first.snapshot);
    expect(r.unresolved).toEqual(["n4"]);
    expect(r.updates).toEqual([]);
    expect(doc.nodes.find((n) => n.id === "n4")).toBeDefined();
  });

  it("detects a rename, keeps position, and updates children and the root", () => {
    const ix = model(SRC);
    const doc = docFor();
    const first = reconcile(doc, ix);
    ix.setDocument(URI, SRC.replace("part engine", "part motor"));
    const r = reconcile(doc, ix, first.snapshot);
    expect(r.unresolved).toEqual([]);
    expect(r.updates.map((u) => [u.itemId, u.to])).toEqual([["n2", { ref: "P::V::motor" }], ["n3", { ref: "P::V::motor::rpm" }]]);
    const next = applyUpdates(doc, r.updates);
    expect(next.nodes.find((n) => n.id === "n2")).toMatchObject({ ref: "P::V::motor", x: 10, y: 20 });
    expect(next.nodes.find((n) => n.id === "n3")!.ref).toBe("P::V::motor::rpm");
    expect(Object.keys(r.snapshot.items)).toContain("n3");
    // second pass is stable
    expect(reconcile(next, ix, r.snapshot).updates).toEqual([]);
  });

  it("updates the root when the root is renamed", () => {
    const ix = model(SRC);
    const doc = docFor();
    const first = reconcile(doc, ix);
    ix.setDocument(URI, SRC.replace("part def V ", "part def W "));
    const r = reconcile(doc, ix, first.snapshot);
    const next = applyUpdates(doc, r.updates);
    expect(next.root).toBe("P::W");
    expect(next.nodes.map((n) => n.ref)).toEqual(["P::W", "P::W::engine", "P::W::engine::rpm", "P::W::other"]);
    expect(r.unresolved).toEqual([]);
  });

  it("leaves ambiguous cases unresolved", () => {
    const ix = model(SRC);
    const doc = docFor();
    const first = reconcile(doc, ix);
    // two new candidates
    ix.setDocument(URI, SRC.replace("part engine : Engine { attribute rpm; }", "part a : Engine; part b : Engine;"));
    expect(reconcile(doc, ix, first.snapshot).unresolved).toContain("n2");
    expect(reconcile(doc, ix, first.snapshot).updates).toEqual([]);
    // zero candidates, different type
    ix.setDocument(URI, SRC.replace("part engine : Engine", "part motor : Other"));
    expect(reconcile(doc, ix, first.snapshot).unresolved).toContain("n2");
    // two lost items, one new candidate: neither is renamed
    ix.setDocument(URI, SRC.replace("part engine", "part x").replace("part other", "part x2").replace("part x2 : Engine;", ""));
    const r = reconcile(doc, ix, first.snapshot);
    expect(r.updates.filter((u) => u.itemId === "n4")).toEqual([]);
    // no previous snapshot: no detection
    ix.setDocument(URI, SRC.replace("part engine", "part motor"));
    expect(reconcile(doc, ix).unresolved).toContain("n2");
  });

  it("re-links and removes items", () => {
    const ix = model(SRC);
    let doc = docFor();
    doc = { ...doc, edges: [{ id: "e1", ref: "P::V::other", source: "n2", target: "n4" }] };
    const relinked = relink(doc, "n4", el(ix, "P::V::engine"));
    expect(relinked.nodes.find((n) => n.id === "n4")).toEqual({ id: "n4", ref: "P::V::engine", parent: "n1" });
    const removed = removeItem(doc, "n2");
    expect(removed.nodes.map((n) => n.id)).toEqual(["n1", "n4"]); // n3 is a child of n2
    expect(removed.edges).toEqual([]);
    expect(removeItem(doc, "e1").edges).toEqual([]);
    expect(removeItem(doc, "e1").nodes).toHaveLength(4);
    expect(() => relink(doc, "zz", el(ix, "P::V"))).toThrow();
  });
});

describe("createDiagram", () => {
  it("shows the root and its visible direct members, with no positions", () => {
    const ix = model(VEHICLE);
    const doc = createDiagram(ix, "VehicleModel::Vehicle", "general", { sourceOf: (u) => u.replace("file:///ws/", "") });
    expect(doc.nodes.map((n) => [n.id, n.ref, n.parent])).toEqual([
      ["n1", "VehicleModel::Vehicle", undefined],
      ["n2", "VehicleModel::Vehicle::engine", "n1"],
      ["n3", "VehicleModel::Vehicle::transmission", "n1"],
    ]);
    expect(doc.nodes.some((n) => "x" in n || "y" in n)).toBe(false);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]).toMatchObject({ id: "e1", source: "n2", target: "n3", locator: { kind: "connect" } });
    expect(doc.sources).toEqual(["model/vehicle.sysml"]);
    const text = serializeDiagram(doc);
    const back = parseDiagram(text);
    expect(back.ok).toBe(true);
    expect(validateSchema(JSON.parse(text), schema, "$")).toEqual([]);
    expect([...resolveDiagram(doc, ix).values()].every(Boolean)).toBe(true);
  });

  it("restricts to given elements and rejects an unknown root", () => {
    const ix = model(VEHICLE);
    const doc = createDiagram(ix, "VehicleModel::Vehicle", "general", { elements: ["VehicleModel::Vehicle::engine"] });
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toEqual([]);
    expect(() => createDiagram(ix, "Nope", "general")).toThrow();
  });

  it("addElement is a no-op for elements already shown and nextId counts up", () => {
    const ix = model(VEHICLE);
    const doc = createDiagram(ix, "VehicleModel::Vehicle", "general");
    const r = addElement(doc, ix, el(ix, "VehicleModel::Vehicle::engine"));
    expect(r.added).toBe(false);
    expect(r.id).toBe("n2");
    expect(r.doc).toBe(doc);
    const add = addElement(doc, ix, el(ix, "VehicleModel::Engine"));
    expect(add).toMatchObject({ added: true, id: "n4" });
    expect(nextId(add.doc, "e")).toBe("e2");
    expect(() => addElement(doc, ix, el(ix, "VehicleModel::Engine"), "n99")).toThrow();
  });

  const fixture = "fixtures/sysml-v2-release/sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml";
  it.skipIf(!existsSync(fixture))("every node and edge created from the real fixture resolves back", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/simple.sysml", readFileSync(fixture, "utf8"));
    let checked = 0;
    const visit = (e: import("../model/index.js").Element) => {
      if (!e.qualifiedName || !["package", "part def", "part"].includes(e.kind) || checked > 40) return;
      const doc = createDiagram(ix, e.qualifiedName, "general");
      const res = resolveDiagram(doc, ix);
      for (const [id, found] of res) expect(found, `${e.qualifiedName} ${id}`).toBeDefined();
      for (const item of [...doc.nodes, ...doc.edges]) expect(res.get(item.id)).toBeDefined();
      expect(parseDiagram(serializeDiagram(doc)).ok).toBe(true);
      checked++;
      e.members.forEach(visit);
    };
    ix.getDocument("file:///ws/simple.sysml")!.model.roots.forEach(visit);
    expect(checked).toBeGreaterThan(3);
  });
});

describe("describeDiagram", () => {
  it("describes resolved and unresolved items and caps size", () => {
    const ix = model(VEHICLE);
    let doc = createDiagram(ix, "VehicleModel::Vehicle", "general");
    doc = { ...doc, nodes: [...doc.nodes, { id: "n9", ref: "VehicleModel::Gone", x: 1, y: 2 }] };
    const d = describeDiagram(doc, ix);
    expect(d.unresolved).toEqual([{ id: "n9", ref: "VehicleModel::Gone" }]);
    expect(d.nodes.find((n) => n.id === "n2")).toMatchObject({ resolved: true, parent: "n1", element: { name: "engine", kind: "part", types: ["Engine"] } });
    expect(d.nodes.find((n) => n.id === "n9")).toMatchObject({ resolved: false, x: 1, y: 2 });
    expect(d.edges[0]).toMatchObject({ source: "n2", target: "n3", element: { kind: "connect" } });
    expect(d.note).toBeUndefined();
    const big = { ...doc, nodes: Array.from({ length: 600 }, (_, i) => ({ id: `n${i}`, ref: "VehicleModel::Vehicle" })), edges: [] };
    const bd = describeDiagram(big, ix);
    expect(bd.nodes).toHaveLength(MAX_DESCRIBED_NODES);
    expect(bd.note).toMatch(/600 nodes/);
  });
});
