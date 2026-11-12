import { describe, expect, it } from "vitest";
import { ModelIndex, LIBRARY_URI_SCHEME } from "../model/index.js";
import { DiagramFileIndex } from "./diagram-index.js";
import { createDiagram } from "./create.js";
import { serializeDiagram } from "./format.js";
import { defaultDiagramFileName, fileNameProblem, listElements, relinkCandidates, uniqueFileName } from "./new-diagram.js";
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
