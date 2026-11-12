import { describe, expect, it } from "vitest";
import type { ViewModel } from "../../diagram/view-model.js";
import { buildScene } from "./scene.js";

describe("buildScene", () => {
  const vm: ViewModel = {
    kind: "interconnection", root: "r", edges: [],
    nodes: [
      { id: "p", shape: "port", label: "p", resolved: true, attachedTo: "a" },
      { id: "k", shape: "usage", label: "k", resolved: true, parent: "a" },
      { id: "a", shape: "usage", label: "a", resolved: true },
    ],
  };
  const rel = new Map([["a", { x: 50, y: 50, w: 300, h: 200 }], ["k", { x: 20, y: 60, w: 80, h: 40 }], ["p", { x: -7, y: 90, w: 14, h: 14 }]]);
  it("orders parents before children and ports last, with absolute boxes", () => {
    const s = buildScene(vm, rel, new Map(), () => 40);
    expect(s.items.map((i) => i.id)).toEqual(["a", "k", "p"]);
    expect(s.get("k")!.abs).toEqual({ x: 70, y: 110, w: 80, h: 40 });
    expect(s.get("p")!.owner).toBe("a");
    expect(s.get("k")!.parent).toBe("a");
    expect(s.get("a")!.headerH).toBeGreaterThan(0);
  });
});
