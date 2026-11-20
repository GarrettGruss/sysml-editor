/** Workspace file access for the DoDAF generator (node fs; no `vscode`). Paths use the same folder mapping as the diagram tools and must stay inside the workspace. */
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import * as path from "node:path";
import { realPathOf } from "../agent-tools/ui-support.js";
import { toolPathToFsPath, type FolderInfo } from "../agent-paths.js";
import type { DodafFiles } from "../agent-tools/types.js";
import { ToolError } from "../agent-tools/types.js";

const within = (root: string, p: string): boolean => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

export function workspaceFiles(folders: () => FolderInfo[], trusted: () => boolean): DodafFiles {
  const resolve = (rel: string): { abs: string; root: string; lex: string } => {
    const fs0 = folders();
    const outside = () => new ToolError(`Path "${rel.slice(0, 100)}" is not inside the workspace.`);
    if (rel.includes("\0") || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) throw outside();
    const abs = toolPathToFsPath(fs0, rel);
    if (abs === undefined) throw outside();
    const owner = fs0.find((f) => within(path.resolve(f.fsPath), abs));
    if (!owner) throw outside();
    const root = realPathOf(path.resolve(owner.fsPath));
    if (!within(root, realPathOf(abs))) throw outside();
    return { abs, root, lex: path.resolve(owner.fsPath) };
  };

  /** Creates the missing parents one at a time; every parent must be a real directory (not a link) inside `root`. */
  const ensureDir = async (dir: string, lex: string, root: string): Promise<void> => {
    let cur = lex;
    for (const part of path.relative(lex, dir).split(path.sep).filter(Boolean)) {
      cur = path.join(cur, part);
      let st = await fs.lstat(cur).catch(() => undefined);
      if (!st) {
        await fs.mkdir(cur).catch(() => undefined);
        st = await fs.lstat(cur).catch(() => undefined);
      }
      if (!st || st.isSymbolicLink() || !st.isDirectory() || !within(root, await fs.realpath(cur))) throw new ToolError(`"${path.relative(lex, cur).split(path.sep).join("/")}" is not a plain directory inside the workspace.`);
    }
  };

  const write = async (rel: string, data: string | Uint8Array): Promise<void> => {
    const { abs, root, lex } = resolve(rel);
    await ensureDir(path.dirname(abs), lex, root);
    // O_NOFOLLOW: a symbolic link at the target (even one planted after the checks) is not written through.
    const h = await fs.open(abs, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o666).catch((e: NodeJS.ErrnoException) => {
      throw new ToolError(e.code === "ELOOP" ? `"${rel}" is a symbolic link; it is not written through.` : `Cannot write "${rel}": ${e.code ?? "error"}.`);
    });
    try {
      await h.writeFile(data);
    } finally {
      await h.close();
    }
  };
  return {
    isTrusted: trusted,
    exists: (p) => fs.lstat(resolve(p).abs).then(() => true, () => false),
    writeText: (p, t) => write(p, t),
    writeBytes: (p, b) => write(p, b),
    readBytes: async (p) => new Uint8Array(await fs.readFile(resolve(p).abs)),
  };
}
