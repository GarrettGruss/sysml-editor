import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { ModelIndex, defaultDocumentParser, loadLibrary, type Element } from "../model/index.js";
import { derivationOf, allDerivations } from "../requirements/relations.js";
import { applyEdits, groupByUri } from "./text.js";
import { planAddParagraph, planAddSection, planDerivation, planMoveMember, planRemoveDerivation, planRemoveSatisfy, planRemoveVerify, planVerify } from "./requirements.js";
import { planSetDocumentation } from "./props.js";
import { commentBodyText, escapeTerminator, planSetCommentBody, unescapeTerminator } from "./comment.js";
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
/** The text after a plan; asserts that it parses without errors. */
function after(plan: PlanResult, text: string): string {
  expect(plan.ok, JSON.stringify(plan)).toBe(true);
  if (!plan.ok) return "";
  const edits = groupByUri(plan.edits).get(URI) ?? [];
  const out = applyEdits(text, edits);
  expect(defaultDocumentParser(URI, out).errors).toEqual([]);
  return out;
}
const fails = (p: PlanResult) => {
  expect(p.ok).toBe(false);
  return p.ok ? "" : p.reason;
};

const BASE = `package P {
    requirement <'R1'> massLimit;
    requirement <'R2'> chassisMass;
    requirement <'R3'> engineMass;
    verification def weighVehicle {
        objective {
            verify massLimit;
        }
    }
    verification def empty;
    verification def noObjective {
        doc /* x */
    }
}
`;

describe("planVerify", () => {
  test("inserts into the objective of an existing case", () => {
    const { ix, q } = setup(BASE);
    const t = after(planVerify(ix, q("P::chassisMass"), q("P::weighVehicle")), BASE);
    expect(t).toContain("            verify massLimit;\n            verify chassisMass;\n        }");
  });
  test("creates an objective when the case has none", () => {
    const { ix, q } = setup(BASE);
    const t = after(planVerify(ix, q("P::massLimit"), q("P::noObjective")), BASE);
    expect(t).toContain("        objective {\n            verify massLimit;\n        }");
  });
  test("creates a body for a case declared with a semicolon", () => {
    const { ix, q } = setup(BASE);
    const t = after(planVerify(ix, q("P::massLimit"), q("P::empty")), BASE);
    expect(t).toContain("verification def empty {\n        objective {\n            verify massLimit;\n        }\n    }");
  });
  test("creates a new verification case in the package of the requirement", () => {
    const { ix, q } = setup(BASE);
    const t = after(planVerify(ix, q("P::engineMass"), { create: "checkEngine" }), BASE);
    expect(t).toContain("    verification checkEngine {\n        objective {\n            verify engineMass;\n        }\n    }\n}");
  });
  test("refuses a duplicate, a non-case and a clashing name", () => {
    const { ix, q } = setup(BASE);
    expect(fails(planVerify(ix, q("P::massLimit"), q("P::weighVehicle")))).toMatch(/already verifies/);
    expect(fails(planVerify(ix, q("P::massLimit"), q("P::chassisMass")))).toMatch(/not a verification case/);
    expect(fails(planVerify(ix, q("P::massLimit"), { create: "weighVehicle" }))).toMatch(/already has a member/);
  });
  test("removal of a verify statement", () => {
    const { ix, q } = setup(BASE);
    const verify = q("P::weighVehicle").members.find((m) => m.kind === "objective")!.members[0]!;
    const t = after(planRemoveVerify(ix, verify), BASE);
    expect(t).not.toContain("verify massLimit");
    expect(t).toContain("objective {\n        }");
  });
});

describe("planDerivation", () => {
  test("writes the connection and the import when missing", () => {
    const { ix, q } = setup(BASE);
    const t = after(planDerivation(ix, q("P::massLimit"), [q("P::chassisMass"), q("P::engineMass")]), BASE);
    expect(t).toContain("    private import RequirementDerivation::*;");
    expect(t).toContain("    #derivation connection {\n        end #original ::> massLimit;\n        end #derive ::> chassisMass;\n        end #derive ::> engineMass;\n    }\n}");
    const ix2 = setup(t).ix;
    const d = allDerivations(ix2);
    expect(d).toHaveLength(1);
    expect(d[0]!.original!.target?.qualifiedName).toBe("P::massLimit");
    expect(d[0]!.derived.map((x) => x.target?.qualifiedName)).toEqual(["P::chassisMass", "P::engineMass"]);
  });
  test("does not add the import twice", () => {
    const text = BASE.replace("package P {\n", "package P {\n    private import RequirementDerivation::*;\n");
    const { ix, q } = setup(text);
    const t = after(planDerivation(ix, q("P::massLimit"), [q("P::chassisMass")]), text);
    expect(t.match(/RequirementDerivation/g)).toHaveLength(1);
  });
  test("removes one derived end or the whole connection", () => {
    const { ix, q } = setup(BASE);
    const t1 = after(planDerivation(ix, q("P::massLimit"), [q("P::chassisMass"), q("P::engineMass")]), BASE);
    const s1 = setup(t1);
    const conn = s1.q("P").members.find((m) => m.kind === "connection")!;
    const t2 = after(planRemoveDerivation(s1.ix, conn, s1.q("P::chassisMass")), t1);
    expect(t2).not.toContain("end #derive ::> chassisMass");
    expect(t2).toContain("end #derive ::> engineMass");
    const s2 = setup(t2);
    const t3 = after(planRemoveDerivation(s2.ix, s2.q("P").members.find((m) => m.kind === "connection")!, s2.q("P::engineMass")), t2);
    expect(t3).not.toContain("#derivation");
    expect(t3).toContain("private import RequirementDerivation::*;");
  });
  test("refuses bad input", () => {
    const { ix, q } = setup(BASE);
    expect(fails(planDerivation(ix, q("P::massLimit"), []))).toMatch(/at least one/);
    expect(fails(planDerivation(ix, q("P::massLimit"), [q("P::massLimit")]))).toMatch(/itself/);
  });
  test.skipIf(!haveLib)("with the real library the result parses and the names resolve", () => {
    const { ix, q } = setup(BASE, true);
    const t = after(planDerivation(ix, q("P::massLimit"), [q("P::chassisMass")]), BASE);
    const s = setup(t, true);
    expect(s.ix.resolveAll("derivation", s.q("P")).map((e) => e.qualifiedName)).toEqual(["RequirementDerivation::DerivationMetadata"]);
    expect(derivationOf(s.ix, s.q("P").members.find((m) => m.kind === "connection")!)?.derived).toHaveLength(1);
    // asking again finds the import and does not add it twice
    const again = planDerivation(s.ix, s.q("P::massLimit"), [q("P::engineMass")].map((e) => s.q(e.qualifiedName!)));
    expect(after(again, t).match(/RequirementDerivation::\*/g)).toHaveLength(1);
  });
});

describe("satisfy removal", () => {
  test("deletes the statement", () => {
    const text = "package P {\n    part v;\n    requirement r;\n    satisfy r by v;\n}\n";
    const { ix, q } = setup(text);
    const s = q("P").members.find((m) => m.kind === "satisfy")!;
    expect(after(planRemoveSatisfy(ix, s), text)).toBe("package P {\n    part v;\n    requirement r;\n}\n");
  });
});

describe("fixture derivations are read back", () => {
  const f = (p: string) => resolve(__dirname, "../../fixtures/sysml-v2-release/sysml/src/examples", p);
  test.skipIf(!existsSync(f("Requirements Examples")))("untyped and typed derivation connections", () => {
    const ix = new ModelIndex();
    for (const p of ["Requirements Examples/VehicleRequirementDerivation.sysml", "Requirements Examples/RequirementDerivationExample.sysml"]) ix.setDocument("file:///" + p.replace(/ /g, "_"), readFileSync(f(p), "utf8"));
    const ds = allDerivations(ix);
    expect(ds).toHaveLength(2); // the definition (ends without ::>) is not a usage derivation
    const veh = ds.find((d) => d.original?.ref === "vehicleMassRequirement")!;
    expect(veh.derived.map((x) => x.target?.name)).toEqual(["chassisMassRequirement", "engineMassRequirement"]);
    const typed = ds.find((d) => d.original?.ref === "req1")!;
    expect(typed.derived.map((x) => x.ref)).toEqual(["req1_1", "req1_1"]);
  });
});

describe("comment bodies", () => {
  test("escape convention round-trips", () => {
    expect(escapeTerminator("a */ b")).toBe("a *\\/ b");
    expect(unescapeTerminator(escapeTerminator("a */ b"))).toBe("a */ b");
  });
  test("setting a paragraph with a terminator keeps the file valid and reads back unescaped", () => {
    const text = "package P {\n    doc /* old */\n}\n";
    const { ix, q } = setup(text);
    const t = after(planSetCommentBody(ix, q("P").members.find((m) => m.kind === "doc")!, "use /* and */ here"), text);
    expect(t).toContain("doc /* use /* and *\\/ here */");
    const s = setup(t);
    expect(commentBodyText(s.ix.getDocument(URI)!.text.match(/\/\*[^]*?\*\//)![0])).toBe("use /* and */ here");
    expect(s.q("P").documentation).toBe("use /* and *\\/ here");
  });
  test("a multi-line comment keeps its margin style and indentation", () => {
    const text = "package P {\n    comment /*\n     * one\n     * two\n     */\n}\n";
    const { ix, q } = setup(text);
    const t = after(planSetCommentBody(ix, q("P").members[0]!, "one\ntwo\nthree"), text);
    expect(t).toBe("package P {\n    comment /*\n     * one\n     * two\n     * three\n     */\n}\n");
  });
  test("documentation with a terminator is stored escaped instead of refused", () => {
    const text = "package P {\n    part x;\n}\n";
    const { ix, q } = setup(text);
    const t = after(planSetDocumentation(ix, q("P::x"), "ends */ here"), text);
    expect(t).toContain("*\\/");
  });
});

const DOC = `package D {
    package S1 { doc /* one */ }

    // the second
    package S2;
    package S3 {
        part def X;
    }
}
`;
describe("planMoveMember", () => {
  test("reorders within the owner, with attached comments", () => {
    const { ix, q } = setup(DOC);
    const t = after(planMoveMember(ix, q("D::S3"), { before: q("D::S2") }), DOC);
    expect(t.indexOf("package S3")).toBeLessThan(t.indexOf("// the second"));
    expect(t.indexOf("// the second")).toBeLessThan(t.indexOf("package S2;"));
    expect(t).toContain("    package S3 {\n        part def X;\n    }\n");
    const t2 = after(planMoveMember(ix, q("D::S1"), { after: q("D::S3") }), DOC);
    expect(t2.indexOf("package S1")).toBeGreaterThan(t2.indexOf("package S3"));
  });
  test("no-op moves are refused", () => {
    const { ix, q } = setup(DOC);
    expect(fails(planMoveMember(ix, q("D::S1"), { before: q("D::S2") }))).toMatch(/already there/);
    expect(fails(planMoveMember(ix, q("D::S2"), { after: q("D::S2") }))).toMatch(/already there/);
  });
  test("moves into another owner with re-indentation", () => {
    const text = DOC.replace("package S1 { doc /* one */ }", "package S1 {\n        doc /* one */\n    }");
    const { ix, q } = setup(text);
    const t = after(planMoveMember(ix, q("D::S3"), { owner: q("D::S1") }), text);
    expect(t).toContain("package S1 {\n        doc /* one */\n        package S3 {\n            part def X;\n        }\n    }");
  });
  test("a move that would change what a reference means is refused", () => {
    const text = "package D {\n    package A { part def X; }\n    package B { part def X; }\n    package C { private import A::*; part y : X; }\n    package E;\n}\n";
    const { ix, q } = setup(text);
    // moving A's X is not possible directly; move A into C: `X` in C would still resolve; move B's X instead
    const r = planMoveMember(ix, q("D::B::X"), { owner: q("D::C") });
    // X in C resolved to A::X before; after the move C has its own X: resolution changes
    expect(r.ok).toBe(false);
  });
});

describe("sections and paragraphs", () => {
  test("add section after a sibling", () => {
    const { ix, q } = setup(DOC);
    const t = after(planAddSection(ix, q("D"), "Safety", { after: q("D::S2") }), DOC);
    expect(t).toContain("    package S2;\n    package Safety;\n    package S3");
  });
  test("heading with spaces is quoted", () => {
    const { ix, q } = setup(DOC);
    expect(after(planAddSection(ix, q("D"), "Functional Safety"), DOC)).toContain("package 'Functional Safety';");
  });
  test("appendix adds the metadata and the import when missing", () => {
    const { ix, q } = setup(DOC);
    const t = after(planAddSection(ix, q("D"), "Glossary", { appendix: true }), DOC);
    expect(t).toContain("    private import DocumentAnnotations::*;");
    expect(t).toContain("    package Glossary {\n        @Appendix;\n    }");
  });
  test("a second appendix does not repeat the import", () => {
    const { ix, q } = setup(DOC);
    const t = after(planAddSection(ix, q("D"), "Glossary", { appendix: true }), DOC);
    const s = setup(t);
    const t2 = after(planAddSection(s.ix, s.q("D"), "Index", { appendix: true }), t);
    expect(t2.match(/DocumentAnnotations::\*/g)).toHaveLength(1);
  });
  test("paragraph: doc first, then comments", () => {
    const text = "package P {\n    package S;\n}\n";
    const { ix, q } = setup(text);
    const t = after(planAddParagraph(ix, q("P::S"), "First."), text);
    expect(t).toContain("package S {\n        doc /* First. */\n    }");
    const s = setup(t);
    const t2 = after(planAddParagraph(s.ix, s.q("P::S"), "Second.\n- a\n- b"), t);
    expect(t2).toContain("doc /* First. */\n        comment /*\n         * Second.\n         * - a\n         * - b\n         */");
  });
});
