import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ModelIndex, loadLibrary } from "../model/index.js";
import { findUnresolvedNames } from "./unresolved.js";

const release = resolve(__dirname, "../../fixtures/sysml-v2-release");
const src = join(release, "sysml/src");
const libDir = join(release, "sysml.library");
const have = existsSync(src) && existsSync(libDir);
if (!have) console.warn("fixtures/sysml-v2-release is missing: unresolved-name measurement is skipped");

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (n.endsWith(".sysml")) out.push(p);
  }
  return out;
}

function measure(dirs: string[]) {
  const ix = new ModelIndex();
  loadLibrary(ix, libDir);
  const uris: string[] = [];
  for (const d of dirs)
    for (const f of files(d)) {
      const uri = "file://" + f;
      uris.push(uri);
      ix.setDocument(uri, readFileSync(f, "utf8"));
    }
  const hits = uris.flatMap((u) => findUnresolvedNames(ix, u).map((h) => ({ ...h, file: u.slice(src.length + 7) })));
  return { ix, hits, uris };
}

describe.skipIf(!have)("unresolved-name false positives on the official models", () => {
  it("reports none", () => {
    const dirs = readdirSync(src).map((d) => join(src, d)).filter((d) => statSync(d).isDirectory());
    const all: ReturnType<typeof measure>["hits"] = [];
    for (const d of dirs) all.push(...measure([d]).hits);
    if (process.env.FP_REPORT) for (const h of all) console.log(`FP ${h.file}:${h.line + 1}:${h.column + 1} ${h.message}`);
    expect(all.length).toBe(0);
  }, 300_000);
});
