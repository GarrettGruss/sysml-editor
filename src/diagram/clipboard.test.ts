import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { copyNodes, pasteNodes } from "./clipboard.js";
import { addElements, createDiagram } from "./create.js";
import { makeSourceMapper } from "./resolve.js";

const sourceOf = makeSourceMapper("file:///ws");
const text = "package P {\n  part def A;\n  part def B;\n  dependency from A to B;\n}\n";
const index = (t: string) => { const ix = new ModelIndex(); ix.setDocument("file:///ws/m.sysml", t); return ix; };
const mk = (ix: ModelIndex) => createDiagram(ix, "P", "general", { sourceOf });

describe("pasting nodes", () => {
  it("adds a line only when both ends are drawn after the paste, and counts the rest", () => {
    const ix = index(text);
    const els = ["P::A", "P::B"].map((q) => ix.findByQualifiedName(q)[0]!);
    const dep = ix.findByQualifiedName("P")[0]!.members.find((e) => e.kind === "dependency");
    expect(dep).toBeDefined();
    const full = addElements(mk(ix), ix, [...els, dep!], { sourceOf });
    const clip = copyNodes(full.doc, full.doc.nodes.map((n) => n.id))!;
    expect(clip.lines.length).toBe(1);
    // B was renamed: the line's end no longer resolves, so it is not added, and B counts as missing.
    const renamed = index(text.replace("part def B;", "part def B2;").replace("A to B", "A to B2"));
    const r = pasteNodes(mk(renamed), renamed, clip, { sourceOf });
    expect(r.missing).toBeGreaterThanOrEqual(1);
    for (const e of r.doc.edges) {
      const ids = new Set(r.doc.nodes.map((n) => n.id));
      expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    }
    // Nothing is missing when everything resolves.
    const ok = pasteNodes(mk(ix), ix, clip, { sourceOf });
    expect(ok.missing).toBe(0);
    expect(ok.doc.edges).toHaveLength(1);
  });

  it("places a pasted node clear of existing nodes", () => {
    const ix = index(text);
    const [a, b] = ["P::A", "P::B"].map((q) => ix.findByQualifiedName(q)[0]!);
    const flat = { ...mk(ix), nodes: [], edges: [] };
    const base = addElements(flat, ix, [b!], { sourceOf });
    const doc = { ...base.doc, nodes: base.doc.nodes.map((n) => ({ ...n, x: 100, y: 100, w: 160, h: 100 })) };
    const clip = { sources: [...doc.sources], nodes: [{ ref: { ref: "P::A" }, x: 60, y: 60 }], lines: [] };
    void a;
    const r = pasteNodes(doc, ix, clip, { sourceOf });
    const pasted = r.doc.nodes.find((n) => n.ref === "P::A")!;
    expect(pasted.parent).toBeUndefined();
    const clear = pasted.x! >= 260 || pasted.y! >= 200 || pasted.x! + 160 <= 100 || pasted.y! + 100 <= 100;
    expect(clear).toBe(true);
  });
});
