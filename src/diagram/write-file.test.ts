import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileExclusive, writeFileAtomic } from "./write-file.js";

let dir = "";
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "sysmld-write-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const enc = (s: string) => new TextEncoder().encode(s);

describe("writeFileAtomic", () => {
  it("writes complete content and leaves no temp files", async () => {
    const f = path.join(dir, "a.sysmld");
    writeFileSync(f, "old old old old");
    await writeFileAtomic(f, enc('{"a":1}'));
    expect(readFileSync(f, "utf8")).toBe('{"a":1}');
    expect(readdirSync(dir)).toEqual(["a.sysmld"]);
  });

  it("never exposes an empty or unparseable file to a polling reader", async () => {
    const f = path.join(dir, "a.sysmld");
    await writeFileAtomic(f, enc("{}"));
    let done = false;
    let bad = 0;
    let reads = 0;
    const reader = (async () => {
      while (!done) {
        try { JSON.parse(readFileSync(f, "utf8")); } catch { bad++; }
        reads++;
        await new Promise((r) => setImmediate(r));
      }
    })();
    for (let i = 0; i < 300; i++) await writeFileAtomic(f, enc(JSON.stringify({ i, pad: "x".repeat(20000) })));
    done = true;
    await reader;
    expect(reads).toBeGreaterThan(0);
    expect(bad).toBe(0);
    expect(readdirSync(dir)).toEqual(["a.sysmld"]);
  });

  it("cleans up the temp file when the rename fails", async () => {
    await expect(writeFileAtomic(path.join(dir, "missing", "a.sysmld"), enc("x"))).rejects.toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("createFileExclusive", () => {
  it("creates a file and refuses to overwrite", async () => {
    const f = path.join(dir, "n.sysmld");
    await createFileExclusive(f, enc("one"));
    await expect(createFileExclusive(f, enc("two"))).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(f, "utf8")).toBe("one");
    expect(readdirSync(dir)).toEqual(["n.sysmld"]);
  });
});
