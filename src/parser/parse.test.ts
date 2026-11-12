import { describe, expect, it } from "vitest";
import { parse } from "./parse.js";

describe("parse", () => {
  it("parses a one-line model without errors", () => {
    const r = parse("package P { part def A; }");
    expect(r.errors).toEqual([]);
  });
  it("reports syntax errors with position", () => {
    const r = parse("package P { part def ; ;; }}");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.line).toBe(1);
  });
});
