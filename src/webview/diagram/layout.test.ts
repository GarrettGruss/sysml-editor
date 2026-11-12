import { readFileSync } from "node:fs";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../../model/index.js";
import { parseDiagram } from "../../diagram/format.js";
import { resolveDiagram } from "../../diagram/resolve.js";
import { buildViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, clipToBox, countOverlaps, describeBox, headPoints, wrapText, type Measure } from "./geometry.js";
import { layoutDiagram, type ElkLike } from "./layout.js";
import { LIGHT_PALETTE, buildSvg, wrapStandalone } from "./svg.js";

const measure: Measure = (t, s) => t.length * (s === "small" ? 5.5 : 6.5);
const elk = new ELK() as unknown as ElkLike;
const dir = new URL("../../../test/fixtures/workspace-basic/", import.meta.url);

function vmOf(file: string) {
  const ix = new ModelIndex();
  ix.setDocument("file:///ws/ports.sysml", readFileSync(new URL("ports.sysml", dir), "utf8"));
  const r = parseDiagram(readFileSync(new URL(file, dir), "utf8"));
  if (!r.ok) throw new Error("fixture does not parse");
  return buildViewModel(r.doc, resolveDiagram(r.doc, ix), ix);
}

describe("geometry", () => {
  it("wraps text to a width and splits over-long words", () => {
    const lines = wrapText("the quick brown fox jumps over the lazy dog", 100, measure);
    expect(lines.every((l) => measure(l, "normal") <= 100)).toBe(true);
    expect(lines.join(" ")).toBe("the quick brown fox jumps over the lazy dog");
    const long = wrapText("x".repeat(80), 100, measure);
    expect(long.every((l) => measure(l, "normal") <= 100)).toBe(true);
    expect(long.join("")).toBe("x".repeat(80));
  });
  it("sizes a box to hold its widest line", () => {
    const vm = vmOf("ports-general.sysmld");
    const n = vm.nodes.find((x) => x.id === "n4")!;
    const c = describeBox(n, measure);
    for (const r of c.rows) expect(measure(r.text, r.style)).toBeLessThanOrEqual(c.w);
    expect(c.h).toBeGreaterThan(c.rows.at(-1)!.y);
  });
  it("clips a line to the box border and builds arrow heads", () => {
    expect(clipToBox({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 25 })).toEqual({ x: 100, y: 25 });
    const [tip, a, b] = headPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 4, 2);
    expect(tip).toEqual({ x: 0, y: 0 });
    expect(a).toEqual({ x: 4, y: 2 });
    expect(b).toEqual({ x: 4, y: -2 });
  });
});

describe("layout", () => {
  it("keeps stored positions exactly and places nothing for a fully positioned diagram", async () => {
    const vm = vmOf("ports-general.sysmld");
    const l = await layoutDiagram(vm, elk, measure);
    expect(l.placed.size).toBe(0);
    expect(l.boxes.get("n2")).toMatchObject({ x: 40, y: 260 });
    expect(l.boxes.get("n4")).toMatchObject({ x: 40, y: 40 });
    expect(countOverlaps(vm, absoluteBoxes(vm, l.boxes))).toBe(0);
  });
  it("positions a coordinate-free diagram without overlaps", async () => {
    const vm = vmOf("ports-general-auto.sysmld");
    const l = await layoutDiagram(vm, elk, measure);
    expect(l.placed.size).toBe(vm.nodes.length);
    expect(countOverlaps(vm, absoluteBoxes(vm, l.boxes))).toBe(0);
  });
  it("places only the nodes that lack positions, beside the stored ones", async () => {
    const vm = vmOf("ports-general-auto.sysmld");
    vm.nodes[0]!.geometry = { x: 100, y: 100 };
    const l = await layoutDiagram(vm, elk, measure);
    expect(l.placed.has(vm.nodes[0]!.id)).toBe(false);
    expect(l.boxes.get(vm.nodes[0]!.id)).toMatchObject({ x: 100, y: 100 });
    expect(countOverlaps(vm, absoluteBoxes(vm, l.boxes))).toBe(0);
  });
  it("nests children inside their container and puts ports on borders", async () => {
    const vm = vmOf("drivetrain-interconnection.sysmld");
    const l = await layoutDiagram(vm, elk, measure);
    const abs = absoluteBoxes(vm, l.boxes);
    for (const n of vm.nodes.filter((x) => x.parent !== undefined)) {
      const c = abs.get(n.id)!;
      const p = abs.get(n.parent!)!;
      expect(c.x).toBeGreaterThanOrEqual(p.x);
      expect(c.y).toBeGreaterThanOrEqual(p.y);
      expect(c.x + c.w).toBeLessThanOrEqual(p.x + p.w);
      expect(c.y + c.h).toBeLessThanOrEqual(p.y + p.h);
    }
    for (const n of vm.nodes.filter((x) => x.attachedTo !== undefined)) {
      const b = abs.get(n.id)!;
      const o = abs.get(n.attachedTo!)!;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const onVertical = (Math.abs(cx - o.x) <= 2 || Math.abs(cx - (o.x + o.w)) <= 2) && cy >= o.y && cy <= o.y + o.h;
      expect(onVertical, n.id).toBe(true);
    }
    expect(countOverlaps(vm, abs)).toBe(0);
  });
  it("draws every node and edge into an SVG", async () => {
    const vm = vmOf("drivetrain-interconnection.sysmld");
    const l = await layoutDiagram(vm, elk, measure);
    const { svg } = wrapStandalone(buildSvg(vm, l.boxes, measure, { palette: LIGHT_PALETTE }), { palette: LIGHT_PALETTE });
    for (const n of vm.nodes) expect(svg).toContain(`data-node="${n.id}"`);
    for (const e of vm.edges) expect(svg).toContain(`data-edge="${e.id}"`);
    expect(svg).toContain("«part»");
    expect(svg).not.toContain("class=");
    expect(svg).not.toContain(" style=");
  });
});
