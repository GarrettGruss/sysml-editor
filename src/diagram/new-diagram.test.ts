import { describe, expect, it } from "vitest";
import { ModelIndex, LIBRARY_URI_SCHEME } from "../model/index.js";
import { DiagramFileIndex } from "./diagram-index.js";
import { createDiagram } from "./create.js";
import { serializeDiagram } from "./format.js";
import { defaultDiagramFileName, fileNameProblem, fileRoots, listElements, relinkCandidates, uniqueFileName } from "./new-diagram.js";
import { makeSourceMapper } from "./resolve.js";

const SRC = `package P {
  part def Wheel;
  part def Car { part w : Wheel; part e; }
  requirement def R1;
  part car : Car;
  satisfy R1 by car;
}`;
const ix = new ModelIndex();
ix.setDocument("file:///w/p.sysml", SRC);
ix.setDocument(`${LIBRARY_URI_SCHEME}:///Lib.sysml`, "package Lib { part def X; }");

describe("file names", () => {
  it("builds a default name and avoids existing files", () => {
    expect(defaultDiagramFileName("Vehicle")).toBe("Vehicle.sysmld");
    expect(defaultDiagramFileName("a/b:c")).toBe("a_b_c.sysmld");
    const taken = new Set(["Car.sysmld", "Car 2.sysmld"]);
    expect(uniqueFileName("Car.sysmld", (n) => taken.has(n))).toBe("Car 3.sysmld");
    expect(uniqueFileName("Wheel.sysmld", (n) => taken.has(n))).toBe("Wheel.sysmld");
  });
  it("avoids Windows reserved names and trailing dots or spaces", () => {
    expect(defaultDiagramFileName("CON")).toBe("_CON.sysmld");
    expect(defaultDiagramFileName("nul.txt")).toBe("_nul.txt.sysmld");
    expect(defaultDiagramFileName("COM1")).toBe("_COM1.sysmld");
    expect(defaultDiagramFileName("Console")).toBe("Console.sysmld");
    expect(defaultDiagramFileName("Car. ")).toBe("Car.sysmld");
    expect(defaultDiagramFileName("...")).toBe("diagram.sysmld");
    const none = () => false;
    expect(fileNameProblem("aux.sysmld", none)).toMatch(/reserved/);
    expect(fileNameProblem("Car .sysmld", none)).toMatch(/dot or a space/);
    expect(fileNameProblem("Car..sysmld", none)).toMatch(/dot or a space/);
    expect(fileNameProblem("lpt3.sysmld", none)).toMatch(/reserved/);
  });
  it("explains a bad name", () => {
    const none = () => false;
    expect(fileNameProblem("x.sysmld", none)).toBeUndefined();
    expect(fileNameProblem("x.txt", none)).toMatch(/must end with/);
    expect(fileNameProblem("a/x.sysmld", none)).toMatch(/not a path/);
    expect(fileNameProblem("x.sysmld", () => true)).toMatch(/already exists/);
    expect(fileNameProblem("", none)).toBeDefined();
  });
});

describe("element lists", () => {
  it("lists named workspace elements, not library elements, relationships or unnamed ones", () => {
    const names = listElements(ix).map((e) => e.qualifiedName);
    expect(names).toContain("P::Car::w");
    expect(names).toContain("P::R1");
    expect(names).not.toContain("Lib::X");
    expect(names.every((n) => !!n)).toBe(true);
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!)));
  });
  it("offers elements of the same kind to re-link", () => {
    expect(relinkCandidates(ix, "part def").map((e) => e.qualifiedName)).toEqual(["P::Car", "P::Wheel"]);
    expect(relinkCandidates(ix, undefined).length).toBeGreaterThan(5);
  });
});

describe("diagram file index", () => {
  it("finds the diagrams that show an element, by resolving them", () => {
    const sourceOf = () => makeSourceMapper("file:///w");
    const files = new DiagramFileIndex();
    files.set("file:///w/car.sysmld", serializeDiagram(createDiagram(ix, "P::Car", "general", { sourceOf: sourceOf() })));
    files.set("file:///w/wheel.sysmld", serializeDiagram(createDiagram(ix, "P::Wheel", "general", { sourceOf: sourceOf() })));
    expect(files.set("file:///w/bad.sysmld", "{ nope")).toBe(false);
    const car = ix.findByQualifiedName("P::Car")[0]!;
    const w = ix.findByQualifiedName("P::Car::w")[0]!;
    expect(files.showing(car, ix, sourceOf).map((h) => h.uri)).toEqual(["file:///w/car.sysmld"]);
    expect(files.showing(w, ix, sourceOf)).toEqual([{ uri: "file:///w/car.sysmld", itemId: "n2" }]);
    expect(files.showing(ix.findByQualifiedName("P::R1")[0]!, ix, sourceOf)).toEqual([]);
    files.delete("file:///w/car.sysmld");
    expect(files.showing(car, ix, sourceOf)).toEqual([]);
    expect(files.uris()).toEqual(["file:///w/wheel.sysmld"]);
  });
});

describe("diagram file index", () => {
  it("keeps a file that does not parse, flagged, and unflags it once it parses", () => {
    const d = new DiagramFileIndex();
    expect(d.set("file:///w/bad.sysmld", "{ nope")).toBe(false);
    expect(d.isUnparsed("file:///w/bad.sysmld")).toBe(true);
    expect(d.allUris()).toEqual(["file:///w/bad.sysmld"]);
    expect(d.uris()).toEqual([]);
    const ok = serializeDiagram(createDiagram(ix, "P::Car", "general", { sourceOf: makeSourceMapper("file:///w") }));
    expect(d.set("file:///w/bad.sysmld", ok)).toBe(true);
    expect(d.isUnparsed("file:///w/bad.sysmld")).toBe(false);
    d.delete("file:///w/bad.sysmld");
    expect(d.allUris()).toEqual([]);
  });
});

describe("New Diagram on a file", () => {
  it("offers the single top-level package as the root", () => {
    const r = fileRoots(ix, "file:///w/p.sysml");
    expect(r.ok && r.roots.map((e) => e.qualifiedName)).toEqual(["P"]);
  });
  it("offers every top-level package of a file with several", () => {
    const m = new ModelIndex();
    m.setDocument("file:///w/two.sysml", "package A { part def X; }\npackage B { part def Y; }");
    const r = fileRoots(m, "file:///w/two.sysml");
    expect(r.ok && r.roots.map((e) => e.qualifiedName)).toEqual(["A", "B"]);
  });
  it("says why an empty file or a file with errors and no earlier version cannot be used", () => {
    const m = new ModelIndex();
    m.setDocument("file:///w/empty.sysml", "// nothing here\n");
    m.setDocument("file:///w/broken.sysml", "package {{{ ");
    const empty = fileRoots(m, "file:///w/empty.sysml");
    expect(!empty.ok && empty.reason).toMatch(/no top-level elements/);
    const broken = fileRoots(m, "file:///w/broken.sysml");
    expect(!broken.ok && broken.reason).toMatch(/syntax errors/);
  });
  it("keeps offering the last good model of a file that now has errors", () => {
    const m = new ModelIndex();
    m.setDocument("file:///w/x.sysml", "package A { part def X; }");
    m.setDocument("file:///w/x.sysml", "package A { part def X; ((( }");
    const r = fileRoots(m, "file:///w/x.sysml");
    expect(r.ok && r.roots.map((e) => e.qualifiedName)).toEqual(["A"]);
  });
});
