import { readFileSync } from "node:fs";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../../model/index.js";
import { parseDiagram } from "../../diagram/format.js";
import { resolveDiagram } from "../../diagram/resolve.js";
import { buildViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, type Box, type Measure } from "./geometry.js";
import { layoutDiagram, type ElkLike } from "./layout.js";
import { layoutSelection, placeGroup } from "./selection-layout.js";

const measure: Measure = (t, s) => t.length * (s === "small" ? 5.5 : 6.5);
const elk = new ELK() as unknown as ElkLike;
const dir = new URL("../../../test/fixtures/workspace-basic/", import.meta.url);

describe("placeGroup", () => {
  const b = (x: number, y: number, w = 100, h = 50): Box => ({ x, y, w, h });
  it("puts the bounding box's top-left at the wanted point", () => {
    expect(placeGroup([b(20, 20), b(200, 120)], { x: 500, y: 300 }, [])).toEqual({ x: 480, y: 280 });
  });
  it("moves right past an obstacle with a gap", () => {
    const s = placeGroup([b(0, 0)], { x: 100, y: 100 }, [b(80, 90, 100, 60)], 16);
    expect(s.y).toBe(100);
    expect(s.x).toBe(180 + 16);
  });
  it("keeps clear of several obstacles in a row", () => {
    const obs = [b(0, 0, 100, 100), b(110, 0, 100, 100), b(230, 0, 100, 100)];
    const s = placeGroup([b(0, 0, 60, 60)], { x: 10, y: 10 }, obs, 16);
    const placed = { x: s.x, y: s.y, w: 60, h: 60 };
    for (const o of obs) expect(placed.x >= o.x + o.w + 16 || placed.x + placed.w + 16 <= o.x).toBe(true);
  });
  it("is a no-op for an empty group", () => {
    expect(placeGroup([], { x: 5, y: 5 }, [])).toEqual({ x: 0, y: 0 });
  });
});

describe("layoutSelection", () => {
  async function setup() {
    const ix = new ModelIndex();
    ix.setDocument("file:///ws/ports.sysml", readFileSync(new URL("ports.sysml", dir), "utf8"));
    const r = parseDiagram(readFileSync(new URL("ports-general.sysmld", dir), "utf8"));
    if (!r.ok) throw new Error("fixture does not parse");
    const vm = buildViewModel(r.doc, resolveDiagram(r.doc, ix), ix);
    const full = await layoutDiagram(vm, elk, measure);
    return { vm, rel: full.boxes };
  }
  it("moves only the selected nodes, near where they were, clear of the others", async () => {
    const { vm, rel } = await setup();
    const tops = vm.nodes.filter((n) => n.parent === undefined && n.attachedTo === undefined);
    expect(tops.length).toBeGreaterThan(2);
    const picked = tops.slice(0, 2).map((n) => n.id);
    const out = await layoutSelection(vm, picked, rel, elk, measure);
    expect(out).toBeDefined();
    const moved = new Set(out!.boxes.map((b) => b.id));
    for (const n of vm.nodes) if (!n.parent && !n.attachedTo && !picked.includes(n.id)) expect(moved.has(n.id)).toBe(false);
    const next = new Map(rel);
    for (const b of out!.boxes) next.set(b.id, { x: b.x, y: b.y, w: b.w, h: b.h });
    const abs = absoluteBoxes(vm, next);
    for (const p of picked) for (const t of tops) {
      if (picked.includes(t.id)) continue;
      const a = abs.get(p)!, o = abs.get(t.id)!;
      expect(a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h, `${p} overlaps ${t.id}`).toBe(false);
    }
  });
  it("answers undefined without a selected node, so the whole diagram is laid out", async () => {
    const { vm, rel } = await setup();
    expect(await layoutSelection(vm, [], rel, elk, measure)).toBeUndefined();
    expect(await layoutSelection(vm, ["nope"], rel, elk, measure)).toBeUndefined();
  });
  it("keeps the routes between unselected nodes and drops those that join the selection", async () => {
    const { vm, rel } = await setup();
    const withPts = { ...vm, edges: vm.edges.map((e) => ({ ...e, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })) };
    const sel = withPts.nodes.find((n) => n.parent === undefined && n.attachedTo === undefined)!.id;
    const out = await layoutSelection(withPts, [sel], rel, elk, measure);
    const touching = new Set(withPts.edges.filter((e) => e.source === sel || e.target === sel).map((e) => e.id));
    for (const e of withPts.edges) {
      if (e.derived) continue;
      const kept = out!.edges.some((x) => x.id === e.id);
      if (touching.has(e.id)) expect(kept).toBe(false);
      else expect(kept).toBe(true);
    }
  });
});
