import { describe, expect, it } from "vitest";
import { antlrDocumentParser } from "./antlr-parser.js";
import { processDocComment, quoteName, splitQualified, unquoteName } from "./names.js";
import type { Element } from "./types.js";

function model(text: string) {
  const r = antlrDocumentParser("file:///t.sysml", text);
  expect(r.errors).toEqual([]);
  return r.model;
}
function walk(roots: readonly Element[], f: (e: Element) => void): void {
  for (const r of roots) {
    f(r);
    walk(r.members, f);
  }
}
function find(roots: readonly Element[], qn: string): Element {
  let out: Element | undefined;
  walk(roots, (e) => {
    if (e.qualifiedName === qn && !out) out = e;
  });
  if (!out) throw new Error("not found: " + qn);
  return out;
}
const slice = (text: string, r: { start: { offset: number }; end: { offset: number } }) =>
  text.slice(r.start.offset, r.end.offset);

describe("packages and nesting", () => {
  const text = "package A {\n  package B {\n    part def C;\n  }\n  part x;\n}\n";
  const m = model(text);
  it("nests members in source order with qualified names and owners", () => {
    const a = m.roots[0]!;
    expect(a.kind).toBe("package");
    expect(a.members.map((e) => e.qualifiedName)).toEqual(["A::B", "A::x"]);
    const c = find(m.roots, "A::B::C");
    expect(c.owner?.qualifiedName).toBe("A::B");
    expect(c.kind).toBe("part def");
    expect(c.isDefinition).toBe(true);
    expect(c.isUsage).toBe(false);
    expect(find(m.roots, "A::x").isUsage).toBe(true);
  });
  it("has 0-based line/column ranges for the declaration, name and body", () => {
    const b = find(m.roots, "A::B");
    expect(b.range.start).toEqual({ offset: 14, line: 1, column: 2 });
    expect(b.range.end.line).toBe(3);
    expect(slice(text, b.nameRange!)).toBe("B");
    expect(b.nameRange!.start).toEqual({ offset: 22, line: 1, column: 10 });
    expect(slice(text, b.bodyRange!).startsWith("{")).toBe(true);
    expect(slice(text, b.bodyRange!).endsWith("}")).toBe(true);
    expect(find(m.roots, "A::B::C").bodyRange).toBeUndefined();
  });
  it("handles several root elements and CRLF text", () => {
    const t = "package A;\r\npackage B;\r\n";
    const mm = model(t);
    expect(mm.roots.map((e) => e.name)).toEqual(["A", "B"]);
    expect(mm.roots[1]!.range.start.line).toBe(1);
    expect(mm.roots[1]!.range.start.column).toBe(0);
  });
  it("computes offsets in UTF-16 units with astral characters", () => {
    const t = "// \u{1F600}\npackage P;";
    const p = model(t).roots[0]!;
    expect(slice(t, p.nameRange!)).toBe("P");
  });
});

describe("definitions and usages", () => {
  const m = model(`package P {
    part def Vehicle :> Base, Other { attribute mass : Real [1..*]; }
    part car : Vehicle [2] :> fleet :>> base::x ::> rr;
    port def Pd; port p : ~Pd;
    action def Go; action go : Go;
    state s; requirement def R; requirement r : R;
    connection def Cd; interface def Id; flow def Fd; view def Vd; metadata def Md;
    use case def U; analysis def An; enum def E { a; b; }
    abstract part def Abs;
  }`);
  it("derives kinds from keywords", () => {
    const kinds = Object.fromEntries(
      m.roots[0]!.members.map((e) => [e.name, e.kind] as const),
    );
    expect(kinds).toMatchObject({
      Vehicle: "part def", car: "part", Pd: "port def", p: "port", Go: "action def", go: "action",
      s: "state", R: "requirement def", r: "requirement", Cd: "connection def", Id: "interface def",
      Fd: "flow def", Vd: "view def", Md: "metadata def", U: "use case def", An: "analysis def",
      E: "enum def", Abs: "part def",
    });
  });
  it("records specialization, typing, subsetting, redefinition and multiplicity as written", () => {
    const v = find(m.roots, "P::Vehicle");
    expect(v.specializes).toEqual(["Base", "Other"]);
    expect(find(m.roots, "P::Vehicle::mass").types).toEqual(["Real"]);
    expect(find(m.roots, "P::Vehicle::mass").multiplicity).toBe("[1..*]");
    const car = find(m.roots, "P::car");
    expect(car.types).toEqual(["Vehicle"]);
    expect(car.multiplicity).toBe("[2]");
    expect(car.subsets).toEqual(["fleet"]);
    expect(car.redefines).toEqual(["base::x"]);
    expect(car.references).toEqual(["rr"]);
    expect(find(m.roots, "P::p").types).toEqual(["~Pd"]);
  });
  it("keeps enumeration values as members", () => {
    expect(find(m.roots, "P::E").members.map((e) => e.name)).toEqual(["a", "b"]);
  });
  it("records visibility", () => {
    const mm = model("package P { private part def A; public part def B; part def C; }");
    expect(mm.roots[0]!.members.map((e) => e.visibility)).toEqual(["private", "public", undefined]);
  });
});

describe("short names and quoted names", () => {
  it("reads <short> names", () => {
    const m = model("package P { part def <v1> Vehicle; part <p2> wheel; part def <only>; }");
    const [v, w, o] = m.roots[0]!.members;
    expect([v!.name, v!.shortName, v!.qualifiedName]).toEqual(["Vehicle", "v1", "P::Vehicle"]);
    expect([w!.name, w!.shortName]).toEqual(["wheel", "p2"]);
    expect([o!.name, o!.shortName, o!.qualifiedName]).toEqual([undefined, "only", undefined]);
  });
  it("unquotes names and re-quotes qualified-name segments that need it", () => {
    const text = "package 'My Pkg' { part def 'Wheel Assembly'; part ok; }";
    const m = model(text);
    const w = m.roots[0]!.members[0]!;
    expect(w.name).toBe("Wheel Assembly");
    expect(w.qualifiedName).toBe("'My Pkg'::'Wheel Assembly'");
    expect(m.roots[0]!.members[1]!.qualifiedName).toBe("'My Pkg'::ok");
    expect(slice(text, w.nameRange!)).toBe("'Wheel Assembly'");
  });
  it("name helpers", () => {
    expect(unquoteName("'a\\'b'")).toBe("a'b");
    expect(quoteName("a b")).toBe("'a b'");
    expect(quoteName("ab_1")).toBe("ab_1");
    expect(splitQualified("A::'b c'::d.e")).toEqual(["A", "b c", "d", "e"]);
  });
});

describe("documentation", () => {
  it("attaches processed doc text to the owner", () => {
    const m = model("package P { part def A {\n doc /* First line\n * second line\n */\n part x; } }");
    const a = find(m.roots, "P::A");
    expect(a.documentation).toBe("First line\nsecond line");
    expect(a.members.map((e) => e.kind)).toEqual(["doc", "part"]);
  });
  it("processes block comments", () => {
    expect(processDocComment("/* one */")).toBe("one");
    expect(processDocComment("/*\n * a\n *  b\n */")).toBe("a\n b");
  });
  it("represents plain comments as elements", () => {
    const m = model("package P { comment C /* note */ part x; }");
    const c = m.roots[0]!.members[0]!;
    expect([c.kind, c.name, c.documentation]).toEqual(["comment", "C", "note"]);
    expect(c.qualifiedName).toBe("P::C");
  });
});

describe("imports and aliases", () => {
  const m = model(`package P {
    private import A::B;
    public import A::*;
  }
  package Q { private import X::**; alias <s> Short for A::B::C; }`);
  it("records import forms", () => {
    const [i1, i2] = m.roots[0]!.members;
    expect(i1!.kind).toBe("import");
    expect(i1!.importInfo).toEqual({ target: "A::B", wildcard: false, recursive: false });
    expect(i2!.importInfo).toEqual({ target: "A", wildcard: true, recursive: false });
    expect(i2!.visibility).toBe("public");
    expect(m.roots[1]!.members[0]!.importInfo).toEqual({ target: "X", wildcard: false, recursive: true });
  });
  it("records aliases", () => {
    const a = m.roots[1]!.members[1]!;
    expect([a.kind, a.name, a.shortName, a.aliasFor, a.qualifiedName]).toEqual(["alias", "Short", "s", "A::B::C", "Q::Short"]);
  });
});

describe("relationship statements", () => {
  const m = model(`package P {
    part def A { port a; port b; }
    part sys : A {
      part x; part y;
      connect x.a to y.b;
      bind x.a = y.b;
      first x then y;
      satisfy R by sys;
    }
    action act { action s1; action s2; first s1; then s2; }
    state st { transition t1 first s1 accept Sig then s2; }
    requirement def R { verify V; require constraint c { true } }
  }`);
  const sys = find(m.roots, "P::sys");
  it("records kind and endpoints of unnamed statements", () => {
    const by = (k: string) => sys.members.filter((e) => e.kind === k);
    expect(by("connect")[0]!.ends).toEqual(["x.a", "y.b"]);
    expect(by("bind")[0]!.ends).toEqual(["x.a", "y.b"]);
    expect(by("succession")[0]!.ends).toEqual(["x", "y"]);
    expect(by("satisfy")[0]!.ends).toEqual(["R", "sys"]);
    const r = find(m.roots, "P::R");
    expect(r.members.map((e) => e.kind)).toEqual(["verify", "require constraint"]);
    expect(r.members[0]!.ends).toEqual(["V"]);
    expect(r.members[1]!.name).toBe("c");
  });
  it("gives unnamed statements no name or qualified name", () => {
    const c = sys.members.find((e) => e.kind === "connect")!;
    expect(c.name).toBeUndefined();
    expect(c.qualifiedName).toBeUndefined();
    expect(c.owner).toBe(sys);
  });
  it("records transitions and action-level successions", () => {
    const t = find(m.roots, "P::st::t1");
    expect(t.kind).toBe("transition");
    expect(t.ends).toEqual(["s1", "s2"]);
    const act = find(m.roots, "P::act");
    expect(act.members.map((e) => e.kind)).toEqual(["action", "action", "first", "succession"]);
    expect(act.members[3]!.ends).toEqual(["s2"]);
  });
  it("reaches members of unnamed owners through the owner chain", () => {
    const mm = model("package P { part { part inner; } }");
    const inner = mm.roots[0]!.members[0]!.members[0]!;
    expect(inner.owner!.name).toBeUndefined();
    expect(inner.owner!.owner!.name).toBe("P");
    expect(inner.qualifiedName).toBeUndefined();
  });
});

describe("robustness", () => {
  it("never throws on odd or broken input", () => {
    const inputs = [
      "", ";;;", "package", "package P {", "part def ;", "}}}", "package P { part x : ; }",
      "\u0000\u0001", "'unterminated", "/* never closed", "package P { connect a to ; }",
    ];
    for (const t of inputs) expect(() => antlrDocumentParser("file:///x", t)).not.toThrow();
  });
  it("keeps KerML-only constructs as elements, not crashes", () => {
    const m = model("dependency D from a to b { specialization S subtype A :> B; feature f; classifier K; }");
    const d = m.roots[0]!;
    expect([d.kind, d.name, d.ends]).toEqual(["dependency", "D", ["a", "b"]]);
    const kinds = d.members.map((e) => e.kind);
    expect(kinds[0]).toBe("unknown"); // `specialization ...` has no element rule here
    expect(kinds).toContain("classifier");
    expect(d.members[0]!.range.start.offset).toBeGreaterThan(0);
  });
});
