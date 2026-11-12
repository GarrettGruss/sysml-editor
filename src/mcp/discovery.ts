/**
 * Discovery files let clients outside VS Code (the stdio bridge) find the MCP server the extension hosts.
 * One file per workspace folder: `~/.sysml-editor/servers/<sha256 of the normalised folder path>.json`,
 * mode 0600 in a 0700 directory. Free of `vscode` so the extension and the bridge share it.
 */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const p = (platform === "win32" ? path.win32 : path.posix).resolve(dir);
  const root = (platform === "win32" ? path.win32 : path.posix).parse(p).root;
  const trimmed = p.length > root.length ? p.replace(/[\\/]+$/, "") : p;
  return platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

export function serversDir(home: string = homedir()): string {
  return path.join(home, ".sysml-editor", "servers");
}

export function discoveryFilePath(workspace: string, home: string = homedir(), platform: NodeJS.Platform = process.platform): string {
  const hash = createHash("sha256").update(normaliseWorkspacePath(workspace, platform)).digest("hex");
  return path.join(serversDir(home), `${hash}.json`);
}

export function writeDiscoveryFile(info: ServerInfo, home: string = homedir()): string {
  const file = discoveryFilePath(info.workspace, home);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    chmodSync(path.dirname(file), 0o700);
  } catch {
    /* best effort (Windows) */
  }
  writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
  try {
    chmodSync(file, 0o600); // writeFileSync's mode only applies to new files
  } catch {
    /* best effort */
  }
  return file;
}

export function removeDiscoveryFile(workspace: string, home: string = homedir()): void {
  rmSync(discoveryFilePath(workspace, home), { force: true });
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The live server for a workspace, or undefined if there is no file, it is malformed, or its process is gone. */
export function readLiveServer(workspace: string, home: string = homedir()): ServerInfo | undefined {
  try {
    const v = JSON.parse(readFileSync(discoveryFilePath(workspace, home), "utf8")) as Partial<ServerInfo>;
    if (typeof v.port !== "number" || typeof v.token !== "string" || typeof v.pid !== "number") return undefined;
    if (!isPidAlive(v.pid)) return undefined;
    return { port: v.port, token: v.token, pid: v.pid, workspace: String(v.workspace ?? workspace) };
  } catch {
    return undefined;
  }
}
