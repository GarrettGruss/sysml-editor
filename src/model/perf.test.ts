import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "./index.js";
import { loadLibrary } from "./library.js";
import { affectedNodes, childNodes, rootNodes } from "../tree/tree-model.js";

/** A valid, varied SysML model of at least `lines` lines: nested packages, definitions, usages, attributes, connections. */
export function generateModel(lines: number): { text: string; editLines: number[] } {
  const out: string[] = ["package BigModel {", "  private import ScalarValues::*;"];
  const editLines: number[] = [];
  for (let p = 0; out.length < lines; p++) {
    out.push(`  package Subsystem${p} {`);
    out.push(`    doc /* Subsystem ${p} of the generated model. */`);
    for (let k = 0; k < 4; k++) {
      editLines.push(out.length);
      out.push(`    part def Unit${p}_${k} {`);
      out.push(`      attribute mass${k} : Real = ${p + k}.5;`);
      out.push(`      attribute label : String = "unit ${p}-${k}";`);
      out.push(`      port in${k};`);
      out.push(`      port out${k};`);
      out.push("    }");
    }
    out.push(`    part def Assembly${p} {`);
    for (let k = 0; k < 4; k++) out.push(`      part unit${k} : Unit${p}_${k};`);
    out.push(`      part spares : Unit${p}_0[2];`);
    out.push(`      connection link0 connect unit0.out0 to unit1.in1;`);
    out.push(`      connection link1 connect unit1.out1 to unit2.in2;`);
    out.push("    }");
    out.push(`    part system${p} : Assembly${p} {`);
    out.push(`      attribute capacity : Integer = ${10 + p};`);
    out.push("    }");
    out.push("  }");
  }
  out.push("}");
  return { text: out.join("\n") + "\n", editLines };
}

const libDir = resolve(__dirname, "../../fixtures/sysml-v2-release/sysml.library");
const haveLib = existsSync(libDir);
if (!haveLib) console.warn("fixtures/sysml-v2-release is missing: performance test runs without the standard library");

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe("performance: 5,000-line model", () => {
  it("re-parses and refreshes the tree within budget after single edits", () => {
    const index = new ModelIndex();
    if (haveLib) loadLibrary(index, libDir);
    const { text, editLines } = generateModel(5000);
    const uri = "file:///workspace/big.sysml";
    const lineCount = text.split("\n").length;
    expect(lineCount).toBeGreaterThanOrEqual(5000);
    index.setDocument(uri, text);
    expect(index.getDocument(uri)!.errors).toEqual([]);
    expect(index.getDocument(uri)!.everParsedCleanly).toBe(true);

    let current = text.split("\n");
    let rootIds = rootNodes(index).map((n) => n.id);
    const times: number[] = [];
    const picks = Array.from({ length: 20 }, (_, i) => editLines[Math.floor((i * (editLines.length - 1)) / 19)]!);
    // Edit from the bottom up so earlier line numbers stay valid.
    picks.sort((a, b) => b - a);
    picks.forEach((line, i) => {
      current = [...current.slice(0, line), `    part def Added${i};`, ...current.slice(line)];
      const next = current.join("\n");
      const t0 = performance.now();
      index.setDocument(uri, next);
      const r = affectedNodes(index, rootIds, [uri]);
      const roots = rootNodes(index);
      rootIds = roots.map((n) => n.id);
      const root = roots.find((n) => r.ids.includes(n.id) || r.full)!;
      const kids = childNodes(index, root);
      const sub = childNodes(index, kids[0]!);
      times.push(performance.now() - t0);
      expect(index.getDocument(uri)!.errors).toEqual([]);
      expect(sub.length).toBeGreaterThan(0);
    });
    const med = median(times);
    const max = Math.max(...times);
    console.log(
      `5,000-line edit round trip (${lineCount} lines, library ${haveLib ? "loaded" : "absent"}): ` +
        `median ${med.toFixed(0)} ms, max ${max.toFixed(0)} ms, all [${times.map((t) => t.toFixed(0)).join(", ")}]`,
    );
    expect(med).toBeLessThan(300);
    expect(max).toBeLessThan(1000);
  }, 120_000);
});
