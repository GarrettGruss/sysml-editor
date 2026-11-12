import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("parse wrapper", () => {
  it("re-joins tokens to the original text with comments and blank lines", () => {
    const text = "// leading note\npackage P {\n\n  /* block */\n  part def A; // trailing\n\n}\n";
    const r = parse(text);
    expect(r.errors).toEqual([]);
    const joined = r.tokens
      .getTokens()
      .filter((t) => t.type !== -1)
      .map((t) => t.text ?? "")
      .join("");
    expect(joined).toBe(text);
  });
  it("reports line and column for a syntax error", () => {
    const r = parse("package P {\n  part def 123;\n}\n");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.line).toBe(2);
    expect(typeof r.errors[0]!.column).toBe("number");
  });
  const file = resolve(
    __dirname,
    "../../fixtures/sysml-v2-release/sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml",
  );
  const hasFixture = existsSync(file);
  if (!hasFixture) console.warn(`SKIPPED: fixture missing (${file}); run "git submodule update --init"`);
  it.skipIf(!hasFixture)("parses a real fixture without errors (needs fixtures submodules)", () => {
    expect(parse(readFileSync(file, "utf8")).errors).toEqual([]);
  }, 60_000);
});
