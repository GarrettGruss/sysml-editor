import { describe, expect, it } from "vitest";
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
