import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { ModelIndex } from "../model/index.js";
import { buildMatrix, filterRows, matrixToCsv, matrixToMarkdown, traceLine, verificationMethodsOf } from "./matrix.js";

const URI = "file:///w/matrix.sysml";
const text = readFileSync(resolve(__dirname, "../../test/fixtures/requirements/verification-matrix.sysml"), "utf8");
function setup(src = text) {
  const ix = new ModelIndex();
  ix.setDocument(URI, src);
  expect(ix.getDocument(URI)!.errors).toEqual([]);
  return ix;
}
const matrix = (ix: ModelIndex) => buildMatrix(ix, ix.findByQualifiedName("MiningSpec")[0]!, () => true);

describe("verification matrix", () => {
  test("rows are nested and numbered by ownership", () => {
    const m = matrix(setup());
    expect(m.rows.map((r) => `${r.number} ${r.id || r.name}`)).toEqual([
      "1 MFRD", "1.1 MFRQ01", "1.2 MFRQ02", "1.2.1 MFRQ02.1", "1.3 MFRQ03",
      "2 SYS1",
      "3 Standalone", "3.1 S1", "3.1.1 S1.1", "3.2 S2",
    ]);
    expect(m.rows.find((r) => r.id === "S1.1")!.depth).toBe(2);
  });

  test("the method is read from VerificationMethod metadata on the verification case", () => {
    const ix = setup();
    const m = matrix(ix);
    const r = m.rows.find((x) => x.id === "MFRQ01")!;
    expect(r.methods).toEqual(["test"]);
    expect(r.verifiedBy.map((v) => v.label)).toEqual(["OreExtractionTest"]);
    expect(m.rows.find((x) => x.id === "MFRQ02")!.methods).toEqual(["inspect"]);
    expect(m.rows.find((x) => x.id === "S1.1")!.methods).toEqual(["analyze"]);
    expect(m.rows.find((x) => x.id === "MFRQ03")!.methods).toEqual([]);
    expect(verificationMethodsOf(ix, ix.findByQualifiedName("MiningSpec::OreExtractionTest")[0]!)).toEqual(["test"]);
  });

  test("a method list and the definition's metadata are read", () => {
    const ix = setup(`package P { requirement r; part p { satisfy r; }
      verification def V { @VerificationMethod { kind = (VerificationMethodKind::demo, VerificationMethodKind::test); } objective { verify r; } }
      verification v : V; }`);
    expect(buildMatrix(ix, ix.findByQualifiedName("P")[0]!, () => true).rows[0]!.methods).toEqual(["demo", "test"]);
  });

  test("status counts a parent's satisfy for its children, and a usage's satisfy for the definition", () => {
    const m = matrix(setup());
    const by = (id: string) => m.rows.find((r) => r.id === id)!;
    expect(by("S1").status).toBe("no verification");
    const child = by("S1.1");
    expect(child.satisfiedBy.map((s) => [s.label, s.via])).toEqual([["rig", "S1 parentReq"]]);
    expect(child.status).toBe("covered");
    expect(by("S2").status).toBe("not satisfied");
    // the usage SYS1 is satisfied by the part; what its definition owns counts it
    expect(by("SYS1").satisfiedBy.map((s) => s.label)).toEqual(["frigate"]);
    expect(by("MFRQ01").satisfiedBy[0]).toMatchObject({ label: "frigate", via: "SYS1 frigateNeeds" });
    expect(by("MFRQ01").status).toBe("covered");
    expect(by("MFRQ02.1").status).toBe("no verification");
    expect(by("MFRQ03").status).toBe("no verification");
  });

  test("the summary counts each status and filters show only those rows", () => {
    const m = matrix(setup());
    expect(m.summary).toEqual({ total: 9, covered: 3, noVerification: 5, notSatisfied: 1, percentCovered: 33 });
    expect(filterRows(m.rows, "no verification").map((r) => r.id)).toEqual(["MFRD", "MFRQ02.1", "MFRQ03", "SYS1", "S1"]);
    expect(filterRows(m.rows, "not satisfied").map((r) => r.id)).toEqual(["S2"]);
    expect(filterRows(m.rows, "gaps").every((r) => r.kind === "requirement" && r.status !== "covered")).toBe(true);
    expect(filterRows(m.rows, "all")).toHaveLength(m.rows.length);
  });

  test("CSV and Markdown carry the same rows and columns; fields are escaped", () => {
    const m = matrix(setup());
    const csv = matrixToCsv(m.rows).trimEnd().split("\r\n");
    expect(csv[0]).toBe("Number,Id,Name,Satisfied by,Verification method,Verified by,Status");
    expect(csv).toHaveLength(m.rows.length + 1);
    expect(csv.find((l) => l.startsWith("1.1,MFRQ01"))).toBe("1.1,MFRQ01,oreExtraction,frigate (via SYS1 frigateNeeds),test,OreExtractionTest,covered");
    const md = matrixToMarkdown(m.rows).trimEnd().split("\n");
    expect(md).toHaveLength(m.rows.length + 2);
    expect(md[0]).toBe("| Number | Id | Name | Satisfied by | Verification method | Verified by | Status |");
    expect(md.find((l) => l.startsWith("| 3.2 |"))).toBe("| 3.2 | S2 | lonely |  |  |  | not satisfied |");
    const ix = setup(`package P { requirement <'a,"b"'> r; }`);
    expect(matrixToCsv(buildMatrix(ix, ix.findByQualifiedName("P")[0]!, () => true).rows)).toContain(`"a,""b"""`);
  });

  test("the trace line uses plain words for gaps", () => {
    const m = matrix(setup());
    const by = (id: string) => m.rows.find((r) => r.id === id)!;
    expect(traceLine(by("S2"))).toBe("Not satisfied yet · Not verified yet");
    expect(traceLine(by("MFRQ01"))).toBe("Satisfied by: frigate (via SYS1 frigateNeeds) · Verified by: OreExtractionTest");
  });
});
