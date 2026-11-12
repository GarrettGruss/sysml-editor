import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStats, tryFastParse } from "./parse.js";
import { isSnapshotActive } from "./dfa-snapshot.js";

// Valid text must parse on the main thread's fast path (snapshot DFAs, no worker round trip).
// A snapshot gap or an SLL lookahead that runs to the end of the file sends a valid text to the
// slow path and leaves the document "details pending". See "Parser performance" in
// openspec/changes/add-model-foundation/design.md.
const fast = (text: string): boolean => {
  const before = parseStats.fastPath;
  const r = tryFastParse(text, { ll: true });
  return r.ok && parseStats.fastPath === before + 1;
};
const heldOut: string[] = JSON.parse(readFileSync(resolve(__dirname, "../../scripts/dfa-training/heldout-snippets.json"), "utf8"));

const reqs = (extra: string): string =>
  `package Spec {\n  doc /* spec */\n  package Functional {\n    requirement def <'R1'> Base { doc /* base */ }\n    requirement <'R2'> a { doc /* text a */ }\n    requirement <'R3'> b { doc /* text b */ }\n    requirement <'R4'> c;\n    part def T;\n  }\n${extra}}\n`;

const reported = [
  "package P {\n    requirement <'R1'> a;\n    part def T;\n}",
  "package P {\n    requirement <'R1'> a;\n}",
  "package P {\n    requirement <R1> a;\n    part def T;\n}",
  "package P {\n    part <p1> x;\n    part def T;\n}",
  "package P {\n    part <'p1'> x;\n    attribute y;\n}",
  "package P {\n    part def <p1> X;\n    part def T;\n}",
  "package P {\n    requirement def <'R1'> a;\n    part def T;\n}",
  "package P {\n    requirement <'R1'> a : A;\n    part def T;\n}",
  "package P {\n    requirement <'R1'> a { doc /* x */ }\n    part def T;\n}",
  "package P {\n    requirement <'R1'> a { doc /* x */ }\n    requirement <'R2'> b { doc /* y */ }\n    part def T;\n}",
  "package P { package Q {\n  requirement <'R1'> a;\n  part def T;\n} }",
  "package P {\n  requirement <'R1'> a;\n  requirement <'R2'> b;\n  requirement <'R3'> c;\n}",
  "package P {\n  part <p1> x [0..*] { }\n  part def T;\n}",
  "package P {\n  private part <p1> x : T :> y;\n  part def T;\n}",
  reqs(""),
  reqs("  part def T2;\n"),
  reqs("  satisfy Functional::a by x;\n  part x;\n"),
  reqs("  satisfy requirement a by x;\n  satisfy b by x;\n"),
  reqs("  verification def V { objective { verify Functional::a; } }\n  part def U;\n"),
  reqs("  verification <'V1'> v { subject s; objective { verify a; verify b; } }\n  part def U;\n"),
  reqs("  #derivation connection {\n    end #original ::> Functional::a;\n    end #derive ::> Functional::b;\n  }\n  part def U;\n"),
];

describe("fast path", () => {
  it("runs on the DFA snapshot", () => {
    expect(isSnapshotActive()).toBe(true);
  });

  it("parses short-named declarations followed by other members on the fast path", () => {
    const missed = reported.filter((t) => !fast(t));
    expect(missed).toEqual([]);
  });

  it("parses a sample of generated valid shapes on the fast path", () => {
    const sample = heldOut.slice(0, 150);
    expect(sample.length).toBeGreaterThanOrEqual(100);
    expect(sample.filter((t) => !fast(t))).toEqual([]);
  });

  it("keeps the fast-path hit rate on the whole held-out set high", () => {
    const hits = heldOut.filter(fast).length;
    // Measured 100% (386 of 386) after the fix, 1.8% before it. The margin is for new grammar
    // versions; a drop below this means a gap that needs a prediction shortcut or training snippets.
    expect(hits / heldOut.length).toBeGreaterThanOrEqual(0.98);
  });

  it("still rejects invalid text on the fast path", () => {
    expect(tryFastParse("package P { part <p1> x [ ; part def ; }", { ll: true }).ok).toBe(false);
    expect(tryFastParse("package P { requirement <'R1'> a ", { ll: true }).ok).toBe(false);
  });
});
