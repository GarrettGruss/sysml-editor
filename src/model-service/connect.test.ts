import { describe, expect, test } from "vitest";
import { FakeHost } from "./fake-host.js";
import { ModelService, type OpOk } from "./service.js";

const U = "file:///w/m.sysml";
const D = "file:///w/d.sysmld";
function setup(model: string, d?: string) {
  const host = new FakeHost();
  host.addDocument(U, model);
  if (d) host.addDiagram(D, d, true);
  const svc = new ModelService(host);
  return { host, svc, q: (qn: string) => host.index.findByQualifiedName(qn)[0]! };
}
const ok = (r: { ok: boolean }): OpOk => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r as OpOk;
};
const diagram = (kind: string, root: string, nodes: unknown[], edges: unknown[] = []) => JSON.stringify({ version: 1, kind, root, sources: ["m.sysml"], nodes, edges });

describe("a node and its line, as one edit", () => {
  const model = "package P { action def A { action a; action b; first a then b; } }";
  test("a fork and the succession to it are written together", async () => {
    const { host, svc, q } = setup(model);
    ok(await svc.addConnectedNode(q("P::A::b"), "fork", "succession"));
    const t = host.disk.get(U)!;
    expect(t).toContain("fork fork1;");
    expect(t).toContain("first b then fork1;");
    expect(host.applied).toHaveLength(1);
  });
  test("the node and the line land on the diagram at the placement", async () => {
    const d = diagram("actionFlow", "P::A", [{ id: "n1", ref: "P::A" }, { id: "n2", ref: "P::A::a", parent: "n1" }, { id: "n3", ref: "P::A::b", parent: "n1" }]);
    const { host, svc, q } = setup(model, d);
    ok(await svc.addConnectedNode(q("P::A::b"), "action", "succession", { diagram: D, placement: { diagram: D, parentNode: "n1", x: 200, y: 90 } }));
    const doc = host.diagramOnDisk(D);
    expect(doc.nodes.find((n) => n.ref === "P::A::action1")).toMatchObject({ x: 200, y: 90, parent: "n1" });
    expect(doc.edges.some((e) => e.target === doc.nodes.find((n) => n.ref === "P::A::action1")!.id)).toBe(true);
  });
  test("a state and a transition to it", async () => {
    const { host, svc, q } = setup("package P { state def S { state idle; } }");
    ok(await svc.addConnectedNode(q("P::S::idle"), "state", "transition"));
    expect(host.disk.get(U)).toContain("state state1;");
    expect(host.disk.get(U)).toContain("transition first idle then state1;");
  });
  test("a kind that cannot end the line is refused and nothing changes", async () => {
    const { host, svc, q } = setup(model);
    const r = await svc.addConnectedNode(q("P::A::b"), "state", "succession");
    expect(r.ok).toBe(false);
    expect(host.applied).toHaveLength(0);
  });
  test("nothing can follow the done node", async () => {
    const { svc, q } = setup("package P { action def A { action a; } }");
    const done = q("P::A").members.find((m) => m.kind === "done");
    if (!done) return;
    expect((await svc.addConnectedNode(done, "action", "succession")).ok).toBe(false);
  });
});

describe("reconnecting one end of a line", () => {
  test("the target of a succession moves to a fork, the rest is unchanged, an unnamed fork is named", async () => {
    const { host, svc, q } = setup("package P { action def A { action a; action b; first a then b; fork; } }");
    const s = q("P::A").members.find((m) => m.kind === "succession")!;
    ok(await svc.reconnect(s, "target", q("P::A").members.find((m) => m.kind === "fork")!));
    const t = host.disk.get(U)!;
    expect(t).toContain("fork fork1;");
    expect(t).toContain("first a then fork1;");
    expect(host.applied).toHaveLength(1);
  });
  test("a guard stays when the source moves", async () => {
    const { host, svc, q } = setup("package P { action def A { action a; action b; action c; first a if x then b; } }");
    const s = q("P::A").members.find((m) => m.kind === "succession")!;
    ok(await svc.reconnect(s, "source", q("P::A::c")));
    expect(host.disk.get(U)).toContain("first c if x then b;");
  });
  test("a transition keeps its trigger, guard and effect and its name", async () => {
    const { host, svc, q } = setup("package P { state def S { state a; state b; state c; transition go first a accept Go if ok do act then b; } }");
    const tr = q("P::S").members.find((m) => m.kind === "transition")!;
    ok(await svc.reconnect(tr, "target", q("P::S::c")));
    expect(host.disk.get(U)).toContain("transition go first a accept Go if ok do act then c;");
  });
  test("a flow end cannot be a control node", async () => {
    const { host, svc, q } = setup("package P { part def X { attribute x; attribute y; flow from x to y; } action def A { action a; fork f; } }");
    const flow = q("P::X").members.find((m) => m.kind === "flow");
    expect(flow).toBeDefined();
    const fork = q("P::A::f");
    const r = await svc.reconnect(flow!, "target", fork);
    expect(r.ok).toBe(false);
    expect(host.applied).toHaveLength(0);
  });
  test("a flow end moves to another feature", async () => {
    const { host, svc, q } = setup("package P { part def X { attribute x; attribute y; attribute z; flow from x to y; } }");
    const flow = q("P::X").members.find((m) => m.kind === "flow")!;
    ok(await svc.reconnect(flow, "target", q("P::X::z")));
    expect(host.disk.get(U)).toContain("flow from x to z;");
  });
  test("the diagram entry follows the rewritten statement", async () => {
    const d = diagram("actionFlow", "P::A", [{ id: "n1", ref: "P::A" }, { id: "n2", ref: "P::A::a", parent: "n1" }, { id: "n3", ref: "P::A::b", parent: "n1" }, { id: "n4", ref: "P::A::c", parent: "n1" }], [{ id: "e1", locator: { owner: "P::A", kind: "succession", ends: ["a", "b"] }, source: "n2", target: "n3", points: [{ x: 1, y: 1 }, { x: 5, y: 1 }] }]);
    const { host, svc, q } = setup("package P { action def A { action a; action b; action c; first a then b; } }", d);
    const s = q("P::A").members.find((m) => m.kind === "succession")!;
    ok(await svc.reconnect(s, "target", q("P::A::c"), { diagram: D }));
    const e = host.diagramOnDisk(D).edges.find((x) => x.id === "e1")!;
    expect(e.target).toBe("n4");
    expect(e.locator).toMatchObject({ ends: ["a", "c"] });
    expect(e.points).toBeUndefined();
  });
  test("an implied succession cannot be reconnected", async () => {
    const { host, svc, q } = setup("package P { action def A { action a; then action b; action c; } }");
    const s = q("P::A").members.find((m) => m.kind === "succession");
    if (!s) return;
    expect((await svc.reconnect(s, "target", q("P::A::c"))).ok).toBe(false);
    expect(host.applied).toHaveLength(0);
  });
});
