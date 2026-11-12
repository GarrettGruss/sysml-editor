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
