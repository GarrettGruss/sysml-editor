import { describe, expect, test } from "vitest";
import { ModelIndex, inheritedFrom, inheritedMembers, isInheritedIn, locate } from "./index.js";

const text = `package M {
  part def Base { part wheel; }
  part def Vehicle :> Base {
    part engine;
    port drive;
  }
  part vehicle1 : Vehicle {
    part battery;
  }
  part vehicle2 : Vehicle {
    part :>> engine;
  }
  part def Loop1 :> Loop2 { part a; }
  part def Loop2 :> Loop1 { part b; }
}`;

function setup() {
  const index = new ModelIndex();
  index.setDocument("file:///m.sysml", text);
  const q = (qn: string) => index.findByQualifiedName(qn)[0]!;
  return { index, q };
}

describe("inherited members", () => {
  test("a usage inherits from its definition and the definition's supertypes, nearest first", () => {
    const { index, q } = setup();
    const names = inheritedMembers(index, q("M::vehicle1")).map((i) => `${i.member.name}<${i.declaredIn.name}`);
    expect(names).toEqual(["engine<Vehicle", "drive<Vehicle", "wheel<Base"]);
  });

  test("own members are not inherited and a redefined member is not inherited", () => {
    const { index, q } = setup();
    expect(inheritedMembers(index, q("M::vehicle1")).some((i) => i.member.name === "battery")).toBe(false);
    const v2 = inheritedMembers(index, q("M::vehicle2")).map((i) => i.member.name);
    expect(v2).not.toContain("engine");
    expect(v2).toContain("drive");
  });

  test("a definition inherits from the definition it specializes", () => {
    const { index, q } = setup();
    expect(isInheritedIn(index, q("M::Base::wheel"), q("M::Vehicle"))).toBe(true);
    expect(isInheritedIn(index, q("M::Vehicle::engine"), q("M::Vehicle"))).toBe(false);
  });

  test("specialization cycles terminate", () => {
    const { index, q } = setup();
    expect(inheritedMembers(index, q("M::Loop1")).map((i) => i.member.name)).toEqual(["b"]);
  });

  test("inheritedFrom names the declaring element", () => {
    const { index, q } = setup();
    expect(inheritedFrom(index, q("M::Vehicle::engine"), q("M::vehicle1"))?.qualifiedName).toBe("M::Vehicle");
    expect(inheritedFrom(index, q("M::vehicle1::battery"), q("M::vehicle1"))).toBeUndefined();
  });

  test("locate finds an inherited feature through the usage path", () => {
    const { index, q } = setup();
    const r = locate(index, "M::vehicle1::engine")!;
    expect(r.element).toBe(q("M::Vehicle::engine"));
    expect(r.context).toBe(q("M::vehicle1"));
    expect(locate(index, "M::Vehicle::engine")!.context).toBeUndefined();
    expect(locate(index, "M::vehicle1::nothing")).toBeUndefined();
  });
});

describe("usage bodies", () => {
  test("a usage with a type and a body has a body range, so members can be added to it", () => {
    const { q } = setup();
    expect(q("M::vehicle1").bodyRange).toBeDefined();
  });
});
