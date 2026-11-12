import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { ModelIndex, defaultDocumentParser, loadLibrary } from "../model/index.js";
import { allDerivations, derivationOf } from "../requirements/relations.js";
import { buildRelations, listRequirements } from "../requirements/queries.js";
import { applyEdits, groupByUri } from "./text.js";
import { planAddParagraph, planAddSection, planDerivation, planRemoveDerivation, planVerify } from "./requirements.js";
import type { PlanResult } from "./types.js";

const URI = "file:///w/m.sysml";
const lib = resolve(__dirname, "../../fixtures/sysml-v2-release/sysml.library");
const haveLib = existsSync(lib);

function setup(text: string, withLib = false) {
  const ix = new ModelIndex();
  if (withLib && haveLib) {
    loadLibrary(ix, lib);
    ix.setDocument("sysml-library:///DocumentAnnotations.sysml", readFileSync(resolve(__dirname, "../requirements/DocumentAnnotations.sysml"), "utf8"));
  }
  ix.setDocument(URI, text);
  return { ix, q: (qn: string) => ix.findByQualifiedName(qn)[0]! };
}
function after(plan: PlanResult, text: string): string {
  expect(plan.ok, JSON.stringify(plan)).toBe(true);
  if (!plan.ok) return "";
  const out = applyEdits(text, groupByUri(plan.edits).get(URI) ?? []);
  expect(defaultDocumentParser(URI, out).errors).toEqual([]);
  return out;
}
const fails = (p: PlanResult) => {
  expect(p.ok).toBe(false);
  return p.ok ? "" : p.reason;
};

describe("verify of a requirement definition (item 3)", () => {
  const T = "package P {\n    requirement def R;\n    verification def V {\n        objective {\n        }\n    }\n}\n";
  test("writes an anonymous requirement usage typed by the definition, and the reader sees it", () => {
    const { ix, q } = setup(T);
    const t = after(planVerify(ix, q("P::R"), q("P::V")), T);
    expect(t).toContain("verify requirement : R;");
    expect(t).not.toMatch(/verify R;/);
    const s = setup(t);
    const rel = buildRelations(s.ix);
    expect(rel.verify.get(s.q("P::R"))?.map((v) => v.verifier.name)).toEqual(["V"]);
    expect(listRequirements(s.ix, s.q("P"), rel)[0]!.verifiedBy).toHaveLength(1);
  });
  test("a new case verifying a definition", () => {
    const { ix, q } = setup("package P {\n    requirement def R;\n}\n");
    const t = after(planVerify(ix, q("P::R"), { create: "Check" }), "package P {\n    requirement def R;\n}\n");
    expect(t).toContain("verify requirement : R;");
  });
  test("a second verification is refused as already verified", () => {
    const { ix, q } = setup(T);
    const t = after(planVerify(ix, q("P::R"), q("P::V")), T);
    const s = setup(t);
    expect(fails(planVerify(s.ix, s.q("P::R"), s.q("P::V")))).toMatch(/already verifies/);
  });
});

describe("derivation (items 3, 8, 9, 10, 11, 12)", () => {
  const T = "package P {\n    requirement a;\n    requirement b;\n    requirement c;\n    requirement def D;\n}\n";
  test("refuses definitions", () => {
    const { ix, q } = setup(T);
    expect(fails(planDerivation(ix, q("P::D"), [q("P::b")]))).toMatch(/usages/);
    expect(fails(planDerivation(ix, q("P::a"), [q("P::D")]))).toMatch(/usages/);
  });
  test("a second derivation from the same original joins the existing connection; a duplicate is refused", () => {
    const { ix, q } = setup(T);
    const t1 = after(planDerivation(ix, q("P::a"), [q("P::b")]), T);
    const s = setup(t1);
    const t2 = after(planDerivation(s.ix, s.q("P::a"), [s.q("P::c")]), t1);
    expect(t2.match(/#derivation connection/g)).toHaveLength(1);
    expect(t2).toContain("end #derive ::> c;");
    const s2 = setup(t2);
    expect(allDerivations(s2.ix)[0]!.derived.map((d) => d.target?.name)).toEqual(["b", "c"]);
    expect(fails(planDerivation(s2.ix, s2.q("P::a"), [s2.q("P::c")]))).toMatch(/already derived/);
  });
  test("removal verifies the named derived requirement, also for the last end", () => {
    const { ix, q } = setup(T);
    const t1 = after(planDerivation(ix, q("P::a"), [q("P::b")]), T);
    const s = setup(t1);
    const conn = allDerivations(s.ix)[0]!.connection;
    expect(fails(planRemoveDerivation(s.ix, conn, s.q("P::c")))).toMatch(/not derived/);
    expect(planRemoveDerivation(s.ix, conn, s.q("P::b")).ok).toBe(true);
  });
  test("hand-written forms are read; removing one end of them is refused", () => {
    const H = `package P {
    private import RequirementDerivation::*;
    requirement a; requirement b; requirement c;
    connection c1 { @DerivationMetadata; end original ::> a; end derive ::> b; end derive ::> c; }
    connection c2 { metadata DerivationMetadata; end #original ::> a; end #derive ::> b; }
    connection c3 : DerivationConnections::Derivation { end #original ::> a; end #derive ::> c; }
}
`;
    const { ix, q } = setup(H, true);
    const ds = allDerivations(ix);
    expect(ds.map((d) => [d.form, d.original?.target?.name, d.derived.map((x) => x.target?.name)])).toEqual([
      ["metadata", "a", ["b", "c"]], ["metadata", "a", ["b"]], ["typed", "a", ["c"]],
    ]);
    expect(buildRelations(ix).derives.get(q("P::a"))).toHaveLength(4);
    expect(fails(planRemoveDerivation(ix, ds[0]!.connection, q("P::b")))).toMatch(/by hand/);
    expect(planRemoveDerivation(ix, ds[1]!.connection).ok).toBe(true);
    expect(derivationOf(ix, ds[0]!.connection)!.form).toBe("metadata");
    expect(listRequirements(ix, q("P")).find((r) => r.name === "b")!.derivedFrom[0]!.removeBlocked).toMatch(/by hand/);
  });
  test("CRLF files get CRLF in every new declaration", () => {
    const crlf = T.replace(/\n/g, "\r\n");
    const { ix, q } = setup(crlf);
    const t = after(planDerivation(ix, q("P::a"), [q("P::b")]), crlf);
    expect(t.replace(/\r\n/g, "")).not.toMatch(/\n/);
    const v = "package P {\r\n    requirement a;\r\n}\r\n";
    const s = setup(v);
    expect(after(planVerify(s.ix, s.q("P::a"), { create: "V" }), v).replace(/\r\n/g, "")).not.toMatch(/\n/);
    const sec = setup(v);
    const t3 = after(planAddSection(sec.ix, sec.q("P"), "Appx", { appendix: true }), v);
    expect(t3.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });
  test("a requirement named like an inherited feature is written qualified", () => {
    const S = "package P {\n    requirement 'subject';\n    requirement other;\n    verification def V {\n        objective {\n        }\n    }\n}\n";
    const { ix, q } = setup(S, true);
    const t = after(planVerify(ix, q("P::'subject'"), q("P::V")), S);
    expect(t).toContain("verify P::'subject';");
    const t2 = after(planVerify(ix, q("P::'subject'"), { create: "N" }), S);
    expect(t2).toContain("verify P::'subject';");
    const t3 = after(planDerivation(ix, q("P::other"), [q("P::'subject'")]), S);
    expect(t3).toContain("end #derive ::> P::'subject';");
  });
});

describe("planAddParagraph places the first doc before comments (item 13)", () => {
  test("after imports, before the first comment", () => {
    const T = "package P {\n    private import ScalarValues::*;\n    comment /* c1 */\n    part x;\n}\n";
    const { ix, q } = setup(T);
    const t = after(planAddParagraph(ix, q("P"), "intro"), T);
    expect(t.indexOf("doc /* intro */")).toBeGreaterThan(t.indexOf("import"));
    expect(t.indexOf("doc /* intro */")).toBeLessThan(t.indexOf("comment /* c1 */"));
  });
});

describe("satisfy forms (item 4)", () => {
  const T = `package P {
    part v;
    requirement def R;
    requirement q;
    part a {
        satisfy q;
    }
    part b {
        satisfy q by v;
        not satisfy q by v;
        assert not satisfy q by v;
        satisfy requirement r : R by v;
    }
}
`;
  test("forms", () => {
    const { ix, q } = setup(T);
    expect(defaultDocumentParser(URI, T).errors).toEqual([]);
    const rel = buildRelations(ix);
    const qi = listRequirements(ix, q("P"), rel).find((r) => r.name === "q")!;
    expect(qi.satisfiedBy.map((s) => s.byElement?.name)).toEqual(["a", "v"]);
    expect(qi.notSatisfiedBy.map((s) => s.by)).toEqual(["v", "v"]);
    const ri = listRequirements(ix, q("P"), rel).find((r) => r.name === "R")!;
    expect(ri.satisfiedBy.map((s) => s.by)).toEqual(["v"]);
    expect(ri.notSatisfiedBy).toEqual([]);
  });
});
