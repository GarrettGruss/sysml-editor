import { describe, expect, test } from "vitest";
import { ModelIndex } from "../model/index.js";
import { allowedForMove, allowedForNew, gapsOf, subtreeOf } from "./gaps.js";
import { buildState } from "./view-model.js";

const URI = "file:///w/m.sysml";
const TEXT = `package P {
  requirement def Owner {
    requirement <'A'> Alpha { requirement <'A1'> AlphaOne; requirement <'A2'> AlphaTwo; }
    requirement <'B'> Beta;
  }
  package Sec { requirement <'S1'> One; }
  package Sec2;
}`;
function vm(root: string) {
  const ix = new ModelIndex();
  ix.setDocument(URI, TEXT);
  expect(ix.getDocument(URI)!.errors).toEqual([]);
  return buildState(ix, { kind: "package", qualifiedName: root }).document!;
}
const keys = (g: { key: string }[]) => g.map((x) => x.key.replace(/P::Owner::/g, "").replace(/P::/g, ""));

describe("gaps of the document", () => {
  test("a requirement definition: before each requirement and at the end of every owner, nested levels in document order", () => {
    const d = vm("P::Owner");
    expect(gapsOf(d).map((g) => g.key)).toEqual([
      "requirement|P::Owner|P::Owner::Alpha",
      "requirement|P::Owner::Alpha|P::Owner::Alpha::AlphaOne",
      "requirement|P::Owner::Alpha::AlphaOne|end",
      "requirement|P::Owner::Alpha|P::Owner::Alpha::AlphaTwo",
      "requirement|P::Owner::Alpha::AlphaTwo|end",
      "requirement|P::Owner::Alpha|end",
      "requirement|P::Owner|P::Owner::Beta",
      "requirement|P::Owner::Beta|end",
      "requirement|P::Owner|end",
    ]);
    expect(gapsOf(d).map((g) => g.level)).toEqual([0, 1, 2, 1, 2, 1, 0, 1, 0]);
  });
  test("a package: section gaps before each section and at the end", () => {
    const g = gapsOf(vm("P"));
    expect(g.filter((x) => x.target === "section").map((x) => `${x.ownerQn}>${x.beforeQn ?? "end"}`)).toEqual(["P>P::Sec", "P::Sec>end", "P>P::Sec2", "P::Sec2>end", "P>end"]);
    expect(g.filter((x) => x.target === "section").every((x) => x.ownerKind === "package")).toBe(true);
  });
  test("a Package ghost is allowed only between sections, never inside a requirement", () => {
    const d = vm("P");
    const a = allowedForNew(gapsOf(d), "package");
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((g) => g.target === "section" && g.ownerKind === "package")).toBe(true);
  });
  test("Requirement is allowed in any owner, Child Requirement only inside a requirement", () => {
    const d = vm("P");
    const all = gapsOf(d);
    const req = allowedForNew(all, "requirement");
    const child = allowedForNew(all, "child");
    expect(req.some((g) => g.ownerKind === "package")).toBe(true);
    expect(child.length).toBeGreaterThan(0);
    expect(child.every((g) => g.ownerKind === "requirement")).toBe(true);
    // the gap below a requirement, inside its body, is a child gap even when it has no children
    expect(child.map((g) => g.key)).toContain("requirement|P::Owner::Beta|end");
  });
  test("a nested requirement has gaps at its own level and at its parent's level below it", () => {
    const d = vm("P::Owner");
    const g = gapsOf(d);
    const iBetaEnd = g.findIndex((x) => x.key.endsWith("Beta|end"));
    expect(g[iBetaEnd]!.level).toBe(1);
    expect(g[iBetaEnd + 1]!.ownerQn).toBe("P::Owner");
    expect(g[iBetaEnd + 1]!.level).toBe(0);
  });
  test("moving: not into itself, not where it already is", () => {
    const d = vm("P::Owner");
    const a = allowedForMove(d, gapsOf(d), "P::Owner::Alpha");
    const ks = keys(a);
    expect(ks).not.toContain("requirement|Alpha|AlphaOne");
    expect(ks).not.toContain("requirement|Owner|Alpha");
    expect(ks).not.toContain("requirement|Owner|Beta"); // directly below itself
    expect(ks).toContain("requirement|Beta|end".replace("Beta", "Beta"));
    expect(subtreeOf(d, "P::Owner::Alpha").size).toBe(3);
  });
});
