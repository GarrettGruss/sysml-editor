import { describe, expect, it } from "vitest";
import { edgeRoute, isOrthogonal, placeLabel, rectsOverlap, routeFits, routeOrthogonal, routeThroughBox, outwardSide } from "./routing.js";

const box = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h });

describe("routeOrthogonal", () => {
  it("is a straight line when the boxes share a horizontal range", () => {
    const r = routeOrthogonal(box(0, 0), box(200, 10));
    expect(r).toHaveLength(2);
    expect(r[0]!.y).toBe(r[1]!.y);
  });
  it("uses two bends when both ends leave facing each other at different heights", () => {
    const r = routeOrthogonal(box(0, 0), box(200, 100), "R", "L");
    expect(r.length).toBe(4);
    expect(isOrthogonal(r)).toBe(true);
  });
  it("uses one bend when there is a gap on both axes", () => {
    const r = routeOrthogonal(box(0, 0), box(200, 200));
    expect(r.length).toBe(3);
    expect(isOrthogonal(r)).toBe(true);
  });
  it("never passes through its end nodes, in any relative position", () => {
    const a = box(300, 300);
    for (let dx = -400; dx <= 400; dx += 50) for (let dy = -400; dy <= 400; dy += 50) {
      const b = box(300 + dx, 300 + dy);
      if (Math.abs(dx) < 100 && Math.abs(dy) < 60) continue; // overlapping boxes
      const r = routeOrthogonal(a, b);
      expect(isOrthogonal(r), `${dx},${dy}`).toBe(true);
      expect(routeThroughBox(r, a), `a ${dx},${dy}`).toBe(false);
      expect(routeThroughBox(r, b), `b ${dx},${dy}`).toBe(false);
    }
  });
  it("leaves a port on the side facing away from its owner", () => {
    const owner = box(0, 0, 200, 100);
    const port = { x: 193, y: 40, w: 14, h: 14 };
    expect(outwardSide(port, owner)).toBe("R");
    const r = edgeRoute({ box: port, owner }, { box: box(400, 120) });
    expect(r[0]!.x).toBe(207);
    expect(r[1]!.x).toBeGreaterThan(207);
    expect(isOrthogonal(r)).toBe(true);
  });
});

describe("stored routes", () => {
  const a = box(0, 0), b = box(200, 100);
  it("is kept while both ends are where they were", () => {
    const stored = [{ x: 100, y: 30 }, { x: 150, y: 30 }, { x: 150, y: 130 }, { x: 200, y: 130 }];
    expect(routeFits(stored, a, b)).toBe(true);
    expect(edgeRoute({ box: a }, { box: b }, stored)).toEqual(stored);
  });
  it("is replaced when an end moved", () => {
    const stored = [{ x: 100, y: 30 }, { x: 150, y: 30 }, { x: 150, y: 130 }, { x: 200, y: 130 }];
    const moved = box(0, 300);
    expect(routeFits(stored, moved, b)).toBe(false);
    const r = edgeRoute({ box: moved }, { box: b }, stored);
    expect(r).not.toEqual(stored);
    expect(isOrthogonal(r)).toBe(true);
  });
  it("is rejected when diagonal", () => {
    expect(routeFits([{ x: 100, y: 30 }, { x: 200, y: 130 }], a, b)).toBe(false);
  });
});

describe("placeLabel", () => {
  it("sits beside the longest segment, off the end nodes", () => {
    const a = box(0, 0), b = box(300, 0);
    const pts = routeOrthogonal(a, b);
    const l = placeLabel(pts, 60, 13, [a, b]);
    expect(rectsOverlap(l, a)).toBe(false);
    expect(rectsOverlap(l, b)).toBe(false);
    expect(l.y + l.h).toBeLessThanOrEqual(pts[0]!.y);
  });
  it("tries the other side when the first is taken", () => {
    const pts = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const blocker = { x: 60, y: 80, w: 80, h: 18 };
    const l = placeLabel(pts, 60, 13, [blocker]);
    expect(l.y).toBeGreaterThan(100);
  });
});
