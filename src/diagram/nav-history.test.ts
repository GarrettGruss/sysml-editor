import { describe, expect, test } from "vitest";
import { NavHistory } from "./nav-history.js";

const all = () => Promise.resolve(true);

describe("NavHistory", () => {
  test("back and forward", async () => {
    const h = new NavHistory();
    h.visit("g", "A");
    h.visit("g", "B");
    expect(h.canBack("g")).toBe(true);
    expect(await h.step("g", -1, all)).toBe("A");
    expect(h.canForward("g")).toBe(true);
    expect(await h.step("g", 1, all)).toBe("B");
    expect(h.canForward("g")).toBe(false);
  });
  test("opening a new diagram clears forward entries", async () => {
    const h = new NavHistory();
    for (const u of ["A", "B"]) h.visit("g", u);
    await h.step("g", -1, all);
    h.visit("g", "C");
    expect(h.canForward("g")).toBe(false);
    expect(await h.step("g", -1, all)).toBe("A");
  });
  test("a missing file is skipped", async () => {
    const h = new NavHistory();
    for (const u of ["A", "B", "C"]) h.visit("g", u);
    expect(await h.step("g", -1, (u) => Promise.resolve(u !== "B"))).toBe("A");
    expect(await h.step("g", -1, all)).toBeUndefined();
  });
  test("groups are independent; revisiting the current one is a no-op", () => {
    const h = new NavHistory();
    h.visit("g1", "A");
    h.visit("g1", "A");
    h.visit("g2", "B");
    expect(h.canBack("g1")).toBe(false);
    expect(h.canBack("g2")).toBe(false);
  });
});
