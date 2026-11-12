import { describe, expect, it } from "vitest";
import { CARD_BELOW, DETAIL_BESIDE_FROM, layoutFor, parseTestWidth } from "./layout";

describe("requirements layout", () => {
  it("uses cards below the breakpoint and the table from it", () => {
    expect(layoutFor(CARD_BELOW - 1).mode).toBe("card");
    expect(layoutFor(CARD_BELOW).mode).toBe("table");
    expect(layoutFor(320).mode).toBe("card");
    expect(layoutFor(800).mode).toBe("table");
  });
  it("puts the detail pane beside the table only when wide", () => {
    expect(layoutFor(DETAIL_BESIDE_FROM - 1).detail).toBe("below");
    expect(layoutFor(DETAIL_BESIDE_FROM).detail).toBe("beside");
    expect(layoutFor(1100)).toEqual({ mode: "table", detail: "beside" });
  });
  it("accepts only sensible forced widths", () => {
    expect(parseTestWidth(480)).toBe(480);
    expect(parseTestWidth(null)).toBeUndefined();
    expect(parseTestWidth(NaN)).toBeUndefined();
    expect(parseTestWidth(10)).toBeUndefined();
    expect(parseTestWidth("480")).toBeUndefined();
  });
});
