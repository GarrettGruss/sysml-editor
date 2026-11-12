import { describe, expect, it } from "vitest";
import { ToolError } from "../agent-tools/types.js";
import { exportWithinLimit, pngWidth, RenderQueue, TOO_MANY_PENDING, writeIfUnchanged } from "./agent-guards.js";

const png = (w: number, bytes: number): string => {
  const b = Buffer.alloc(Math.max(24, bytes));
  b.writeUInt32BE(0x49484452, 12);
  b.writeUInt32BE(w, 16);
  return b.toString("base64");
};

describe("RenderQueue", () => {
  it("runs one job at a time, in order, and rejects beyond the waiting bound", async () => {
    const q = new RenderQueue(2);
    let active = 0, maxActive = 0;
    const order: number[] = [];
    const gates: (() => void)[] = [];
    const job = (n: number) => () => new Promise<number>((res) => {
      active++; maxActive = Math.max(maxActive, active); order.push(n);
      gates.push(() => { active--; res(n); });
    });
    const p = [q.run(job(1)), q.run(job(2)), q.run(job(3))];
    await expect(q.run(job(4))).rejects.toThrow(TOO_MANY_PENDING);
    expect(q.pending).toBe(2);
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 0)); gates[i]!(); }
    expect(await Promise.all(p)).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
    expect(await q.run(async () => 5)).toBe(5);
  });
  it("keeps going after a failing job", async () => {
    const q = new RenderQueue(2);
    const a = q.run(async () => { throw new Error("x"); });
    const b = q.run(async () => 2);
    await expect(a).rejects.toThrow("x");
    expect(await b).toBe(2);
  });
});

describe("exportWithinLimit", () => {
  const cap = 1000;
  it("returns the first export when it fits", async () => {
    const widths: number[] = [];
    const r = await exportWithinLimit(async (w) => { widths.push(w); return png(w, 500); }, cap);
    expect(pngWidth(r)).toBe(1600);
    expect(widths).toEqual([1600]);
  });
  it("halves the width until it fits", async () => {
    const widths: number[] = [];
    const r = await exportWithinLimit(async (w) => { widths.push(w); return png(w, w); }, cap);
    expect(widths).toEqual([1600, 800]);
    expect(pngWidth(r)).toBe(800);
  });
  it("gives up below 400 px", async () => {
    const widths: number[] = [];
    await expect(exportWithinLimit(async (w) => { widths.push(w); return png(w, 5000); }, cap)).rejects.toThrow("image too large");
    expect(widths).toEqual([1600, 800, 400, 200]);
  });
});

describe("writeIfUnchanged", () => {
  const io = (cur: string, log: string[]) => ({ read: async () => cur, write: async (t: string) => { log.push(t); } });
  it("writes when unchanged", async () => {
    const log: string[] = [];
    expect(await writeIfUnchanged(io("a", log), "a", "b", () => false)).toBe("written");
    expect(log).toEqual(["b"]);
  });
  it("fails when the file changed", async () => {
    const log: string[] = [];
    await expect(writeIfUnchanged(io("z", log), "a", "b", () => false)).rejects.toThrow(ToolError);
    await expect(writeIfUnchanged(io("z", log), "a", "b", () => false)).rejects.toThrow("changed on disk; read it again");
    expect(log).toEqual([]);
  });
  it("yields to an editor that opened it meanwhile", async () => {
    const log: string[] = [];
    expect(await writeIfUnchanged(io("a", log), "a", "b", () => true)).toBe("open");
    expect(log).toEqual([]);
  });
});
