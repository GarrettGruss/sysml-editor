import { describe, expect, it } from "vitest";
import { ModelIndex, defaultDocumentParser } from "../model/index.js";
import { FakeHost } from "../model-service/fake-host.js";
import { ModelService } from "../model-service/service.js";
import { ToolError, invokeTool, toolDefinitions, type ToolContext } from "./index.js";
import { lmToolManifest } from "./manifest.js";

const ROOT = "file:///w/";
const URI = ROOT + "spec.sysml";
const MODEL = `package VehicleSpec {
  private import DocumentAnnotations::*;
  @DocumentRoot { title = "Vehicle SRS"; version = "2"; }
  package 'Performance Requirements' {
    doc /* Scope of performance. */
    requirement <'R3'> massLimit { doc /* Mass --> shall be low. */ }
    requirement <'R4'> chassisMass;
    part def TestRig;
    verification def weigh {
      objective {
        verify massLimit;
      }
    }
  }
  package Glossary { @Appendix; doc /* Terms. */ }
}
`;

function setup(trusted = true) {
  const host = new FakeHost();
  host.addDocument(URI, MODEL);
  const service = new ModelService(host);
  const ctx: ToolContext = {
    index: host.index,
    uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
    pathToUri: (p) => (host.index.getDocument(ROOT + p) ? ROOT + p : undefined),
    edits: { service, isTrusted: () => trusted, diagramUri: async () => { throw new ToolError("no diagrams"); } },
  };
  return { host, ctx };
}
const call = (ctx: ToolContext, name: string, input: unknown) => Promise.resolve(invokeTool(name, input, ctx));

describe("sysml_read_requirements_document", () => {
  it("returns Markdown with numbering, a table of contents, qualified-name markers and appendices", async () => {
    const { ctx } = setup();
    const r = await call(ctx, "sysml_read_requirements_document", { package: "VehicleSpec" });
    expect(r.isError).toBeUndefined();
    const t = r.text;
    expect(t).toMatch(/^# Vehicle SRS <!-- qn: VehicleSpec -->/);
    expect(t).toContain("Version 2");
    expect(t).toContain("## Table of contents");
    expect(t).toContain("- 1 Performance Requirements\n- Appendix A Glossary");
    expect(t).toContain("## 1 Performance Requirements <!-- qn: VehicleSpec::'Performance Requirements' -->");
    expect(t).toContain("Scope of performance.");
    expect(t).toContain("**R3 massLimit** (requirement) <!-- qn: VehicleSpec::'Performance Requirements'::massLimit -->");
    expect(t).toContain("- Verified by: weigh");
    expect(t).toContain("Model elements: part def TestRig, verification def weigh");
    expect(t).toContain("## Appendix A Glossary <!-- qn: VehicleSpec::Glossary -->");
    // untrusted text cannot forge or close a marker
    expect(t).toContain("Mass --&gt; shall be low.");
    expect(t).not.toContain("Mass --> shall");
    expect(t.indexOf("## Appendix A Glossary")).toBeGreaterThan(t.indexOf("## 1 Performance Requirements"));
  });
  it("works in an untrusted workspace and refuses unknown packages", async () => {
    const { ctx } = setup(false);
    expect((await call(ctx, "sysml_read_requirements_document", { package: "VehicleSpec" })).isError).toBeUndefined();
    expect((await call(ctx, "sysml_read_requirements_document", { package: "Nope" })).isError).toBe(true);
  });
  it("is bounded", async () => {
    const host = new FakeHost();
    host.addDocument(URI, "package Big {\n" + Array.from({ length: 4000 }, (_v, i) => `  requirement r${i} { doc /* ${"text ".repeat(10)} */ }`).join("\n") + "\n}\n");
    const r = await call({ index: host.index, uriToPath: (u) => u, pathToUri: (p) => p }, "sysml_read_requirements_document", { package: "Big" });
    expect(r.text.length).toBeLessThan(61000);
    expect(r.text).toContain("[Truncated at 60000 characters");
  });
});

describe("requirement edit tools", () => {
  it("create_requirement, verify and derivation", async () => {
    const { host, ctx } = setup();
    const c = await call(ctx, "sysml_create_requirement", { owner: "VehicleSpec::'Performance Requirements'", name: "rangeReq", id: "R9", documentation: "Range." });
    expect(c.isError, c.text).toBeUndefined();
    expect(host.buffers.get(URI)).toContain("requirement <'R9'> rangeReq {");
    const v = await call(ctx, "sysml_create_relationship", { kind: "verify", requirement: "VehicleSpec::'Performance Requirements'::chassisMass", verificationCase: "VehicleSpec::'Performance Requirements'::weigh" });
    expect(v.isError, v.text).toBeUndefined();
    expect(host.buffers.get(URI)).toContain("verify massLimit;\n        verify chassisMass;");
    const n = await call(ctx, "sysml_create_relationship", { kind: "verify", requirement: "VehicleSpec::'Performance Requirements'::rangeReq", newVerificationCase: "checkRange" });
    expect(n.isError, n.text).toBeUndefined();
    expect(host.buffers.get(URI)).toContain("verification checkRange {");
    const d = await call(ctx, "sysml_create_relationship", { kind: "derivation", original: "VehicleSpec::'Performance Requirements'::massLimit", derived: ["VehicleSpec::'Performance Requirements'::chassisMass"] });
    expect(d.isError, d.text).toBeUndefined();
    expect(host.buffers.get(URI)).toMatch(/end #original ::> massLimit;\n\s+end #derive ::> chassisMass;/);
    expect((await call(ctx, "sysml_create_relationship", { kind: "verify", requirement: "VehicleSpec::'Performance Requirements'::massLimit" })).isError).toBe(true);
    expect((await call(ctx, "sysml_create_relationship", { kind: "derivation", original: "VehicleSpec::'Performance Requirements'::massLimit", derived: [] })).isError).toBe(true);
  });
  it("write tools are refused in an untrusted workspace", async () => {
    const { host, ctx } = setup(false);
    for (const [name, input] of [
      ["sysml_create_requirement", { owner: "VehicleSpec", name: "x" }],
      ["sysml_create_relationship", { kind: "derivation", original: "VehicleSpec::'Performance Requirements'::massLimit", derived: ["VehicleSpec::'Performance Requirements'::chassisMass"] }],
      ["sysml_create_relationship", { kind: "verify", requirement: "VehicleSpec::'Performance Requirements'::massLimit", newVerificationCase: "z" }],
    ] as const) {
      const r = await call(ctx, name, input);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/not trusted/);
    }
    expect(host.buffers.get(URI)).toBe(MODEL);
  });
  it("agent derivation text equals the editor's service operation", async () => {
    const g = new FakeHost();
    g.addDocument(URI, MODEL);
    const q = (qn: string) => g.index.findByQualifiedName(qn)[0]!;
    const res = await new ModelService(g).derive(q("VehicleSpec::'Performance Requirements'::massLimit"), [q("VehicleSpec::'Performance Requirements'::chassisMass")]);
    expect(res.ok).toBe(true);
    const { host, ctx } = setup();
    await call(ctx, "sysml_create_relationship", { kind: "derivation", original: "VehicleSpec::'Performance Requirements'::massLimit", derived: ["VehicleSpec::'Performance Requirements'::chassisMass"] });
    expect(host.buffers.get(URI)).toBe(g.buffers.get(URI));
    expect(host.buffers.get(URI)).not.toBe(MODEL);
  });
  it("the new tools are in the manifest with the right tags", () => {
    const m = lmToolManifest();
    expect(m.find((t) => t.name === "sysml_read_requirements_document")!.tags).toContain("read-only");
    expect(m.find((t) => t.name === "sysml_create_requirement")!.tags).toContain("edits-model");
    expect(toolDefinitions.filter((t) => !t.readOnly).every((t) => m.find((x) => x.name === t.name)!.tags.includes("read-only") === false)).toBe(true);
  });
});

describe("requirement tools with hostile input", () => {
  const PR = "VehicleSpec::'Performance Requirements'";
  it("writes ids with spaces, quotes, backslashes and > quoted, and the real parser reads them back", async () => {
    const ids = ["R 1", "a'b", "back\\slash", "x>y", "say \"hi\"", "end\\", "'"];
    for (const id of ids) {
      const { host, ctx } = setup();
      const r = await call(ctx, "sysml_create_requirement", { owner: PR, name: "hostile", id, documentation: "text */ here" });
      expect(r.isError, `${id}: ${r.text}`).toBeUndefined();
      const text = host.buffers.get(URI)!;
      expect(defaultDocumentParser(URI, text).errors, `${id}\n${text}`).toEqual([]);
      const ix = new ModelIndex();
      ix.setDocument(URI, text);
      const el = ix.findByQualifiedName(`${PR}::hostile`)[0]!;
      expect(el.shortName).toBe(id);
      expect(el.documentation).toBe("text *\\/ here");
    }
  });
  it("writes <'R 1'> with correct quoting", async () => {
    const { host, ctx } = setup();
    await call(ctx, "sysml_create_requirement", { owner: PR, name: "spaced", id: "R 1" });
    expect(host.buffers.get(URI)).toContain("requirement <'R 1'> spaced;");
  });
  it("hostile qualified names are refused without changing anything", async () => {
    const { host, ctx } = setup();
    for (const owner of ["a'b", "VehicleSpec::", "::", "VehicleSpec::'", "'Perf'::x", "x".repeat(300), "A::'B::C'", "a\nb"]) {
      const r = await call(ctx, "sysml_create_requirement", { owner, name: "x" });
      expect(r.isError, owner).toBe(true);
    }
    expect((await call(ctx, "sysml_read_requirements_document", { package: "'" })).isError).toBe(true);
    expect(host.buffers.get(URI)).toBe(MODEL);
  });
  it("names that are not names are refused", async () => {
    const { host, ctx } = setup();
    for (const name of ["a b\nc", "x;", "}", "a'b"]) {
      const r = await call(ctx, "sysml_create_requirement", { owner: PR, name });
      if (!r.isError) {
        const text = host.buffers.get(URI)!;
        expect(defaultDocumentParser(URI, text).errors, name).toEqual([]);
      }
    }
  });
  it("very long strings are rejected by the schema or written validly", async () => {
    const { host, ctx } = setup();
    expect((await call(ctx, "sysml_create_requirement", { owner: PR, name: "x".repeat(5000) })).isError).toBe(true);
    expect((await call(ctx, "sysml_create_requirement", { owner: PR, name: "ok", documentation: "y".repeat(200000) })).isError).toBe(true);
    expect((await call(ctx, "sysml_create_requirement", { owner: "x".repeat(100000), name: "ok" })).isError).toBe(true);
    const long = await call(ctx, "sysml_create_requirement", { owner: PR, name: "longText", documentation: "word ".repeat(5000) });
    expect(long.isError, long.text.slice(0, 200)).toBeUndefined();
    expect(defaultDocumentParser(URI, host.buffers.get(URI)!).errors).toEqual([]);
  });
  it("kinds outside the enum and a verification case that is not one are refused", async () => {
    const { host, ctx } = setup();
    expect((await call(ctx, "sysml_create_relationship", { kind: "refine", requirement: `${PR}::massLimit` })).isError).toBe(true);
    const r = await call(ctx, "sysml_create_relationship", { kind: "verify", requirement: `${PR}::chassisMass`, verificationCase: `${PR}::TestRig` });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/not a verification case/);
    const r2 = await call(ctx, "sysml_create_relationship", { kind: "verify", requirement: `${PR}::TestRig`, newVerificationCase: "v2" });
    expect(r2.isError).toBe(true);
    const r3 = await call(ctx, "sysml_create_relationship", { kind: "derivation", original: `${PR}::TestRig`, derived: [`${PR}::chassisMass`] });
    expect(r3.isError).toBe(true);
    expect(host.buffers.get(URI)).toBe(MODEL);
  });
});
