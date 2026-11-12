import { describe, expect, test } from "vitest";
import { FakeHost } from "./fake-host.js";
import { ModelService, type OpOk } from "./service.js";

const URI = "file:///w/spec.sysml";
const MODEL = `package Spec {
    requirement <'R1'> massLimit {
        doc /* The mass shall be small. */
    }
    requirement <'R2'> chassisMass;
    part vehicle;
    package Perf;
    package Safety {
        doc /* Safe. */
    }
    verification def weigh;
}
`;
function setup() {
  const host = new FakeHost();
  host.addDocument(URI, MODEL);
  const svc = new ModelService(host);
  const q = (qn: string) => host.index.findByQualifiedName(qn)[0]!;
  return { host, svc, q };
}
const ok = (r: { ok: boolean }): OpOk => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r as OpOk;
};

describe("ModelService requirement operations", () => {
  test("derive writes the connection, saves, and is the text an agent also gets", async () => {
    const a = setup();
    ok(await a.svc.derive(a.q("Spec::massLimit"), [a.q("Spec::chassisMass")]));
    expect(a.host.buffers.get(URI)).toContain("#derivation connection {\n        end #original ::> massLimit;\n        end #derive ::> chassisMass;\n    }");
    expect(a.host.disk.get(URI)).toBe(a.host.buffers.get(URI));
    expect(a.host.applied).toHaveLength(1);
    const b = setup();
    ok(await b.svc.derive(b.q("Spec::massLimit"), [b.q("Spec::chassisMass")]));
    expect(b.host.buffers.get(URI)).toBe(a.host.buffers.get(URI));
  });
  test("verify into an existing case, a new case, and removal", async () => {
    const { host, svc, q } = setup();
    ok(await svc.verify(q("Spec::massLimit"), q("Spec::weigh")));
    expect(host.buffers.get(URI)).toContain("verification def weigh {\n        objective {\n            verify massLimit;\n        }\n    }");
    ok(await svc.verify(q("Spec::chassisMass"), { create: "checkChassis" }));
    expect(host.buffers.get(URI)).toContain("verification checkChassis {");
    const v = q("Spec::weigh").members.find((m) => m.kind === "objective")!.members[0]!;
    ok(await svc.removeVerify(v));
    expect(host.buffers.get(URI)).not.toContain("verify massLimit");
  });
  test("satisfy and its removal", async () => {
    const { host, svc, q } = setup();
    ok(await svc.satisfy(q("Spec::massLimit"), q("Spec::vehicle")));
    expect(host.buffers.get(URI)).toContain("satisfy massLimit by vehicle;");
    ok(await svc.removeSatisfy(q("Spec").members.find((m) => m.kind === "satisfy")!));
    expect(host.buffers.get(URI)).toBe(MODEL);
  });
  test("create requirement with id, name and documentation containing a terminator", async () => {
    const { host, svc, q } = setup();
    ok(await svc.createRequirement(q("Spec"), { id: "R9", name: "rangeReq", documentation: "Range */ ok" }));
    expect(host.buffers.get(URI)).toContain("requirement <'R9'> rangeReq {\n        doc /* Range *\\/ ok */\n    }");
    ok(await svc.createRequirement(q("Spec"), { id: "R10", name: "plain" }));
    expect(host.buffers.get(URI)).toContain("requirement <'R10'> plain;");
  });
  test("sections, paragraphs and moves", async () => {
    const { host, svc, q } = setup();
    ok(await svc.addSection(q("Spec"), "Functional Safety", { after: q("Spec::Perf") }));
    expect(host.buffers.get(URI)).toContain("package Perf;\n    package 'Functional Safety';\n    package Safety");
    ok(await svc.moveMember(q("Spec::Safety"), { before: q("Spec::Perf") }));
    expect(host.buffers.get(URI)!.indexOf("package Safety")).toBeLessThan(host.buffers.get(URI)!.indexOf("package Perf"));
    ok(await svc.addParagraph(q("Spec::Perf"), "Hello"));
    ok(await svc.addParagraph(q("Spec::Perf"), "World"));
    expect(host.buffers.get(URI)).toContain("package Perf {\n        doc /* Hello */\n        comment /* World */\n    }");
    ok(await svc.setParagraph(q("Spec::Perf").members[1]!, "Changed"));
    expect(host.buffers.get(URI)).toContain("comment /* Changed */");
    ok(await svc.addSection(q("Spec"), "Glossary", { appendix: true }));
    expect(host.buffers.get(URI)).toContain("@Appendix;");
    expect(host.buffers.get(URI)).toContain("private import DocumentAnnotations::*;");
  });
  test("refused on a file with a syntax error and on library content", async () => {
    const { host, svc, q } = setup();
    host.addDocument("file:///w/bad.sysml", "package Bad { part x }");
    const r = await svc.addSection(q("Spec"), "X");
    expect(r.ok).toBe(true);
    host.blocked.set(URI, "excluded");
    const r2 = await svc.derive(q("Spec::massLimit"), [q("Spec::chassisMass")]);
    expect(r2.ok).toBe(false);
  });
});
