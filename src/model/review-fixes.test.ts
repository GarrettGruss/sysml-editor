import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../parser/parse.js";
import { antlrDocumentParser } from "./antlr-parser.js";
import { ModelIndex } from "./index.js";
import { SYSML_KEYWORDS } from "./keywords.js";
import { loadLibrary } from "./library.js";
import { quoteName } from "./names.js";
import type { Element } from "./types.js";

function el(ix: ModelIndex, qn: string): Element {
  const r = ix.findByQualifiedName(qn)[0];
  if (!r) throw new Error("missing " + qn);
  return r;
}
function timed<T>(f: () => T): [T, number] {
  const t = performance.now();
  const r = f();
  return [r, performance.now() - t];
}

describe("resolver performance with many sibling imports", () => {
  it("resolves in bounded time with 14 sibling imports", () => {
    const N = 14;
    let text = "";
    for (let i = 1; i <= N; i++) text += `package L${i} { part def D${i}; }\n`;
    text += "package P {\n";
    for (let i = 1; i <= N; i++) text += `  private import L${i}::*;\n`;
    text += "  part def Own;\n}\n";
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", text);
    const from = el(ix, "P::Own");
    const [miss, t1] = timed(() => ix.resolve("Missing", from));
    const [hit, t2] = timed(() => ix.resolve(`D${N}`, from));
    console.log(`14 imports: missing ${t1.toFixed(2)} ms, last import ${t2.toFixed(2)} ms`);
    expect(miss).toBeUndefined();
    expect(hit).toBe(el(ix, `L${N}::D${N}`));
    expect(t1).toBeLessThan(50);
    expect(t2).toBeLessThan(50);
  });

  const libDir = resolve(__dirname, "../../fixtures/sysml-v2-release/sysml.library");
  it.skipIf(!existsSync(libDir))("resolves a missing name quickly with the real library", () => {
    const ix = new ModelIndex();
    loadLibrary(ix, libDir);
    const libs: string[] = [];
    for (const u of ix.uris()) for (const r of ix.getDocument(u)!.model.roots) if (r.name) libs.push(r.name);
    const importsOf = (e: Element) => e.members.filter((m) => m.kind === "import").length;
    let best: Element | undefined;
    for (const u of ix.uris())
      for (const r of ix.getDocument(u)!.model.roots) if (!best || importsOf(r) > importsOf(best)) best = r;
    expect(best).toBeDefined();
    const [, tLib] = timed(() => ix.resolve("NoSuchNameAnywhere", best!));
    console.log(`library package ${best!.name} (${importsOf(best!)} imports): ${tLib.toFixed(2)} ms`);
    expect(tLib).toBeLessThan(100);

    const names = ["ScalarValues", "ISQ", "SI", "Quantities", "MeasurementReferences", "Time", "Collections",
      "Objects", "Occurrences", "Items", "Parts", "Actions"].filter((n) => libs.includes(n)).slice(0, 12);
    const user = `package U {\n${names.map((n) => `  private import ${n}::*;\n`).join("")}  part def Own;\n}`;
    ix.setDocument("file:///u.sysml", user);
    const [, tUser] = timed(() => ix.resolve("NoSuchNameAnywhere", el(ix, "U::Own")));
    console.log(`user package with ${names.length} library imports: ${tUser.toFixed(2)} ms`);
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(tUser).toBeLessThan(100);
  });
});

describe("resolveAll", () => {
  it("returns every candidate in priority order and resolve returns the first", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package A { part def X; } package B { part def X; }
      package P { private import A::*; private import B::*; part def Own; }`);
    const all = ix.resolveAll("X", el(ix, "P::Own"));
    expect(all).toEqual([el(ix, "A::X"), el(ix, "B::X")]);
    expect(ix.resolve("X", el(ix, "P::Own"))).toBe(all[0]);
  });
});

describe("qualified names under unnamed owners", () => {
  it("leaves qualifiedName undefined below an unnamed owner", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package P { part def Real; part { part inner; } }`);
    const doc = ix.getDocument("file:///a.sysml")!.model;
    const walk = (e: Element, f: (e: Element) => void) => (f(e), e.members.forEach((m) => walk(m, f)));
    const inner: Element[] = [];
    for (const r of doc.roots) walk(r, (e) => e.name === "inner" && inner.push(e));
    expect(inner).toHaveLength(1);
    expect(inner[0]!.qualifiedName).toBeUndefined();
    expect(ix.findByQualifiedName("P::inner")).toEqual([]);
  });
});

describe("quoteName and reserved words", () => {
  it("quotes reserved words", () => {
    expect(quoteName("part")).toBe("'part'");
    expect(quoteName("Part")).toBe("Part");
  });
  it("every keyword round-trips as a quoted name through the parser", () => {
    expect(SYSML_KEYWORDS.size).toBeGreaterThan(150);
    const bad: string[] = [];
    for (const k of SYSML_KEYWORDS) {
      if (parse(`part def ${quoteName(k)};`).errors.length) bad.push(k);
    }
    expect(bad).toEqual([]);
    expect(parse("part def 'part';").errors).toEqual([]);
  });
});

describe("syntax error columns", () => {
  it("are UTF-16 columns, matching model ranges, after an astral character", () => {
    const text = "package P { /* 😀 */ part def A ) }";
    const r = antlrDocumentParser("file:///a.sysml", text);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.line).toBe(0);
    expect(r.errors[0]!.column).toBe(text.indexOf(")"));
  });
});

describe("listeners", () => {
  it("a throwing listener does not block others or escape", () => {
    const ix = new ModelIndex();
    const seen: string[][] = [];
    const orig = console.error;
    console.error = () => {};
    try {
      ix.onDidChange(() => {
        throw new Error("boom");
      });
      ix.onDidChange((e) => seen.push(e.uris));
      expect(() => ix.setDocument("file:///a.sysml", "package A;")).not.toThrow();
    } finally {
      console.error = orig;
    }
    expect(seen).toEqual([["file:///a.sysml"]]);
  });
});

describe("fixes found by measuring unresolved names on the official models", () => {
  it("resolves a non-wildcard import of an alias by the alias name", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package P { package D { part def Vehicle; alias Car for Vehicle; }
      package U { private import D::Car; part v : Car; } }`);
    const v = ix.findByQualifiedName("P::U::v")[0]!;
    expect(ix.resolve("Car", v)?.qualifiedName).toBe("P::D::Vehicle");
  });

  it("`import all` sees private members and private imports of the target", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package P { package P1 { part def A; } package P2 { private import P1::*; private part def H; }
      package Q { public import all P2::*; part z : A; part h : H; }
      package R { public import P2::*; part z : A; part h : H; } }`);
    const at = (qn: string) => ix.findByQualifiedName(qn)[0]!;
    expect(ix.resolve("A", at("P::Q::z"))?.qualifiedName).toBe("P::P1::A");
    expect(ix.resolve("H", at("P::Q::h"))?.qualifiedName).toBe("P::P2::H");
    expect(ix.resolve("A", at("P::R::z"))).toBeUndefined();
    expect(ix.resolve("H", at("P::R::h"))).toBeUndefined();
  });

  it("indexes KerML declarations with the `all` modifier under their own name", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.kerml", "package P { assoc all HB specializes HL; struct all Point specializes Object { } }");
    expect(ix.findByQualifiedName("P::HB")).toHaveLength(1);
    expect(ix.findByQualifiedName("P::Point")).toHaveLength(1);
  });
});
