import { describe, expect, it } from "vitest";
import { inBatches } from "./chunked.js";

describe("inBatches", () => {
  it("processes in order in fixed-size batches and yields between them", async () => {
    const log: string[] = [];
    await inBatches([1, 2, 3, 4, 5], 2, (b) => void log.push(b.join("")), { yieldFn: async () => void log.push("y") });
    expect(log).toEqual(["12", "y", "34", "y", "5", "y"]);
  });
  it("stops when cancelled", async () => {
    let n = 0;
    await inBatches([1, 2, 3, 4], 1, () => void n++, { yieldFn: async () => {}, cancelled: () => n >= 2 });
    expect(n).toBe(2);
  });
});
