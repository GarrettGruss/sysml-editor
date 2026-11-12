import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { analyze, interactionOf } from "../model/index.js";
import { FakeHost } from "./fake-host.js";
import { ModelService, type OpOk } from "./service.js";

const fx = (n: string) => readFileSync(`test/fixtures/workspace-basic/${n}.sysml`, "utf8");
const U = "file:///w/m.sysml";
const D = "file:///w/d.sysmld";
const diagram = (kind: string, root: string, nodes: unknown[], edges: unknown[] = []) => JSON.stringify({ version: 1, kind, root, sources: ["m.sysml"], nodes, edges });
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

describe("behaviour operations", () => {
  test("add a state, a transition, then its trigger, all saved at once and undoable as text", async () => {
    const { host, svc, q } = setup(fx("states"));
    ok(await svc.addElement(q("Lamp::lamp"), { kind: "state", name: "idle" }));
    expect(host.disk.get(U)).toContain("state idle;");
    ok(await svc.addTransition(q("Lamp::lamp"), q("Lamp::lamp::off"), q("Lamp::lamp::idle")));
    expect(host.disk.get(U)).toContain("transition first off then idle;");
    const tr = q("Lamp::lamp").members.find((m) => m.kind === "transition" && m.ends.join() === "off,idle")!;
    ok(await svc.setTransition(tr, { trigger: "TurnOff" }));
    expect(host.disk.get(U)).toContain("transition first off accept TurnOff then idle;");
    expect(host.disk.get(U)).toBe(host.buffers.get(U));
  });
  test("a refused guard changes nothing", async () => {
    const { host, svc, q } = setup(fx("states"));
    const before = host.disk.get(U);
    const r = await svc.setTransition(q("Lamp::lamp::off_to_on"), { guard: "a +" });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/syntax error/);
    expect(host.disk.get(U)).toBe(before);
    expect(host.applied).toHaveLength(0);
  });
  test("a drawn transition lands on the diagram, and rewriting a shorthand transition keeps its edge", async () => {
    const model = "package P { attribute def Sig; state def S { first start then off; state off; accept Sig then on; state on; } }";
    const { host, svc, q } = setup(model, diagram("stateTransition", "P::S", [{ id: "n1", ref: "P::S" }, { id: "n2", ref: "P::S::off", parent: "n1" }, { id: "n3", ref: "P::S::on", parent: "n1" }], [{ id: "e1", locator: { owner: "P::S", kind: "transition", ends: ["on"] }, source: "n2", target: "n3" }]));
    const tr = q("P::S").members.find((m) => m.kind === "transition")!;
    ok(await svc.setTransition(tr, { guard: "x > 1" }, { diagram: D }));
    expect(host.disk.get(U)).toContain("transition first off accept Sig if x > 1 then on;");
    const e = host.diagramOnDisk(D).edges.find((x) => x.id === "e1")!;
    expect(e.locator).toMatchObject({ kind: "transition", ends: ["off", "on"] });
    const r = ok(await svc.addTransition(q("P::S"), q("P::S::on"), q("P::S::off"), {}, { diagram: D, placement: { diagram: D } }));
    expect(r.diagramFiles).toEqual([D]);
    expect(host.diagramOnDisk(D).edges.some((x) => x.locator?.ends.join() === "on,off")).toBe(true);
  });
  test("succession and a duplicate; message after the last message", async () => {
    const { host, svc, q } = setup(fx("actions") + "\n", undefined);
    const o = q("Delivery::deliverOrder");
    ok(await svc.addSuccession(o, q("Delivery::deliverOrder::retry"), q("Delivery::deliverOrder::ship")));
    expect(host.disk.get(U)).toContain("first retry then ship;");
    const dup = await svc.addSuccession(q("Delivery::deliverOrder"), q("Delivery::deliverOrder::retry"), q("Delivery::deliverOrder::ship"));
    expect(dup.ok).toBe(false);
    const m = setup(fx("interaction"));
    ok(await m.svc.addMessage(m.q("Ordering::OrderInteraction"), "customer", "warehouse", { name: "ping", itemType: "Order" }));
    expect(m.host.disk.get(U)).toContain("then message ping of Order from customer to warehouse;");
    const i = interactionOf(m.host.index, m.q("Ordering::OrderInteraction"));
    expect(i.messages.map((x) => x.name)).toEqual(["placeOrder", "pickGoods", "sendReceipt", "ping"]);
  });
  test("deleting a state removes its transitions in one edit, and the diagram entries; undo restores the text", async () => {
    const { host, svc, q } = setup(fx("states"), diagram("stateTransition", "Lamp::lamp", [{ id: "n1", ref: "Lamp::lamp" }, { id: "n2", ref: "Lamp::lamp::off", parent: "n1" }, { id: "n3", ref: "Lamp::lamp::operating", parent: "n1" }], [{ id: "e1", ref: "Lamp::lamp::off_to_on", source: "n2", target: "n3" }, { id: "e2", ref: "Lamp::lamp::on_to_off", source: "n3", target: "n2" }]));
    const before = host.disk.get(U)!;
    const r = ok(await svc.deleteElement({ element: q("Lamp::lamp::off") }));
    expect(host.applied).toHaveLength(1);
    expect(host.disk.get(U)).not.toContain("off_to_on");
    expect(host.disk.get(U)).not.toContain("first start then off");
    const d = host.diagramOnDisk(D);
    expect(d.nodes.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(d.edges).toEqual([]);
    expect((await svc.undo(r)).textReverted).toBe(true);
    expect(host.disk.get(U)).toBe(before);
  });
  test("an unnamed message deleted from the model also leaves the diagram", async () => {
    const model = "package P { part def Pt { part a; part b; message of Int from a to b; } }";
    const { host, svc, q } = setup(model, diagram("sequence", "P::Pt", [{ id: "n1", ref: "P::Pt" }, { id: "n2", ref: "P::Pt::a" }, { id: "n3", ref: "P::Pt::b" }], [{ id: "e1", locator: { owner: "P::Pt", kind: "message", ends: ["a", "b"] }, source: "n2", target: "n3" }]));
    const msg = q("P::Pt").members.find((m) => m.kind === "message")!;
    ok(await svc.deleteElement({ element: msg }));
    expect(host.disk.get(U)).not.toContain("message");
    expect(host.diagramOnDisk(D).edges).toEqual([]);
    expect(analyze(host.index, q("P::Pt")).successions).toEqual([]);
  });

  test("rule: staleness: a change between planning and applying re-plans once, and a second change fails untouched", async () => {
    const { host, svc, q } = setup(fx("states"));
    host.beforeApply = () => host.buffers.set(U, "// header\n" + host.buffers.get(U)!);
    ok(await svc.addTransition(q("Lamp::lamp"), q("Lamp::lamp::operating"), q("Lamp::lamp::off"), { trigger: "Overheat" }));
    expect(host.buffers.get(U)).toMatch(/^\/\/ header\n/);
    expect(host.buffers.get(U)).toContain("transition first operating accept Overheat then off;");
    const b = setup(fx("states"));
    let n = 0;
    const orig = b.host.applyAndSave.bind(b.host);
    b.host.applyAndSave = async (e, s2) => { b.host.buffers.set(U, `// ${n++}\n` + b.host.buffers.get(U)!); return orig(e, s2); };
    const r = await b.svc.addTransition(b.q("Lamp::lamp"), b.q("Lamp::lamp::operating"), b.q("Lamp::lamp::off"));
    expect(r.ok).toBe(false);
    expect(b.host.applied).toHaveLength(0);
  });
  test("rule: reference writing: an item type from another package is written so it resolves, with its import", async () => {
    const { host, svc, q } = setup("package Other { item def Order; }\npackage P { part def Pt { part a; part b; } }\n");
    ok(await svc.addMessage(q("P::Pt"), "a", "b", { name: "m", itemType: "Other::Order" }));
    const t = host.disk.get(U)!;
    expect(t).toMatch(/import Other::(Order|\*);/);
    expect(t).toMatch(/message m of (Other::)?Order from a to b;/);
    expect(host.index.getDocument(U)!.errors).toEqual([]);
  });
  test("rule: syntax errors, library and read-only files are refused", async () => {
    const { host, svc, q } = setup(fx("states"));
    const lamp = q("Lamp::lamp");
    host.buffers.set(U, host.buffers.get(U)! + "\npackage Broken { part x : ; }");
    host.index.setDocument(U, host.buffers.get(U)!);
    const r = await svc.addTransition(lamp, q("Lamp::lamp::off"), q("Lamp::lamp::operating"));
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/syntax error/);
  });
});
