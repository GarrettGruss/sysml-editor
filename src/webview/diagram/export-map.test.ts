import { describe, expect, it } from "vitest";
import { exportBox, exportHighlight } from "./export-map.js";

describe("export highlight mapping", () => {
  it("maps a node into the export drawing", () => {
    expect(exportBox({ x: 100, y: 50, w: 40, h: 20 }, { x: 80, y: 40 }, 160, 64, 0.5)).toEqual({ x: 170, y: 69, w: 20, h: 10 });
  });
  it("frames the node and puts the callout beside it", () => {
    const h = exportHighlight({ x: 170, y: 69, w: 20, h: 10 }, { width: 1000, height: 700 });
    expect(h.frame).toEqual({ x: 164, y: 63, w: 32, h: 22 });
    expect(h.callout.left).toBe(170);
    expect(h.callout.top).toBe(87);
  });
});
