import { describe, expect, it } from "vitest";
import { parseDiagram, type DiagramDocument } from "../diagram/format.js";
import { ModelIndex, defaultDocumentParser, type Element } from "../model/index.js";
import {
  applyEdits, checkResolutionPreserved, groupByUri, isPlanCurrent, planDeleteElement, planInsertMember, planRename, planSetShortName, planSetType,
  validatePlan, writeReference, type PlanResult,
} from "./index.js";

const A = "file:///ws/a.sysml";
const B = "file:///ws/b.sysml";

function ws(files: Record<string, string>): ModelIndex {
  const ix = new ModelIndex();
  for (const [u, t] of Object.entries(files)) ix.setDocument(u, t);
  return ix;
}
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
function after(ix: ModelIndex, plan: PlanResult): ModelIndex {
  const t = texts(ix, plan);
  const ix2 = new ModelIndex();
  for (const u of ix.uris()) ix2.setDocument(u, t[u] ?? ix.getDocument(u)!.text);
  return ix2;
}

describe("rename: resolution is preserved", () => {
  it("refuses a rename that would capture a reference to another element (review finding 1)", () => {
    const ix = ws({ [A]: "package P { part def Y; package Q { part def X; part y : Y; } }" });
    const r = planRename(ix, el(ix, "P::Q::X"), "Y");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/a\.sysml:1/);
      expect(r.reason).toMatch(/P::Q::Y instead of P::Y/);
    }
  });

  it("accepts a rename that changes nothing else, including across files", () => {
    const ix = ws({ [A]: "package P { part def X; }", [B]: "package Q { part y : P::X; }" });
    expect(planRename(ix, el(ix, "P::X"), "Z").ok).toBe(true);
  });

  it("checkResolutionPreserved reports a plan that makes a name resolve elsewhere or not at all", () => {
    const ix = ws({ [A]: "package P { part def Y; package Q { part def X; part y : Y; } }" });
    const y = el(ix, "P::Y");
    // Renaming only the declaration (not the reference) leaves `part y : Y` unresolved.
    const bad: PlanResult = { ok: true, description: "x", edits: [{ uri: A, range: { start: y.nameRange!.start.offset, end: y.nameRange!.end.offset }, newText: "Y2" }] };
    const r = checkResolutionPreserved(ix, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/would no longer resolve/);
  });
});

describe("rename: an element declared in several files", () => {
  it("renames every declaration of a package and the references into it (review finding 2)", () => {
    const ix = ws({
      [A]: "package P { part def X; }",
      [B]: "package P { part y : X; }\npackage Q { part z : P::X; }",
    });
    const p = planRename(ix, el(ix, "P"), "R");
    expect(p.ok).toBe(true);
    const out = texts(ix, p);
    expect(out[A]).toBe("package R { part def X; }");
    expect(out[B]).toBe("package R { part y : X; }\npackage Q { part z : R::X; }");
    const ix2 = after(ix, p);
    expect(ix2.findByQualifiedName("P")).toHaveLength(0);
    expect(ix2.findByQualifiedName("R")).toHaveLength(2);
    expect(ix2.resolve("R::X", el(ix2, "Q::z"))?.qualifiedName).toBe("R::X");
  });
});

describe("conjugated port types", () => {
  const src = "package P { port def Pd; port def Pe; port p : ~Pd; }";
  it("the model keeps `~Pd` in types and exposes the name and the flag separately (review finding 3)", () => {
    const ix = ws({ [A]: src });
    const p = el(ix, "P::p");
    expect(p.types).toEqual(["~Pd"]);
    expect(p.typeNames).toEqual(["Pd"]);
    expect(p.typeConjugated).toEqual([true]);
    expect(el(ix, "P::Pd").typeConjugated).toEqual([]);
  });

  it("set type keeps the `~` unless the caller says otherwise", () => {
    const ix = ws({ [A]: src });
    const p = el(ix, "P::p");
    expect(texts(ix, planSetType(ix, p, el(ix, "P::Pe")))[A]).toBe("package P { port def Pd; port def Pe; port p : ~Pe; }");
    expect(texts(ix, planSetType(ix, p, el(ix, "P::Pe"), { conjugated: false }))[A]).toBe("package P { port def Pd; port def Pe; port p : Pe; }");
    expect(texts(ix, planSetType(ix, p, undefined))[A]).toBe("package P { port def Pd; port def Pe; port p; }");
    const plain = ws({ [A]: "package P { port def Pd; port q : Pd; }" });
    expect(texts(plain, planSetType(plain, el(plain, "P::q"), el(plain, "P::Pd"), { conjugated: true }))[A]).toBe("package P { port def Pd; port q : ~Pd; }");
  });

  it("rename of the port definition rewrites the name inside `~Pd`", () => {
    const ix = ws({ [A]: src });
    const p = planRename(ix, el(ix, "P::Pd"), "Pz");
    expect(p.ok).toBe(true);
    expect(texts(ix, p)[A]).toBe("package P { port def Pz; port def Pe; port p : ~Pz; }");
    if (p.ok) expect(p.unjudged).toBeUndefined();
  });
});

describe("unjudged references", () => {
  it("counts a name that reads like the old one but did not resolve (review finding 4)", () => {
    const ix = ws({ [A]: "package P { part def X; part a : Nope::X; }" });
    const p = planRename(ix, el(ix, "P::X"), "Z");
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.unjudged?.count).toBe(1);
      expect(p.unjudged?.locations[0]).toMatchObject({ uri: A, line: 0 });
    }
  });
});

describe("plan sources and staleness", () => {
  it("records hash and length of every document the plan reads or edits (review finding 5)", () => {
    const ix = ws({ [A]: "package P { part def X; part a : X; }", [B]: "package Q { part b; }" });
    const p = planRename(ix, el(ix, "P::X"), "Z");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.sources?.map((s) => s.uri).sort()).toEqual([A, B]);
    for (const s of p.sources!) expect(s.length).toBe(ix.getDocument(s.uri)!.text.length);
    expect(isPlanCurrent(ix, p)).toBe(true);
    ix.setDocument(B, "package Q { part c; }"); // a document that was only read changes
    expect(isPlanCurrent(ix, p)).toBe(false);
    ix.setDocument(B, "package Q { part b; }");
    expect(isPlanCurrent(ix, p)).toBe(true);
    ix.setDocument(A, "package P { part def X; part a : X; } ");
    expect(isPlanCurrent(ix, p)).toBe(false);
  });

  it("a same-length change is detected by the hash; a plan without sources is never current", () => {
    const ix = ws({ [A]: "package P { part def X; }" });
    const p = planInsertMember(ix, el(ix, "P"), "part a;");
    if (!p.ok) throw new Error(p.reason);
    ix.setDocument(A, "package P { part def Y; }");
    expect(ix.getDocument(A)!.text.length).toBe(p.sources![0]!.length);
    expect(isPlanCurrent(ix, p)).toBe(false);
    expect(isPlanCurrent(ix, { ok: true, edits: [], description: "" } as never)).toBe(false);
    expect(isPlanCurrent((u) => (u === A ? "package P { part def X; }" : undefined), p)).toBe(true);
  });

  it("includes the diagram files a rename updates", () => {
    const ix = ws({ [A]: "package P { part def Engine; }" });
    const doc: DiagramDocument = { version: 1, kind: "general", root: "P", sources: [], nodes: [{ id: "n1", ref: "P::Engine" }], edges: [] };
    const raw = JSON.stringify(doc);
    const p = planRename(ix, el(ix, "P::Engine"), "Motor", { diagrams: [{ uri: "file:///ws/d.sysmld", doc, text: raw }] });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const d = p.sources!.find((s) => s.uri === "file:///ws/d.sysmld");
    expect(d?.length).toBe(raw.length);
    expect(isPlanCurrent((u) => (u === "file:///ws/d.sysmld" ? raw : ix.getDocument(u)?.text), p)).toBe(true);
    expect(isPlanCurrent((u) => (u === "file:///ws/d.sysmld" ? raw + " " : ix.getDocument(u)?.text), p)).toBe(false);
  });
});

describe("reference writer", () => {
  it("keeps the qualified name when a wildcard import already supplies a different element of that name (review finding 6)", () => {
    const ix = ws({ [A]: "package Lib { part def Engine; }\npackage Other { part def Engine; }\npackage M { private import Lib::*; part c; }" });
    const w = writeReference(ix, el(ix, "Other::Engine"), el(ix, "M::c"));
    expect(w).toMatchObject({ ok: true, text: "Other::Engine", edits: [] });
  });

  it("does not import a target behind a private namespace; refuses when it cannot be named at all", () => {
    const ix = ws({ [A]: "package Lib { private package Hidden { part def Secret; } part def Open; }\npackage M { part c; }" });
    const w = writeReference(ix, el(ix, "Lib::Hidden::Secret"), el(ix, "M::c"));
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.reason).toMatch(/private/);
    const protectedCase = ws({ [A]: "package Lib { protected part def Hid; }\npackage M { part c; }" });
    // protected: no import, and the qualified name is only used because it resolves from the edit location
    expect(writeReference(protectedCase, el(protectedCase, "Lib::Hid"), el(protectedCase, "M::c"))).toMatchObject({ ok: true, text: "Lib::Hid", edits: [] });
    // Visible from inside the private namespace: the plain name is used.
    const inside = ws({ [A]: "package Lib { private package Hidden { part def Secret; part s; } }" });
    expect(writeReference(inside, el(inside, "Lib::Hidden::Secret"), el(inside, "Lib::Hidden::s"))).toMatchObject({ ok: true, text: "Secret", edits: [] });
  });

  it("reuses an existing import whatever its visibility and never adds a duplicate", () => {
    for (const vis of ["private ", "public "]) {
      const ix = ws({ [A]: `package Lib { part def Engine; }\npackage M { ${vis}import Lib::Engine; part c; }` });
      expect(writeReference(ix, el(ix, "Lib::Engine"), el(ix, "M::c"))).toMatchObject({ ok: true, text: "Engine", edits: [] });
    }
  });

  it("still adds a private import when it is safe", () => {
    const ix = ws({ [A]: "package Lib { part def Engine; }\npackage M { part c; }" });
    const w = writeReference(ix, el(ix, "Lib::Engine"), el(ix, "M::c"));
    expect(w).toMatchObject({ ok: true, text: "Engine", importText: "private import Lib::Engine;" });
  });
});

describe("insert and short name clashes", () => {
  it("refuses a name the owner inherits, naming the supertype (review finding 7)", () => {
    const ix = ws({ [A]: "package P { part def Base { part wheel; } part def Car :> Base; }" });
    const r = planInsertMember(ix, el(ix, "P::Car"), { kind: "part", name: "wheel" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/inherited .* from P::Base/);
  });

  it("refuses a name another declaration of the same package already has", () => {
    const ix = ws({ [A]: "package P { part def X; }", [B]: "package P { part def Z; }" });
    const second = ix.findByQualifiedName("P").find((p) => p.uri === B)!;
    const r = planInsertMember(ix, second, { kind: "part def", name: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already has a member named 'X'/);
  });

  it("a short name must not clash with sibling names, short names, other declarations or inherited names", () => {
    const ix = ws({ [A]: "package P { part def A; part def <b> B; part def Base { part wheel; } part def Car :> Base { part w; } }", [B]: "package P { part def Other; }" });
    expect(planSetShortName(ix, el(ix, "P::Car"), "A").ok).toBe(false);
    expect(planSetShortName(ix, el(ix, "P::Car"), "b").ok).toBe(false);
    expect(planSetShortName(ix, el(ix, "P::Car"), "Other").ok).toBe(false);
    expect(planSetShortName(ix, el(ix, "P::Car::w"), "wheel").ok).toBe(false);
    expect(planSetShortName(ix, el(ix, "P::Car"), "fresh").ok).toBe(true);
  });
});

describe("delete reports the references that stay behind", () => {
  it("counts and locates references to the element and to what it owns (review finding 8)", () => {
    const ix = ws({ [A]: "package P {\n  part def E { part inner; }\n  part a : E;\n}", [B]: "package Q { part b : P::E; part c :> P::E::inner; }" });
    const p = planDeleteElement(ix, el(ix, "P::E"));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.remainingReferences?.count).toBe(3);
    expect(p.remainingReferences?.locations.length).toBeGreaterThan(0);
    expect(p.remainingReferences?.locations.some((l) => l.uri === B)).toBe(true);
    const none = planDeleteElement(ix, el(ix, "Q::b"));
    expect(none.ok && none.remainingReferences).toBeFalsy();
  });
});

describe("set type on a usage with several types", () => {
  it("refuses instead of replacing all of them (review finding 9)", () => {
    const ix = ws({ [A]: "package P { part def A; part def B; part def C; part x : A, B; }" });
    const r = planSetType(ix, el(ix, "P::x"), el(ix, "P::C"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/several types/);
    expect(planSetType(ix, el(ix, "P::x"), undefined).ok).toBe(false);
  });
});

describe("diagram updates on rename", () => {
  const src = "package Vehicles {\n    part def Car { part 'my engine'; part wheel; }\n}\n";
  it("matches quoted and plain spellings of the same qualified name (review finding 10)", () => {
    const ix = ws({ [A]: src });
    const doc: DiagramDocument = {
      version: 1, kind: "general", root: "'Vehicles'::Car", sources: [],
      nodes: [{ id: "n1", ref: "'Vehicles'::'Car'::'my engine'" }, { id: "n2", ref: "Vehicles::Car::wheel" }], edges: [],
    };
    const p = planRename(ix, el(ix, "Vehicles::Car"), "Auto", { diagrams: [{ uri: "file:///ws/d.sysmld", doc }] });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const d = (parseDiagram(p.diagramUpdates![0]!.text) as { ok: true; doc: DiagramDocument }).doc;
    expect(d.root).toBe("Vehicles::Auto");
    expect(d.nodes.map((n) => n.ref)).toEqual(["Vehicles::Auto::'my engine'", "Vehicles::Auto::wheel"]);
  });

  it("lists diagram files that could not be parsed", () => {
    const ix = ws({ [A]: src });
    const p = planRename(ix, el(ix, "Vehicles::Car"), "Auto", { diagrams: [{ uri: "file:///ws/broken.sysmld", text: "{ not json" }] });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.skippedDiagrams).toEqual(["file:///ws/broken.sysmld"]);
  });
});

describe("model: forked index", () => {
  it("withTexts leaves the original untouched and shares unchanged documents", () => {
    const ix = ws({ [A]: "package P { part def X; }", [B]: "package Q { part y : P::X; }" });
    const f = ix.withTexts(new Map([[A, "package P { part def X2; }"]]));
    expect(f.findByQualifiedName("P::X2")).toHaveLength(1);
    expect(f.findByQualifiedName("P::X")).toHaveLength(0);
    expect(ix.findByQualifiedName("P::X")).toHaveLength(1);
    expect(ix.findByQualifiedName("P::X2")).toHaveLength(0);
    expect(f.getDocument(B)!.model).toBe(ix.getDocument(B)!.model);
    expect(defaultDocumentParser(A, f.getDocument(A)!.text).errors).toEqual([]);
  });
});

describe("validatePlan stays idempotent about sources", () => {
  it("returns the same object and fills sources", () => {
    const ix = ws({ [A]: "package P { part a; }" });
    const ok: PlanResult = { ok: true, description: "x", edits: [{ uri: A, range: { start: 12, end: 12 }, newText: "part b; " }] };
    expect(validatePlan(ix, ok)).toBe(ok);
    expect(ok.sources).toHaveLength(1);
  });
});
