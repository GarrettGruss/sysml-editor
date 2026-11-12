import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FakeHost } from "../model-service/fake-host.js";
import { ModelService } from "../model-service/service.js";
import { ModelIndex } from "../model/index.js";
import { callTool, invokeTool, ToolError, type ToolContext } from "./index.js";
import { FakeDiagrams } from "./test-support.js";

const fx = (n: string) => readFileSync(`test/fixtures/workspace-basic/${n}.sysml`, "utf8");
const ROOT = "file:///w/";
const URI = ROOT + "m.sysml";

function setup(model: string) {
  const host = new FakeHost();
  host.addDocument(URI, model);
  const service = new ModelService(host);
  const diagrams = new FakeDiagrams();
  const ctx: ToolContext = {
    index: host.index,
    uriToPath: (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : undefined),
    pathToUri: () => undefined,
    diagrams,
    edits: { service, isTrusted: () => true, diagramUri: async (p) => { throw new ToolError(`No diagram file "${p}".`); } },
  };
  return { host, service, ctx, diagrams };
}
const call = async (ctx: ToolContext, name: string, input: unknown) => {
  const r = await invokeTool(name, input, ctx);
  return { ...r, json: r.isError ? undefined : JSON.parse(r.text) };
};

describe("Generate a state diagram", () => {
  it("lists the states and transitions, with trigger, guard and effect, in the JSON description", async () => {
    const { ctx, diagrams } = setup(fx("states"));
    const r = await call(ctx, "sysml_create_diagram", { root: "Lamp::lamp", kind: "stateTransition", path: "lamp.sysmld" });
    expect(r.isError, r.text).toBeUndefined();
    const d = r.json.diagram;
    expect(d.kind).toBe("stateTransition");
    const names = d.nodes.map((n: { element?: { name?: string; kind: string } }) => n.element?.name ?? n.element?.kind);
    expect(names).toEqual(expect.arrayContaining(["lamp", "off", "operating", "low", "high", "start"]));
    const tr = d.edges.find((e: { element?: { name?: string } }) => e.element?.name === "off_to_on");
    expect(tr.behavior).toEqual({ type: "transition", trigger: "TurnOn", guard: "powerAvailable", effect: "action logEvent" });
    expect(diagrams.files.has("lamp.sysmld")).toBe(true);
    const read = await call(ctx, "sysml_read_diagram", { path: "lamp.sysmld" });
    expect((read.json.edges ?? read.json.diagram?.edges).filter((e: { behavior?: { type: string } }) => e.behavior?.type === "transition")).toHaveLength(3);
  });
  it("refuses a root that does not fit the kind, with the reason", async () => {
    const { ctx } = setup(fx("states"));
    const r = await call(ctx, "sysml_create_diagram", { root: "Lamp::logEvent", kind: "stateTransition" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/needs a state or a state definition/);
    expect((await call(ctx, "sysml_create_diagram", { root: "Lamp::lamp", kind: "sequence" })).text).toMatch(/owns no `message`/);
  });
  it("action flow and sequence descriptions carry guards, flows and message order", async () => {
    const a = setup(fx("actions"));
    const af = (await call(a.ctx, "sysml_create_diagram", { root: "Delivery::deliverOrder", kind: "actionFlow", path: "a.sysmld" })).json.diagram;
    const behaviors = af.edges.map((e: { behavior?: { type: string; guard?: string; implied?: boolean; item?: string } }) => e.behavior!);
    expect(behaviors.filter((b: { guard?: string }) => b.guard).map((b: { guard?: string }) => b.guard)).toEqual(["pack.weight >= 100", "else"]);
    expect(behaviors.find((b: { type: string }) => b.type === "flow")).toMatchObject({ item: "Parcel", from: "pack.parcel", to: "ship.parcel" });
    expect(af.nodes.filter((n: { element?: { kind: string } }) => ["start", "done", "decide"].includes(n.element?.kind ?? "")).length).toBe(3);
    const s = setup(fx("interaction"));
    const sq = (await call(s.ctx, "sysml_create_diagram", { root: "Ordering::OrderInteraction", kind: "sequence", path: "s.sysmld" })).json.diagram;
    expect(sq.messages.map((m: { name: string; order: number; from: string; to: string }) => `${m.order}:${m.name}:${m.from}>${m.to}`)).toEqual(["0:placeOrder:customer>shop", "1:pickGoods:shop>warehouse", "2:sendReceipt:shop>customer"]);
    expect(sq.messages.every((m: { unordered: boolean }) => !m.unordered)).toBe(true);
  });
});

describe("Agent adds a transition", () => {
  it("writes the same transition text as the State Transition View would", async () => {
    const agent = setup("package P { attribute def TurnOn; state def S { state off; state on; } }");
    const r = await call(agent.ctx, "sysml_create_relationship", { kind: "transition", owner: "P::S", source: "off", target: "on", trigger: "TurnOn" });
    expect(r.isError, r.text).toBeUndefined();
    // GUI path: draw the transition (plain), then enter the trigger in the properties panel.
    const gui = setup("package P { attribute def TurnOn; state def S { state off; state on; } }");
    const q = (qn: string) => gui.host.index.findByQualifiedName(qn)[0]!;
    expect((await gui.service.addTransition(q("P::S"), q("P::S::off"), q("P::S::on"))).ok).toBe(true);
    const tr = q("P::S").members.find((m) => m.kind === "transition")!;
    expect((await gui.service.setTransition(tr, { trigger: "TurnOn" })).ok).toBe(true);
    expect(agent.host.disk.get(URI)).toBe(gui.host.disk.get(URI));
    expect(agent.host.disk.get(URI)).toContain("transition first off accept TurnOn then on;");
    // And in one step through the service, as `first off accept TurnOn then on` too.
    const direct = setup("package P { attribute def TurnOn; state def S { state off; state on; } }");
    await direct.service.addTransition(direct.host.index.findByQualifiedName("P::S")[0]!, direct.host.index.findByQualifiedName("P::S::off")[0]!, direct.host.index.findByQualifiedName("P::S::on")[0]!, { trigger: "TurnOn" });
    expect(direct.host.disk.get(URI)).toBe(agent.host.disk.get(URI));
  });
  it("refuses invalid guard text with the syntax error and leaves the file alone", async () => {
    const { host, ctx } = setup(fx("states"));
    const before = host.disk.get(URI);
    const r = await call(ctx, "sysml_set_transition", { element: "Lamp::lamp::off_to_on", guard: "a +" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/syntax error/);
    expect(host.disk.get(URI)).toBe(before);
  });
  it("rewrites a transition's parts and an unnamed one by its locator", async () => {
    const { host, ctx } = setup("package P { attribute def Sig; state def S { first start then off; state off; accept Sig then on; state on; } }");
    const r = await call(ctx, "sysml_set_transition", { statement: { owner: "P::S", kind: "transition", ends: ["on"] }, guard: "x > 1" });
    expect(r.isError, r.text).toBeUndefined();
    expect(host.disk.get(URI)).toContain("transition first off accept Sig if x > 1 then on;");
  });
});

describe("agent write tools for behaviour", () => {
  it("creates control nodes and successions, and the actions, states and messages the views draw", async () => {
    const { host, ctx } = setup("package P { action def A { action a; action b; } part def Pt { part x; part y; } }");
    for (const [k, n] of [["decide", "d1"], ["fork", "f1"]] as const) expect((await call(ctx, "sysml_create_element", { owner: "P::A", kind: k, name: n })).isError).toBeUndefined();
    expect((await call(ctx, "sysml_create_element", { owner: "P::Pt", kind: "fork", name: "f" })).text).toMatch(/cannot be added/);
    expect((await call(ctx, "sysml_create_relationship", { kind: "succession", owner: "P::A", source: "start", target: "a" })).isError).toBeUndefined();
    expect((await call(ctx, "sysml_create_relationship", { kind: "succession", owner: "P::A", source: "a", target: "d1" })).isError).toBeUndefined();
    expect((await call(ctx, "sysml_create_relationship", { kind: "succession", owner: "P::A", source: "d1", target: "b", guard: "x > 1" })).isError).toBeUndefined();
    const dup = await call(ctx, "sysml_create_relationship", { kind: "succession", owner: "P::A", source: "a", target: "d1" });
    expect(dup.text).toMatch(/already a succession/);
    const t = host.disk.get(URI)!;
    expect(t).toContain("first start then a;");
    expect(t).toContain("first d1 if x > 1 then b;");
    expect((await call(ctx, "sysml_create_relationship", { kind: "message", owner: "P::Pt", from: "x", to: "y", name: "m1" })).isError).toBeUndefined();
    expect((await call(ctx, "sysml_create_relationship", { kind: "message", owner: "P::Pt", from: "y", to: "x" })).isError).toBeUndefined();
    expect(host.disk.get(URI)).toContain("message m1 from x to y;");
    expect(host.disk.get(URI)).toContain("then message from y to x;");
    // delete: a node with its successions, and an unnamed message by its locator
    const del = await call(ctx, "sysml_delete_element", { element: "P::A::d1" });
    expect(del.isError, del.text).toBeUndefined();
    expect(host.disk.get(URI)).not.toContain("d1");
    const msg = await call(ctx, "sysml_delete_element", { statement: { owner: "P::Pt", kind: "message", ends: ["y", "x"] } });
    expect(msg.isError, msg.text).toBeUndefined();
    expect(host.disk.get(URI)).not.toContain("from y to x");
    expect(host.disk.get(URI)).toContain("message m1 from x to y;");
    expect(new ModelIndex()).toBeTruthy();
  });
  it("is refused in an untrusted workspace", async () => {
    const { ctx } = setup("package P { state def S { state a; state b; } }");
    const r = await callTool("sysml_create_relationship", { kind: "transition", owner: "P::S", source: "a", target: "b" }, { ...ctx, edits: { ...ctx.edits!, isTrusted: () => false } });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/not trusted/);
  });
});
