// Fast-path hit rate of the main thread (snapshot DFAs, SLL then LL) on the held-out snippets and
// on the integration-test fixtures. Usage: npx tsx scripts/dfa-training/measure.ts
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tryFastParse } from "../../src/parser/parse.js";

const dir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const stage = (t: string): "SLL" | "LL" | "fallback" => (tryFastParse(t).ok ? "SLL" : tryFastParse(t, { ll: true }).ok ? "LL" : "fallback");
const sets: [string, string[]][] = [
  ["held-out", JSON.parse(readFileSync(join(dir, "heldout-snippets.json"), "utf8"))],
  ["training", JSON.parse(readFileSync(join(dir, "training-snippets.json"), "utf8"))],
];
for (const [name, xs] of sets) {
  const c = { SLL: 0, LL: 0, fallback: 0 };
  for (const t of xs) c[stage(t)]++;
  console.log(`${name}: ${xs.length} snippets, SLL ${c.SLL}, LL retry ${c.LL}, fallback ${c.fallback}, hit rate ${(((c.SLL + c.LL) / xs.length) * 100).toFixed(1)}%`);
}
const fx = resolve(dir, "../../test/fixtures/workspace-basic");
for (const f of readdirSync(fx).filter((x) => x.endsWith(".sysml"))) console.log(`workspace-basic/${f}: ${stage(readFileSync(join(fx, f), "utf8"))}`);
