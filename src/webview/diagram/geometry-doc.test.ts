import { describe, expect, it } from "vitest";
import { MAX_DOC_LINES, clipLines, describeBox, type Measure } from "./geometry.js";
import type { VmNode } from "../../diagram/view-model.js";

const measure: Measure = (t) => t.length * 6;
const node = (doc?: string): VmNode => ({ id: "n1", shape: "usage", keyword: "«part»", label: "engine", resolved: true, ...(doc !== undefined ? { doc } : {}) });

describe("descriptions on nodes", () => {
  it("shows no description area without a doc", () => {
    expect(describeBox(node(), measure).docArea).toBeUndefined();
  });
  it("puts the doc below the name and reports its area", () => {
    const c = describeBox(node("Drives the wheels."), measure);
    const label = c.rows.find((r) => r.kind === "label")!;
    const doc = c.rows.filter((r) => r.kind === "doc");
    expect(doc.length).toBe(1);
    expect(doc[0]!.y).toBeGreaterThan(label.y);
    expect(c.docArea!.y).toBeLessThan(doc[0]!.y);
    expect(c.docArea!.y + c.docArea!.h).toBeGreaterThanOrEqual(doc[0]!.y);
  });
  it("clips a long doc to three lines ending in an ellipsis", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const rows = describeBox(node(long), measure).rows.filter((r) => r.kind === "doc");
    expect(rows.length).toBe(MAX_DOC_LINES);
    expect(rows[rows.length - 1]!.text.endsWith("…")).toBe(true);
  });
  it("keeps a short list of lines as it is", () => {
    expect(clipLines(["a", "b"], 3, measure, 100)).toEqual(["a", "b"]);
    expect(clipLines(["a", "b", "c", "d"], 3, measure, 100)).toEqual(["a", "b", "c…"]);
  });
});
