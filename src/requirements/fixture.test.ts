import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { ModelIndex } from "../model/index.js";
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
