import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { fsPathToToolPath, toolPathToFsPath, type FolderInfo } from "./agent-paths.js";

const folders: FolderInfo[] = [
  { name: "main", fsPath: "/w/main" },
  { name: "lib", fsPath: "/w/lib" },
];
const posix = path.posix as typeof path;

describe("agent path mapping", () => {
  it("keeps first-folder paths relative and prefixes other folders", () => {
    expect(fsPathToToolPath(folders, "/w/main/a/b.sysml", posix)).toBe("a/b.sysml");
    expect(fsPathToToolPath(folders, "/w/lib/c.sysml", posix)).toBe("lib/c.sysml");
  });
  it("rejects paths outside every folder and the folder itself", () => {
    expect(fsPathToToolPath(folders, "/w/other/x.sysml", posix)).toBeUndefined();
    expect(fsPathToToolPath(folders, "/w/main", posix)).toBeUndefined();
    expect(fsPathToToolPath(folders, "/w/main/../x.sysml", posix)).toBeUndefined();
  });
  it("accepts a file whose name starts with two dots", () => {
    expect(fsPathToToolPath(folders, "/w/main/..foo.sysml", posix)).toBe("..foo.sysml");
    expect(toolPathToFsPath(folders, "..foo.sysml", posix)).toBe("/w/main/..foo.sysml");
  });
  it("maps back and rejects escapes", () => {
    expect(toolPathToFsPath(folders, "a/b.sysml", posix)).toBe("/w/main/a/b.sysml");
    expect(toolPathToFsPath(folders, "lib/c.sysml", posix)).toBe("/w/lib/c.sysml");
    expect(toolPathToFsPath(folders, "../x.sysml", posix)).toBeUndefined();
    expect(toolPathToFsPath(folders, "lib/../../x.sysml", posix)).toBeUndefined();
    expect(toolPathToFsPath([], "a", posix)).toBeUndefined();
  });
});
