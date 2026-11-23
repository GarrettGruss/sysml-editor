import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoveryFilePath, normaliseWorkspacePath, listLiveServers, readLiveServer, removeDiscoveryFile, resolveServer, writeDiscoveryFile } from "./discovery.js";

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

describe("resolveServer", () => {
  const dead = 2 ** 22 + 12345;
  const add = (h: string, ws: string, token: string, pid = process.pid) => writeDiscoveryFile({ port: 1, token, pid, workspace: ws }, h);
  const tok = (r: ReturnType<typeof resolveServer>) => ("server" in r ? r.server.token : r.error);

  it("exact --workspace match wins", () => {
    const h = home();
    add(h, "/w/a", "a");
    add(h, "/w/a/b", "b");
    expect(tok(resolveServer({ workspace: "/w/a/b", cwd: "/", home: h }))).toBe("b");
  });
  it("uses cwd when --workspace is absent, matching a containing workspace", () => {
    const h = home();
    add(h, "/w/a", "a");
    add(h, "/w/z", "z");
    expect(tok(resolveServer({ cwd: "/w/a/src/deep", home: h }))).toBe("a");
  });
  it("matches a workspace contained by the target", () => {
    const h = home();
    add(h, "/w/a/sub", "sub");
    add(h, "/other", "o");
    expect(tok(resolveServer({ workspace: "/w/a", cwd: "/", home: h }))).toBe("sub");
  });
  it("prefers the closest match", () => {
    const h = home();
    add(h, "/w", "outer");
    add(h, "/w/a", "inner");
    expect(tok(resolveServer({ cwd: "/w/a/x", home: h }))).toBe("inner");
  });
  it("breaks ties by newest mtime", () => {
    const h = home();
    const f1 = add(h, "/w/a", "old");
    const f2 = writeDiscoveryFile({ port: 1, token: "new", pid: process.pid, workspace: "/w/a" }, h);
    utimesSync(f1, new Date(Date.now() - 5000), new Date(Date.now() - 5000));
    expect(f2).toBe(f1); // same pid overwrites the primary; add a second entry for a real tie
    const other = path.join(path.dirname(f1), `${path.basename(f1, ".json")}.${process.pid + 1}.json`);
    writeFileSync(other, JSON.stringify({ port: 1, token: "newer", pid: process.pid, workspace: "/w/a" }));
    utimesSync(f1, new Date(Date.now() - 5000), new Date(Date.now() - 5000));
    expect(tok(resolveServer({ cwd: "/w/a", home: h }))).toBe("newer");
  });
  it("respects separators: /a/b does not contain /a/bc", () => {
    const h = home();
    add(h, "/a/b", "ab");
    add(h, "/q", "q");
    expect(resolveServer({ cwd: "/a/bc", home: h })).toMatchObject({ error: "ambiguous" });
  });
  it("falls back to the only live server", () => {
    const h = home();
    add(h, "/elsewhere", "only");
    expect(tok(resolveServer({ cwd: "/unrelated", home: h }))).toBe("only");
  });
  it("lists workspaces when several are live and none match", () => {
    const h = home();
    add(h, "/x", "x");
    add(h, "/y", "y");
    const r = resolveServer({ cwd: "/unrelated", home: h });
    expect(r).toMatchObject({ error: "ambiguous" });
    expect("workspaces" in r && r.workspaces.sort()).toEqual(["/x", "/y"]);
  });
  it("reports none when no server is live", () => {
    const h = home();
    add(h, "/x", "x", dead);
    expect(resolveServer({ cwd: "/x", home: h })).toEqual({ error: "none" });
    expect(resolveServer({ cwd: "/x", home: home() })).toEqual({ error: "none" });
  });
});

describe("listLiveServers cleanup", () => {
  it("deletes malformed and dead-pid files for all workspaces and keeps live ones", () => {
    const h = home();
    const dead = 2 ** 22 + 12345;
    const live = writeDiscoveryFile({ port: 1, token: "l", pid: process.pid, workspace: "/live" }, h);
    const d = writeDiscoveryFile({ port: 1, token: "d", pid: dead, workspace: "/dead" }, h);
    const bad = path.join(path.dirname(live), "f".repeat(64) + ".json");
    writeFileSync(bad, "{not json");
    expect(listLiveServers(h).map((s) => s.token)).toEqual(["l"]);
    expect(existsSync(d)).toBe(false);
    expect(existsSync(bad)).toBe(false);
    expect(existsSync(live)).toBe(true);
  });
});
