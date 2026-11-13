import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { analyze, interactionOf, isSynthetic, stateActions, parseTransition, syntheticMembers } from "./behavior.js";
import { ModelIndex } from "./index.js";
import type { Element } from "./types.js";

const REL = "fixtures/sysml-v2-release/sysml/src";
function load(text: string) {
  const index = new ModelIndex();
  index.setDocument("file:///m.sysml", text);
  expect(index.getDocument("file:///m.sysml")!.errors).toEqual([]);
  return { index, q: (qn: string) => index.findByQualifiedName(qn)[0]! };
}
const loadFile = (rel: string) => load(readFileSync(`${REL}/${rel}`, "utf8"));
const nm = (e: Element) => e.name ?? e.kind;
const edges = (a: ReturnType<typeof analyze>) => a.successions.map((s) => `${nm(s.source)}->${nm(s.target)}${s.guard ? ` [${s.guard}]` : ""}${s.implied ? " (implied)" : ""}`);

describe("successions and control nodes", () => {
  test("decision with guards and merge (Decision Example)", () => {
    const { index, q } = loadFile("training/17. Control/Decision Example.sysml");
    const a = analyze(index, q("'Decision Example'::ChargeBattery"));
    expect(edges(a)).toEqual([
      "start->continueCharging (implied)",
      "continueCharging->monitor (implied)",
      "monitor->decide (implied)",
      "decide->addCharge [monitor.batteryCharge < 100]",
      "decide->endCharging [monitor.batteryCharge >= 100]",
      "addCharge->continueCharging (implied)",
      "endCharging->done (implied)",
    ].map((e) => (e.startsWith("addCharge") || e.startsWith("endCharging") ? e.replace(" (implied)", "") : e)));
  });
  test("fork and join (Fork Join Example)", () => {
    const { index, q } = loadFile("training/17. Control/Fork Join Example.sysml");
    const a = analyze(index, q("'Fork Join Example'::Brake"));
    expect(edges(a)).toContain("TurnOn->fork (implied)");
    expect(edges(a)).toContain("fork->monitorBrakePedal");
    expect(edges(a)).toContain("braking->joinNode");
    expect(a.flows.map((f) => `${f.sourceText}>${f.targetText}`)).toEqual(["monitorBrakePedal.brakePressure>braking.brakePressure", "monitorTraction.modulationFrequency>braking.modulationFrequency"]);
    expect(a.flows[0]!.source?.name).toBe("monitorBrakePedal");
  });
  test("guarded first/then and flow (Conditional Succession)", () => {
    const { index, q } = loadFile("training/16. Conditional Succession/Conditional Succession Example-1.sysml");
    const a = analyze(index, q("'Conditional Succession Example-1'::takePicture"));
    expect(edges(a)).toEqual(["focus->shoot [focus.image.isWellFocused]"]);
    expect(a.flows).toHaveLength(1);
  });
  test("the forms of one action", () => {
    const { index, q } = load(`package P { item def T;
      action def A { out y : T;
        first start; then action a1; action a2; action a3 { out o : T; } action a4 { in i : T; }
        then fork f1; then a2; then a3; join j1; first a2 then j1; succession s1 first a3 then j1;
        decide d1; if a2 == 1 then a4; else a3; merge m1; flow of T from a3.o to a4.i; flow f2 from a3.o to a4.i; } }`);
    const a = analyze(index, q("P::A"));
    expect(edges(a)).toContain("start->a1 (implied)");
    expect(edges(a)).toContain("f1->a2");
    expect(edges(a)).toContain("a2->j1");
    expect(edges(a)).toContain("a3->j1");
    expect(edges(a)).toContain("d1->a4 [a2 == 1]");
    expect(edges(a)).toContain("d1->a3 [else]");
    expect(a.flows.map((f) => f.item)).toEqual(["T", undefined]);
    expect(a.nodes.map(nm)).toContain("start");
  });
  test("synthetic start/done and implied successions are stable per owner and ends of locators", () => {
    const { index, q } = load("package P { action def A { first start; then action x; then action y; then done; } }");
    const a = q("P::A");
    const s1 = syntheticMembers(index, a);
    expect(syntheticMembers(index, a)).toBe(s1);
    expect(s1.map((e) => `${e.kind}:${e.ends.join(",")}`)).toEqual(["start:", "done:", "succession:start,x", "succession:x,y"]);
    expect(s1.every((e) => isSynthetic(e))).toBe(true);
  });
});

describe("states and transitions", () => {
  test("shorthand transitions and entry/do/exit (Transition Actions)", () => {
    const { index, q } = loadFile("training/25. Transitions/Transition Actions.sysml");
    const s = q("'Transition Actions'::vehicleStates");
    const a = analyze(index, s);
    expect(edges(a)).toEqual(["start->off"]);
    expect(a.transitions.map((t) => `${nm(t.source)}->${nm(t.target)} | ${t.trigger ?? ""} | ${t.guard ?? ""} | ${t.effect ?? ""}`)).toEqual([
      "off->starting | VehicleStartSignal |  | ",
      "starting->on | VehicleOnSignal | operatingVehicle.brakePedalDepressed | send new ControllerStartSignal() to controller",
      "on->off | VehicleOffSignal |  | ",
    ]);
    expect(stateActions(index, q("'Transition Actions'::vehicleStates::on"))).toEqual([
      { kind: "entry", text: "performSelfTest" }, { kind: "do", text: "providePower" }, { kind: "exit", text: "applyParkingBrake" },
    ]);
  });
  test("named transitions with entry; then (ServerSequenceRealization-2)", () => {
    const { index, q } = loadFile("examples/Interaction Sequencing Examples/ServerSequenceRealization-2.sysml");
    const s = q("ServerSequenceRealization_2::Configuration::server_2::serverBehavior");
    const a = analyze(index, s);
    expect(edges(a)).toEqual(["start->waitForSubscription (implied)"]);
    expect(a.transitions.map((t) => `${t.statement.name}: ${nm(t.source)}->${nm(t.target)} | ${t.trigger} | ${t.guard ?? ""}`)).toEqual([
      "subscribing: waitForSubscription->waitForPublication | sub : Subscribe via subscriptionPort | ",
      "delivering: waitForPublication->waitForPublication | pub : Publish via publicationPort | pub.topic == subscribing.sub.topic",
    ]);
  });
  test("every part of a named transition, and nested states", () => {
    const { index, q } = load(`package P { attribute def Sig; state def S { state off; state on { state inner; }
      transition t1 first off accept Sig if x > 1 do action e2 then on; transition first on then off; } }`);
    const s = q("P::S");
    const a = analyze(index, s);
    expect(a.transitions).toHaveLength(2);
    expect(a.transitions[0]!).toMatchObject({ trigger: "Sig", guard: "x > 1", effect: "action e2" });
    expect(a.transitions[1]!.trigger).toBeUndefined();
    expect(parseTransition(index.getDocument("file:///m.sysml")!.text, a.transitions[0]!.statement)).toEqual({ first: "off", accept: "Sig", if: "x > 1", do: "action e2", then: "on" });
    expect(q("P::S::on").members.map(nm)).toEqual(["inner"]);
  });
});

describe("messages", () => {
  test("explicit succession between messages (Interaction Example-1)", () => {
    const { index, q } = loadFile("training/27. Occurrences/Interaction Example-1.sysml");
    const i = interactionOf(index, q("'Interaction Example-1'::CruiseControlInteraction"));
    expect(i.messages.map((m) => `${m.name}:${m.itemType}:${m.fromParticipant}>${m.toParticipant}`)).toEqual([
      "setSpeedMessage:SetSpeed:driver>vehicle", "sensedSpeedMessage:SensedSpeed:vehicle>vehicle", "fuelCommandMessage:FuelCommand:vehicle>vehicle",
    ]);
    // Only the first two are ordered (by `first ... then ...`); the third has no relation to them.
    expect(i.messages.map((m) => m.unordered)).toEqual([true, true, true]);
    expect(i.messages[0]!.unorderedWith).toEqual([2]);
  });
  test("then message chains (Message Payload Example) and event ordering (Interaction Example-2)", () => {
    const a = loadFile("training/27. Occurrences/Message Payload Example.sysml");
    const i = interactionOf(a.index, a.q("'Message Payload Example'::CruiseControlInteraction"));
    expect(i.messages.map((m) => m.name)).toEqual(["setSpeedMessage", "sensedSpeedMessage", "fuelCommandMessage", "fuelCommandForwardingMessage"]);
    expect(i.messages.every((m) => !m.unordered)).toBe(true);
  });
  test("partially ordered messages keep source order and are marked (ServerSequenceModel)", () => {
    const { index, q } = loadFile("examples/Interaction Sequencing Examples/ServerSequenceModel.sysml");
    const i = interactionOf(index, q("ServerSequenceModel::PubSubSequence"));
    expect(i.messages.map((m) => m.name)).toEqual(["publish_message", "subscribe_message", "deliver_message"]);
    expect(i.messages.every((m) => m.unordered)).toBe(true);
    expect(i.participants.map((p) => p.name)).toEqual(["producer", "server", "consumer"]);
  });
  test("unnamed messages, names, item types and ordering by then", () => {
    const { index, q } = load(`package P { item def T; part def Pt { part driver; part vehicle;
      message of T from driver to vehicle; then message m2 of T from vehicle to driver; then message from driver to vehicle; } }`);
    const i = interactionOf(index, q("P::Pt"));
    expect(i.messages.map((m) => `${m.name ?? "-"}/${m.itemType ?? "-"}/${m.unordered}`)).toEqual(["-/T/false", "m2/T/false", "-/-/false"]);
    expect(i.participants.map((p) => p.name)).toEqual(["driver", "vehicle"]);
  });
});

describe("ordering across other members", () => {
  test("a message after another member is not ordered after the message before it", () => {
    const { index, q } = load("package P { part def Pt { part a; part b; message m1 from a to b; part p; then message m2 from b to a; } }");
    const i = interactionOf(index, q("P::Pt"));
    expect(i.messages.every((m) => m.unordered)).toBe(true);
  });
});

describe("dotted succession and transition ends", () => {
  const model = "package P { state def S { state s1 { state sub; } state s2; transition first s1.sub then s2; transition first s1.nope then s2; } }";
  test("every segment of the path is resolved; an unresolvable path leaves the statement undrawn", () => {
    const { index, q } = load(model);
    const t = analyze(index, q("P::S")).transitions;
    expect(t.map((x) => `${x.source.name}>${x.target.name}`)).toEqual(["sub>s2"]);
  });
});
