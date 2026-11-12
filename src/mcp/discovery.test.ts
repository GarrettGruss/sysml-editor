import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
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
