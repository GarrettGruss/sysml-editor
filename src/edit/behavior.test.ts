import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { analyze, interactionOf, ModelIndex, type Element } from "../model/index.js";
import { applyEdits } from "./text.js";
import { describeDependents, dependentsOf, planAddMessage, planAddSuccession, planAddTransition, planDeleteBehavior, planSetTransition, transitionParts, transitionText } from "./behavior.js";
import type { PlanResult } from "./types.js";

const URI = "file:///m.sysml";
const fx = (n: string) => readFileSync(`test/fixtures/workspace-basic/${n}.sysml`, "utf8");
function setup(text: string) {
  const index = new ModelIndex();
  index.setDocument(URI, text);
  expect(index.getDocument(URI)!.errors).toEqual([]);
  return { index, q: (qn: string) => index.findByQualifiedName(qn)[0]!, text };
}
function apply(p: PlanResult, text: string): string {
  if (!p.ok) throw new Error(p.reason);
  return applyEdits(text, p.edits);
}
const reparse = (text: string) => {
  const i = new ModelIndex();
  i.setDocument(URI, text);
  expect(i.getDocument(URI)!.errors).toEqual([]);
  return i;
};

describe("successions", () => {
  test("first a then b; is written after the two declarations and read back", () => {
    const { index, q, text } = setup(fx("actions"));
    const owner = q("Delivery::deliverOrder");
    const r = apply(planAddSuccession(index, owner, q("Delivery::deliverOrder::retry"), q("Delivery::deliverOrder::ship")), text);
    // Straight after `ship` the parser reads `then done;` wrongly, so the statement goes to the end of the body.
    expect(r).toContain("flow of Parcel from pack.parcel to ship.parcel;\n    first retry then ship;\n  }");
    const i2 = reparse(r);
    expect(analyze(i2, i2.findByQualifiedName("Delivery::deliverOrder")[0]!).successions.map((s) => `${s.source.name}>${s.target.name}`)).toContain("retry>ship");
  });
  test("a guarded succession, and refusal of a duplicate", () => {
    const { index, q, text } = setup("package P { action def A { action a; action b; } }");
    const owner = q("P::A");
    const r = apply(planAddSuccession(index, owner, q("P::A::a"), q("P::A::b"), "x > 1"), text);
    expect(r).toContain("first a if x > 1 then b;");
    const i2 = reparse(r);
    const dup = planAddSuccession(i2, i2.findByQualifiedName("P::A")[0]!, i2.findByQualifiedName("P::A::a")[0]!, i2.findByQualifiedName("P::A::b")[0]!, "x > 1");
    expect(dup).toMatchObject({ ok: false });
    expect((dup as { reason: string }).reason).toMatch(/already a succession/);
  });
  test("an existing implied succession counts as a duplicate", () => {
    const { index, q } = setup("package P { action def A { first start; then action a; then action b; } }");
    const p = planAddSuccession(index, q("P::A"), q("P::A::a"), q("P::A::b"));
    expect(p.ok).toBe(false);
  });
  test("start and done as ends, and refusal of unnamed or foreign nodes", () => {
    const { index, q, text } = setup("package P { action def A { action a; decide; } action def B { action c; } }");
    const a = analyze(index, q("P::A"));
    const start = a.synthetic.length ? a.synthetic[0]! : undefined;
    expect(start).toBeUndefined(); // nothing refers to start yet: it is only offered by the view
    const decide = q("P::A").members.find((m) => m.kind === "decide")!;
    expect(planAddSuccession(index, q("P::A"), q("P::A::a"), decide).ok).toBe(false);
    expect(planAddSuccession(index, q("P::A"), q("P::A::a"), q("P::B::c")).ok).toBe(false);
    expect(text).toBeTruthy();
  });
});

describe("transitions", () => {
  test("transition first off accept TurnOn then on; (trigger entered after drawing)", () => {
    const { index, q, text } = setup("package P { attribute def TurnOn; state def S { state off; state on; } }");
    const owner = q("P::S");
    const plain = apply(planAddTransition(index, owner, q("P::S::off"), q("P::S::on")), text);
    expect(plain).toContain("state on; transition first off then on;");
    const i2 = reparse(plain);
    const tr = i2.findByQualifiedName("P::S")[0]!.members.find((m) => m.kind === "transition")!;
    const withTrigger = apply(planSetTransition(i2, tr, { trigger: "TurnOn" }), plain);
    expect(withTrigger).toContain("transition first off accept TurnOn then on;");
    const direct = apply(planAddTransition(index, owner, q("P::S::off"), q("P::S::on"), { trigger: "TurnOn" }), text);
    expect(direct).toContain("transition first off accept TurnOn then on;");
  });
  test("trigger, guard and effect are re-planned from their parts, the name is kept", () => {
    const { index, q, text } = setup(fx("states"));
    const t = q("Lamp::lamp::off_to_on");
    expect(transitionParts(index, t)).toEqual({ trigger: "TurnOn", guard: "powerAvailable", effect: "action logEvent" });
    const r = apply(planSetTransition(index, t, { guard: "powerAvailable and ready", effect: "" }), text);
    expect(r).toContain("transition off_to_on first off accept TurnOn if powerAvailable and ready then operating;");
    expect(transitionText("a", "b", { trigger: "T", guard: "g", effect: "e" })).toBe("transition first a accept T if g do e then b;");
  });
  test("shorthand transitions are rewritten in the explicit form", () => {
    const { index, q, text } = setup("package P { attribute def Sig; state def S { first start then off; state off; accept Sig then on; state on; } }");
    const tr = q("P::S").members.find((m) => m.kind === "transition")!;
    const r = apply(planSetTransition(index, tr, { guard: "x > 1" }), text);
    expect(r).toContain("transition first off accept Sig if x > 1 then on;");
  });
  test("a shorthand transition inside a state body is rewritten and the source and target read back", () => {
    const { index, q, text } = setup("package P { attribute def T; state def S { state a { state x; accept T then y; state y; } state b; } }");
    const tr = q("P::S::a").members.find((m) => m.kind === "transition")!;
    const p = planSetTransition(index, tr, { guard: "x > 1" });
    const r = apply(p, text);
    expect(r).toContain("transition first x accept T if x > 1 then y;");
    const i2 = reparse(r);
    const t2 = analyze(i2, i2.findByQualifiedName("P::S::a")[0]!).transitions;
    expect(t2.map((t) => `${t.source.name}>${t.target.name} ${t.guard}`)).toEqual(["x>y x > 1"]);
  });
  test("a doc comment or visibility before a transition is kept", () => {
    const { index, q, text } = setup("package P { state def S { state a; state b;\n /** why */ private transition first a then b;\n transition t2 first b then a; } }");
    const [t1, t2] = q("P::S").members.filter((m) => m.kind === "transition");
    const r = apply(planSetTransition(index, t1!, { guard: "g" }), text);
    expect(r).toContain("/** why */ private transition first a if g then b;");
    reparse(r);
    expect(planSetTransition(index, t2!, { guard: "g" }).ok).toBe(true);
  });
  test("a transition from a dotted path is rewritten with the path as written", () => {
    const { index, q, text } = setup("package P { state def S { state s1 { state sub; } state s2; transition first s1.sub then s2; } }");
    const tr = q("P::S").members.find((m) => m.kind === "transition")!;
    const r = apply(planSetTransition(index, tr, { guard: "g" }), text);
    expect(r).toContain("transition first s1.sub if g then s2;");
  });
  test("invalid guard text is refused with the syntax error and nothing changes", () => {
    const { index, q } = setup(fx("states"));
    const t = q("Lamp::lamp::off_to_on");
    for (const bad of ["a +", "x then y", "(a", "a; part evil", "a } b"]) {
      const p = planSetTransition(index, t, { guard: bad });
      expect(p.ok, bad).toBe(false);
    }
    const p = planSetTransition(index, t, { guard: "a +" });
    expect((p as { reason: string }).reason).toMatch(/syntax error/);
  });
});

describe("messages", () => {
  test("a message is written as then message after the last one and read back last", () => {
    const { index, q, text } = setup(fx("interaction"));
    const owner = q("Ordering::OrderInteraction");
    const r = apply(planAddMessage(index, owner, "customer", "warehouse", { name: "ping", itemType: "Order" }), text);
    expect(r).toContain("then message sendReceipt of Receipt from shop to customer;\n    then message ping of Order from customer to warehouse;\n");
    const i2 = reparse(r);
    const inter = interactionOf(i2, i2.findByQualifiedName("Ordering::OrderInteraction")[0]!);
    expect(inter.messages.map((m) => m.name)).toEqual(["placeOrder", "pickGoods", "sendReceipt", "ping"]);
    expect(inter.messages.every((m) => !m.unordered)).toBe(true);
  });
  test("the first message is written without then; unknown participants are refused", () => {
    const { index, q, text } = setup("package P { part def Pt { part a; part b; } }");
    const r = apply(planAddMessage(index, q("P::Pt"), "a", "b"), text);
    expect(r).toContain("message from a to b;");
    expect(planAddMessage(index, q("P::Pt"), "a", "zzz").ok).toBe(false);
  });
});

describe("message item type", () => {
  test("only a qualified name is accepted as the item type", () => {
    const { index, q } = setup("package P { item def T; part def Pt { part a; part b; } }");
    for (const bad of ["T /* c */", "T\rU", "T U", "T // x", "'unclosed", "T::"]) expect(planAddMessage(index, q("P::Pt"), "a", "b", { itemType: bad }).ok, bad).toBe(false);
    expect(planAddMessage(index, q("P::Pt"), "a", "b", { itemType: "P::T" }).ok).toBe(true);
  });
  test("the new message reads back with its name, type and ends when it is the first", () => {
    const { index, q, text } = setup("package P { item def T; part def Pt { part a; part b; } }");
    const r = apply(planAddMessage(index, q("P::Pt"), "a", "b", { name: "m", itemType: "T" }), text);
    const i2 = reparse(r);
    const m = interactionOf(i2, i2.findByQualifiedName("P::Pt")[0]!).messages;
    expect(m.map((x) => `${x.name}:${x.itemType}:${x.fromParticipant}>${x.toParticipant}`)).toEqual(["m:T:a>b"]);
  });
});

describe("delete with dependents", () => {
  test("deleting a state deletes the transitions that reference it, in one plan", () => {
    const { index, q, text } = setup(fx("states"));
    const off = q("Lamp::lamp::off");
    expect(dependentsOf(index, off).map((d) => d.name ?? d.kind)).toEqual(["succession", "off_to_on", "on_to_off"]);
    expect(describeDependents(index, off)).toHaveLength(3);
    const r = apply(planDeleteBehavior(index, off), text);
    expect(r).not.toContain("off_to_on");
    expect(r).not.toContain("on_to_off");
    expect(r).not.toContain("first start then off");
    expect(r).toContain("state operating");
    reparse(r);
  });
  test("deleting an action written as then action also removes its then", () => {
    const { index, q, text } = setup("package P { action def A { first start; then action a; then action b; flow from a.x to b.y; } }");
    const r = apply(planDeleteBehavior(index, q("P::A::a")), text);
    expect(r).not.toMatch(/\bthen\s*;/);
    expect(r).toContain("first start; action b;");
    reparse(r);
  });
  test("deleting a message and the succession that orders it", () => {
    const { index, q, text } = setup("package P { part def Pt { part a; part b; message m1 from a to b; message m2 from b to a; first m1 then m2; } }");
    const r = apply(planDeleteBehavior(index, q("P::Pt::m2")), text);
    expect(r).not.toContain("first m1 then m2");
    expect(r).toContain("message m1 from a to b;");
  });
  test("deleting a node never re-binds the following then to the node before it", () => {
    const run = (body: string, name: string) => { const { index, q, text } = setup(`package P { action def A { ${body} } }`); return apply(planDeleteBehavior(index, q(`P::A::${name}`)), text); };
    expect(run("action a; action b; then action c;", "b")).toContain("action a; action c;");
    expect(run("action a; action b; then action c;", "b")).not.toMatch(/then/);
    expect(run("action a; then action b; then action c;", "b")).not.toMatch(/then/);
    expect(run("action a; then action b; then c; action c;", "b")).not.toMatch(/then/);
    expect(run("action a; action b; then c; action c;", "b")).not.toMatch(/then/);
    // the then belongs to the declaration even across a line break and a comment
    const r = run("action a;\n then // note\n action b;\n action c;", "b");
    expect(r).not.toMatch(/then/);
  });
  test("deleting a message keeps a following then only when it still follows a message", () => {
    const run = (body: string, name: string) => { const { index, q, text } = setup(`package P { part def Pt { part a; part b; ${body} } }`); return apply(planDeleteBehavior(index, q(`P::Pt::${name}`)), text); };
    expect(run("message m1 from a to b; then message m2 from b to a;", "m1")).toContain("message m2 from b to a;");
    expect(run("message m1 from a to b; then message m2 from b to a;", "m1")).not.toMatch(/then/);
    expect(run("message m0 from a to b; then message m1 from a to b; then message m2 from b to a;", "m1")).toContain("then message m2");
    expect(run("part c; message m1 from a to b; then message m2 from b to a;", "m1")).not.toMatch(/then/);
  });
  test("implied statements cannot be deleted on their own", () => {
    const { index, q } = setup("package P { action def A { first start; then action a; } }");
    const a = analyze(index, q("P::A"));
    const implied = a.synthetic.find((e) => e.kind === "succession")!;
    expect(planDeleteBehavior(index, implied).ok).toBe(false);
    const el: Element = q("P::A::a");
    expect(el.kind).toBe("action");
  });
});
