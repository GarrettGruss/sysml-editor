import { describe, expect, test } from "vitest";
import { ModelIndex } from "../model/index.js";
import { serializeDiagram, type DiagramDocument } from "./format.js";
import { dropEntriesChange } from "../model-service/diagram-changes.js";
import { DiagramState, dropKeys, forceChange, forceOnText, refresh, unforceChange } from "./session.js";
import { referenceKey } from "./resolve.js";

const doc = (nodes: DiagramDocument["nodes"]): DiagramDocument => ({ version: 1, kind: "general", root: "P", sources: ["a.sysml"], nodes, edges: [] });
const text = (d: DiagramDocument) => serializeDiagram(d);
const addNode = (d: DiagramDocument): DiagramDocument => (d.nodes.some((n) => n.id === "n9") ? d : { ...d, nodes: [...d.nodes, { id: "n9", ref: "P::fresh" }] });
const removeNode = (d: DiagramDocument): DiagramDocument => ({ ...d, nodes: d.nodes.filter((n) => n.id !== "n9") });

describe("forced diagram changes", () => {
  test("applied to the saved state on disk and to memory, without saving pending layout or dirtying", () => {
    const base = doc([{ id: "n1", ref: "P::A", x: 1, y: 1 }]);
    const s = new DiagramState(text(base));
    s.apply({ ...s.doc!, nodes: [{ id: "n1", ref: "P::A", x: 500, y: 500 }] }); // pending move
    expect(s.dirty).toBe(true);
    const token = {};
    const w = forceChange(s, token, addNode, text(base));
    expect(w.kind).toBe("write");
    const written = JSON.parse((w as { text: string }).text) as DiagramDocument;
    expect(written.nodes.map((n) => [n.id, n.x])).toEqual([["n1", 1], ["n9", undefined]]);
    expect(s.doc!.nodes.find((n) => n.id === "n1")!.x).toBe(500);
    expect(s.doc!.nodes.some((n) => n.id === "n9")).toBe(true);
    expect(s.dirty).toBe(true);
    expect(s.disk).toBe((w as { text: string }).text);
  });

  test("the forced change is not lost when a user edit made before it is undone", () => {
    const base = doc([{ id: "n1", ref: "P::A", x: 1, y: 1 }]);
    const s = new DiagramState(text(base));
    const edit = s.apply({ ...s.doc!, nodes: [{ id: "n1", ref: "P::A", x: 5, y: 5 }] });
    forceChange(s, {}, addNode, s.disk);
    edit.undo();
    expect(s.doc!.nodes.map((n) => n.id)).toEqual(["n1", "n9"]);
    expect(s.doc!.nodes[0]!.x).toBe(1);
  });

  test("unforce reverts memory and the saved state", () => {
    const base = doc([{ id: "n1", ref: "P::A" }]);
    const s = new DiagramState(text(base));
    const token = {};
    forceChange(s, token, addNode, s.disk);
    const w = unforceChange(s, token, removeNode, s.disk);
    expect(w.kind).toBe("write");
    expect(s.doc!.nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(s.forced).toHaveLength(0);
  });

  test("a closed file changes on its saved text", () => {
    const t = text(doc([{ id: "n1", ref: "P::A" }]));
    expect(JSON.parse(forceOnText(t, addNode)!).nodes).toHaveLength(2);
    expect(forceOnText(text(addNode(doc([]))), addNode)).toBeUndefined();
  });
});

describe("items created in this session that vanish from the text", () => {
  const model = (t: string) => {
    const i = new ModelIndex();
    i.setDocument("file:///w/a.sysml", t);
    return i;
  };

  test("no unresolved placeholder: refresh reports them, an earlier unresolved item stays", () => {
    const s = new DiagramState(text(doc([{ id: "n1", ref: "P::A" }, { id: "n2", ref: "P::gone" }, { id: "n9", ref: "P::fresh" }])));
    s.created.add(referenceKey({ ref: "P::fresh" }));
    const withNew = refresh(s, model("package P { part def A; part fresh; }"));
    expect(withNew!.vanished).toBeUndefined();
    const r = refresh(s, model("package P { part def A; }"))!;
    expect(r.vanished).toEqual(["ref:P::fresh"]);
    const dropped = dropKeys(s.doc!, r.vanished!);
    expect(dropped.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
  });
});

describe("vanished items: only a clean parse of the declaring document drops them", () => {
  const URI = "file:///w/a.sysml";
  const model = (t: string, into?: ModelIndex) => {
    const i = into ?? new ModelIndex();
    i.setDocument(URI, t);
    return i;
  };
  const fresh = () => {
    const s = new DiagramState(text(doc([{ id: "n1", ref: "P::A", x: 1, y: 1 }, { id: "n9", ref: "P::fresh", x: 70, y: 80 }])));
    s.created.add(referenceKey({ ref: "P::fresh" }));
    s.createdIn.set(referenceKey({ ref: "P::fresh" }), URI);
    return s;
  };
  const CTX = { uri: "file:///w/d.sysmld", sourceOf: (() => undefined) as never };

  test("a document with a syntax error never drops anything (even though its model lacks the element), and fixing it keeps the node", () => {
    const s = fresh();
    const ix = model("package P { part def A; part "); // never parsed cleanly: empty model
    expect(ix.getDocument(URI)!.errors.length).toBeGreaterThan(0);
    expect(refresh(s, ix)!.vanished).toBeUndefined();
    model("package P { part def A; part fresh; }", ix);
    const r = refresh(s, ix)!;
    expect(r.vanished).toBeUndefined();
    expect(s.doc!.nodes.some((n) => n.id === "n9")).toBe(true);
  });

  test("an item that rename detection matched is not dropped", () => {
    const s = fresh();
    const ix = model("package P { part def A; part fresh; }");
    refresh(s, ix); // snapshot
    model("package P { part def A; part fresher; }", ix);
    const r = refresh(s, ix)!;
    expect(r.vanished).toBeUndefined();
    expect(r.updates?.some((u) => u.itemId === "n9")).toBe(true);
  });

  test("Undo in the text editor (clean parse, element gone) drops the node; Redo brings it back at its position", () => {
    const s = fresh();
    const ix = model("package P { part def A; part fresh; }");
    expect(refresh(s, ix)!.vanished).toBeUndefined();
    model("package P { part def A; }", ix);
    const gone = refresh(s, ix)!;
    expect(gone.vanished).toEqual(["ref:P::fresh"]);
    const change = dropEntriesChange(gone.vanished!, "drop");
    forceChange(s, change, (d) => change.apply(d, CTX), s.disk);
    s.dropped.push({ change, uri: CTX.uri });
    for (const k of gone.vanished!) s.created.delete(k);
    expect(s.doc!.nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(refresh(s, ix)!.restore).toBeUndefined();
    // the element returns at the same qualified name
    model("package P { part def A; part fresh; }", ix);
    const back = refresh(s, ix)!;
    expect(back.restore).toEqual([change]);
    unforceChange(s, change, (d) => change.revert(d, CTX), s.disk);
    expect(s.doc!.nodes.find((n) => n.id === "n9")).toMatchObject({ ref: "P::fresh", x: 70, y: 80 });
    expect(s.forced.some((f) => f.token === change)).toBe(false);
  });
});

describe("forced changes and hand-edited lines", () => {
  test("a forced change keeps the saved route and label of an edge and does not save pending ones", () => {
    const saved: DiagramDocument = { ...doc([{ id: "n1", ref: "P::A", x: 1, y: 1 }, { id: "n2", ref: "P::B", x: 9, y: 9 }]), edges: [{ id: "e1", ref: "P::r", source: "n1", target: "n2", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], label: { dx: 1, dy: 2 } }] };
    const s = new DiagramState(text(saved));
    s.apply({ ...s.doc!, edges: [{ ...s.doc!.edges[0]!, points: [{ x: 0, y: 0 }, { x: 0, y: 5 }], label: { dx: 50, dy: 60, w: 40 } }] }); // pending layout edit
    const w = forceChange(s, {}, addNode, text(saved));
    const written = JSON.parse((w as { text: string }).text) as DiagramDocument;
    expect(written.edges[0]!.points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    expect(written.edges[0]!.label).toEqual({ dx: 1, dy: 2 });
    expect(s.doc!.edges[0]!.label).toEqual({ dx: 50, dy: 60, w: 40 });
    expect(s.doc!.edges[0]!.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: 5 }]);
    expect(s.dirty).toBe(true);
  });
});
