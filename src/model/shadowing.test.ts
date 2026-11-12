import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { ModelIndex, isLibraryUri } from "./index.js";

const BUNDLED = readFileSync(resolve(__dirname, "../requirements/DocumentAnnotations.sysml"), "utf8");
const LIB_URI = "sysml-library:///DocumentAnnotations.sysml";

function setup(withCopy: boolean) {
  const ix = new ModelIndex();
  ix.setDocument(LIB_URI, BUNDLED);
  ix.setDocument("sysml-library:///Other/ScalarValues.sysml", "standard library package ScalarValues { attribute def Real; }");
  if (withCopy) ix.setDocument("file:///w/DocumentAnnotations.sysml", BUNDLED);
  ix.setDocument("file:///w/spec.sysml", "package Spec {\n    private import DocumentAnnotations::*;\n    @Appendix;\n    package P { doc /* x */ }\n}\n");
  return ix;
}

describe("a workspace copy of a bundled non-standard library package shadows the bundled one", () => {
  test("without a copy, the bundled package resolves", () => {
    const ix = setup(false);
    const at = ix.findByQualifiedName("Spec")[0]!;
    const found = ix.resolveAll("DocumentAnnotations::Appendix", at);
    expect(found).toHaveLength(1);
    expect(isLibraryUri(found[0]!.uri)).toBe(true);
  });
  test("with a copy, names and qualified names see only the workspace declaration", () => {
    const ix = setup(true);
    const at = ix.findByQualifiedName("Spec")[0]!;
    const found = ix.resolveAll("DocumentAnnotations::Appendix", at);
    expect(found.map((e) => e.uri)).toEqual(["file:///w/DocumentAnnotations.sysml"]);
    expect(ix.resolveAll("Appendix", at).map((e) => e.uri)).toEqual(["file:///w/DocumentAnnotations.sysml"]);
    expect(ix.findByQualifiedName("DocumentAnnotations").map((e) => e.uri)).toEqual(["file:///w/DocumentAnnotations.sysml"]);
    expect(ix.findByQualifiedName("DocumentAnnotations::Appendix").map((e) => e.uri)).toEqual(["file:///w/DocumentAnnotations.sysml"]);
    expect(ix.resolve("DocumentAnnotations::Appendix", at)?.uri).toBe("file:///w/DocumentAnnotations.sysml");
  });
  test("removing the copy brings the bundled package back", () => {
    const ix = setup(true);
    ix.setDocument("file:///w/DocumentAnnotations.sysml", "package Unrelated;");
    expect(ix.findByQualifiedName("DocumentAnnotations::Appendix").map((e) => e.uri)).toEqual([LIB_URI]);
  });
  test("standard library packages are never shadowed", () => {
    const ix = setup(true);
    ix.setDocument("file:///w/sv.sysml", "package ScalarValues { attribute def Real; }");
    expect(ix.findByQualifiedName("ScalarValues::Real")).toHaveLength(2);
  });
});
