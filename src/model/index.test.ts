import { describe, expect, it } from "vitest";
import { ModelIndex } from "./index.js";
import type { Element } from "./types.js";

function el(ix: ModelIndex, qn: string): Element {
  const r = ix.findByQualifiedName(qn)[0];
  if (!r) throw new Error("missing " + qn);
  return r;
}

describe("ModelIndex lookup", () => {
  it("indexes qualified names across documents and updates on change and removal", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", "package A { part def X; }");
    ix.setDocument("file:///b.sysml", "package B { part def Y; }");
    expect(el(ix, "A::X").kind).toBe("part def");
    expect(el(ix, "B::Y").uri).toBe("file:///b.sysml");
    ix.setDocument("file:///a.sysml", "package A { part def Z; }");
    expect(ix.findByQualifiedName("A::X")).toEqual([]);
    expect(el(ix, "A::Z")).toBeDefined();
    expect(ix.removeDocument("file:///b.sysml")).toBe(true);
    expect(ix.findByQualifiedName("B::Y")).toEqual([]);
    expect(ix.removeDocument("file:///b.sysml")).toBe(false);
    expect(ix.uris()).toEqual(["file:///a.sysml"]);
  });
});

describe("ModelIndex.resolve", () => {
  it("resolves lexically, innermost scope first", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package P {
      part def T;
      package Q { part def T; part x : T; }
      part y : T;
    }`);
    expect(ix.resolve("T", el(ix, "P::Q::x"))).toBe(el(ix, "P::Q::T"));
    expect(ix.resolve("T", el(ix, "P::y"))).toBe(el(ix, "P::T"));
    expect(ix.resolve("Q::T", el(ix, "P::y"))).toBe(el(ix, "P::Q::T"));
    expect(ix.resolve("P::T", el(ix, "P::Q::x"))).toBe(el(ix, "P::T"));
    expect(ix.resolve("Nope", el(ix, "P::y"))).toBeUndefined();
    expect(ix.resolve("Q::Nope", el(ix, "P::y"))).toBeUndefined();
  });

  it("sees members of the element's own body and quoted names", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", "package P { part def 'My Def' { part inner; part r :>> inner; } part z : 'My Def'; }");
    expect(ix.resolve("inner", el(ix, "P::'My Def'::r"))).toBe(el(ix, "P::'My Def'::inner"));
    expect(ix.resolve("'My Def'", el(ix, "P::z"))).toBe(el(ix, "P::'My Def'"));
    expect(ix.resolve("P::'My Def'::inner", el(ix, "P::z"))).toBe(el(ix, "P::'My Def'::inner"));
  });

  it("resolves across documents through root packages and imports", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///lib.sysml", "package Lib { part def Engine; part def Wheel; package Inner { part def Deep; } }");
    ix.setDocument("file:///use.sysml", `package App {
      private import Lib::*;
      part e : Engine;
      part d : Inner::Deep;
    }
    package App2 { private import Lib::Wheel; part w : Wheel; part n : Engine; }
    package App3 { part q : Lib::Engine; }`);
    expect(ix.resolve("Engine", el(ix, "App::e"))).toBe(el(ix, "Lib::Engine"));
    expect(ix.resolve("Inner::Deep", el(ix, "App::d"))).toBe(el(ix, "Lib::Inner::Deep"));
    expect(ix.resolve("Wheel", el(ix, "App2::w"))).toBe(el(ix, "Lib::Wheel"));
    expect(ix.resolve("Engine", el(ix, "App2::n"))).toBeUndefined(); // membership import of Wheel only
    expect(ix.resolve("Lib::Engine", el(ix, "App3::q"))).toBe(el(ix, "Lib::Engine"));
  });

  it("handles recursive imports and root-level imports", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///lib.sysml", "package Lib { package A { package B { part def Deep; } } }");
    ix.setDocument("file:///use.sysml", "private import Lib::**;\npackage App { part x : Deep; }\npackage App2 { private import Lib::*::**; part y : Deep; }");
    expect(ix.resolve("Deep", el(ix, "App::x"))).toBe(el(ix, "Lib::A::B::Deep"));
    expect(ix.resolve("Deep", el(ix, "App2::y"))).toBe(el(ix, "Lib::A::B::Deep"));
  });

  it("follows public import re-exports but not private ones", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package Base { part def Core; }
      package Facade { public import Base::*; part def Own; }
      package Hidden { private import Base::*; }
      package Chain { public import Facade::*; }
      package User1 { private import Facade::*; part a : Core; }
      package User2 { private import Hidden::*; part b : Core; }
      package User3 { private import Chain::*; part c : Core; }
      package User4 { part d : Facade::Core; part e : Hidden::Core; }`);
    expect(ix.resolve("Core", el(ix, "User1::a"))).toBe(el(ix, "Base::Core"));
    expect(ix.resolve("Core", el(ix, "User2::b"))).toBeUndefined();
    expect(ix.resolve("Core", el(ix, "User3::c"))).toBe(el(ix, "Base::Core"));
    expect(ix.resolve("Facade::Core", el(ix, "User4::d"))).toBe(el(ix, "Base::Core"));
    expect(ix.resolve("Hidden::Core", el(ix, "User4::e"))).toBeUndefined();
  });

  it("ignores private members through imports and survives import cycles", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package P { private part def Secret; part def Open; }
      package Q { private import P::*; part u : Open; part v : Secret; }
      package C1 { public import C2::*; } package C2 { public import C1::*; part def K; }
      package R { private import C1::*; part k : K; part m : Missing; }`);
    expect(ix.resolve("Open", el(ix, "Q::u"))).toBe(el(ix, "P::Open"));
    expect(ix.resolve("Secret", el(ix, "Q::v"))).toBeUndefined();
    expect(ix.resolve("K", el(ix, "R::k"))).toBe(el(ix, "C2::K"));
    expect(ix.resolve("Missing", el(ix, "R::m"))).toBeUndefined();
  });

  it("resolves aliases, including through qualified names", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", `package Lib { part def Engine; package In { part def Deep; } }
      package App {
        alias Motor for Lib::Engine;
        alias Short for Lib::In;
        part m : Motor;
        part d : Short::Deep;
        alias Loop1 for Loop2; alias Loop2 for Loop1; part l : Loop1;
      }
      package Out { part q : App::Motor; }`);
    expect(ix.resolve("Motor", el(ix, "App::m"))).toBe(el(ix, "Lib::Engine"));
    expect(ix.resolve("Short::Deep", el(ix, "App::d"))).toBe(el(ix, "Lib::In::Deep"));
    expect(ix.resolve("App::Motor", el(ix, "Out::q"))).toBe(el(ix, "Lib::Engine"));
    expect(ix.resolve("Loop1", el(ix, "App::l"))).toBeUndefined();
  });

  it("merges a package declared in several documents", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", "package P { part def A; }");
    ix.setDocument("file:///b.sysml", "package P { part def B; part x : A; }");
    expect(ix.resolve("A", el(ix, "P::x"))).toBe(ix.findByQualifiedName("P::A")[0]);
    expect(ix.resolve("P::A", el(ix, "P::x"))).toBeDefined();
    expect(ix.findByQualifiedName("P").length).toBe(2);
  });

  it("matches short names", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///a.sysml", "package P { part def <v> Vehicle; part x : v; }");
    expect(ix.resolve("v", el(ix, "P::x"))).toBe(el(ix, "P::Vehicle"));
  });
});

describe("ModelIndex change events", () => {
  it("lists changed URIs, skips identical text, reports removals", () => {
    const ix = new ModelIndex();
    const seen: string[][] = [];
    const sub = ix.onDidChange((e) => seen.push(e.uris));
    ix.setDocument("u1", "package A;");
    ix.setDocument("u1", "package A;");
    ix.setDocument("u1", "package A2;");
    ix.setDocuments([["u1", "package A2;"], ["u2", "package B;"], ["u3", "package C;"]]);
    ix.removeDocument("u2");
    ix.removeDocument("nope");
    expect(seen).toEqual([["u1"], ["u1"], ["u2", "u3"], ["u2"]]);
    sub.dispose();
    ix.setDocument("u1", "package Z;");
    expect(seen.length).toBe(4);
  });
});

describe("broken files (last good model)", () => {
  const good = "package P {\n  part def A;\n}\n";
  const broken = "package P {\n  part def A;\n  part def ;; }}\n";

  it("keeps the last good model, flags it stale, and clears the flag on recovery", () => {
    const ix = new ModelIndex();
    const uri = "file:///f.sysml";
    ix.setDocument(uri, good);
    let d = ix.getDocument(uri)!;
    expect(d.stale).toBe(false);
    expect(d.errors).toEqual([]);
    const goodModel = d.model;

    ix.setDocument(uri, broken);
    d = ix.getDocument(uri)!;
    expect(d.stale).toBe(true);
    expect(d.model).toBe(goodModel);
    expect(d.errors.length).toBeGreaterThan(0);
    expect(d.errors[0]!.line).toBe(2); // 0-based
    expect(d.errors[0]!.column).toBeGreaterThanOrEqual(0);
    expect(el(ix, "P::A")).toBeDefined(); // still indexed

    ix.setDocument(uri, good.replace("A", "B"));
    d = ix.getDocument(uri)!;
    expect(d.stale).toBe(false);
    expect(d.errors).toEqual([]);
    expect(d.model).not.toBe(goodModel);
    expect(ix.findByQualifiedName("P::A")).toEqual([]);
    expect(el(ix, "P::B")).toBeDefined();
  });

  it("exposes an empty model plus errors for a document that never parsed cleanly", () => {
    const ix = new ModelIndex();
    ix.setDocument("u", broken);
    const d = ix.getDocument("u")!;
    expect(d.model.roots).toEqual([]);
    expect(d.errors.length).toBeGreaterThan(0);
    expect(d.stale).toBe(true);
    expect(d.everParsedCleanly).toBe(false);
  });

  it("emits a change event when only the error state changes", () => {
    const ix = new ModelIndex();
    ix.setDocument("u", good);
    const seen: string[][] = [];
    ix.onDidChange((e) => seen.push(e.uris));
    ix.setDocument("u", broken);
    expect(seen).toEqual([["u"]]);
  });

  it("survives a parser that throws", () => {
    const ix = new ModelIndex(() => {
      throw new Error("boom");
    });
    expect(() => ix.setDocument("u", "x")).not.toThrow();
    expect(ix.getDocument("u")!.errors[0]!.message).toContain("boom");
  });
});
