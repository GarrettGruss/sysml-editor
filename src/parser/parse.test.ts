import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, parseStats, warmFallbackParser } from "./parse.js";
import { isSnapshotActive } from "./dfa-snapshot.js";

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

describe("fallback parser", () => {
  const bad = "package P {\n  part def A;\n  part a : ;\n  part def B;\n}\n";
  it("returns the same errors with the snapshot active and with it off", async () => {
    const { spawnSync } = await import("node:child_process");
    const script = `import { parse } from "./src/parser/parse.ts"; console.log(JSON.stringify(parse(${JSON.stringify(bad)}).errors));`;
    const run = (off: boolean) =>
      spawnSync(process.execPath, ["--import", "tsx", "-e", script], {
        encoding: "utf8",
        cwd: resolve(__dirname, "../.."),
        env: { ...process.env, ...(off ? { SYSML_DFA_SNAPSHOT: "off" } : {}) },
      });
    const on = run(false);
    const off = run(true);
    expect(on.status, on.stderr).toBe(0);
    expect(off.status, off.stderr).toBe(0);
    const errors = JSON.parse(on.stdout.trim().split("\n").pop()!);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toEqual(JSON.parse(off.stdout.trim().split("\n").pop()!));
  }, 120_000);
  it("never purges the fast path: a clean parse after a failing one stays on it", () => {
    const clean = "package P { part def A; part a : A; }";
    parse(clean);
    const f0 = parseStats.fastPath;
    const b0 = parseStats.fallback;
    expect(parse(bad).errors.length).toBeGreaterThan(0);
    expect(parseStats.fallback).toBe(b0 + 1);
    expect(isSnapshotActive()).toBe(true);
    const r = parse(clean);
    expect(r.errors).toEqual([]);
    expect(parseStats.fastPath).toBe(f0 + 1);
    expect(parseStats.fallback).toBe(b0 + 1);
  }, 120_000);
  it("warm-up does not change results and yields between steps", async () => {
    let yields = 0;
    await warmFallbackParser(["package P { part def A; }\n", "package Q { part def B; }\n"], async () => { yields++; });
    expect(yields).toBeGreaterThanOrEqual(2);
    expect(parse(bad).errors.length).toBeGreaterThan(0);
  }, 120_000);
});
