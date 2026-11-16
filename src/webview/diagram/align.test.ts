import { describe, expect, it } from "vitest";
import type { Box } from "./geometry.js";
import { planAlign, planDistribute } from "./align.js";
import { Scene, type SceneItem } from "./interaction.js";

const item = (id: string, abs: Box, extra: Partial<SceneItem> = {}, rel: Box = abs): SceneItem => ({ id, rel, abs, min: { w: 10, h: 10 }, headerH: 20, ...extra });
const scene = () => new Scene([
  item("a", { x: 100, y: 50, w: 80, h: 40 }),
  item("b", { x: 40, y: 200, w: 120, h: 60 }),
  item("c", { x: 300, y: 120, w: 60, h: 100 }),
]);

describe("planAlign", () => {
  it("left puts every left edge at the leftmost", () => {
    const p = planAlign(scene(), ["a", "b", "c"], "left");
    expect([...p].map(([id, b]) => [id, b.x])).toEqual([["a", 40], ["b", 40], ["c", 40]]);
    expect([...p.values()].map((b) => b.y)).toEqual([50, 200, 120]);
  });
  it("right, top, bottom, center and middle use the bounding box of the selection", () => {
    const s = scene();
    expect([...planAlign(s, ["a", "b", "c"], "right").values()].map((b) => b.x + 0)).toEqual([280, 240, 300]);
    expect([...planAlign(s, ["a", "b", "c"], "top").values()].map((b) => b.y)).toEqual([50, 50, 50]);
    expect([...planAlign(s, ["a", "b", "c"], "bottom").values()].map((b) => b.y)).toEqual([220, 200, 160]);
    expect([...planAlign(s, ["a", "b", "c"], "center").values()].map((b) => b.x)).toEqual([160, 140, 170]);
    expect([...planAlign(s, ["a", "b", "c"], "middle").values()].map((b) => b.y)).toEqual([135, 125, 105]);
  });
  it("needs two nodes", () => {
    expect(planAlign(scene(), ["a"], "left").size).toBe(0);
  });
  it("moves a nested node by the same amount in its parent's coordinates, and skips ports and nodes inside a selected parent", () => {
    const s = new Scene([
      item("p", { x: 100, y: 100, w: 300, h: 200 }),
      item("k", { x: 150, y: 160, w: 60, h: 40 }, { parent: "p" }, { x: 50, y: 60, w: 60, h: 40 }),
      item("q", { x: 20, y: 400, w: 50, h: 50 }),
      item("port", { x: 93, y: 150, w: 14, h: 14 }, { owner: "p" }, { x: -7, y: 50, w: 14, h: 14 }),
    ]);
    const p = planAlign(s, ["p", "k", "q", "port"], "left");
    expect([...p.keys()]).toEqual(["p", "q"]);
    expect(p.get("p")!.x).toBe(20);
    const kid = planAlign(s, ["k", "q"], "left");
    expect(kid.get("k")).toEqual({ x: 50 - 130, y: 60 });
  });
});

describe("planDistribute", () => {
  it("makes the gaps equal and keeps the outer nodes", () => {
    const s = new Scene([item("a", { x: 0, y: 0, w: 50, h: 20 }), item("b", { x: 60, y: 30, w: 100, h: 20 }), item("c", { x: 300, y: 60, w: 50, h: 20 })]);
    const p = planDistribute(s, ["a", "b", "c"], "horizontal");
    expect(p.get("a")!.x).toBe(0);
    expect(p.get("c")!.x).toBe(300);
    expect(p.get("b")!.x).toBe(125);
    const v = planDistribute(s, ["a", "b", "c"], "vertical");
    expect([...v.values()].map((b) => b.y)).toEqual([0, 30, 60]);
  });
  it("needs three nodes", () => {
    expect(planDistribute(scene(), ["a", "b"], "horizontal").size).toBe(0);
  });
});
