import { describe, expect, it } from "vitest";
import { createDiagram, addElement } from "../diagram/create.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "../diagram/format.js";
import { ModelIndex, type DetailsProvider, type Element } from "../model/index.js";
import { defaultDocumentParser } from "../model/index.js";
import {
  applyEdits, groupByUri, planConnect, planDeleteElement, planInsertMember, planRename, planSatisfy, planSetDocumentation,
  planSetMultiplicity, planSetShortName, planSetType, validatePlan, writeReference, type PlanResult, type TextEdit,
} from "./index.js";

const A = "file:///ws/a.sysml";
const B = "file:///ws/b.sysml";

function ws(files: Record<string, string>): ModelIndex {
  const ix = new ModelIndex();
  for (const [u, t] of Object.entries(files)) ix.setDocument(u, t);
  return ix;
}
const one = (text: string, uri = A) => ws({ [uri]: text });
const el = (ix: ModelIndex, qn: string): Element => {
  const r = ix.findByQualifiedName(qn)[0];
  if (!r) throw new Error("missing " + qn);
  return r;
};
function texts(ix: ModelIndex, plan: PlanResult): Record<string, string> {
  if (!plan.ok) throw new Error("plan failed: " + plan.reason);
  const out: Record<string, string> = {};
  for (const [uri, es] of groupByUri(plan.edits)) out[uri] = applyEdits(ix.getDocument(uri)!.text, es);
  return out;
}
const apply = (ix: ModelIndex, plan: PlanResult, uri = A) => texts(ix, plan)[uri]!;
const errorsOf = (uri: string, text: string) => defaultDocumentParser(uri, text).errors;
function expectOk(p: PlanResult): asserts p is Extract<PlanResult, { ok: true }> {
  if (!p.ok) throw new Error("expected ok, got: " + p.reason);
}

describe("applyEdits and validatePlan", () => {
  it("applies edits in a stable order and rejects overlaps", () => {
    const t = "0123456789";
    expect(applyEdits(t, [{ range: { start: 5, end: 5 }, newText: "b" }, { range: { start: 5, end: 5 }, newText: "c" }, { range: { start: 0, end: 2 }, newText: "X" }])).toBe("X234bc56789");
    expect(() => applyEdits(t, [{ range: { start: 0, end: 4 }, newText: "" }, { range: { start: 3, end: 5 }, newText: "" }])).toThrow();
  });

  it("rejects a plan whose edit would leave a syntax error", () => {
    const ix = one("package P { part a; }");
    const bad: PlanResult = { ok: true, description: "x", edits: [{ uri: A, range: { start: 12, end: 16 }, newText: "part part" }] };
    const r = validatePlan(ix, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/syntax error/);
  });

  it("accepts a valid plan unchanged", () => {
    const ix = one("package P { part a; }");
    const ok: PlanResult = { ok: true, description: "x", edits: [{ uri: A, range: { start: 12, end: 12 }, newText: "part b; " }] };
    expect(validatePlan(ix, ok)).toBe(ok);
  });
});

describe("insert member", () => {
  it("Insert preserves formatting: comments and custom indentation", () => {
    const src = `package P {
  // the engine
  part def Engine {
      // internal
      attribute power;   // watts
  }

  part def Gearbox;
}
`;
    const ix = one(src);
    const p = planInsertMember(ix, el(ix, "P::Engine"), { kind: "attribute", name: "torque" });
    expectOk(p);
    const out = apply(ix, p);
    expect(out).toBe(src.replace("      attribute power;   // watts\n", "      attribute power;   // watts\n      attribute torque;\n"));
    expect(errorsOf(A, out)).toEqual([]);
    expect(p.edits).toHaveLength(1);
    // Everything outside the inserted span is byte-identical.
    const e = p.edits[0]!;
    expect(out.slice(0, e.range.start)).toBe(src.slice(0, e.range.start));
    expect(out.slice(out.length - (src.length - e.range.end))).toBe(src.slice(e.range.end));
  });

  it("uses the owner's indent plus the detected unit when the body is empty", () => {
    const src = "package P {\n  part def A {\n  }\n  part def B { }\n}\n";
    const ix = one(src);
    expect(apply(ix, planInsertMember(ix, el(ix, "P::A"), "part x;"))).toBe("package P {\n  part def A {\n    part x;\n  }\n  part def B { }\n}\n");
    expect(apply(ix, planInsertMember(ix, el(ix, "P::B"), "part x;"))).toBe("package P {\n  part def A {\n  }\n  part def B {\n    part x;\n  }\n}\n");
  });

  it("uses tabs when the file is indented with tabs", () => {
    const src = "package P {\n\tpart def A {\n\t\tpart a;\n\t}\n\tpart def B;\n}\n";
    const ix = one(src);
    expect(apply(ix, planInsertMember(ix, el(ix, "P::A"), "part x;"))).toBe("package P {\n\tpart def A {\n\t\tpart a;\n\t\tpart x;\n\t}\n\tpart def B;\n}\n");
    expect(apply(ix, planInsertMember(ix, el(ix, "P::B"), "part x;"))).toBe("package P {\n\tpart def A {\n\t\tpart a;\n\t}\n\tpart def B {\n\t\tpart x;\n\t}\n}\n");
  });

  it("preserves CRLF line endings", () => {
    const src = "package P {\r\n    part def A {\r\n        part a;\r\n    }\r\n    part def B;\r\n}\r\n";
    const ix = one(src);
    const out = apply(ix, planInsertMember(ix, el(ix, "P::A"), "part x;"));
    expect(out).toBe("package P {\r\n    part def A {\r\n        part a;\r\n        part x;\r\n    }\r\n    part def B;\r\n}\r\n");
    const out2 = apply(ix, planInsertMember(ix, el(ix, "P::B"), "part x;"));
    expect(out2).toBe("package P {\r\n    part def A {\r\n        part a;\r\n    }\r\n    part def B {\r\n        part x;\r\n    }\r\n}\r\n");
    expect(out2.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("supports start and after-element positions", () => {
    const src = "package P {\n    part def A {\n        // first\n        part a;\n        part b;\n    }\n}\n";
    const ix = one(src);
    const a = el(ix, "P::A");
    expect(apply(ix, planInsertMember(ix, a, "part x;", "start"))).toBe("package P {\n    part def A {\n        // first\n        part x;\n        part a;\n        part b;\n    }\n}\n".replace("        // first\n        part x;\n", "        part x;\n        // first\n"));
    expect(apply(ix, planInsertMember(ix, a, "part x;", { after: el(ix, "P::A::a") }))).toBe("package P {\n    part def A {\n        // first\n        part a;\n        part x;\n        part b;\n    }\n}\n");
    const other = planInsertMember(ix, a, "part x;", { after: el(ix, "P") });
    expect(other.ok).toBe(false);
  });

  it("handles one-line bodies and members sharing a line", () => {
    const ix = one("package P { part def A { part a; } part def B { } part def C {} }\n");
    expect(apply(ix, planInsertMember(ix, el(ix, "P::A"), "part x;"))).toBe("package P { part def A { part a; part x; } part def B { } part def C {} }\n");
    expect(apply(ix, planInsertMember(ix, el(ix, "P::A"), "part x;", "start"))).toBe("package P { part def A { part x; part a; } part def B { } part def C {} }\n");
    for (const n of ["B", "C"]) {
      const out = apply(ix, planInsertMember(ix, el(ix, "P::" + n), "part x;"));
      expect(errorsOf(A, out)).toEqual([]);
    }
  });

  it("creates a body from `;` and keeps the rest of the file", () => {
    const src = "package P {\n    part def A;\n    part a : A;\n}";
    const ix = one(src);
    const out = apply(ix, planInsertMember(ix, el(ix, "P::A"), { kind: "attribute", name: "x" }));
    expect(out).toBe("package P {\n    part def A {\n        attribute x;\n    }\n    part a : A;\n}");
  });

  it("works on a file without a trailing newline and a body-less top-level owner", () => {
    const ix = one("package P;");
    expect(apply(ix, planInsertMember(ix, el(ix, "P"), "part def A;"))).toBe("package P {\n    part def A;\n}");
  });

  it("builds structured declarations (kinds, short name, type, multiplicity)", () => {
    const ix = one("package P {\n    part def Engine;\n}\n");
    const p = el(ix, "P");
    const out = apply(ix, planInsertMember(ix, p, { kind: "part", name: "engine", shortName: "e1", type: el(ix, "P::Engine"), multiplicity: "0..1" }));
    expect(out).toContain("    part <e1> engine : Engine[0..1];");
    expect(apply(ix, planInsertMember(ix, p, { kind: "port def", name: "Fuel" }))).toContain("    port def Fuel;");
    expect(apply(ix, planInsertMember(ix, p, { kind: "requirement", name: "R1" }))).toContain("    requirement R1;");
    expect(planInsertMember(ix, p, { kind: "bogus", name: "x" }).ok).toBe(false);
    expect(planInsertMember(ix, p, { kind: "part", name: "Engine" }).ok).toBe(false); // duplicate name
    expect(planInsertMember(ix, p, { kind: "part", name: "x", multiplicity: "[[" }).ok).toBe(false);
  });

  it("Name needs quoting", () => {
    const ix = one("package P {\n}\n");
    expect(apply(ix, planInsertMember(ix, el(ix, "P"), { kind: "part", name: "fuel pump" }))).toContain("    part 'fuel pump';");
    expect(apply(ix, planInsertMember(ix, el(ix, "P"), { kind: "part", name: "end" }))).toContain("    part 'end';");
    expect(apply(ix, planInsertMember(ix, el(ix, "P"), { kind: "part", name: "it's" }))).toContain("    part 'it\\'s';");
  });

  it("offsets are UTF-16: non-ASCII and astral characters before the edit", () => {
    const src = "// héllo 😀 wörld 𝒳\npackage P {\n    // naïve 😀\n    part def A { }\n    part def B { part 'é😀'; }\n}\n";
    const ix = one(src);
    const out = apply(ix, planInsertMember(ix, el(ix, "P::A"), "part x;"));
    expect(out).toBe(src.replace("part def A { }", "part def A {\n        part x;\n    }"));
    const out2 = apply(ix, planInsertMember(ix, el(ix, "P::B"), "part y;"));
    expect(out2).toBe(src.replace("part 'é😀'; }", "part 'é😀'; part y; }"));
    expect(errorsOf(A, out2)).toEqual([]);
  });

  it("inserts into a body that holds a visibility-prefixed member", () => {
    const src = "package P {\n    private part a;\n    public part b;\n}\n";
    const ix = one(src);
    expect(apply(ix, planInsertMember(ix, el(ix, "P"), "part x;", "start"))).toBe("package P {\n    part x;\n    private part a;\n    public part b;\n}\n");
  });

  it("refuses an owner that cannot hold members", () => {
    const ix = one("package P {\n    import_dummy;\n}\n".replace("    import_dummy;\n", "    private import Q::*;\n"));
    const imp = el(ix, "P").members[0]!;
    expect(planInsertMember(ix, imp, "part x;").ok).toBe(false);
  });
});

describe("delete element", () => {
  it("Delete removes whole declaration: body, a `doc` inside it, and the preceding note", () => {
    const src = `package P {
    part def Keep;

    // The engine
    part def Engine {
        doc /* the engine */
        attribute power;
        part cyl { part valve; }
    }

    part def Other;
}
`;
    const ix = one(src);
    const p = planDeleteElement(ix, el(ix, "P::Engine"));
    expectOk(p);
    const out = apply(ix, p);
    expect(out).toBe("package P {\n    part def Keep;\n\n    part def Other;\n}\n");
    expect(errorsOf(A, out)).toEqual([]);
  });

  it("removes only comments directly above the element", () => {
    const src = "package P {\n    // about a\n    part a;\n\n    // header for the block\n\n    // about b\n    part b;\n    part c; // trailing on c\n    /* note */\n    part d;\n}\n";
    const ix = one(src);
    // blank line between the header and the next comment: only the directly attached note goes
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::b")))).toBe("package P {\n    // about a\n    part a;\n\n    // header for the block\n\n    part c; // trailing on c\n    /* note */\n    part d;\n}\n");
    // a's own note goes with it; the blank line left at the top of the body is collapsed
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::a")))).toBe("package P {\n    // header for the block\n\n    // about b\n    part b;\n    part c; // trailing on c\n    /* note */\n    part d;\n}\n");
    // a comment that precedes another member stays when its predecessor is deleted
    const out = apply(ix, planDeleteElement(ix, el(ix, "P::c")));
    expect(out).toContain("    /* note */\n    part d;");
    expect(out).not.toContain("trailing on c");
    // a bare block comment directly above is attached
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::d")))).toBe("package P {\n    // about a\n    part a;\n\n    // header for the block\n\n    // about b\n    part b;\n    part c; // trailing on c\n}\n");
  });

  it("does not take a `doc` of the owner above the element", () => {
    const src = "package P {\n    doc /* about P */\n    part a;\n}\n";
    const ix = one(src);
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::a")))).toBe("package P {\n    doc /* about P */\n}\n");
  });

  it("collapses blank lines at the seam", () => {
    const src = "package P {\n    part a;\n\n    part b;\n\n    part c;\n}\n";
    const ix = one(src);
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::b")))).toBe("package P {\n    part a;\n\n    part c;\n}\n");
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::a")))).toBe("package P {\n    part b;\n\n    part c;\n}\n".replace("{\n    part b", "{\n    part b"));
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::c")))).toBe("package P {\n    part a;\n\n    part b;\n\n}\n");
  });

  it("deleting the only member keeps the empty body", () => {
    const ix = one("package P {\n    part def A {\n        part a;\n    }\n}\n");
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::A::a")))).toBe("package P {\n    part def A {\n    }\n}\n");
    const ix2 = one("package P { part def A { part a; } }\n");
    expect(apply(ix2, planDeleteElement(ix2, el(ix2, "P::A::a")))).toBe("package P { part def A { } }\n");
  });

  it("deletes one of several declarations on a line", () => {
    const ix = one("package P {\n    part a; part b; part c;\n}\n");
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::a")))).toBe("package P {\n    part b; part c;\n}\n");
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::b")))).toBe("package P {\n    part a; part c;\n}\n");
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::c")))).toBe("package P {\n    part a; part b;\n}\n");
  });

  it("deletes the last line of a file without a trailing newline, and handles CRLF", () => {
    const ix = one("package P;\npart def A;\npart def B;");
    expect(apply(ix, planDeleteElement(ix, el(ix, "B")))).toBe("package P;\npart def A;");
    const ix2 = one("package P {\r\n    part a;\r\n    part b;\r\n}\r\n");
    expect(apply(ix2, planDeleteElement(ix2, el(ix2, "P::a")))).toBe("package P {\r\n    part b;\r\n}\r\n");
  });

  it("removes a visibility keyword with its declaration, and a trailing line note", () => {
    const ix = one("package P {\n    private part a; // gone\n    part b;\n}\n");
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::a")))).toBe("package P {\n    part b;\n}\n");
  });

  it("with non-ASCII text before the element", () => {
    const src = "// 😀 ünï\npackage P {\n    part a; // ✓\n    part b;\n}\n";
    const ix = one(src);
    expect(apply(ix, planDeleteElement(ix, el(ix, "P::a")))).toBe("// 😀 ünï\npackage P {\n    part b;\n}\n");
  });

  it("Round trip: insert then delete returns the original text", () => {
    const srcs = [
      "package P {\n    part def A {\n        part a;\n    }\n\n    part def B {\n        // c\n        part b; // t\n\n    }\n}\n",
      "package P {\n\tpart def A {\n\t\tpart a;\n\t}\n}\n",
      "package P {\r\n  part def A {\r\n    part a;\r\n  }\r\n}\r\n",
      "package P {\n    part def A {\n    }\n}\n",
    ];
    for (const src of srcs) {
      const ix = one(src);
      for (const qn of ["P::A", ...(src.includes("def B") ? ["P::B"] : [])]) {
        for (const pos of ["end", "start"] as const) {
          const p = planInsertMember(ix, el(ix, qn), { kind: "part", name: "zzz" }, pos);
          const mid = apply(ix, p);
          expect(mid).not.toBe(src);
          const ix2 = one(mid);
          const back = apply(ix2, planDeleteElement(ix2, el(ix2, qn + "::zzz")));
          expect(back).toBe(src);
        }
      }
    }
  });
});

describe("rename", () => {
  const ENGINE = `package Vehicles {
    part def Engine { attribute power; }
    part def Car {
        part engine : Engine;
        part spare : Vehicles::Engine[0..1];
    }
    alias Motor0 for Engine;
}
`;
  it("Rename definition: references elsewhere follow", () => {
    const ix = ws({
      [A]: ENGINE,
      [B]: "package Use {\n    private import Vehicles::*;\n    part e : Engine;\n    part f : Vehicles::Engine;\n    part def Fast :> Engine;\n}\n",
    });
    const p = planRename(ix, el(ix, "Vehicles::Engine"), "Motor");
    expectOk(p);
    const out = texts(ix, p);
    expect(out[A]).toBe(ENGINE.replace("def Engine {", "def Motor {").replace("part engine : Engine;", "part engine : Motor;").replace("Vehicles::Engine[0..1]", "Vehicles::Motor[0..1]").replace("for Engine;", "for Motor;"));
    expect(out[B]).toBe("package Use {\n    private import Vehicles::*;\n    part e : Motor;\n    part f : Vehicles::Motor;\n    part def Fast :> Motor;\n}\n");
    expect(p.unjudged).toBeUndefined();
    // The edited workspace resolves every former reference to the renamed element.
    const ix2 = ws({ [A]: out[A]!, [B]: out[B]! });
    const motor = el(ix2, "Vehicles::Motor");
    expect(ix2.resolve("Motor", el(ix2, "Vehicles::Car::engine"))).toBe(motor);
    expect(ix2.resolve("Motor", el(ix2, "Use::e"))).toBe(motor);
    expect(ix2.resolve("Vehicles::Motor", el(ix2, "Use::f"))).toBe(motor);
  });

  it("never touches the name in comments, strings, or longer identifiers", () => {
    const src = `package P {
    // Engine in a comment
    /* Engine in a block comment */
    part def Engine;
    part def EngineX;
    part def MyEngine;
    part a : Engine;
    attribute s = "Engine";
    doc /* the Engine doc */
}
`;
    const ix = one(src);
    const out = apply(ix, planRename(ix, el(ix, "P::Engine"), "Motor"));
    expect(out).toBe(src.replace("part def Engine;", "part def Motor;").replace("part a : Engine;", "part a : Motor;"));
  });

  it("changes only the matching segment of qualified references and feature chains", () => {
    const src = `package P {
    part def Wheel;
    part def Car { part wheel : Wheel; }
    part c : Car;
    part w : P::Wheel;
    package Q { part def Wheel; part x : P::Wheel; part y : Q::Wheel; part z : Wheel; }
    connect c.wheel to w;
}
`;
    const ix = one(src);
    const out = apply(ix, planRename(ix, el(ix, "P::Wheel"), "Tire"));
    expect(out).toContain("part wheel : Tire;");
    expect(out).toContain("part w : P::Tire;");
    expect(out).toContain("part x : P::Tire;");
    expect(out).toContain("part y : Q::Wheel;");
    expect(out).toContain("part z : Wheel; }");
    expect(out).toContain("package Q { part def Wheel;");
    const out2 = apply(ix, planRename(ix, el(ix, "P::Car::wheel"), "tire"));
    expect(out2).toContain("part tire : Wheel;");
    expect(out2).toContain("connect c.tire to w;");
    const out3 = apply(ix, planRename(ix, el(ix, "P"), "R"));
    expect(out3).toContain("part w : R::Wheel;");
    expect(out3).toContain("part x : R::Wheel;");
    expect(out3).toContain("part y : Q::Wheel;");
  });

  it("renames a name that needs quotes", () => {
    const ix = one("package P {\n    part def Engine;\n    part e : Engine;\n}\n");
    expect(apply(ix, planRename(ix, el(ix, "P::Engine"), "fuel pump"))).toBe("package P {\n    part def 'fuel pump';\n    part e : 'fuel pump';\n}\n");
    expect(apply(ix, planRename(ix, el(ix, "P::Engine"), "end"))).toContain("part e : 'end';");
    const ix2 = one("package P {\n    part def 'a b';\n    part e : 'a b';\n}\n");
    expect(apply(ix2, planRename(ix2, el(ix2, "P::'a b'"), "ab"))).toBe("package P {\n    part def ab;\n    part e : ab;\n}\n");
  });

  it("refuses a name that collides with a sibling or hides a visible element", () => {
    const ix = one("package P {\n    part def Engine;\n    part def Motor;\n    package Q { part def T; part x : T; }\n}\n");
    const r = planRename(ix, el(ix, "P::Engine"), "Motor");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already has a member/);
    expect(planRename(ix, el(ix, "P::Engine"), "Engine").ok).toBe(false);
    expect(planRename(ix, el(ix, "P::Engine"), "").ok).toBe(false);
    // The conservative "new name is visible where the old one was used" refusal is gone: renaming Q::T
    // to Motor shadows P::Motor in Q, but nothing there referred to P::Motor, so it is fine ...
    expect(planRename(ix, el(ix, "P::Q::T"), "Motor").ok).toBe(true);
    expect(planRename(ix, el(ix, "P::Q::T"), "Other").ok).toBe(true);
    // ... and it is refused as soon as something in Q does refer to P::Motor (the semantic check).
    const ix2 = one("package P {\n    part def Motor;\n    package Q { part def T; part x : T; part z : Motor; }\n}\n");
    const r2 = planRename(ix2, el(ix2, "P::Q::T"), "Motor");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/'Motor' at a\.sysml:3 would resolve to P::Q::Motor instead of P::Motor/);
  });

  it("keeps references through the short name valid", () => {
    const ix = one("package P {\n    part def <E> Engine;\n    part a : E;\n    part b : Engine;\n}\n");
    expect(apply(ix, planRename(ix, el(ix, "P::Engine"), "Motor"))).toBe("package P {\n    part def <E> Motor;\n    part a : E;\n    part b : Motor;\n}\n");
  });

  it("renames an element under an unnamed owner (no qualified name)", () => {
    const src = "package P {\n    part def T;\n    part {\n        part inner : T;\n        part def Local;\n        part l : Local;\n    }\n}\n";
    const ix = one(src);
    const inner = el(ix, "P").members[1]!.members[0]!;
    expect(inner.name).toBe("inner");
    expect(inner.qualifiedName).toBeUndefined();
    const p = planRename(ix, inner, "core");
    expectOk(p);
    expect(apply(ix, p)).toContain("part core : T;");
    // and a reference to a definition declared under it
    const local = el(ix, "P").members[1]!.members[1]!;
    expect(local.qualifiedName).toBeUndefined();
    const p2 = planRename(ix, local, "Loc");
    expectOk(p2);
    expect(apply(ix, p2)).toContain("part def Loc;");
    expect(apply(ix, p2)).toContain("part l : Loc;");
  });

  it("reports references it cannot judge", () => {
    const src = `package P {
    part def Engine { attribute mass; }
    part e : Engine { attribute :>> mass = 5; }
    constraint c { mass > 2 }
    part def Other { attribute mass; }
    part def Gen { attribute :>> mass; }
}
`;
    const ix = one(src);
    const p = planRename(ix, el(ix, "P::Engine::mass"), "weight");
    expectOk(p);
    const out = apply(ix, p);
    // the redefinition inside a usage typed by Engine is judged through the declared type
    expect(out).toContain("attribute :>> weight = 5;");
    // Gen has no relation to Engine, Other::mass is another element
    expect(out).toContain("part def Other { attribute mass; }");
    expect(out).toContain("part def Gen { attribute :>> mass; }");
    // the expression reference cannot be judged
    expect(p.unjudged?.count).toBeGreaterThanOrEqual(1);
    expect(p.unjudged?.locations.some((l) => l.line === 3)).toBe(true);
  });

  it("does not examine documents with syntax errors, and says so", () => {
    const ix = ws({ [A]: "package P { part def Engine; }", [B]: "package Q { part x : P::Engine; part y : ; }" });
    const p = planRename(ix, el(ix, "P::Engine"), "Motor");
    expectOk(p);
    expect(p.unjudged?.skippedDocuments).toEqual([B]);
  });

  it("Rename from tree: two diagrams keep their nodes and positions", () => {
    const src = "package Vehicles {\n    part def Engine { part cyl; }\n    part def Car { part engine : Engine; connect engine to engine; }\n}\n";
    const ix = one(src);
    const mk = (uri: string): { uri: string; doc: DiagramDocument } => {
      let doc = createDiagram(ix, "Vehicles", "general");
      for (const qn of ["Vehicles::Engine", "Vehicles::Engine::cyl", "Vehicles::Car"]) doc = addElement(doc, ix, el(ix, qn)).doc;
      doc = { ...doc, nodes: doc.nodes.map((n, i) => ({ ...n, x: 10 * i + 0.5, y: 20 * i })) };
      return { uri, doc };
    };
    const d1 = mk("file:///ws/one.sysmld");
    const d2 = mk("file:///ws/two.sysmld");
    const p = planRename(ix, el(ix, "Vehicles::Engine"), "Motor", { diagrams: [d1, d2] });
    expectOk(p);
    expect(p.diagramUpdates?.map((u) => u.uri).sort()).toEqual([d1.uri, d2.uri]);
    for (const u of p.diagramUpdates!) {
      const parsed = parseDiagram(u.text);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const refs = parsed.doc.nodes.map((n) => n.ref);
      expect(refs).toContain("Vehicles::Motor");
      expect(refs).toContain("Vehicles::Motor::cyl");
      expect(refs).toContain("Vehicles::Car");
      expect(refs.some((r) => r?.includes("Engine"))).toBe(false);
      expect(parsed.doc.nodes.map((n) => [n.x, n.y])).toEqual(d1.doc.nodes.map((n) => [n.x, n.y]));
      expect(parsed.doc.nodes.length).toBe(d1.doc.nodes.length);
      expect(u.text).toBe(serializeDiagram(parsed.doc)); // canonical
    }
    // after the edit the diagram refs resolve in the new model
    const ix2 = one(apply(ix, p));
    for (const q of ["Vehicles::Motor", "Vehicles::Motor::cyl"]) expect(ix2.findByQualifiedName(q)).toHaveLength(1);
  });

  it("rewrites diagram roots, locator owners and locator ends", () => {
    const src = "package Vehicles {\n    part def Engine;\n    part def Car { part engine : Engine; part wheel; connect engine to wheel; }\n}\n";
    const ix = one(src);
    const doc: DiagramDocument = {
      version: 1, kind: "general", root: "Vehicles::Car", sources: [],
      nodes: [{ id: "n1", ref: "Vehicles::Car::engine" }],
      edges: [{ id: "e1", source: "n1", target: "n1", locator: { owner: "Vehicles::Car", kind: "connect", ends: ["engine", "wheel"] } }],
    };
    const p = planRename(ix, el(ix, "Vehicles::Car"), "Auto", { diagrams: [{ uri: "file:///ws/d.sysmld", doc }] });
    expectOk(p);
    const d = (parseDiagram(p.diagramUpdates![0]!.text) as { ok: true; doc: DiagramDocument }).doc;
    expect(d.root).toBe("Vehicles::Auto");
    expect(d.nodes[0]!.ref).toBe("Vehicles::Auto::engine");
    expect(d.edges[0]!.locator!.owner).toBe("Vehicles::Auto");
    const p2 = planRename(ix, el(ix, "Vehicles::Car::engine"), "motor", { diagrams: [{ uri: "file:///ws/d.sysmld", doc }] });
    expectOk(p2);
    const d2 = (parseDiagram(p2.diagramUpdates![0]!.text) as { ok: true; doc: DiagramDocument }).doc;
    expect(d2.edges[0]!.locator!.ends).toEqual(["motor", "wheel"]);
    expect(d2.nodes[0]!.ref).toBe("Vehicles::Car::motor");
  });
});

describe("set type, multiplicity, short name, documentation", () => {
  it("Change type", () => {
    const src = "package P {\n    part def Engine;\n    part def Motor;\n    part engine : Engine[0..1] :> base;\n    part bare;\n    part base;\n}\n";
    const ix = one(src);
    expect(apply(ix, planSetType(ix, el(ix, "P::engine"), el(ix, "P::Motor")))).toBe(src.replace("engine : Engine[0..1]", "engine : Motor[0..1]"));
    expect(apply(ix, planSetType(ix, el(ix, "P::engine"), undefined))).toBe(src.replace(" : Engine[0..1] :> base", "[0..1] :> base").replace("engine[0..1]", "engine[0..1]"));
    expect(apply(ix, planSetType(ix, el(ix, "P::bare"), el(ix, "P::Motor")))).toBe(src.replace("part bare;", "part bare : Motor;"));
    expect(planSetType(ix, el(ix, "P::Engine"), el(ix, "P::Motor")).ok).toBe(false); // a definition has no type
    expect(planSetType(ix, el(ix, "P::bare"), undefined).ok).toBe(false);
  });

  it("Change type adds an import or a qualified name through the reference writer", () => {
    const ix = ws({
      [A]: "package Powertrain {\n    part def Engine;\n}\n",
      [B]: "package Car {\n    part def Body;\n    part e;\n}\n",
    });
    const p = planSetType(ix, el(ix, "Car::e"), el(ix, "Powertrain::Engine"));
    expectOk(p);
    expect(texts(ix, p)[B]).toBe("package Car {\n    private import Powertrain::Engine;\n    part def Body;\n    part e : Engine;\n}\n");
  });

  it("sets, replaces and removes multiplicity", () => {
    const src = "package P {\n    part def T;\n    part a : T;\n    part b : T[1..*] = 3;\n    part c;\n}\n";
    const ix = one(src);
    expect(apply(ix, planSetMultiplicity(ix, el(ix, "P::a"), "0..1"))).toContain("part a : T[0..1];");
    expect(apply(ix, planSetMultiplicity(ix, el(ix, "P::b"), "[2]"))).toContain("part b : T[2] = 3;");
    expect(apply(ix, planSetMultiplicity(ix, el(ix, "P::b"), undefined))).toContain("part b : T = 3;");
    expect(apply(ix, planSetMultiplicity(ix, el(ix, "P::c"), "*"))).toContain("part c[*];");
    expect(planSetMultiplicity(ix, el(ix, "P::a"), "[x").ok).toBe(false);
  });

  it("sets, replaces and removes a short name", () => {
    const src = "package P {\n    part a;\n    part <x> b;\n}\n";
    const ix = one(src);
    expect(apply(ix, planSetShortName(ix, el(ix, "P::a"), "s1"))).toContain("part <s1> a;");
    expect(apply(ix, planSetShortName(ix, el(ix, "P::b"), "y"))).toContain("part <y> b;");
    expect(apply(ix, planSetShortName(ix, el(ix, "P::b"), undefined))).toBe("package P {\n    part a;\n    part b;\n}\n");
    expect(planSetShortName(ix, el(ix, "P::a"), "x").ok).toBe(false); // collides with <x>
  });

  it("creates, replaces and removes documentation, keeping the style", () => {
    const src = "package P {\n    part def A;\n    part def B {\n        doc /* old */\n        part x;\n    }\n    part def C {\n        /* c */\n        doc /*\n         * first\n         * second\n         */\n    }\n}\n";
    const ix = one(src);
    expect(apply(ix, planSetDocumentation(ix, el(ix, "P::A"), "About A."))).toContain("part def A {\n        doc /* About A. */\n    }");
    expect(apply(ix, planSetDocumentation(ix, el(ix, "P::B"), "New."))).toContain("doc /* New. */\n        part x;");
    expect(apply(ix, planSetDocumentation(ix, el(ix, "P::B"), undefined))).toContain("part def B {\n        part x;\n    }");
    const multi = apply(ix, planSetDocumentation(ix, el(ix, "P::C"), "one\ntwo\nthree"));
    expect(multi).toContain("doc /*\n         * one\n         * two\n         * three\n         */");
    const created = apply(ix, planSetDocumentation(ix, el(ix, "P::A"), "line1\nline2"));
    expect(created).toContain("part def A {\n        doc /*\n         * line1\n         * line2\n         */\n    }");
    expect(errorsOf(A, created)).toEqual([]);
    expect(el(one(created), "P::A").documentation).toBe("line1\nline2");
    const r = planSetDocumentation(ix, el(ix, "P::A"), "bad */ text");
    expect(r.ok).toBe(false);
    expect(planSetDocumentation(ix, el(ix, "P::A"), undefined).ok).toBe(false);
  });
});

describe("reference writer", () => {
  it("Already visible", () => {
    const ix = one("package P {\n    part def Engine;\n    part def Car;\n}\n");
    const w = writeReference(ix, el(ix, "P::Engine"), el(ix, "P::Car"));
    expect(w).toMatchObject({ ok: true, text: "Engine", edits: [] });
    const p = planInsertMember(ix, el(ix, "P::Car"), { kind: "part", name: "engine", type: el(ix, "P::Engine") });
    expectOk(p);
    expect(apply(ix, p)).toContain("part engine : Engine;");
    expect(apply(ix, p)).not.toContain("import");
  });

  it("Import added", () => {
    const ix = ws({ [A]: "package Powertrain {\n    part def Engine;\n}\n", [B]: "package Car {\n    part def Body;\n}\n" });
    const w = writeReference(ix, el(ix, "Powertrain::Engine"), el(ix, "Car"));
    expect(w).toMatchObject({ ok: true, text: "Engine", importText: "private import Powertrain::Engine;" });
    const p = planInsertMember(ix, el(ix, "Car"), { kind: "part", name: "engine", type: el(ix, "Powertrain::Engine") });
    expectOk(p);
    expect(texts(ix, p)[B]).toBe("package Car {\n    private import Powertrain::Engine;\n    part def Body;\n    part engine : Engine;\n}\n");
  });

  it("puts the import after the existing imports, or as first member when there are none", () => {
    const ix = ws({
      [A]: "package Powertrain {\n    part def Engine;\n}\n",
      [B]: "package Car {\n    private import ScalarValues::*;\n    private import Other::X;\n    part def Body;\n    part e;\n}\n",
    });
    const p = planSetType(ix, el(ix, "Car::e"), el(ix, "Powertrain::Engine"));
    expectOk(p);
    expect(texts(ix, p)[B]).toBe("package Car {\n    private import ScalarValues::*;\n    private import Other::X;\n    private import Powertrain::Engine;\n    part def Body;\n    part e : Engine;\n}\n");
    // an empty package gets the import and the member together
    const ix2 = ws({ [A]: "package Powertrain {\n    part def Engine;\n}\n", [B]: "package Car {\n}\n" });
    const p2 = planInsertMember(ix2, el(ix2, "Car"), { kind: "part", name: "engine", type: el(ix2, "Powertrain::Engine") });
    expectOk(p2);
    expect(texts(ix2, p2)[B]).toBe("package Car {\n    private import Powertrain::Engine;\n    part engine : Engine;\n}\n");
    // a package with only a body-less declaration
    const ix3 = ws({ [A]: "package Powertrain {\n    part def Engine;\n}\n", [B]: "package Car;" });
    const p3 = planInsertMember(ix3, el(ix3, "Car"), { kind: "part", name: "engine", type: el(ix3, "Powertrain::Engine") });
    expectOk(p3);
    expect(texts(ix3, p3)[B]).toBe("package Car {\n    private import Powertrain::Engine;\n    part engine : Engine;\n}");
  });

  it("Import would clash", () => {
    const ix = ws({ [A]: "package Powertrain {\n    part def Engine;\n}\n", [B]: "package Car {\n    part def Engine;\n}\n" });
    const w = writeReference(ix, el(ix, "Powertrain::Engine"), el(ix, "Car"));
    expect(w).toMatchObject({ ok: true, text: "Powertrain::Engine", edits: [] });
    const p = planInsertMember(ix, el(ix, "Car"), { kind: "part", name: "engine", type: el(ix, "Powertrain::Engine") });
    expectOk(p);
    expect(texts(ix, p)[B]).toBe("package Car {\n    part def Engine;\n    part engine : Powertrain::Engine;\n}\n");
  });

  it("clashes with a name imported by a wildcard too", () => {
    const ix = ws({
      [A]: "package Powertrain {\n    part def Engine;\n}\n",
      [B]: "package Lib {\n    part def Engine;\n}\npackage Car {\n    private import Lib::*;\n}\n",
    });
    expect(writeReference(ix, el(ix, "Powertrain::Engine"), el(ix, "Car"))).toMatchObject({ ok: true, text: "Powertrain::Engine", edits: [] });
  });

  it("Name needs quoting: names and imports", () => {
    const ix = ws({ [A]: "package Powertrain {\n    part def 'fuel pump';\n    part def 'end';\n}\n", [B]: "package Car {\n}\n" });
    const w = writeReference(ix, el(ix, "Powertrain::'fuel pump'"), el(ix, "Car"));
    expect(w).toMatchObject({ ok: true, text: "'fuel pump'", importText: "private import Powertrain::'fuel pump';" });
    expect(writeReference(ix, el(ix, "Powertrain::'end'"), el(ix, "Car"))).toMatchObject({ ok: true, text: "'end'" });
  });

  it("refuses to refer to an element inside an unnamed owner", () => {
    const ix = one("package P {\n    part {\n        part inner;\n    }\n    part q;\n}\n");
    const inner = el(ix, "P").members[0]!.members[0]!;
    const w = writeReference(ix, inner, el(ix, "P::q"));
    expect(w.ok).toBe(false);
  });
});

describe("connect and satisfy", () => {
  it("connect writes feature chains relative to the owner and the result resolves", () => {
    const src = "package P {\n    part def Engine { port drive; }\n    part def Gear { port input; }\n    part def Car {\n        part engine : Engine;\n        part gear : Gear;\n    }\n}\n";
    const ix = one(src);
    const car = el(ix, "P::Car");
    // ends are inherited ports through the part types; give the plan the usages' chains as text
    const p = planConnect(ix, car, "engine.drive", "gear.input");
    expectOk(p);
    const out = apply(ix, p);
    expect(out).toContain("        part gear : Gear;\n        connect engine.drive to gear.input;\n");
    expect(errorsOf(A, out)).toEqual([]);
    const c = el(one(out), "P::Car").members.find((m) => m.kind === "connect")!;
    expect(c.ends).toEqual(["engine.drive", "gear.input"]);
    // elements: nested features are written as chains from the owner
    const src2 = "package P {\n    part a { port x; }\n    part b { port y; }\n}\n";
    const ix2 = one(src2);
    const p2 = planConnect(ix2, el(ix2, "P"), el(ix2, "P::a::x"), el(ix2, "P::b::y"));
    expectOk(p2);
    expect(apply(ix2, p2)).toContain("    connect a.x to b.y;\n}");
    const ix3 = one(apply(ix2, p2));
    const conn = el(ix3, "P").members.find((m) => m.kind === "connect")!;
    expect(ix3.resolve(conn.ends[0]!, el(ix3, "P"))).toBe(el(ix3, "P::a::x"));
    expect(ix3.resolve(conn.ends[1]!, el(ix3, "P"))).toBe(el(ix3, "P::b::y"));
  });

  it("satisfy defaults to the package owning the satisfying element", () => {
    const ix = ws({
      [A]: "package Reqs {\n    requirement def R1;\n}\n",
      [B]: "package Design {\n    part def Car {\n        part engine;\n    }\n}\n",
    });
    const p = planSatisfy(ix, el(ix, "Reqs::R1"), el(ix, "Design::Car::engine"));
    expectOk(p);
    expect(texts(ix, p)[B]).toBe("package Design {\n    private import Reqs::R1;\n    part def Car {\n        part engine;\n    }\n    satisfy R1 by Car.engine;\n}\n");
    expect(planSatisfy(ix, el(ix, "Design::Car"), el(ix, "Design::Car::engine")).ok).toBe(false);
    const p2 = planSatisfy(ix, el(ix, "Reqs::R1"), el(ix, "Design::Car::engine"), el(ix, "Design::Car"));
    expectOk(p2);
    expect(texts(ix, p2)[B]).toContain("        satisfy R1 by engine;");
  });
});

describe("refusals", () => {
  const BAD = "package P {\n    part def A {\n        part x : ;\n    \n}\n";
  it("Edit blocked: a file with a syntax error is refused with a location, nothing is changed", () => {
    const ix = ws({ [A]: BAD, [B]: "package Q { part def T; }" });
    expect(ix.getDocument(A)!.errors.length).toBeGreaterThan(0);
    const owner = ix.getDocument(A)!.model.roots[0]; // never parsed cleanly: no model
    expect(owner).toBeUndefined();
    // a file that parsed once and now has an error
    const ix2 = one("package P { part def A; }");
    const a = el(ix2, "P::A");
    ix2.setDocument(A, "package P { part def A; part y : ; }");
    for (const r of [planInsertMember(ix2, a, "part x;"), planDeleteElement(ix2, a), planRename(ix2, a, "B"), planSetType(ix2, a, "X"), planSetDocumentation(ix2, a, "d")]) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toMatch(/syntax error/);
        expect(r.reason).toMatch(/a\.sysml:1:/);
        expect(r.reason).toContain(`${A}#L1,`);
      }
    }
    expect(ix2.getDocument(A)!.stale).toBe(true);
  });

  it("Valid file with undisplayed constructs: edits are applied", () => {
    const src = `package P {
    part def Car;
    state def Machine {
        entry action start;
        state idle;
        state running;
        transition first idle then running;
    }
    calc def Sum { in x : Real; in y : Real; return z : Real = x + y; }
    action def Go { first start; then done; }
}
`;
    const ix = one(src);
    expect(ix.getDocument(A)!.errors).toEqual([]);
    const p = planInsertMember(ix, el(ix, "P"), { kind: "part", name: "c1", type: el(ix, "P::Car") });
    expectOk(p);
    expect(apply(ix, p)).toBe(src.replace(/\}\n$/, "    part c1 : Car;\n}\n"));
    expect(errorsOf(A, apply(ix, p))).toEqual([]);
  });

  it("refuses read-only library content, unknown documents and stale elements", () => {
    const ix = new ModelIndex();
    ix.setDocument("sysml-library:/Base.sysml", "package Lib { part def X; }");
    ix.setDocument(A, "package P { part def A; }");
    expect(planInsertMember(ix, el(ix, "Lib"), "part y;")).toMatchObject({ ok: false });
    expect(planDeleteElement(ix, el(ix, "Lib::X"))).toMatchObject({ ok: false });
    const old = el(ix, "P::A");
    ix.setDocument(A, "package P { part def A; part def B; }");
    expect(planRename(ix, old, "C")).toMatchObject({ ok: false, reason: expect.stringMatching(/out of date/) });
    const lib = planRename(ix, el(ix, "Lib::X"), "Y");
    expect(lib.ok).toBe(false);
    if (!lib.ok) expect(lib.reason).toMatch(/read-only/);
  });

  it("refuses while details are pending", () => {
    const pending: DetailsProvider = { request: () => new Promise(() => undefined) };
    const ix = new ModelIndex(undefined, { details: pending });
    ix.setDocument(A, "package P { part def A; }");
    const a = el(ix, "P::A");
    ix.setDocument(A, "package P { part def A; part y : ; ");
    expect(ix.getDocument(A)!.detailsPending).toBe(true);
    const r = planInsertMember(ix, a, "part x;");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/still being checked/);
  });
});
