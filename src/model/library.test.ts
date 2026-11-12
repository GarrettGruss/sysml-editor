import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "./index.js";
import { buildKermlOutline } from "./kerml-outline.js";
import { loadLibrary } from "./library.js";
import type { Element } from "./types.js";

const release = resolve(__dirname, "../../fixtures/sysml-v2-release");
const libDir = join(release, "sysml.library");
const have = existsSync(libDir);
if (!have) console.warn("fixtures/sysml-v2-release is missing (git submodule not initialised): library tests are skipped");

function files(dir: string, ext: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, ext, out);
    else if (n.endsWith(ext)) out.push(p);
  }
  return out;
}
function walk(roots: readonly Element[], f: (e: Element) => void): void {
  for (const r of roots) {
    f(r);
    walk(r.members, f);
  }
}
const unq = (t: string) => (t.startsWith("'") ? t.slice(1, -1).replace(/\\(.)/gs, "$1") : t);

describe.skipIf(!have)("KerML outline indexer", () => {
  const kermlFiles = have ? [...files(libDir, ".kerml"), ...files(join(release, "kerml"), ".kerml")] : [];

  it("covers the expected number of files", () => {
    expect(files(libDir, ".kerml")).toHaveLength(36);
    expect(files(join(release, "kerml"), ".kerml")).toHaveLength(58);
  });

  it("indexes every library and example file without throwing, with name ranges matching names", () => {
    let named = 0;
    for (const f of kermlFiles) {
      const text = readFileSync(f, "utf8");
      const m = buildKermlOutline("file:///x.kerml", text);
      walk(m.roots, (e) => {
        if (e.name !== undefined) {
          named++;
          const r = e.nameRange!;
          expect(unq(text.slice(r.start.offset, r.end.offset)), f).toBe(e.name);
          const line = text.split("\n")[r.start.line]!;
          expect(line.slice(r.start.column, r.start.column + (r.end.offset - r.start.offset)), f).toBe(
            text.slice(r.start.offset, r.end.offset),
          );
        }
        if (e.shortName !== undefined) {
          const r = e.shortNameRange!;
          expect(unq(text.slice(r.start.offset, r.end.offset)), f).toBe(e.shortName);
        }
        expect(e.range.end.offset, f).toBeGreaterThanOrEqual(e.range.start.offset);
      });
    }
    expect(named).toBeGreaterThan(1000);
  });

  it("indexes declarations of Base, ScalarValues and the function and behavior libraries", () => {
    const ix = new ModelIndex();
    loadLibrary(ix, libDir);
    const get = (qn: string) => {
      const e = ix.findByQualifiedName(qn)[0];
      if (!e) throw new Error("missing " + qn);
      return e;
    };
    expect(get("ScalarValues").kind).toBe("package");
    expect(get("ScalarValues::String")).toMatchObject({ kind: "datatype", specializes: ["ScalarValue"], isDefinition: true });
    expect(get("ScalarValues::Integer")).toMatchObject({ kind: "datatype", specializes: ["Rational"] });
    expect(get("ScalarValues::ScalarValue").kind).toBe("datatype");
    expect(get("Base::Anything")).toMatchObject({ kind: "classifier", specializes: [] });
    expect(get("Base::DataValue")).toMatchObject({ kind: "datatype", specializes: ["Anything"] });
    expect(get("Base::dataValues")).toMatchObject({
      kind: "feature", types: ["DataValue"], subsets: ["things"], multiplicity: "[0..*]", isUsage: true,
    });
    expect(get("Objects::Object")).toMatchObject({ kind: "struct", specializes: ["Occurrence"] });
    expect(get("Occurrences::Occurrence")).toMatchObject({ kind: "class", specializes: ["Anything"] });
    expect(get("Performances::Performance")).toMatchObject({ kind: "behavior", specializes: ["Occurrence"] });
    expect(get("Performances::Evaluation").kind).toBe("function");
    expect(get("Links::Link").kind).toBe("assoc");
    expect(get("NumericalFunctions::sum").kind).toBe("function");
    // doc text is attached to the owner
    expect(get("ScalarValues").documentation).toContain("primitive scalar");
    // imports carry the SysML import shape and visibility
    const imp = get("ScalarValues").members.find((m) => m.kind === "import")!;
    expect(imp).toMatchObject({ visibility: "private", importInfo: { target: "Base::DataValue", wildcard: false, recursive: false } });
  });

  it("handles quoted names, short names, imports, aliases and comments in a small sample", () => {
    const text = [
      "// note\n/* comment */ package P {",
      "  doc /* hello\n * world */",
      "  public import A::B::*;",
      "  private import 'x y'::**;",
      "  alias <al> Short for A::B;",
      "  abstract classifier <c1> 'My Class' specializes A, B { feature f : T[1] subsets g redefines h; }",
      "  assoc struct L specializes Link;",
      "  comment C about A /* text */",
      '  feature s = "str ; {" ;',
      "}",
    ].join("\n");
    const m = buildKermlOutline("file:///p.kerml", text);
    const p = m.roots[0]!;
    expect(p).toMatchObject({ kind: "package", name: "P", documentation: "hello\nworld" });
    const [doc, i1, i2, al, cls, l, c, s] = p.members;
    expect(doc!.kind).toBe("doc");
    expect(i1).toMatchObject({ kind: "import", visibility: "public", importInfo: { target: "A::B", wildcard: true, recursive: false } });
    expect(i2!.importInfo).toEqual({ target: "'x y'", wildcard: true, recursive: true });
    expect(al).toMatchObject({ kind: "alias", name: "Short", shortName: "al", aliasFor: "A::B" });
    expect(cls).toMatchObject({ kind: "classifier", name: "My Class", shortName: "c1", specializes: ["A", "B"], qualifiedName: "P::'My Class'" });
    expect(cls!.members[0]).toMatchObject({ kind: "feature", name: "f", types: ["T"], multiplicity: "[1]", subsets: ["g"], redefines: ["h"] });
    expect(l).toMatchObject({ kind: "assoc struct", specializes: ["Link"] });
    expect(c).toMatchObject({ kind: "comment", name: "C", documentation: "text" });
    expect(s).toMatchObject({ kind: "feature", name: "s" });
    expect(p.members).toHaveLength(8);
  });

  it("never throws on garbage", () => {
    for (const t of ["", "}}}{{{", "package", "package P {", "'unterminated", "/* open", "import ;; ::: <", "feature :>> ;"]) {
      expect(() => buildKermlOutline("file:///g.kerml", t)).not.toThrow();
    }
  });
});

describe.skipIf(!have)("standard library", () => {
  const ix = new ModelIndex();
  const loaded = have ? loadLibrary(ix, libDir) : { uris: [], failed: [] };

  it("loads all 94 files without read errors or syntax errors", () => {
    expect(loaded.failed).toEqual([]);
    expect(loaded.uris).toHaveLength(94);
    for (const u of loaded.uris) expect(ix.getDocument(u)!.errors, u).toEqual([]);
  });

  it("finds exactly one root package per library file", () => {
    let packages = 0;
    for (const u of loaded.uris) {
      const roots = ix.getDocument(u)!.model.roots.filter((r) => r.kind === "package" || r.kind === "library package");
      expect(roots, u).toHaveLength(1);
      packages += roots.length;
    }
    expect(packages).toBe(94);
  });

  it("flags library documents and elements as read-only", () => {
    const s = ix.findByQualifiedName("ScalarValues::String")[0]!;
    expect(ix.isReadOnly(s)).toBe(true);
    expect(ix.isReadOnly(s.uri)).toBe(true);
    expect(ix.isReadOnly(ix.findByQualifiedName("Parts::Part")[0]!)).toBe(true);
    ix.setDocument("file:///user.sysml", "package U { part def X; }");
    expect(ix.isReadOnly("file:///user.sysml")).toBe(false);
    expect(ix.isReadOnly(ix.findByQualifiedName("U::X")[0]!)).toBe(false);
    ix.removeDocument("file:///user.sysml");
  });

  function resolveIn(text: string, qn: string, name: string): Element | undefined {
    ix.setDocument("file:///m.sysml", text);
    try {
      const from = ix.findByQualifiedName(qn)[0]!;
      return ix.resolve(name, from);
    } finally {
      ix.removeDocument("file:///m.sysml");
    }
  }

  it("resolves a KerML library type through an import", () => {
    const r = resolveIn(
      "package M { private import ScalarValues::*; attribute def A { attribute name : String; } }",
      "M::A::name",
      "String",
    );
    expect(r?.qualifiedName).toBe("ScalarValues::String");
    expect(ix.isReadOnly(r!)).toBe(true);
  });

  it("resolves a qualified KerML library type without an import", () => {
    const r = resolveIn("package M { attribute def A { attribute name : ScalarValues::String; } }", "M::A::name", "ScalarValues::String");
    expect(r?.qualifiedName).toBe("ScalarValues::String");
  });

  it("resolves a SysML library type", () => {
    const r = resolveIn(
      "package M { private import Parts::*; private import ISQBase::*; part def P :> Part; attribute l : LengthValue; }",
      "M::P",
      "Part",
    );
    expect(r?.qualifiedName).toBe("Parts::Part");
    expect(r?.kind).toBe("part def");
    const l = resolveIn(
      "package M { private import ISQBase::*; attribute l : LengthValue; }",
      "M::l",
      "LengthValue",
    );
    expect(l?.qualifiedName).toBe("ISQBase::LengthValue");
    expect(l?.uri.endsWith("ISQBase.sysml")).toBe(true);
  });
});
