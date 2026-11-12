import { describe, expect, it } from "vitest";
import { repairRoute, addBend, dragBend, dragSegment, routeHandleAt, routeHandles, segmentAt } from "./route-edit.js";
import { isOrthogonal, routeFits } from "./routing.js";

const A = { x: 0, y: 0, w: 100, h: 60 };
const B = { x: 300, y: 100, w: 100, h: 60 };
// A's right border at y=30 -> right 150 -> down to y=130 -> B's left border.
const Z = [{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 130 }, { x: 300, y: 130 }];

describe("dragSegment", () => {
  it("moves a middle segment sideways and stretches its neighbours", () => {
    const r = dragSegment(Z, 1, 40, A, B);
    expect(r).toEqual([{ x: 100, y: 30 }, { x: 240, y: 30 }, { x: 240, y: 130 }, { x: 300, y: 130 }]);
    expect(isOrthogonal(r)).toBe(true);
    expect(routeFits(r, A, B)).toBe(true);
  });
  it("moves an end segment along the border while it stays on it", () => {
    const r = dragSegment(Z, 0, 20, A, B);
    expect(r[0]).toEqual({ x: 100, y: 50 });
    expect(routeFits(r, A, B)).toBe(true);
  });
  it("goes around the node when an end segment is dragged past its edge", () => {
    const r = dragSegment(Z, 0, -60, A, B);
    expect(r[0]).toEqual({ x: 100, y: 30 });
    expect(r.length).toBeGreaterThan(Z.length);
    expect(isOrthogonal(r)).toBe(true);
    expect(routeFits(r, A, B)).toBe(true);
    expect(r.some((p) => p.y === -30)).toBe(true);
    // it leaves the border horizontally first
    expect(r[1]!.y).toBe(30);
    expect(r[1]!.x).toBeGreaterThan(100);
  });
  it("does the same at the target end", () => {
    const r = dragSegment(Z, 2, 100, A, B);
    expect(r[r.length - 1]).toEqual({ x: 300, y: 130 });
    expect(isOrthogonal(r)).toBe(true);
    expect(routeFits(r, A, B)).toBe(true);
    expect(r.some((p) => p.y === 230)).toBe(true);
  });
  it("removes bends that become collinear", () => {
    // dragging the middle segment back in line with the end segments: 2 bends vanish
    const r = dragSegment(Z, 1, 0, A, B);
    expect(r).toEqual(Z);
    const straight = [{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 50 }, { x: 300, y: 50 }];
    const B2 = { x: 300, y: 20, w: 100, h: 60 };
    expect(dragSegment(straight, 2, -20, A, B2)).toEqual([{ x: 100, y: 30 }, { x: 300, y: 30 }]);
  });
  it("moves a single-segment route and adds stubs at both ends when it leaves the borders", () => {
    const line = [{ x: 100, y: 30 }, { x: 300, y: 30 }];
    const B3 = { x: 300, y: 0, w: 100, h: 60 };
    const r = dragSegment(line, 0, -80, A, B3);
    expect(isOrthogonal(r)).toBe(true);
    expect(routeFits(r, A, B3)).toBe(true);
    expect(r).toHaveLength(6);
  });
});

describe("dragBend", () => {
  it("moves a corner in both directions", () => {
    const r = dragBend(Z, 1, 30, 10, A, B);
    expect(isOrthogonal(r)).toBe(true);
    expect(r).toEqual([{ x: 100, y: 40 }, { x: 230, y: 40 }, { x: 230, y: 130 }, { x: 300, y: 130 }]);
  });
});

describe("addBend", () => {
  it("steps the rest of a straight segment aside, orthogonally", () => {
    const line = [{ x: 100, y: 30 }, { x: 300, y: 30 }];
    const B3 = { x: 300, y: 0, w: 100, h: 60 };
    const r = addBend(line, { x: 200, y: 32 }, A, B3)!;
    expect(r).toEqual([{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 46 }, { x: 300, y: 46 }]);
    expect(isOrthogonal(r)).toBe(true);
  });
  it("adds to the middle of a long inner segment", () => {
    const r = addBend(Z, { x: 200, y: 80 }, A, B)!;
    expect(r.length).toBe(Z.length + 2);
    expect(isOrthogonal(r)).toBe(true);
  });
});

describe("handles", () => {
  it("has a bend handle per inner point and a handle in the middle of every segment", () => {
    const h = routeHandles(Z);
    expect(h.filter((x) => x.kind === "bend")).toHaveLength(2);
    expect(h.filter((x) => x.kind === "segment").map((x) => x.at)).toEqual([{ x: 150, y: 30 }, { x: 200, y: 80 }, { x: 250, y: 130 }]);
    expect(routeHandleAt(Z, { x: 201, y: 31 }, 6)?.kind).toBe("bend");
    expect(routeHandleAt(Z, { x: 151, y: 31 }, 6)).toMatchObject({ kind: "segment", index: 0 });
    expect(routeHandleAt(Z, { x: 0, y: 0 }, 6)).toBeUndefined();
  });
  it("finds the segment nearest a point", () => {
    expect(segmentAt(Z, { x: 202, y: 90 }, 5)?.index).toBe(1);
    expect(segmentAt(Z, { x: 500, y: 500 }, 5)).toBeUndefined();
  });
});

describe("repairRoute", () => {
  const A2 = { x: 0, y: 0, w: 100, h: 60 };
  const B2 = { x: 300, y: 100, w: 100, h: 60 };
  it("keeps interior bends and slides the end along the border", () => {
    const moved = { ...B2, y: 120 };
    const r = repairRoute(Z, A2, moved)!;
    expect(r).toBeDefined();
    expect(r.slice(0, 3)).toEqual(Z.slice(0, 3));
    expect(r[r.length - 1]).toEqual({ x: 300, y: 130 });
    expect(isOrthogonal(r)).toBe(true);
  });
  it("adds a bend when the end segment's line no longer meets the node", () => {
    const moved = { ...B2, y: 300 };
    const r = repairRoute(Z, A2, moved)!;
    expect(r).toBeDefined();
    expect(r.length).toBeGreaterThan(Z.length);
    expect(isOrthogonal(r)).toBe(true);
    expect(routeFits(r, A2, moved)).toBe(true);
    expect(r[1]).toEqual(Z[1]);
  });
  it("gives up when the route would cross an end node", () => {
    expect(repairRoute(Z, A2, { x: 120, y: 0, w: 200, h: 300 })).toBeUndefined();
    expect(repairRoute(Z.slice(0, 2), A2, B2)).toBeUndefined();
  });
});
