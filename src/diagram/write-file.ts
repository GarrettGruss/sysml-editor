// Atomic file writes for diagram files: a reader never sees an empty or partial file, and a crash mid-write cannot corrupt the target.
// Core is vscode-free (path and bytes). Temp files are named `.<base>.<pid>.<random>.tmp`, which never matches `*.sysmld`.
import { randomBytes } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import * as path from "node:path";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function writeTemp(target: string, bytes: Uint8Array): Promise<string> {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const h = await fs.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666);
  try {
    await h.writeFile(bytes);
    await h.sync();
  } catch (e) {
    await h.close().catch(() => {});
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  await h.close();
  return tmp;
}

/** Replaces `target` (or creates it) atomically. On Windows a rename over a file that is open can fail: retried, then written directly. */
export async function writeFileAtomic(target: string, bytes: Uint8Array): Promise<void> {
  const tmp = await writeTemp(target, bytes);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, target);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if ((code === "EPERM" || code === "EBUSY" || code === "EACCES") && process.platform === "win32") {
          if (attempt < 5) {
            await wait(20 * (attempt + 1));
            continue;
          }
          await fs.writeFile(target, bytes);
          return;
        }
        throw e;
      }
    }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

/** Creates `target` with complete content, never replacing an existing entry (throws EEXIST). */
export async function createFileExclusive(target: string, bytes: Uint8Array): Promise<void> {
  const tmp = await writeTemp(target, bytes);
  try {
    try {
      await fs.link(tmp, target); // atomic, fails with EEXIST rather than replacing
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EEXIST" || code === "ENOENT") throw e;
      await fs.writeFile(target, bytes, { flag: "wx" }); // no hard links on this file system
    }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
