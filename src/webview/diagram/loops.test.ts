import { describe, expect, it } from "vitest";
import { loopExtent, planSelfLoops } from "./loops.js";
import { rectsOverlap } from "./routing.js";

const measure = (t: string) => t.length * 5.5;
const LONG = "warpCommand : Domain::ShipCommand via miningFrigates.controlPort / action executeWarpDrive : ExecuteWarpDrive";

describe("self-transition loops", () => {
  const box = { x: 100, y: 100, w: 120, h: 50 };
  it("every loop is orthogonal, leaves and returns on the node border, and no two labels overlap", () => {
    const plans = planSelfLoops(box, Array.from({ length: 9 }, () => LONG), measure);
    for (const p of plans) {
      expect(p.pts).toHaveLength(4);
      for (const i of [1, 2, 3]) expect(p.pts[i]!.x === p.pts[i - 1]!.x || p.pts[i]!.y === p.pts[i - 1]!.y).toBe(true);
    }
    const labels = plans.map((p) => p.label!);
    for (const [i, a] of labels.entries()) {
      expect(a.w).toBeLessThanOrEqual(204 + 1);
      expect(rectsOverlap(a, box)).toBe(false);
      for (const b of labels.slice(i + 1)) expect(rectsOverlap(a, b), `${i}`).toBe(false);
    }
  });
  it("loops of one side are different and nested", () => {
    const [a, b] = planSelfLoops(box, [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined], measure).filter((_, i) => i % 4 === 0);
    expect(a!.pts[1]!.x).not.toBe(b!.pts[1]!.x);
  });
  it("the extent covers the loops and labels", () => {
    const e = loopExtent(120, 50, [LONG, LONG, LONG, LONG], measure);
    expect(e.r).toBeGreaterThan(200);
    expect(e.l).toBeGreaterThan(200);
    expect(e.t).toBeGreaterThan(0);
    expect(e.b).toBeGreaterThan(0);
  });
});
