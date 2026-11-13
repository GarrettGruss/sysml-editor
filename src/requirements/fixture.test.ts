import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { ModelIndex, loadLibrary } from "../model/index.js";
import { buildDocumentModel } from "./document-model.js";
import { listRequirements } from "./queries.js";

const text = readFileSync(resolve(__dirname, "../../test/fixtures/requirements/vehicle-spec.sysml"), "utf8");

test("the requirements fixture parses, renders as a document and lists its requirements with relationships", () => {
  const ix = new ModelIndex();
  ix.setDocument("file:///w/vehicle-spec.sysml", text);
  expect(ix.getDocument("file:///w/vehicle-spec.sysml")!.errors).toEqual([]);
  const root = ix.findByQualifiedName("VehicleSpec")[0]!;
  const d = buildDocumentModel(ix, root);
  expect(d.title).toBe("Vehicle SRS");
  expect(d.toc.map((t) => `${t.number} ${t.heading}`)).toEqual(["1 Performance Requirements", "1.1 Acceleration", "2 Safety", "3 Design", "4 Verification", "A Glossary"]);
  const rows = listRequirements(ix, root);
  expect(rows.map((r) => [r.shortName, r.satisfiedBy.length, r.verifiedBy.length, r.derivedFrom.length, r.derives.length])).toEqual([
    ["R1", 1, 1, 0, 1],
    ["R2", 0, 0, 1, 0],
    ["R3", 0, 0, 0, 0],
    ["R4", 0, 0, 0, 0],
  ]);
});

test("the DocumentAnnotations library parses, is read-only, and @DocumentRoot / @Appendix resolve from the fixture package", () => {
  const ix = new ModelIndex();
  const libUri = "sysml-library:///DocumentAnnotations.sysml";
  const lib = readFileSync(resolve(__dirname, "DocumentAnnotations.sysml"), "utf8");
  const std = resolve(__dirname, "../../fixtures/sysml-v2-release/sysml.library");
  if (existsSync(std)) loadLibrary(ix, std);
  ix.setDocument(libUri, lib);
  ix.setDocument("file:///w/vehicle-spec.sysml", text);
  expect(ix.getDocument(libUri)!.errors).toEqual([]);
  expect(ix.isReadOnly(libUri)).toBe(true);
  const root = ix.findByQualifiedName("VehicleSpec")[0]!;
  expect(ix.resolve("DocumentAnnotations", root)?.qualifiedName).toBe("DocumentAnnotations");
  expect(ix.resolveAll("DocumentRoot", root).map((e) => e.qualifiedName)).toEqual(["DocumentAnnotations::DocumentRoot"]);
  expect(ix.resolveAll("Appendix", ix.findByQualifiedName("VehicleSpec::Glossary")[0]!).map((e) => e.qualifiedName)).toEqual(["DocumentAnnotations::Appendix"]);
  expect(ix.findByQualifiedName("DocumentAnnotations::DocumentRoot::title")).toHaveLength(1);
  // the annotations in the fixture are read by the document model
  expect(buildDocumentModel(ix, root).appendices.map((a) => a.heading)).toEqual(["Glossary"]);
});
