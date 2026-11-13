import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { ModelIndex, loadLibrary } from "../model/index.js";
import { buildState } from "./view-model.js";
import { buildDocumentModel } from "./document-model.js";
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
    expect(by("MFRQ02.1").status).toBe("covered");
    expect(by("MFRQ02.1").verifiedBy.map((v) => [v.label, v.via])).toEqual([["CargoInspection", "MFRQ02 cargoCapacity"]]);
    expect(by("MFRQ02.1").methods).toEqual(["inspect"]);
    expect(by("MFRQ03").status).toBe("no verification");
  });

  test("the summary counts each status and filters show only those rows", () => {
    const m = matrix(setup());
    expect(m.summary).toEqual({ total: 9, covered: 4, noVerification: 4, notSatisfied: 1, partlySatisfied: 0, percentCovered: 44 });
    expect(filterRows(m.rows, "no verification").map((r) => r.id)).toEqual(["MFRD", "MFRQ03", "SYS1", "S1"]);
    expect(filterRows(m.rows, "not satisfied").map((r) => r.id)).toEqual(["S2"]);
    expect(filterRows(m.rows, "gaps").every((r) => r.kind === "requirement" && r.status !== "covered")).toBe(true);
    expect(filterRows(m.rows, "all")).toHaveLength(m.rows.length);
  });

  test("CSV and Markdown carry the same rows and columns; fields are escaped", () => {
    const m = matrix(setup());
    const csv = matrixToCsv(m.rows).trimEnd().split("\r\n");
    expect(csv[0]).toBe("Number,Id,Name,Satisfied by,Verification method,Verified by,Status");
    expect(csv).toHaveLength(m.rows.length + 1);
    expect(csv.find((l) => l.startsWith("1.1,MFRQ01"))).toBe("1.1,MFRQ01,oreExtraction,frigate (via SYS1 frigateNeeds) [1 of 1 usage],test,OreExtractionTest,covered");
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

  test("a definition is satisfied only when every usage is; partly satisfied otherwise", () => {
    const ix = setup(`package P {
      requirement def D { requirement <'D1'> inner; }
      requirement <'U1'> u1 : D;
      requirement <'U2'> u2 : D;
      part p { satisfy u1; }
      verification def V { objective { verify D; } }
    }`);
    const m = buildMatrix(ix, ix.findByQualifiedName("P")[0]!, () => true);
    const by = (id: string) => m.rows.find((r) => r.id === id || r.name === id)!;
    for (const id of ["D", "D1"]) {
      expect(by(id).usages).toEqual({ satisfied: 1, total: 2 });
      expect(by(id).status).toBe("partly satisfied");
      expect(by(id).satisfiedBy.map((l) => [l.label, l.via])).toEqual([["p", "U1 u1"]]);
    }
    expect(m.summary.partlySatisfied).toBe(2);
    expect(filterRows(m.rows, "partly satisfied").map((r) => r.name)).toEqual(["D", "inner"]);
    expect(traceLine(by("D"))).toBe("Partly satisfied (1 of 2 usages) by p (via U1 u1) · Verified by: V");
    // the second usage is satisfied too: now the definition is
    const ix2 = setup(`package P { requirement def D; requirement u1 : D; requirement u2 : D; part p { satisfy u1; satisfy u2; } }`);
    const r = buildMatrix(ix2, ix2.findByQualifiedName("P")[0]!, () => true).rows[0]!;
    expect(r.usages).toEqual({ satisfied: 2, total: 2 });
    expect(r.status).toBe("no verification");
  });

  test("VerificationMethod is read in every form, through specializations, and not from comments", { timeout: 60000 }, () => {
    const lib = resolve(__dirname, "../../fixtures/sysml-v2-release/sysml.library");
    const ix = new ModelIndex();
    loadLibrary(ix, lib);
    const methods = (body: string, extra = "") => {
      ix.setDocument(URI, `package P { ${extra} verification def V ${body} }`);
      return verificationMethodsOf(ix, ix.findByQualifiedName("P::V")[0]!);
    };
    expect(methods("{ metadata vm : VerificationMethod { kind = VerificationMethodKind::demo; } }")).toEqual(["demo"]);
    expect(methods("{ metadata VerificationMethod { kind = VerificationMethodKind::analyze; } }")).toEqual(["analyze"]);
    expect(methods("{ @vm : VerificationMethod { kind = VerificationMethodKind::inspect; } }")).toEqual(["inspect"]);
    expect(methods("{ @VerificationCases::VerificationMethod { kind = VerificationMethodKind::test; } }")).toEqual(["test"]);
    expect(methods("{ @VM { kind = VerificationMethodKind::test; } }", "alias VM for VerificationCases::VerificationMethod;")).toEqual(["test"]);
    expect(methods("{ @Other { kind = VerificationMethodKind::test; } }")).toEqual([]);
    expect(methods("{ @VerificationMethod { /* kind = test */ // kind = demo\n kind = VerificationMethodKind::inspect; } }")).toEqual(["inspect"]);
    expect(methods("{ doc /* @VerificationMethod { kind = test; } */ }")).toEqual([]);
    expect(methods("{ @VerificationMethod { kind = (VerificationMethodKind::demo, VerificationMethodKind::test); } }")).toEqual(["demo", "test"]);
    // through the definition the case is typed by and the definitions that one specializes (a cycle ends)
    ix.setDocument(URI, `package P { verification def A :> B { @VerificationMethod { kind = VerificationMethodKind::demo; } } verification def B :> A { @VerificationMethod { kind = VerificationMethodKind::test; } } verification def C :> A; verification c : C; }`);
    expect(verificationMethodsOf(ix, ix.findByQualifiedName("P::c")[0]!)).toEqual(["demo", "test"]);
  });

  test("CSV cells that look like formulas are neutralised", () => {
    const ix = setup(`package P { requirement <'=1+1'> r; requirement <'-x'> q; requirement <'@a'> a; requirement <'+b'> b; }`);
    const csv = matrixToCsv(buildMatrix(ix, ix.findByQualifiedName("P")[0]!, () => true).rows);
    for (const f of ["'=1+1", "'-x", "'@a", "'+b"]) expect(csv).toContain("," + f + ",");
  });
  test("a requirement and a section have the same number in the matrix and in the document", () => {
    const src = "package P {\n  requirement <'A'> a;\n  package S {\n    requirement <'B'> b {\n      requirement <'C'> c;\n    }\n  }\n  requirement <'D'> d;\n}";
    const ix = setup(src);
    const root = ix.findByQualifiedName("P")[0]!;
    const doc = buildDocumentModel(ix, root);
    const fromDoc = new Map(doc.toc.map((t) => [t.qualifiedName, t.number]));
    const rows = buildMatrix(ix, root, () => true).rows;
    expect(rows.length).toBe(5);
    for (const r of rows) expect(r.number, r.qn).toBe(fromDoc.get(r.qn));
    expect(rows.map((r) => r.number)).toEqual(["1", "2", "2.1", "2.1.1", "3"]);
  });
  test("the document items carry the matrix status and trace line, not a second calculation", () => {
    const ix = setup();
    const st = buildState(ix, { kind: "package", qualifiedName: "MiningSpec" });
    const rows = new Map(st.matrix!.rows.filter((r) => r.kind === "requirement").map((r) => [r.qn, r]));
    const items: { qn: string; status?: string; trace?: string }[] = [];
    const walkItems = (l: any[]) => l.forEach((b) => { if (b.kind === "item") { items.push(b); walkItems(b.children); } });
    const walkSec = (s: any) => { walkItems(s.blocks); s.children.forEach(walkSec); };
    walkItems(st.document!.blocks);
    st.document!.sections.forEach(walkSec);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.status, it.qn).toBe(rows.get(it.qn)!.status);
      expect(it.trace, it.qn).toBe(traceLine(rows.get(it.qn)!));
    }
  });
});
