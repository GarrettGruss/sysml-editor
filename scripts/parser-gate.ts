import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser/parse.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const groups: Record<string, string> = {
  "release examples": "fixtures/sysml-v2-release/sysml",
  "kerml examples": "fixtures/sysml-v2-release/kerml",
  "standard library": "fixtures/sysml-v2-release/sysml.library",
  "community models": "fixtures/sysml-v2-models",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile() && [".sysml", ".kerml"].includes(extname(p))) out.push(p);
  }
  return out;
}

interface Stat { files: number; withErrors: number; percentClean: number }
const summary: Record<string, Record<string, Stat>> = {};
const msgCounts = new Map<string, number>();
const failing: { file: string; errors: number; first: string }[] = [];
const rejoinFailures: string[] = [];
let total = 0, totalErr = 0, libMs = 0;

for (const [name, rel] of Object.entries(groups)) {
  const files = walk(join(root, rel)).sort();
  const t0 = performance.now();
  summary[name] = {};
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const r = parse(text);
    const ext = extname(f);
    const s = (summary[name]![ext] ??= { files: 0, withErrors: 0, percentClean: 0 });
    s.files++;
    total++;
    const toks = r.tokens.getTokens().filter((t) => t.type !== -1);
    if (toks.map((t) => t.text ?? "").join("") !== text) rejoinFailures.push(relative(root, f));
    if (r.errors.length) {
      s.withErrors++;
      totalErr++;
      failing.push({ file: relative(root, f), errors: r.errors.length, first: `${r.errors[0]!.line}:${r.errors[0]!.column} ${r.errors[0]!.message}` });
      for (const e of r.errors) msgCounts.set(e.message, (msgCounts.get(e.message) ?? 0) + 1);
    }
  }
  if (name === "standard library") libMs = performance.now() - t0;
  for (const s of Object.values(summary[name]!)) s.percentClean = +(100 * (1 - s.withErrors / s.files)).toFixed(2);
}

const overallClean = +(100 * (1 - totalErr / total)).toFixed(2);
const pass = overallClean >= 99 && rejoinFailures.length === 0;
const topErrors = [...msgCounts].sort((a, b) => b[1] - a[1]).slice(0, 10);
const result = {
  date: new Date().toISOString(),
  groups: summary,
  totalFiles: total,
  filesWithErrors: totalErr,
  overallPercentClean: overallClean,
  rejoinFailures: rejoinFailures.length,
  rejoinFailingFiles: rejoinFailures,
  standardLibraryParseMs: Math.round(libMs),
  pass,
  topErrors: topErrors.map(([message, count]) => ({ message, count })),
  failingFiles: failing,
};
writeFileSync(join(root, "scripts/parser-gate-result.json"), JSON.stringify(result, null, 2) + "\n");

console.log(JSON.stringify(summary, null, 2));
console.log(`overall clean: ${overallClean}% (${total - totalErr}/${total})`);
console.log(`token re-join failures: ${rejoinFailures.length}`);
console.log(`standard library parse time: ${Math.round(libMs)} ms`);
console.log("top error messages:");
for (const [m, c] of topErrors) console.log(`  ${c}  ${m}`);
console.log(`failing files (${failing.length}, showing up to 40):`);
for (const f of failing.slice(0, 40)) console.log(`  ${f.file} [${f.errors}] ${f.first}`);
console.log(pass ? "GATE: PASS" : "GATE: FAIL");
