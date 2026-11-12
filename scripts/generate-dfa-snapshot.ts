// Trains the prediction DFAs on the .sysml fixtures with no snapshot loaded, then writes
// src/parser/dfa-snapshot.json. Run via `npm run generate:dfa` (takes about a minute).
process.env["SYSML_DFA_SNAPSHOT"] = "off";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(p) === ".sysml") out.push(p);
  }
  return out;
}
async function main(): Promise<void> {
const { parse } = await import("../src/parser/parse.js");
const { extractSnapshot } = await import("../src/parser/dfa-snapshot.js");
const dirs = (process.argv[2] ?? "fixtures/sysml-v2-release,fixtures/sysml-v2-models").split(",");
const t0 = performance.now();
let n = 0;
for (const d of dirs) {
  const dir = join(root, d);
  if (!existsSync(dir)) throw new Error(`fixture directory ${d} is missing; run: git submodule update --init`);
  for (const f of walk(dir).sort()) { parse(readFileSync(f, "utf8")); n++; }
}
// Small generated snippets (scripts/dfa-training, see build-snippets.ts) cover shapes the fixtures
// lack (for example a short-named declaration followed by a member). Each must still parse cleanly.
const snippets: string[] = JSON.parse(readFileSync(join(root, "scripts/dfa-training/training-snippets.json"), "utf8"));
snippets.forEach((t, i) => {
  if (parse(t).errors.length > 0) throw new Error(`training snippet ${i} is not valid SysML:\n${t}`);
});
n += snippets.length;
const snap = extractSnapshot();
const out = join(root, "src/parser/dfa-snapshot.json");
writeFileSync(out, JSON.stringify(snap));
const states = snap.decisions.reduce((a, d) => a + d.s.length, 0);
console.log(`trained on ${n} files and snippets in ${Math.round(performance.now() - t0)} ms: ${snap.decisions.length} decisions, ${states} states -> ${out}`);
}
void main();
