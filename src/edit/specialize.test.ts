import { describe, expect, test } from "vitest";
import { ModelIndex, defaultDocumentParser } from "../model/index.js";
import { planDependency } from "./connect.js";
import { planSpecialize } from "./specialize.js";
import { applyEdits, groupByUri } from "./text.js";
import type { PlanResult } from "./types.js";

const URI = "file:///w/m.sysml";
function setup(text: string) {
  const ix = new ModelIndex();
  ix.setDocument(URI, text);
  return { ix, q: (qn: string) => ix.findByQualifiedName(qn)[0]! };
}
function after(plan: PlanResult, text: string): string {
  expect(plan.ok, JSON.stringify(plan)).toBe(true);
  if (!plan.ok) return "";
  const out = applyEdits(text, groupByUri(plan.edits).get(URI) ?? []);
  expect(defaultDocumentParser(URI, out).errors).toEqual([]);
  return out;
}
const reason = (p: PlanResult) => (p.ok ? "" : p.reason);

const BASE = `package P {
    part def Ship;
    part def Frigate {
        attribute mass;
    }
    part def Hull :> Ship, Frigate2;
    part def Frigate2;
    item def Cargo;
    part engine : Ship;
}
`;

describe("planSpecialize", () => {
  test("writes :> on a definition with a body", () => {
    const { ix, q } = setup(BASE);
    expect(after(planSpecialize(ix, q("P::Frigate"), q("P::Ship")), BASE)).toContain("part def Frigate :> Ship {");
  });
  test("appends to an existing specialization", () => {
    const { ix, q } = setup(BASE.replace("item def Cargo;", "part def Cargo;"));
    expect(after(planSpecialize(ix, q("P::Hull"), q("P::Cargo")), BASE.replace("item def Cargo;", "part def Cargo;"))).toContain("part def Hull :> Ship, Frigate2, Cargo;");
  });
  test("refuses a kind mismatch, a usage, itself and a repeat", () => {
    const { ix, q } = setup(BASE);
    expect(reason(planSpecialize(ix, q("P::Frigate"), q("P::Cargo")))).toContain("can only specialize another part def");
    expect(reason(planSpecialize(ix, q("P::engine"), q("P::Ship")))).toContain("only definitions");
    expect(reason(planSpecialize(ix, q("P::Ship"), q("P::Ship")))).toContain("itself");
    expect(reason(planSpecialize(ix, q("P::Hull"), q("P::Ship")))).toContain("already specializes");
  });
  test("refuses a cycle", () => {
    const text = BASE.replace("part def Frigate {", "part def Frigate :> Ship {");
    const { ix, q } = setup(text);
    expect(reason(planSpecialize(ix, q("P::Ship"), q("P::Frigate")))).toContain("cycle");
  });
});

describe("planDependency", () => {
  test("writes a dependency statement in the owning package", () => {
    const { ix, q } = setup(BASE);
    const t = after(planDependency(ix, q("P::Frigate"), q("P::Cargo")), BASE);
    expect(t).toContain("dependency from Frigate to Cargo;");
    const d = defaultDocumentParser(URI, t).model.roots[0]!.members.find((m) => m.kind === "dependency");
    expect(d?.ends).toEqual(["Frigate", "Cargo"]);
  });
  test("refuses the same element on both ends", () => {
    const { ix, q } = setup(BASE);
    expect(reason(planDependency(ix, q("P::Ship"), q("P::Ship")))).toContain("two different");
  });
});
