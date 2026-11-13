import { describe, expect, test } from "vitest";
import { FakeHost } from "./fake-host.js";
import { ModelService, type OpOk } from "./service.js";

const URI = "file:///w/m.sysml";
const MODEL = `package P {
    state def M {
        state big;
        state test;
        transition first big then test;
    }
}
`;
const D = "file:///w/d.sysmld";
const DIAGRAM = JSON.stringify({
  version: 1, kind: "stateTransition", root: "P::M", sources: ["m.sysml"],
  nodes: [{ id: "n0", ref: "P::M" }, { id: "n1", ref: "P::M::big", parent: "n0", x: 10, y: 10 }, { id: "n2", ref: "P::M::test", parent: "n0", x: 200, y: 10 }],
  edges: [{ id: "e1", locator: { owner: "P::M", kind: "transition", ends: ["big", "test"] }, source: "n1", target: "n2" }],
});

describe("ModelService.nest", () => {
  test("moves the declaration, rewrites references, follows in the diagram and undoes as one", async () => {
    const host = new FakeHost();
    host.addDocument(URI, MODEL);
    host.addDiagram(D, DIAGRAM, true);
    const svc = new ModelService(host);
    const q = (qn: string) => host.index.findByQualifiedName(qn)[0]!;
    const r = await svc.nest({ element: q("P::M::test") }, q("P::M::big"), { diagram: D });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const text = host.buffers.get(URI)!;
    expect(text).toMatch(/state big \{\s+state test;\s+\}/);
    expect(text).toContain("then P::M::big::test;");
    const mem = host.diagramMemory.get(D)!;
    const moved = mem.nodes.find((n) => n.id === "n2")!;
    expect(moved.ref).toBe("P::M::big::test");
    expect(moved.parent).toBe("n1");
    expect(moved.x).toBeUndefined();
    expect(mem.edges[0]!.locator?.ends).toEqual(["big", "P::M::big::test"]);
    const u = await svc.undo(r as OpOk);
    expect(u.textReverted).toBe(true);
    expect(host.buffers.get(URI)).toBe(MODEL);
    const back = host.diagramMemory.get(D)!;
    expect(back.nodes.find((n) => n.id === "n2")).toMatchObject({ ref: "P::M::test", parent: "n0", x: 200, y: 10 });
    expect(back.edges[0]!.locator?.ends).toEqual(["big", "test"]);
  });

  test("refuses an inherited feature seen from a usage, and a target that cannot own it", async () => {
    const host = new FakeHost();
    host.addDocument(URI, "package P {\n  part def A { part x; }\n  part def B;\n  part a : A;\n  state s;\n}\n");
    const svc = new ModelService(host);
    const q = (qn: string) => host.index.findByQualifiedName(qn)[0]!;
    const inherited = await svc.nest({ element: q("P::A::x"), context: q("P::a") }, q("P::B"));
    expect(inherited.ok).toBe(false);
    const wrong = await svc.nest({ element: q("P::a") }, q("P::s"));
    expect(wrong.ok).toBe(false);
    expect(!wrong.ok && wrong.reason).toMatch(/cannot own/);
    expect(host.buffers.get(URI)).toBe("package P {\n  part def A { part x; }\n  part def B;\n  part a : A;\n  state s;\n}\n");
  });
});
