import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSettled } from "./read-settled.js";

const valid = readFileSync("test/fixtures/workspace-basic/ports-general.sysmld", "utf8");
describe("readSettled", () => {
  it("retries once after an empty read", async () => {
    const reads = ["", valid];
    expect(await readSettled(async () => reads.shift(), 1)).toBe(valid);
  });
  it("retries once after a partial read, then gives up", async () => {
    let n = 0;
    expect(await readSettled(async () => (n++, "{ not"), 1)).toBe("{ not");
    expect(n).toBe(2);
  });
  it("does not retry a valid file", async () => {
    let n = 0;
    await readSettled(async () => (n++, valid), 1);
    expect(n).toBe(1);
  });
});
