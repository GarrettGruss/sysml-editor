import { describe, expect, it } from "vitest";
import { labelAnchor, labelHit, labelLines, laidOutLabel, layoutAt, resizeBox, toggleWrap } from "./labels.js";

const measure = (t: string) => t.length * 6;
const route = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 100 }, { x: 80, y: 100 }];

describe("label layout", () => {
  it("anchors at the middle of the longest segment", () => {
    expect(labelAnchor(route)).toEqual({ x: 40, y: 50 });
  });
  it("places a laid-out label relative to the anchor, so it follows the route", () => {
    const l = { dx: 10, dy: -20 };
    expect(laidOutLabel(route, "abc", l, measure).box).toMatchObject({ x: 50, y: 30 });
    const moved = route.map((p) => ({ x: p.x + 100, y: p.y }));
    expect(laidOutLabel(moved, "abc", l, measure).box).toMatchObject({ x: 150, y: 30 });
  });
  it("wraps within the stored width unless wrapping is off", () => {
    const text = "when the key is turned";
    expect(labelLines(text, undefined, measure)).toEqual([text]);
    expect(labelLines(text, { dx: 0, dy: 0, w: 70 }, measure).length).toBeGreaterThan(1);
    expect(labelLines(text, { dx: 0, dy: 0, w: 70, wrap: false }, measure)).toEqual([text]);
    const r = laidOutLabel(route, text, { dx: 0, dy: 0, w: 70 }, measure);
    expect(r.box.h).toBe(r.lines.length * 12 + 1);
  });
  it("derives a layout from a box and back", () => {
    const l = layoutAt({ x: 55, y: 25, w: 80, h: 30 }, route, true);
    expect(l).toEqual({ dx: 15, dy: -25, w: 80, h: 30 });
    expect(laidOutLabel(route, "x", l, measure).box).toEqual({ x: 55, y: 25, w: 80, h: 30 });
    expect(layoutAt({ x: 55, y: 25, w: 80, h: 30 }, route, false)).toEqual({ dx: 15, dy: -25 });
  });
  it("resizes from the bottom-right corner with a minimum", () => {
    expect(resizeBox({ x: 0, y: 0, w: 50, h: 13 }, 30, 20)).toEqual({ x: 0, y: 0, w: 80, h: 33 });
    expect(resizeBox({ x: 0, y: 0, w: 50, h: 13 }, -100, -100)).toMatchObject({ w: 24, h: 13 });
  });
  it("toggles wrapping", () => {
    const box = { x: 55, y: 25, w: 80, h: 13 };
    const off = toggleWrap(undefined, box, route);
    expect(off).toEqual({ dx: 15, dy: -25, wrap: false });
    expect(toggleWrap(off, box, route)).toEqual({ dx: 15, dy: -25 });
  });
  it("hits handles before the body", () => {
    const b = { x: 0, y: 0, w: 60, h: 30 };
    expect(labelHit(b, { x: 60, y: 30 })).toBe("resize");
    expect(labelHit(b, { x: 0, y: 0 })).toBe("move");
    expect(labelHit(b, { x: 30, y: 15 })).toBe("body");
    expect(labelHit(b, { x: 100, y: 15 })).toBeUndefined();
  });
});
