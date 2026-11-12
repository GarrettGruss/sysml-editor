/**
 * Mapping between file system paths and the workspace-relative paths agents see. Free of `vscode`.
 * Files in the first workspace folder keep their plain relative path; files in other folders are prefixed with
 * the folder name: `<folderName>/<relative path>`.
 */
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { ToolError } from "./agent-tools/types.js";

export interface FolderInfo {
  name: string;
  fsPath: string;
}

/** Path of `fsPath` relative to `root` with forward slashes, or undefined if it is the root or outside it. */
function inside(root: string, fsPath: string, p: typeof nodePath): string | undefined {
  const rel = p.relative(root, fsPath);
  if (rel === "" || rel === ".." || rel.startsWith(".." + p.sep) || p.isAbsolute(rel)) return undefined;
  return rel.split(p.sep).join("/");
}

export function fsPathToToolPath(folders: readonly FolderInfo[], fsPath: string, p: typeof nodePath = nodePath): string | undefined {
  for (let i = 0; i < folders.length; i++) {
    const rel = inside(folders[i]!.fsPath, fsPath, p);
    if (rel !== undefined) return i === 0 ? rel : `${folders[i]!.name}/${rel}`;
  }
  return undefined;
}

/** Inverse of {@link fsPathToToolPath}; undefined for paths that would escape their folder. */
export function toolPathToFsPath(folders: readonly FolderInfo[], toolPath: string, p: typeof nodePath = nodePath): string | undefined {
  const tryFolder = (f: FolderInfo, rel: string): string | undefined => {
    const full = p.resolve(f.fsPath, ...rel.split("/"));
    return inside(f.fsPath, full, p) === undefined ? undefined : full;
  };
  for (let i = 1; i < folders.length; i++) {
    const prefix = folders[i]!.name + "/";
    if (toolPath.startsWith(prefix)) return tryFolder(folders[i]!, toolPath.slice(prefix.length));
  }
  return folders[0] && tryFolder(folders[0], toolPath);
}

const realOf = async (p: string): Promise<string | undefined> => fs.realpath(p).catch(() => undefined);

/**
 * The checked path for a tool path: inside a workspace folder by its real path (symlinks followed), not excluded
 * by `isExcluded` (given the path relative to its folder), and not a dangling symlink. The real path of the deepest existing ancestor
 * of the target (the target itself when it exists) must lie inside the real path of a workspace folder.
 * Throws `ToolError`. Returns the lexical file system path.
 */
export async function resolveToolPath(
  folders: readonly FolderInfo[],
  toolPath: string,
  isExcluded: (relPath: string) => boolean = () => false,
  p: typeof nodePath = nodePath,
): Promise<string> {
  const fsPath = toolPathToFsPath(folders, toolPath, p);
  if (fsPath === undefined) throw new ToolError(`"${toolPath}" is outside the workspace. Diagram paths are relative to the workspace root.`);
  // The predicate sees the path relative to its folder, as the diagram file index does.
  const rel = folders.map((f) => inside(f.fsPath, fsPath, p)).find((r) => r !== undefined);
  if (rel !== undefined && isExcluded(rel)) throw new ToolError(`"${toolPath}" is excluded by sysml.exclude or files.exclude, so agents cannot access it.`);
  let existing = fsPath;
  let real: string | undefined;
  for (;;) {
    real = await realOf(existing);
    if (real !== undefined) break;
    // A symlink whose target is missing: never read or written through.
    if (await fs.lstat(existing).then(() => true, () => false)) throw new ToolError(`"${toolPath}" is a broken symbolic link and is not used.`);
    const parent = p.dirname(existing);
    if (parent === existing) throw new ToolError(`"${toolPath}" is outside the workspace.`);
    existing = parent;
  }
  for (const f of folders) {
    const root = await realOf(f.fsPath);
    if (root !== undefined && (real === root || inside(root, real, p) !== undefined)) return fsPath;
  }
  throw new ToolError(`"${toolPath}" resolves outside the workspace through a symbolic link.`);
}

/** Whether anything exists at the path, not following symlinks (a dangling symlink counts). */
export const entryExists = (fsPath: string): Promise<boolean> => fs.lstat(fsPath).then(() => true, () => false);
