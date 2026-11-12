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
    expect((await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "text", value: "Vehicle mass shall not exceed 2000 kg" })).ok).toBe(true);
    expect(host.buffers.get(URI)).toContain("doc /* Vehicle mass shall not exceed 2000 kg */");
    expect((await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "id", value: "R7" })).ok).toBe(true);
    expect(host.buffers.get(URI)).toContain("requirement <'R7'> massLimit");
    expect((await ctl.handle({ type: "setCell", qn: `${PR}::massLimit`, field: "name", value: "massCap" })).ok).toBe(true);
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
    await ctl.handle({ type: "setHeading", qn: "VehicleSpec::Reliability", value: "Functional Safety" });
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
    await ctl.handle({ type: "setParagraph", key: para.key, value: "Edited */ text" });
    expect(host.buffers.get(URI)).toContain("Edited *\\/ text");
    expect(state().document!.sections[1]!.blocks[1]).toMatchObject({ text: "Edited */ text" });
  });
});
