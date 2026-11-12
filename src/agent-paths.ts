/**
 * Mapping between file system paths and the workspace-relative paths agents see. Free of `vscode`.
 * Files in the first workspace folder keep their plain relative path; files in other folders are prefixed with
 * the folder name: `<folderName>/<relative path>`.
 */
import * as nodePath from "node:path";

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
