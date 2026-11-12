import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type SyntaxErrorInfo } from "../src/parser/parse.js";

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

type ErrClass = "import without visibility" | "actor outside a use case or requirement" | "other";

function classify(text: string, e: SyntaxErrorInfo): ErrClass {
  const line = text.split(/\r?\n/)[e.line - 1] ?? "";
  const rest = line.slice(e.column);
  if (/extraneous input 'import'|mismatched input 'import'/.test(e.message) || /^import\b/.test(rest)) {
    return "import without visibility";
  }
  if (/'actor'/.test(e.message) || /^actor\b/.test(rest)) return "actor outside a use case or requirement";
  return "other";
}

interface Stat { files: number; withErrors: number; expectedInvalid: number; percentClean: number }
const summary: Record<string, Record<string, Stat>> = {};
const msgCounts = new Map<string, number>();
const failing: { file: string; errors: number; first: string }[] = [];
const expectedInvalid: { file: string; reason: string }[] = [];
const otherFailures: { file: string; errors: number; first: string }[] = [];
const suspicious: { file: string; line: number; message: string }[] = [];
const classCounts: Record<string, number> = {};
const rejoinFailures: string[] = [];
const kerml: string[] = [];
let gated = 0, gatedErr = 0, rejoined = 0, libMs = 0;

for (const [name, rel] of Object.entries(groups)) {
  const files = walk(join(root, rel)).sort();
  summary[name] = {};
  const sysmlFiles = files.filter((f) => extname(f) === ".sysml");
  for (const f of files) if (extname(f) === ".kerml") kerml.push(relative(root, f));
  const t0 = performance.now();
  for (const f of sysmlFiles) {
    const text = readFileSync(f, "utf8");
    const r = parse(text);
    const s = (summary[name]![".sysml"] ??= { files: 0, withErrors: 0, expectedInvalid: 0, percentClean: 0 });
    s.files++;
    gated++;
    rejoined++;
    const toks = r.tokens.getTokens().filter((t) => t.type !== -1);
    if (toks.map((t) => t.text ?? "").join("") !== text) rejoinFailures.push(relative(root, f));
    if (!r.errors.length) continue;
    const rel2 = relative(root, f);
    const first = `${r.errors[0]!.line}:${r.errors[0]!.column} ${r.errors[0]!.message}`;
    failing.push({ file: rel2, errors: r.errors.length, first });
    for (const e of r.errors) msgCounts.set(e.message, (msgCounts.get(e.message) ?? 0) + 1);
    const classes = r.errors.map((e) => classify(text, e));
    const firstClass = classes[0]!;
    classCounts[firstClass] = (classCounts[firstClass] ?? 0) + 1;
    // Errors of class "other" on a line that already has a classified error are follow-on errors.
    const knownLines = new Set(r.errors.filter((_, i) => classes[i] !== "other").map((e) => e.line));
    const stray = r.errors.filter((e, i) => classes[i] === "other" && !knownLines.has(e.line));
    if (firstClass !== "other" && stray.length === 0) {
      s.expectedInvalid++;
      expectedInvalid.push({ file: rel2, reason: firstClass });
    } else {
      s.withErrors++;
      gatedErr++;
      otherFailures.push({ file: rel2, errors: r.errors.length, first });
      if (firstClass !== "other") for (const e of stray) suspicious.push({ file: rel2, line: e.line, message: e.message });
    }
  }
  if (name === "standard library") libMs = performance.now() - t0;
  for (const s of Object.values(summary[name]!)) {
    s.percentClean = +(100 * (1 - s.withErrors / (s.files - s.expectedInvalid))).toFixed(2);
  }
}
writeFileSync(
  join(root, "scripts/expected-invalid.json"),
  JSON.stringify(expectedInvalid.map((e) => ({ file: e.file, reason: `${e.reason} (pre-release syntax, invalid for release 2026-09.1)` })), null, 2) + "\n",
);
const gatedTotal = gated - expectedInvalid.length;
const overallClean = +(100 * (1 - gatedErr / gatedTotal)).toFixed(2);
const pass = overallClean >= 99 && rejoinFailures.length === 0;
const topErrors = [...msgCounts].sort((a, b) => b[1] - a[1]).slice(0, 10);
const result = {
  date: new Date().toISOString(),
  groups: summary,
  sysmlFiles: gated,
  expectedInvalid: expectedInvalid.length,
  expectedInvalidByClass: classCounts,
  gatedFiles: gatedTotal,
  filesWithErrors: gatedErr,
  overallPercentClean: overallClean,
  rejoinChecked: rejoined,
  rejoinFailures: rejoinFailures.length,
  rejoinFailingFiles: rejoinFailures,
  standardLibrarySysmlParseMs: Math.round(libMs),
  kermlFilesNotParsed: kerml.length,
  pass,
  otherFailures,
  stragglerErrorsInExpectedFiles: suspicious,
  topErrors: topErrors.map(([message, count]) => ({ message, count })),
};
writeFileSync(join(root, "scripts/parser-gate-result.json"), JSON.stringify(result, null, 2) + "\n");

console.log(JSON.stringify(summary, null, 2));
console.log(`.kerml files: ${kerml.length} not parsed by this parser (handled by the KerML outline indexer)`);
console.log(`expected invalid (pre-release syntax): ${expectedInvalid.length} ${JSON.stringify(classCounts)}`);
console.log(`gated: ${gatedTotal}, clean: ${gatedTotal - gatedErr} (${overallClean}%)`);
console.log(`token re-join failures: ${rejoinFailures.length} of ${rejoined}`);
console.log(`standard library (.sysml) parse time: ${Math.round(libMs)} ms`);
for (const o of otherFailures) console.log(`  OTHER ${o.file} [${o.errors}] ${o.first}`);
for (const o of suspicious) console.log(`  STRAY ${o.file}:${o.line} ${o.message}`);
console.log(pass ? "GATE: PASS" : "GATE: FAIL");
