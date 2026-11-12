import { describe, expect, it } from "vitest";
import { isFileGone } from "./file-gone";

describe("isFileGone", () => {
  it("recognises a removed file", () => {
    expect(isFileGone(Object.assign(new Error("x"), { code: "ENOENT" }))).toBe(true);
    expect(isFileGone(Object.assign(new Error("Unable to read file '/a/tmp-edit.sysmld' (Error: ENOENT: no such file)"), { code: "Unknown" }))).toBe(true);
    expect(isFileGone(Object.assign(new Error("file not found"), { code: "FileNotFound", name: "EntryNotFound (FileSystemError)" }))).toBe(true);
  });
  it("does not hide other failures", () => {
    expect(isFileGone(new Error("EACCES: permission denied"))).toBe(false);
    expect(isFileGone("ENOENT")).toBe(false);
    expect(isFileGone(undefined)).toBe(false);
  });
});
