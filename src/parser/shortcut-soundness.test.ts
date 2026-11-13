import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { tryFastParse } from "./parse.js";
import { checkShortcutFacts, followCacheStats, setShortcutFault, shortcutInfo, shortcutsAvailable } from "./parse-core.js";
import { compareWithExact, mutants, negativeCorpus } from "./exact-reference.js";

// Guards of the main-thread prediction shortcuts (see "Parser performance" in
// openspec/changes/add-model-foundation/design.md): the fast path may only accept a text with the
// exact parser's tree, and must decline every text the exact parser rejects.
const root = resolve(__dirname, "../..");
const heldOut: string[] = JSON.parse(readFileSync(join(root, "scripts/dfa-training/heldout-snippets.json"), "utf8"));
const slow = 300_000;

function smallFixtures(n: number): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir).sort()) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (extname(p) === ".sysml") {
        const t = readFileSync(p, "utf8");
        if (t.length <= 4000) out.push(t);
      }
    }
  };
  walk(join(root, "fixtures/sysml-v2-release/sysml/src/examples"));
  const step = Math.max(1, Math.floor(out.length / n));
  return out.filter((_, i) => i % step === 0).slice(0, n);
}

describe("shortcut decisions", () => {
  it("are located in the generated ATN and the grammar facts hold", () => {
    expect(shortcutsAvailable).toBe(true);
    expect(checkShortcutFacts()).toEqual([]);
    const info = shortcutInfo();
    expect(info.problems).toEqual([]);
    expect(info.identDecision).toBeGreaterThanOrEqual(0);
    expect(info.optionalDecisions.length).toBeGreaterThanOrEqual(2);
  });
});

describe("targeted cases from the review", () => {
  const valid: [string, string][] = [
    ["specialization then another declaration", "part <p1> x :> y; part def T;"],
    ["short name only", "part <a>;"],
    ["short name and typing", "part <a> : T;"],
    ["requirement with quoted names and doc comment", "requirement <'R 1'> 'my req' { doc /* x */ } part def T;"],
    ["short-named declaration at end of file", "package P { part <p1> x; }"],
    ["short-named declaration at end of file, no newline", "part <p1> x;"],
    ["short-named declaration at end of file, newline", "part <p1> x;\n"],
    ["short-named requirement at end, no newline", "package P { requirement <'R1'> a; }"],
    ["short-named requirement at end, newline", "package P {\n  requirement <'R1'> a;\n}\n"],
  ];
  for (const [name, text] of valid) {
    it(`${name}: the fast path accepts it with the exact tree`, () => {
      const c = compareWithExact(text);
      expect(c.kind === "violation" ? c.why : c.kind).toBe("same");
    });
  }
  it("doc <s> locale in a package is never a violation (a known snapshot gap: the fast path declines it, the exact parser accepts it)", () => {
    for (const t of ['package P { doc <s> locale "x" /* c */ }', 'package P { doc locale "x" /* c */ part def T; }']) {
      const c = compareWithExact(t);
      expect(c.kind).not.toBe("violation");
      if (c.kind === "declined") expect(c.exactValid).toBe(true);
    }
  }, slow);
  it("part <a> b c; is invalid and must be declined", () => {
    expect(compareWithExact("part <a> b c;")).toEqual({ kind: "declined", exactValid: false });
    expect(tryFastParse("part <a> b c;", { ll: true }).ok).toBe(false);
  });
});

describe("negative corpus", () => {
  it("mutants are deterministic", () => {
    expect(mutants(heldOut[0]!, 5)).toEqual(mutants(heldOut[0]!, 5));
    expect(mutants(heldOut[0]!, 5).length).toBeGreaterThanOrEqual(4);
  });
  it(
    "declines every invalid variant of the held-out snippets and of fixture texts, and accepts only with the exact tree",
    () => {
      const fixtures = smallFixtures(60);
      expect(fixtures.length).toBeGreaterThanOrEqual(30);
      for (const texts of [heldOut, fixtures]) {
        const st = negativeCorpus(texts, 3);
        expect(st.violations).toEqual([]);
        expect(st.variants).toBeGreaterThan(texts.length * 3);
        expect(st.invalidPerExact).toBeGreaterThan(0);
        expect(st.declinedOfInvalid).toBe(st.invalidPerExact);
      }
    },
    slow,
  );
});

describe("the comparison can fail", () => {
  const sample = [...heldOut.slice(0, 80), "part <p1> x :> y; part def T;", "package P { requirement <'R1'> a; part def T; }"];
  const run = () => {
    let violations = 0, declinedValid = 0, same = 0;
    for (const t of sample) {
      const c = compareWithExact(t);
      if (c.kind === "violation") violations++;
      else if (c.kind === "declined" && c.exactValid) declinedValid++;
      else if (c.kind === "same") same++;
    }
    return { violations, declinedValid, same };
  };
  it("reports nothing with the shortcuts as they are", () => {
    const r = run();
    expect(r.violations).toBe(0);
    expect(r.declinedValid).toBe(0);
    expect(r.same).toBe(sample.length);
  }, slow);
  for (const fault of ["ident-short-only"] as const) {
    it(`reports violations or declines with the deliberate fault ${fault}`, () => {
      setShortcutFault(fault);
      try {
        const r = run();
        expect(r.violations + r.declinedValid).toBeGreaterThan(0);
      } finally {
        setShortcutFault(undefined);
      }
    }, slow);
  }
});

describe("follow cache", () => {
  it("is cleared when it exceeds its limit, without changing results", () => {
    const limit = followCacheStats.limit;
    expect(limit).toBe(50_000);
    const clears = followCacheStats.clears;
    followCacheStats.limit = 20;
    try {
      for (const t of heldOut.slice(0, 40)) {
        const c = compareWithExact(t);
        expect(c.kind).toBe("same");
        expect(followCacheStats.nodes).toBeLessThanOrEqual(20 + 500);
      }
      expect(followCacheStats.clears).toBeGreaterThan(clears);
    } finally {
      followCacheStats.limit = limit;
    }
  }, slow);
});
