import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { callTool, DECLARATION_CAP, FILE_CAP, MEMBER_CAP, PROBLEM_CAP, type ToolContext } from "./index.js";

const ROOT = "file:///w/";
function setup(files: Record<string, string>): ToolContext {
  const index = new ModelIndex();
  for (const [p, t] of Object.entries(files)) index.setDocument(ROOT + p, t);
  return {
    index,
    uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
    pathToUri: (p) => (index.getDocument(ROOT + p) ? ROOT + p : undefined),
  };
}
const json = (ctx: ToolContext, name: string, input: unknown = {}) => {
  const r = callTool(name, input, ctx);
  expect(r.isError).toBeUndefined();
  return JSON.parse(r.text);
};

describe("output caps", () => {
  it("sysml_validate caps problems and reports the total", () => {
    const body = Array.from({ length: PROBLEM_CAP + 30 }, (_, i) => `part p${i} : Nope${i};`).join("\n");
    const ctx = setup({ "a.sysml": `package A {\n${body}\n}` });
    const r = json(ctx, "sysml_validate");
    expect(r.problems).toHaveLength(PROBLEM_CAP);
    expect(r.note).toContain(`${PROBLEM_CAP + 30}`);
    expect(r.note).toContain("file");
    expect(json(ctx, "sysml_validate", { file: "a.sysml" }).problems).toHaveLength(PROBLEM_CAP);
  });
  it("sysml_list_files caps files with a note", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < FILE_CAP + 5; i++) files[`f${String(i).padStart(4, "0")}.sysml`] = `package P${i};`;
    const r = json(setup(files), "sysml_list_files");
    expect(r.files).toHaveLength(FILE_CAP);
    expect(r.note).toContain(`${FILE_CAP + 5}`);
  });
  it("sysml_get_element caps owned members", () => {
    const body = Array.from({ length: MEMBER_CAP + 7 }, (_, i) => `part m${i};`).join("\n");
    const r = json(setup({ "a.sysml": `package A {\n${body}\n}` }), "sysml_get_element", { qualifiedName: "A" });
    expect(r.elements[0].ownedMembers).toHaveLength(MEMBER_CAP);
    expect(r.elements[0].ownedMembersTotal).toBe(MEMBER_CAP + 7);
    expect(r.elements[0].note).toContain("ownedMembers");
  });
  it("sysml_get_element caps declarations", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < DECLARATION_CAP + 4; i++) files[`f${i}.sysml`] = `package Shared { part x${i}; }`;
    const r = json(setup(files), "sysml_get_element", { qualifiedName: "Shared" });
    expect(r.elements).toHaveLength(DECLARATION_CAP);
    expect(r.note).toContain(`${DECLARATION_CAP + 4}`);
  });
  it("leaves small results untouched", () => {
    const r = json(setup({ "a.sysml": "package A { part x; }" }), "sysml_get_element", { qualifiedName: "A" });
    expect(r.note).toBeUndefined();
    expect(r.ownedMembersTotal).toBeUndefined();
  });
});
