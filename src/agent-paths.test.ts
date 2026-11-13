import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { makeIndexFilter } from "./workspace/exclude.js";
import { entryExists, fsPathToToolPath, resolveToolPath, toolPathToFsPath, type FolderInfo } from "./agent-paths.js";

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

describe("resolveToolPath (real paths)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sysml-paths-"));
  const ws = path.join(tmp, "ws");
  const outside = path.join(tmp, "outside");
  fs.mkdirSync(path.join(ws, "real"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "secret.sysmld"), "{}");
  fs.writeFileSync(path.join(ws, "real", "ok.sysmld"), "{}");
  fs.symlinkSync(outside, path.join(ws, "linkdir"));
  fs.symlinkSync(path.join(outside, "secret.sysmld"), path.join(ws, "linkfile.sysmld"));
  fs.symlinkSync(path.join(outside, "missing.sysmld"), path.join(ws, "dangling.sysmld"));
  fs.symlinkSync(path.join(ws, "real"), path.join(ws, "inner"));
  const fl: FolderInfo[] = [{ name: "ws", fsPath: ws }];
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("accepts files, new files and symlinks that stay inside", async () => {
    expect(await resolveToolPath(fl, "real/ok.sysmld")).toBe(path.join(ws, "real", "ok.sysmld"));
    expect(await resolveToolPath(fl, "real/new/deep.sysmld")).toBe(path.join(ws, "real", "new", "deep.sysmld"));
    expect(await resolveToolPath(fl, "inner/ok.sysmld")).toBe(path.join(ws, "inner", "ok.sysmld"));
  });
  it("rejects a folder symlink that points outside, for existing and new files", async () => {
    await expect(resolveToolPath(fl, "linkdir/secret.sysmld")).rejects.toThrow(/symbolic link/);
    await expect(resolveToolPath(fl, "linkdir/new.sysmld")).rejects.toThrow(/symbolic link/);
    await expect(resolveToolPath(fl, "linkdir/a/b/new.sysmld")).rejects.toThrow(/symbolic link/);
  });
  it("rejects a file symlink that points outside", async () => {
    await expect(resolveToolPath(fl, "linkfile.sysmld")).rejects.toThrow(/symbolic link/);
  });
  it("rejects a dangling symlink at the target name, and entryExists sees it", async () => {
    await expect(resolveToolPath(fl, "dangling.sysmld")).rejects.toThrow(/broken symbolic link/);
    expect(await entryExists(path.join(ws, "dangling.sysmld"))).toBe(true);
    expect(await entryExists(path.join(ws, "nothing.sysmld"))).toBe(false);
  });
  it("rejects excluded paths with a clear error", async () => {
    const ex = makeIndexFilter(["**/node_modules/**"], { "**/hidden": true });
    await expect(resolveToolPath(fl, "node_modules/x/a.sysmld", ex)).rejects.toThrow(/excluded by sysml.exclude or files.exclude/);
    await expect(resolveToolPath(fl, "hidden/a.sysmld", ex)).rejects.toThrow(/excluded/);
    expect(await resolveToolPath(fl, "real/ok.sysmld", ex)).toBe(path.join(ws, "real", "ok.sysmld"));
  });
});
