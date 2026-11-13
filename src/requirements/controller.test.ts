import { describe, expect, test } from "vitest";
import { FakeHost } from "../model-service/fake-host.js";
import { ModelService } from "../model-service/service.js";
import { RequirementsController, type RequirementsUi, type PickItem } from "./controller.js";
import { buildState } from "./view-model.js";

const URI = "file:///w/spec.sysml";
const MODEL = `package VehicleSpec {
    private import DocumentAnnotations::*;
    @DocumentRoot { title = "Vehicle SRS"; }
    package 'Performance Requirements' {
        doc /* Scope. */
        requirement <'R1'> massLimit {
            doc /* The mass shall be small. */
        }
        requirement <'R2'> chassisMass;
        part vehicle;
    }
    package Safety;
    package Glossary {
        @Appendix;
    }
}
`;

function setup(script: Partial<{ confirm: boolean; one: string; many: string[]; verification: { existing: string } | { create: string }; name: string }> = {}) {
  const host = new FakeHost();
  host.addDocument(URI, MODEL);
  const service = new ModelService(host);
  const reports: string[] = [];
  const nav: string[] = [];
  const ui: RequirementsUi = {
    confirm: async (m, d) => { reports.push(`confirm: ${m} | ${d}`); return script.confirm ?? true; },
    pickOne: async (items: PickItem[]) => script.one ?? items[0]?.id,
    pickMany: async () => script.many,
    pickVerification: async () => script.verification,
    inputName: async () => script.name,
    report: (r) => { if (!r.ok) reports.push(`refused: ${r.reason}`); },
  };
  const ctl = new RequirementsController(service, host.index, ui, { revealInTree: (e) => nav.push("tree " + e.qualifiedName), goToText: (e) => nav.push("text " + e.qualifiedName), showInDiagram: (e) => nav.push("diagram " + e.qualifiedName) }, () => "VehicleSpec::'Performance Requirements'");
  const state = () => buildState(host.index, { kind: "package", qualifiedName: "VehicleSpec" });
  return { host, ctl, reports, nav, state };
}
const PR = "VehicleSpec::'Performance Requirements'";

describe("requirements table", () => {
  test("lists requirements with counts of nested packages", () => {
    const { state } = setup();
    const rows = state().table.rows;
    expect(rows.map((r) => [r.id, r.name, r.text, r.satisfy, r.verify])).toEqual([["R1", "massLimit", "The mass shall be small.", 0, 0], ["R2", "chassisMass", "", 0, 0]]);
    expect(rows[0]!.owner).toBe(PR);
  });
  test("edit text, id and name; add and delete", async () => {
    const { host, ctl, state } = setup();
    expect((await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "text", value: "Vehicle mass shall not exceed 2000 kg", expected: "The mass shall be small." })).ok).toBe(true);
    expect(host.buffers.get(URI)).toContain("doc /* Vehicle mass shall not exceed 2000 kg */");
    expect((await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "id", value: "R7", expected: "R1" })).ok).toBe(true);
    expect(host.buffers.get(URI)).toContain("requirement <'R7'> massLimit");
    expect((await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "name", value: "massCap", expected: "massLimit" })).ok).toBe(true);
    expect(state().table.rows[0]!.name).toBe("massCap");
    expect((await ctl.handle({ type: "addRequirement", kind: "requirement", id: "R2x", name: "rangeReq" })).ok).toBe(true);
    expect(host.buffers.get(URI)).toContain("requirement <'R2x'> rangeReq;");
    expect((await ctl.handle({ type: "deleteRequirement", qn: `${PR}::rangeReq` })).ok).toBe(true);
    expect(host.buffers.get(URI)).not.toContain("rangeReq");
  });
  test("delete needs confirmation", async () => {
    const { host, ctl } = setup({ confirm: false });
    const before = host.buffers.get(URI);
    expect((await ctl.handle({ type: "deleteRequirement", qn: `${PR}::massLimit` })).message).toBe("cancelled");
    expect(host.buffers.get(URI)).toBe(before);
  });
  test("satisfy, verify (new case), derivation, and removal; counts update", async () => {
    const { host, ctl, state } = setup({ one: `${PR}::vehicle`, name: "weighVehicle" });
    await ctl.handle({ type: "addSatisfy", qn: `${PR}::massLimit` });
    expect(host.buffers.get(URI)).toContain("satisfy massLimit by vehicle;");
    expect(state().table.rows[0]!.satisfy).toBe(1);
    await ctl.handle({ type: "addVerify", qn: `${PR}::massLimit` }); // no case exists: asks for a name
    expect(host.buffers.get(URI)).toContain("verification weighVehicle {");
    expect(state().table.rows[0]!.verify).toBe(1);
    const c2 = setup({ one: `${PR}::massLimit` });
    await c2.ctl.handle({ type: "addDerivedFrom", qn: `${PR}::chassisMass` });
    expect(c2.host.buffers.get(URI)).toMatch(/#derivation connection \{\n\s+end #original ::> massLimit;\n\s+end #derive ::> chassisMass;/);
    const rows = c2.state().table.rows;
    expect(rows[1]!.derivedFrom).toHaveLength(1);
    expect(rows[0]!.derives).toHaveLength(1);
    await c2.ctl.handle({ type: "removeDerivation", connectionKey: rows[1]!.derivedFrom[0]!.connectionKey!, derivedQn: `${PR}::chassisMass` });
    expect(c2.host.buffers.get(URI)).not.toContain("#derivation");
    const s = state().table.rows[0]!;
    await ctl.handle({ type: "removeSatisfy", key: s.satisfiedBy[0]!.key });
    await ctl.handle({ type: "removeVerify", key: state().table.rows[0]!.verifiedBy[0]!.key });
    expect(state().table.rows[0]).toMatchObject({ satisfy: 0, verify: 0 });
  });
  test("verify into an existing case; navigation", async () => {
    const { host, ctl, nav } = setup({ verification: { existing: `${PR}::weigh` } });
    host.addDocument(URI, MODEL.replace("part vehicle;", "part vehicle;\n        verification def weigh;"));
    await ctl.handle({ type: "addVerify", qn: `${PR}::massLimit` });
    expect(host.buffers.get(URI)).toContain("verify massLimit;");
    await ctl.handle({ type: "navigate", qn: `${PR}::massLimit`, to: "tree" });
    await ctl.handle({ type: "navigate", qn: `${PR}::massLimit`, to: "text" });
    await ctl.handle({ type: "navigate", qn: `${PR}::massLimit`, to: "diagram" });
    expect(nav).toEqual([`tree ${PR}::massLimit`, `text ${PR}::massLimit`, `diagram ${PR}::massLimit`]);
  });
});

describe("document view operations", () => {
  test("document view state", () => {
    const { state } = setup();
    const d = state().document!;
    expect(d.title).toBe("Vehicle SRS");
    expect(d.sections.map((s) => `${s.number} ${s.heading}`)).toEqual(["1 Performance Requirements", "2 Safety"]);
    expect(d.appendices.map((s) => `${s.number} ${s.heading}`)).toEqual(["A Glossary"]);
    expect(d.sections[0]!.canMoveUp).toBe(false);
    expect(d.sections[0]!.canMoveDown).toBe(true);
  });
  test("add section after, rename with spaces, move, delete with the contents named", async () => {
    const { host, ctl, state, reports } = setup();
    await ctl.handle({ type: "addSection", parentQn: "VehicleSpec", name: "Reliability", afterQn: PR });
    expect(host.buffers.get(URI)).toContain("package Reliability;");
    expect(state().document!.sections.map((s) => s.heading)).toEqual(["Performance Requirements", "Reliability", "Safety"]);
    await ctl.handle({ type: "setHeading", qn: "VehicleSpec::Reliability", value: "Functional Safety", expected: "Reliability" });
    expect(host.buffers.get(URI)).toContain("package 'Functional Safety';");
    await ctl.handle({ type: "moveSection", qn: "VehicleSpec::Safety", how: "up" });
    expect(state().document!.sections.map((s) => s.heading)).toEqual(["Performance Requirements", "Safety", "Functional Safety"]);
    expect(host.buffers.get(URI)).not.toMatch(/package '?[0-9]/);
    expect((await ctl.handle({ type: "moveSection", qn: "VehicleSpec::Glossary", how: "up" })).message).toContain("cannot move further");
    await ctl.handle({ type: "deleteSection", qn: PR });
    expect(reports.join("\n")).toContain("It contains 1 paragraph, 2 requirements, 1 other element, which are removed");
    expect(host.buffers.get(URI)).not.toContain("Performance Requirements");
    expect(state().document!.sections.map((s) => s.number)).toEqual(["1", "2"]);
  });
  test("appendix and paragraphs", async () => {
    const { host, ctl, state } = setup();
    await ctl.handle({ type: "addSection", parentQn: "VehicleSpec", name: "Index", appendix: true });
    expect(state().document!.appendices.map((s) => `${s.number} ${s.heading}`)).toEqual(["A Glossary", "B Index"]);
    expect(host.buffers.get(URI)!.match(/DocumentAnnotations::\*/g)).toHaveLength(1);
    await ctl.handle({ type: "addParagraph", pkgQn: "VehicleSpec::Safety", text: "Safety matters.\n- one\n- two" });
    await ctl.handle({ type: "addParagraph", pkgQn: "VehicleSpec::Safety", text: "Contains */ here" });
    const sec = state().document!.sections[1]!;
    expect(sec.blocks.map((b) => (b.kind === "paragraph" ? `${b.source}:${b.text}` : b.kind))).toEqual(["paragraph:" + "Safety matters.\n- one\n- two", "paragraph:Contains */ here"].map((s, i) => (i === 0 ? "doc:" + s.slice(10) : "comment:" + s.slice(10))));
    const para = sec.blocks[1]! as { key: string };
    await ctl.handle({ type: "setParagraph", key: para.key, value: "Edited */ text", expected: "Contains */ here" });
    expect(host.buffers.get(URI)).toContain("Edited *\\/ text");
    expect(state().document!.sections[1]!.blocks[1]).toMatchObject({ text: "Edited */ text" });
  });
});

describe("conflicts and stable paragraph keys", () => {
  const SAFETY = "VehicleSpec::Safety";
  test("a stale expected text is a conflict and nothing is applied; overwrite with the new expected applies", async () => {
    const { host, ctl } = setup();
    const before = host.buffers.get(URI);
    const r = await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "text", value: "mine", expected: "something older" });
    expect(r).toMatchObject({ ok: false, conflict: { fieldKey: `${PR}::massLimit|text`, current: "The mass shall be small." } });
    expect(host.buffers.get(URI)).toBe(before);
    const h = await ctl.handle({ type: "setHeading", qn: SAFETY, value: "Safe", expected: "Old" });
    expect(h.conflict).toEqual({ fieldKey: `${SAFETY}|heading`, current: "Safety" });
    expect((await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "text", value: "mine", expected: "The mass shall be small." })).ok).toBe(true);
    expect(host.buffers.get(URI)).toContain("doc /* mine */");
  });
  test("a paragraph key survives text inserted above, and a stale expected text is a conflict", async () => {
    const { host, ctl, state } = setup();
    await ctl.handle({ type: "addParagraph", pkgQn: SAFETY, text: "First." });
    await ctl.handle({ type: "addParagraph", pkgQn: SAFETY, text: "Second." });
    const key = (state().document!.sections[1]!.blocks[1] as { key: string }).key;
    // Insert lines at the top of the file: every offset moves, the key does not.
    host.addDocument(URI, "// header\n// header 2\n" + host.buffers.get(URI)!);
    const again = state().document!.sections[1]!.blocks[1] as { key: string; text: string };
    expect(again.key).toBe(key);
    expect(again.text).toBe("Second.");
    expect((await ctl.handle({ type: "setParagraph", key, value: "Changed.", expected: "Second." })).ok).toBe(true);
    expect(host.buffers.get(URI)).toContain("Changed.");
    expect(host.buffers.get(URI)).toContain("First.");
    const r = await ctl.handle({ type: "setParagraph", key, value: "Again.", expected: "Second." });
    expect(r.conflict).toMatchObject({ fieldKey: key, current: "Changed." });
    expect((await ctl.handle({ type: "setParagraph", key: key.replace(/\|1$/, "|7"), value: "x", expected: "" })).ok).toBe(false);
  });
});

describe("requirements authoring: add and move", () => {
  const MF = `package MF {
    requirement def Owner {
        requirement <'MFRQ01'> First {
            doc /* One. */
        }
        // about the second
        requirement <'MFRQ02'> Second {
            doc /* Two. */
        }
        requirement <'MFRQ03'> Third;
    }
}
`;
  function mf() {
    const host = new FakeHost();
    host.addDocument(URI, MF);
    const service = new ModelService(host);
    const ui: RequirementsUi = { confirm: async () => true, pickOne: async () => undefined, pickMany: async () => undefined, pickVerification: async () => undefined, inputName: async () => undefined, report: () => undefined };
    const ctl = new RequirementsController(service, host.index, ui, { revealInTree: () => undefined, goToText: () => undefined, showInDiagram: () => undefined }, () => "MF::Owner");
    return { host, ctl, text: () => host.buffers.get(URI)!, order: () => [...host.buffers.get(URI)!.matchAll(/<'(MFRQ\d+)'>/g)].map((m) => m[1]) };
  }
  test("add above a requirement, at the end, and as a child inside a requirement body", async () => {
    const { ctl, text, order } = mf();
    expect((await ctl.handle({ type: "addRequirement", kind: "requirement", id: "MFRQ00", name: "Zero", ownerQn: "MF::Owner", beforeQn: "MF::Owner::First" })).ok).toBe(true);
    expect(order()).toEqual(["MFRQ00", "MFRQ01", "MFRQ02", "MFRQ03"]);
    expect((await ctl.handle({ type: "addRequirement", kind: "requirement", id: "MFRQ04", name: "Fourth", ownerQn: "MF::Owner" })).ok).toBe(true);
    expect(order().at(-1)).toBe("MFRQ04");
    expect((await ctl.handle({ type: "addRequirement", kind: "requirement", id: "MFRQ01_1", name: "Child", ownerQn: "MF::Owner::First" })).ok).toBe(true);
    expect(text()).toMatch(/<'MFRQ01'> First \{[\s\S]*<'MFRQ01_1'> Child[\s\S]*\}\s*\/\/ about the second/);
    expect((await ctl.handle({ type: "addRequirement", kind: "requirement", id: "X", name: "Nope", ownerQn: "MF::Owner", beforeQn: "MF::Owner::Missing" })).ok).toBe(false);
  });
  test("a comment above the target stays attached: the new requirement goes above the comment", async () => {
    const { ctl, text } = mf();
    await ctl.handle({ type: "addRequirement", kind: "requirement", id: "N", name: "New", ownerQn: "MF::Owner", beforeQn: "MF::Owner::Second" });
    expect(text()).toMatch(/<'N'> New;?[\s\S]*\/\/ about the second\s*\n\s*requirement <'MFRQ02'>/);
  });
  test("move up, down, to a gap; the leading comment travels with it", async () => {
    const { ctl, text, order } = mf();
    expect((await ctl.handle({ type: "moveRequirement", qn: "MF::Owner::Second", how: "up" })).ok).toBe(true);
    expect(order()).toEqual(["MFRQ02", "MFRQ01", "MFRQ03"]);
    expect(text()).toMatch(/\/\/ about the second\s*\n\s*requirement <'MFRQ02'>/);
    expect((await ctl.handle({ type: "moveRequirement", qn: "MF::Owner::First", how: "down" })).ok).toBe(true);
    expect(order()).toEqual(["MFRQ02", "MFRQ03", "MFRQ01"]);
    expect((await ctl.handle({ type: "moveRequirement", qn: "MF::Owner::Third", how: { ownerQn: "MF::Owner", beforeQn: "MF::Owner::Second" } })).ok).toBe(true);
    expect(order()).toEqual(["MFRQ03", "MFRQ02", "MFRQ01"]);
    expect((await ctl.handle({ type: "moveRequirement", qn: "MF::Owner::Third", how: "up" })).ok).toBe(false);
  });
  test("dropping onto a requirement nests it, creating { } when it has none; dragging out un-nests", async () => {
    const { ctl, text, order } = mf();
    const r = await ctl.handle({ type: "moveRequirement", qn: "MF::Owner::Second", how: { ownerQn: "MF::Owner::Third" } });
    expect(r.ok).toBe(true);
    expect(text()).toMatch(/<'MFRQ03'> Third \{[\s\S]*<'MFRQ02'> Second[\s\S]*\}/);
    expect(order()).toEqual(["MFRQ01", "MFRQ03", "MFRQ02"]);
    expect((await ctl.handle({ type: "moveRequirement", qn: "MF::Owner::Third::Second", how: { ownerQn: "MF::Owner", beforeQn: "MF::Owner::First" } })).ok).toBe(true);
    expect(order()).toEqual(["MFRQ02", "MFRQ01", "MFRQ03"]);
    expect((await ctl.handle({ type: "moveRequirement", qn: "MF::Owner::First", how: { ownerQn: "MF::Owner::First" } })).ok).toBe(false);
  });
  test("a move that would change what a name resolves to is refused with a reason, and nothing changes", async () => {
    const host = new FakeHost();
    const text = "package D {\n    package A {\n        requirement <'RA'> X;\n    }\n    package B {\n        requirement <'RB'> X;\n    }\n    package C {\n        private import A::*;\n        part y : X;\n    }\n}\n";
    host.addDocument(URI, text);
    const service = new ModelService(host);
    const ui: RequirementsUi = { confirm: async () => true, pickOne: async () => undefined, pickMany: async () => undefined, pickVerification: async () => undefined, inputName: async () => undefined, report: () => undefined };
    const ctl = new RequirementsController(service, host.index, ui, { revealInTree: () => undefined, goToText: () => undefined, showInDiagram: () => undefined }, () => "D");
    const r = await ctl.handle({ type: "moveRequirement", qn: "D::B::X", how: { ownerQn: "D::C" } });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/refer to|resolve/i);
    expect(host.buffers.get(URI)).toBe(text);
  });
});
