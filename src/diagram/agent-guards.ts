/** vscode-free guards for the agent diagram service: the render queue, the image size cap and the changed-on-disk check. */
import { ToolError } from "../agent-tools/types.js";

export const TOO_MANY_PENDING = "too many pending image requests";
export const IMAGE_TOO_LARGE = "image too large";
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_PENDING_RENDERS = 8;

/** Runs jobs one at a time. At most `maxWaiting` jobs may wait behind the running one; more are rejected. */
export class RenderQueue {
  private running = false;
  private waiting: (() => void)[] = [];

  constructor(private readonly maxWaiting = MAX_PENDING_RENDERS) {}

  get pending(): number {
    return this.waiting.length;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running) {
      if (this.waiting.length >= this.maxWaiting) throw new Error(TOO_MANY_PENDING);
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running = true;
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // stays "running": the next job starts on its own turn
      else this.running = false;
    }
  }
}

/** Width in px from a base64 PNG header, or undefined. */
export function pngWidth(base64: string): number | undefined {
  const head = Buffer.from(base64.slice(0, 40), "base64");
  return head.length >= 24 && head.readUInt32BE(12) === 0x49484452 ? head.readUInt32BE(16) : undefined;
}

const byteLength = (base64: string) => Math.floor((base64.length * 3) / 4);

/**
 * Export at the default width; while the PNG exceeds `cap`, re-export at half the width until it fits or the image is
 * narrower than 400 px. Throws "image too large" when it still does not fit.
 */
export async function exportWithinLimit(exportAt: (maxWidth: number) => Promise<string>, cap = MAX_IMAGE_BYTES, startWidth = 1600): Promise<string> {
  let width = startWidth;
  let b64 = await exportAt(width);
  while (byteLength(b64) > cap) {
    const actual = pngWidth(b64) ?? width;
    if (actual < 400) throw new Error(IMAGE_TOO_LARGE);
    width = Math.floor(Math.min(width, actual) / 2);
    b64 = await exportAt(width);
  }
  return b64;
}

export interface FileIo {
  read(): Promise<string>;
  write(text: string): Promise<void>;
}

/**
 * Write `text` to a closed diagram: fails when the file no longer holds `before`, and yields to the open editor
 * (returns "open") when a tab opened it in the meantime.
 */
export async function writeIfUnchanged(io: FileIo, before: string, text: string, isOpen: () => boolean): Promise<"written" | "open"> {
  let now: string;
  try {
    now = await io.read();
  } catch {
    throw new ToolError("the diagram changed on disk; read it again");
  }
  if (now !== before) throw new ToolError("the diagram changed on disk; read it again");
  if (isOpen()) return "open";
  await io.write(text);
  return "written";
}
