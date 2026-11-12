/**
 * Discovery files let clients outside VS Code (the stdio bridge) find the MCP server the extension hosts.
 * One file per workspace folder: `~/.sysml-editor/servers/<sha256 of the normalised folder path>.json`,
 * mode 0600 in a 0700 directory. Free of `vscode` so the extension and the bridge share it.
 */
import { createHash } from "node:crypto";
import { chmodSync, closeSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

export interface ServerInfo {
  port: number;
  token: string;
  pid: number;
  workspace: string;
}

/** Absolute path without trailing separator; case-folded on Windows, where paths are case-insensitive. */
export function normaliseWorkspacePath(dir: string, platform: NodeJS.Platform = process.platform): string {
  let resolved = dir;
  if (platform === process.platform) {
    try {
      resolved = realpathSync.native(dir); // resolve symlinks so extension and bridge agree
    } catch {
      /* does not exist: use the path as given */
    }
  }
  const p = (platform === "win32" ? path.win32 : path.posix).resolve(resolved);
  const root = (platform === "win32" ? path.win32 : path.posix).parse(p).root;
  const trimmed = p.length > root.length ? p.replace(/[\\/]+$/, "") : p;
  return platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

export function serversDir(home: string = homedir()): string {
  return path.join(home, ".sysml-editor", "servers");
}

function workspaceHash(workspace: string, platform: NodeJS.Platform = process.platform): string {
  return createHash("sha256").update(normaliseWorkspacePath(workspace, platform)).digest("hex");
}

/** The primary discovery file of a workspace. Further servers on the same workspace use `<hash>.<pid>.json`. */
export function discoveryFilePath(workspace: string, home: string = homedir(), platform: NodeJS.Platform = process.platform): string {
  return path.join(serversDir(home), `${workspaceHash(workspace, platform)}.json`);
}

function perProcessFilePath(workspace: string, pid: number, home: string): string {
  return path.join(serversDir(home), `${workspaceHash(workspace)}.${pid}.json`);
}

function parseInfo(file: string): ServerInfo | undefined {
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as Partial<ServerInfo>;
    if (typeof v.port !== "number" || typeof v.token !== "string" || typeof v.pid !== "number") return undefined;
    return { port: v.port, token: v.token, pid: v.pid, workspace: String(v.workspace ?? "") };
  } catch {
    return undefined;
  }
}

/** Every discovery file for a workspace (primary and per-process), whatever its content. */
function entryFiles(workspace: string, home: string): string[] {
  const hash = workspaceHash(workspace);
  const re = new RegExp(`^${hash}(\\.\\d+)?\\.json$`);
  try {
    return readdirSync(serversDir(home)).filter((f) => re.test(f)).map((f) => path.join(serversDir(home), f));
  } catch {
    return [];
  }
}

/** Atomic write: a 0600 temp file in the same directory, then rename. */
function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/**
 * Publish a server. If the primary file belongs to another live process (another window on the same workspace),
 * it is left alone and a per-process file is written instead. Returns the file written.
 */
export function writeDiscoveryFile(info: ServerInfo, home: string = homedir()): string {
  const primary = discoveryFilePath(info.workspace, home);
  mkdirSync(path.dirname(primary), { recursive: true, mode: 0o700 });
  try {
    chmodSync(path.dirname(primary), 0o700);
  } catch {
    /* best effort (Windows) */
  }
  const existing = parseInfo(primary);
  const taken = existing !== undefined && existing.pid !== info.pid && isPidAlive(existing.pid);
  const file = taken ? perProcessFilePath(info.workspace, info.pid, home) : primary;
  writeAtomic(file, JSON.stringify(info));
  return file;
}

/** Remove this server's entries. Only files whose pid and token match are deleted (never another window's). */
export function removeDiscoveryFile(workspace: string, home: string = homedir(), match?: { pid: number; token: string }): void {
  for (const f of entryFiles(workspace, home)) {
    const v = parseInfo(f);
    if (match === undefined || (v !== undefined && v.pid === match.pid && v.token === match.token)) rmSync(f, { force: true });
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * A live server for a workspace: the newest entry whose process is alive. Entries that are malformed or whose
 * process is gone are deleted. Undefined if none.
 */
export function readLiveServer(workspace: string, home: string = homedir()): ServerInfo | undefined {
  let best: { info: ServerInfo; mtime: number } | undefined;
  for (const f of entryFiles(workspace, home)) {
    const v = parseInfo(f);
    if (v === undefined || !isPidAlive(v.pid)) {
      rmSync(f, { force: true });
      continue;
    }
    let mtime = 0;
    try {
      mtime = statSync(f).mtimeMs;
    } catch {
      continue;
    }
    if (!best || mtime > best.mtime) best = { info: { ...v, workspace: v.workspace || workspace }, mtime };
  }
  return best?.info;
}
