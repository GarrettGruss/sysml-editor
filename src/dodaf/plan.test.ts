import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ModelIndex } from "../model/index.js";
import { planViews } from "./plan.js";
import { writeDocument, EMPTY_VIEW_TEXT } from "./document.js";

const LIB = readFileSync(join(__dirname, "../../resources/dodaf/DoDAF.sysml"), "utf8");
const ix = new ModelIndex();
ix.setDocument("file:///DoDAF.sysml", LIB);
ix.setDocument(
  "file:///m.sysml",
  `package M {
  private import DoDAF::*;
  #OperationalPerformer part p;
  #OperationalActivity action a1;
  #OperationalActivity action a2;
}`,
);
const root = ix.findByQualifiedName("M")[0]!;

describe("planViews", () => {
  const plan = planViews(ix, root);
  it("covers views in order with files for diagrams", () => {
    expect(plan.find((p) => p.id === "OV-1")).toMatchObject({ form: "diagram", fileName: "M-OV-1.sysmld", empty: false });
    expect(plan[0]!.id).toBe("AV-1");
  });
  it("reports missing definitions and empty views", () => {
    expect(plan.find((p) => p.id === "SV-1")).toMatchObject({ empty: true, missing: ["System"] });
    expect(plan.find((p) => p.id === "OV-4")!.empty).toBe(true);
  });
  it("makes one OV-5b diagram per root activity", () => {
    expect(plan.filter((p) => p.id === "OV-5b").map((p) => p.root)).toEqual(["M::a1", "M::a2"]);
  });
  it("filters views", () => {
    expect(planViews(ix, root, ["SV-1", "nope"]).map((p) => p.id)).toEqual(["SV-1"]);
  });
});

describe("writeDocument", () => {
  const md = writeDocument("Doc", [
    { id: "OV-1", image: "images/OV-1.svg", narrative: "Story" },
    { id: "AV-1", markdown: "| a |\n|---|" },
    { id: "SV-1", skipped: "no diagram view" },
    { id: "CV-1" },
  ]);
  it("orders in DoDAF order and links images", () => {
    expect(md.indexOf("AV-1")).toBeLessThan(md.indexOf("CV-1"));
    expect(md.indexOf("CV-1")).toBeLessThan(md.indexOf("## OV-1"));
    expect(md).toContain("![OV-1 High-Level Operational Concept Graphic](images/OV-1.svg)");
  });
  it("marks empty and skipped views", () => {
    expect(md).toContain(EMPTY_VIEW_TEXT);
    expect(md).toContain("_Skipped: no diagram view_");
  });
});
