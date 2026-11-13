import { describe, expect, it } from "vitest";
import { effectiveName, newEntryTarget, validateName, withPlaceholder } from "./new-entry.js";
import type { ModelNode } from "./tree-model.js";

const roots = [{ uri: "file:///w" }, { uri: "file:///x" }];
const folder = (uri: string): ModelNode => ({ id: uri, uri, kind: "folder" });
const file = (uri: string): ModelNode => ({ id: uri, uri, kind: "file" });

describe("newEntryTarget", () => {
  it("uses the selected folder", () => expect(newEntryTarget(roots, [folder("file:///w/a")])).toBe("file:///w/a"));
  it("uses the folder of a selected file", () => expect(newEntryTarget(roots, [file("file:///w/a/b.sysml")])).toBe("file:///w/a"));
  it("uses the folder of a selected element", () => expect(newEntryTarget(roots, [{ id: "file:///w/a/b.sysml|part:p", uri: "file:///w/a/b.sysml" }])).toBe("file:///w/a"));
  it("falls back to the first workspace folder", () => {
    expect(newEntryTarget(roots, [])).toBe("file:///w");
    expect(newEntryTarget([], [])).toBeUndefined();
  });
});

describe("names", () => {
  it("appends .sysml to files only", () => {
    expect(effectiveName("file", "engine")).toBe("engine.sysml");
    expect(effectiveName("file", "engine.SYSML")).toBe("engine.SYSML");
    expect(effectiveName("folder", "engine")).toBe("engine");
    expect(effectiveName("file", "")).toBe("untitled.sysml");
    expect(effectiveName("folder", " ")).toBe("New Folder");
  });
  it("rejects duplicates and invalid characters", () => {
    expect(validateName("file", "engine", ["engine.sysml"])?.severity).toBe("error");
    expect(validateName("folder", "A", ["a"])?.severity).toBe("error");
    expect(validateName("file", "a/b", [])?.severity).toBe("error");
    expect(validateName("folder", "..", [])?.severity).toBe("error");
  });
  it("says when .sysml is appended", () => {
    expect(validateName("file", "engine", [])).toEqual({ severity: "info", message: "Will be created as engine.sysml." });
    expect(validateName("file", "engine.sysml", [])).toBeUndefined();
    expect(validateName("file", "", [])).toBeUndefined();
  });
});

describe("withPlaceholder", () => {
  const kids = [folder("f1"), folder("f2"), file("a.sysml")];
  it("goes before the folders for a folder", () => expect(withPlaceholder(kids, "p", "folder").map((k) => k.id)).toEqual(["!new-entry", "f1", "f2", "a.sysml"]));
  it("goes before the files for a file", () => expect(withPlaceholder(kids, "p", "file").map((k) => k.id)).toEqual(["f1", "f2", "!new-entry", "a.sysml"]));
  it("goes last without files", () => expect(withPlaceholder([folder("f1")], "p", "file").map((k) => k.id)).toEqual(["f1", "!new-entry"]));
});
