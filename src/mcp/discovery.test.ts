import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoveryFilePath, normaliseWorkspacePath, readLiveServer, removeDiscoveryFile, writeDiscoveryFile } from "./discovery.js";

const homes: string[] = [];
const home = () => {
  const h = mkdtempSync(path.join(tmpdir(), "sysml-disc-"));
  homes.push(h);
  return h;
};
afterEach(() => homes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true })));

describe("discovery paths", () => {
  it("normalises trailing separators and dot segments", () => {
    expect(normaliseWorkspacePath("/a/b/", "linux")).toBe("/a/b");
    expect(normaliseWorkspacePath("/a/b/../b/.", "linux")).toBe("/a/b");
    expect(normaliseWorkspacePath("/", "linux")).toBe("/");
  });
  it("folds case on Windows only", () => {
    expect(normaliseWorkspacePath("C:\\Work\\Proj\\", "win32")).toBe("c:\\work\\proj");
    expect(normaliseWorkspacePath("/A/b", "linux")).toBe("/A/b");
  });
  it("is a stable sha256-named file under ~/.sysml-editor/servers", () => {
    const f = discoveryFilePath("/a/b/", "/home/u", "linux");
    expect(f).toBe(discoveryFilePath("/a/b", "/home/u", "linux"));
    expect(f).toMatch(/^\/home\/u\/\.sysml-editor\/servers\/[0-9a-f]{64}\.json$/);
    expect(f).not.toBe(discoveryFilePath("/a/c", "/home/u", "linux"));
  });
});

describe("discovery file", () => {
  it("is written 0600 in a 0700 directory, read back, and removed", () => {
    const h = home();
    const ws = path.join(h, "ws");
    const file = writeDiscoveryFile({ port: 1234, token: "t", pid: process.pid, workspace: ws }, h);
    if (process.platform !== "win32") {
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    }
    expect(readLiveServer(ws, h)).toEqual({ port: 1234, token: "t", pid: process.pid, workspace: ws });
    removeDiscoveryFile(ws, h);
    expect(readLiveServer(ws, h)).toBeUndefined();
  });
  it("ignores a stale pid and malformed files", () => {
    const h = home();
    const ws = path.join(h, "ws");
    writeDiscoveryFile({ port: 1, token: "t", pid: 2 ** 22 + 12345, workspace: ws }, h);
    expect(readLiveServer(ws, h)).toBeUndefined();
    writeFileSync(discoveryFilePath(ws, h), "{nope");
    expect(readLiveServer(ws, h)).toBeUndefined();
  });
});

describe("several windows on one workspace", () => {
  // process.ppid is a live pid that is not this process: it stands in for another VS Code window.
  const other = process.ppid;
  it("does not overwrite a live foreign entry and the bridge still finds one after either stops", () => {
    const h = home();
    const ws = path.join(h, "ws");
    const a = { port: 1, token: "A", pid: other, workspace: ws };
    const b = { port: 2, token: "B", pid: process.pid, workspace: ws };
    const fa = writeDiscoveryFile(a, h);
    const fb = writeDiscoveryFile(b, h);
    expect(fb).not.toBe(fa);
    expect(fb).toMatch(new RegExp(`\\.${process.pid}\\.json$`));
    expect(JSON.parse(readFileSync(fa, "utf8")).token).toBe("A");
    expect(readLiveServer(ws, h)).toBeDefined();

    removeDiscoveryFile(ws, h, { pid: process.pid, token: "B" });
    expect(readLiveServer(ws, h)?.token).toBe("A");
    writeDiscoveryFile(b, h);
    removeDiscoveryFile(ws, h, { pid: other, token: "A" });
    expect(readLiveServer(ws, h)?.token).toBe("B");
  });
  it("does not delete a file that now belongs to someone else", () => {
    const h = home();
    const ws = path.join(h, "ws");
    writeDiscoveryFile({ port: 1, token: "mine", pid: process.pid, workspace: ws }, h);
    writeDiscoveryFile({ port: 2, token: "theirs", pid: process.pid, workspace: ws }, h); // same pid: replaces
    removeDiscoveryFile(ws, h, { pid: process.pid, token: "mine" });
    expect(readLiveServer(ws, h)?.token).toBe("theirs");
  });
  it("prefers the newest live entry and cleans up dead ones", () => {
    const h = home();
    const ws = path.join(h, "ws");
    const dead = 2 ** 22 + 999;
    writeDiscoveryFile({ port: 1, token: "old", pid: other, workspace: ws }, h);
    const f = writeDiscoveryFile({ port: 3, token: "new", pid: process.pid, workspace: ws }, h);
    const future = new Date(Date.now() + 5000);
    utimesSync(f, future, future);
    writeFileSync(path.join(path.dirname(f), path.basename(f).replace(/\.\d+\.json$/, `.${dead}.json`)), JSON.stringify({ port: 9, token: "dead", pid: dead, workspace: ws }));
    expect(readLiveServer(ws, h)?.token).toBe("new");
    expect(readdirSync(path.dirname(f)).some((n) => n.includes(`.${dead}.`))).toBe(false);
  });
});

describe("atomic write and symlinks", () => {
  it("leaves no temp files behind", () => {
    const h = home();
    const file = writeDiscoveryFile({ port: 1, token: "t", pid: process.pid, workspace: path.join(h, "ws") }, h);
    expect(readdirSync(path.dirname(file)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect(existsSync(file)).toBe(true);
  });
  it("resolves symlinks so both names map to the same file", () => {
    const h = home();
    const real = path.join(h, "real");
    mkdirSync(real);
    const link = path.join(h, "link");
    symlinkSync(real, link);
    expect(normaliseWorkspacePath(link)).toBe(realpathSync.native(real));
    expect(discoveryFilePath(link, h)).toBe(discoveryFilePath(real, h));
  });
  it("falls back to the given path when it does not exist", () => {
    expect(normaliseWorkspacePath("/no/such/dir/")).toBe("/no/such/dir");
  });
});
