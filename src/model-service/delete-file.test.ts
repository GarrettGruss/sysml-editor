import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { deleteFileConfirmation, referencesToFile } from "./delete-file.js";

describe("referencesToFile", () => {
  const make = () => {
    const index = new ModelIndex();
    index.setDocument("file:///w/vehicle.sysml", "package V { part def Engine; part def Own { part e : Engine; } }");
    index.setDocument("file:///w/system.sysml", "package S { private import V::*; part def Car { part engine : Engine; } }");
    index.setDocument("file:///w/other.sysml", "package O { part def Z; }");
    return index;
  };
  it("counts references from other files, not from the file itself", () => {
    const r = referencesToFile(make(), "file:///w/vehicle.sysml");
    expect(r.files.map((f) => f.uri)).toEqual(["file:///w/system.sysml"]);
    expect(r.count).toBeGreaterThanOrEqual(1);
  });
  it("is zero for an unreferenced file", () => {
    expect(referencesToFile(make(), "file:///w/other.sysml").count).toBe(0);
  });
  it("words the confirmation", () => {
    const c = deleteFileConfirmation("file:///w/vehicle.sysml", { count: 1, files: [{ uri: "file:///w/system.sysml", count: 1 }] }, true);
    expect(c.message).toContain("vehicle.sysml");
    expect(c.detail).toContain("unsaved");
    expect(c.detail).toContain("1 reference in system.sysml will no longer resolve");
  });
});
