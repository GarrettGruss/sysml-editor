import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { paletteFor } from "../diagram/palette.js";
import { allowedChildKinds } from "./service.js";
import { confirmationText, deleteImpact, needsConfirmation, nameProblem, typeCandidates } from "./support.js";

const index = new ModelIndex();
index.setDocument("file:///w/m.sysml", `package P {
  part def Engine;
  port def Pw;
  part def Vehicle {
    part engine : Engine;
    part sub { part deep; }
  }
  part car : Vehicle;
  part other { part e2 : Engine; }
}`);
const q = (qn: string) => index.findByQualifiedName(qn)[0]!;

describe("palette", () => {
  it("lists the kinds valid for each diagram kind", () => {
    expect(paletteFor("general").map((i) => i.kind)).toEqual(["part def", "port def", "attribute def", "item def", "action def", "part", "port", "attribute", "item", "action"]);
    expect(paletteFor("interconnection").map((i) => i.kind)).toEqual(["part", "port", "attribute", "connection"]);
    expect(paletteFor("requirements").map((i) => i.kind)).toEqual(["requirement def", "requirement"]);
  });
});

describe("tree and dialog helpers", () => {
  it("offers package, definitions and usages under a package and usages under others", () => {
    expect(allowedChildKinds(q("P"))).toEqual(expect.arrayContaining(["package", "part def", "port def", "attribute def", "item def", "action def", "requirement def", "part", "port", "attribute", "item", "action", "requirement"]));
    expect(allowedChildKinds(q("P::Vehicle"))).toEqual(["part", "port", "attribute", "item", "action", "requirement"]);
  });
  it("validates names", () => {
    expect(nameProblem("", q("P"))).toMatch(/Enter a name/);
    expect(nameProblem("a\nb", q("P"))).toMatch(/single line/);
    expect(nameProblem("Engine", q("P"))).toMatch(/already has a member/);
    expect(nameProblem("Engine", q("P"), q("P::Engine"))).toBeUndefined();
    expect(nameProblem("fuel pump", q("P"))).toBeUndefined();
  });
  it("counts owned members and references elsewhere for the confirmation", () => {
    const impact = deleteImpact(index, q("P::Engine"));
    expect(impact.ownedMembers).toBe(0);
    expect(impact.references).toBe(2);
    expect(impact.locations.length).toBe(2);
    expect(confirmationText(q("P::Engine"), impact).detail).toMatch(/referenced in 2 places elsewhere \(m\.sysml:\d+, m\.sysml:\d+\)/);
    expect(needsConfirmation(impact)).toBe(true);
    const sub = deleteImpact(index, q("P::Vehicle::sub"));
    expect(sub).toMatchObject({ ownedMembers: 1, references: 0 });
    const { message, detail } = confirmationText(q("P::Vehicle::sub"), sub);
    expect(message).toContain("'sub'");
    expect(detail).toContain("owns 1 element");
    expect(needsConfirmation(deleteImpact(index, q("P::Vehicle::engine")))).toBe(false);
  });
  it("completes types from definitions of the matching kind", () => {
    expect(typeCandidates(index, q("P::Vehicle::engine"), "").map((c) => c.qualifiedName)).toEqual(["P::Engine", "P::Vehicle"]);
    expect(typeCandidates(index, q("P::Vehicle::engine"), "eng").map((c) => c.name)).toEqual(["Engine"]);
    expect(typeCandidates(index, q("P"), "")).toEqual([]);
  });
});

describe("input validation with inherited names", () => {
  const ix = new ModelIndex();
  ix.setDocument("file:///w/i.sysml", `package I {
  part def Base { part wheel; }
  part def Car :> Base { part own; }
  part c : Car;
}`);
  const k = (qn: string) => ix.findByQualifiedName(qn)[0]!;
  it("reports a name the owner inherits while typing, with the declaring definition", () => {
    expect(nameProblem("wheel", k("I::Car"), undefined, ix)).toMatch(/already inherited by .*Car.* from .*Base/);
    expect(nameProblem("wheel", k("I::c"), undefined, ix)).toMatch(/inherited/);
    expect(nameProblem("spare", k("I::Car"), undefined, ix)).toBeUndefined();
    // without the index only own members are known (the old behaviour)
    expect(nameProblem("wheel", k("I::Car"))).toBeUndefined();
  });
  it("renaming to an inherited name is reported too", () => {
    expect(nameProblem("wheel", k("I::Car"), k("I::Car::own"), ix)).toMatch(/inherited/);
  });
});

describe("delete confirmation", () => {
  const dx = new ModelIndex();
  dx.setDocument("file:///w/d.sysml", `package D {
  part def Engine { attribute mass : Real; }
  part car { part e : Engine; attribute total = e.mass + 1; }
  part other { attribute q = mass; }
}`);
  it("states the resolved references (count, first locations) and, separately, how many mentions could not be judged", () => {
    const el = dx.findByQualifiedName("D::Engine")[0]!;
    const impact = deleteImpact(dx, el);
    expect(impact.references).toBeGreaterThan(0);
    expect(impact.unjudged).toBeGreaterThan(0);
    const { detail } = confirmationText(el, impact);
    expect(detail).toMatch(/referenced in \d+ places? elsewhere \(d\.sysml:\d+/);
    expect(detail).toMatch(/\d+ other mentions? of .*could not be checked/);
    expect(needsConfirmation({ ownedMembers: 0, references: 0, unjudged: 2, locations: [] })).toBe(true);
  });
});
