/** Workspace file access for the DoDAF generator (node fs; no `vscode`). Every path is resolved with symlinks followed and must stay inside the workspace. */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { realPathOf } from "../agent-tools/ui-support.js";
import type { DodafFiles } from "../agent-tools/types.js";
import { ToolError } from "../agent-tools/types.js";

export function workspaceFiles(roots: () => string[], trusted: () => boolean): DodafFiles {
  const resolve = (rel: string): string => {
    const rs = roots();
    if (rs.length === 0 || rel.includes("\0") || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) throw new ToolError(`Path "${rel.slice(0, 100)}" is not inside the workspace.`);
    const abs = path.resolve(rs[0]!, rel);
    const within = path.relative(realPathOf(path.resolve(rs[0]!)), realPathOf(abs));
    if (within.startsWith("..") || path.isAbsolute(within)) throw new ToolError(`Path "${rel.slice(0, 100)}" leads outside the workspace.`);
    return abs;
  };
  const write = async (rel: string, data: string | Uint8Array): Promise<void> => {
    const abs = resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (await fs.lstat(abs).then((s) => s.isSymbolicLink(), () => false)) throw new ToolError(`"${rel}" is a symbolic link; it is not written through.`);
    await fs.writeFile(abs, data);
  };
  return {
    isTrusted: trusted,
    writeText: (p, t) => write(p, t),
    writeBytes: (p, b) => write(p, b),
    readBytes: async (p) => new Uint8Array(await fs.readFile(resolve(p))),
  };
}
