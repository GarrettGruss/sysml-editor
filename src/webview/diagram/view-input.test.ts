import { describe, expect, it } from "vitest";
import { PAN_STEP, PAN_STEP_LARGE, arrowPan, wheelFactor } from "./view-input.js";

describe("wheel zoom", () => {
  it("is 1.5 times the old exponent and symmetric", () => {
    expect(wheelFactor(-100)).toBeCloseTo(Math.exp(100 * 0.0015 * 1.5), 10);
    expect(wheelFactor(100) * wheelFactor(-100)).toBeCloseTo(1, 12);
    expect(wheelFactor(0)).toBe(1);
  });
});

describe("arrow pan", () => {
  it("moves 40 px per press, 160 with Shift, and ignores other keys", () => {
    expect(arrowPan("ArrowLeft", false)).toEqual({ dx: PAN_STEP, dy: 0 });
    expect(arrowPan("ArrowDown", false)).toEqual({ dx: 0, dy: -PAN_STEP });
    expect(arrowPan("ArrowRight", true)).toEqual({ dx: -PAN_STEP_LARGE, dy: 0 });
    expect(PAN_STEP).toBe(40);
    expect(arrowPan("a", false)).toBeUndefined();
  });
});
