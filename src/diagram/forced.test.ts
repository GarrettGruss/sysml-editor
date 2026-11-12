import { describe, expect, test } from "vitest";
import { ModelIndex } from "../model/index.js";
import { serializeDiagram, type DiagramDocument } from "./format.js";
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
