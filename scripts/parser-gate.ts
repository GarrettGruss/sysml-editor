import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CharStream, CommonTokenStream, ParserATNSimulator, ParserRuleContext, TerminalNode, type ParseTree } from "antlr4ng";
import { parse, tryFastParse, type SyntaxErrorInfo } from "../src/parser/parse.js";
import { newSim } from "../src/parser/parse-core.js";
import { SysMLv2Lexer } from "../src/parser/generated/SysMLv2Lexer.js";
import { SysMLv2Parser } from "../src/parser/generated/SysMLv2Parser.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
// Hand-maintained input: files excused from the gate. This script never writes it.
const excusedList: { file: string; reason: string }[] = JSON.parse(
  readFileSync(join(root, "scripts/expected-invalid.json"), "utf8"),
);
const excused = new Map(excusedList.map((e) => [e.file, e.reason]));
const pct = (num: number, den: number): number => (den === 0 ? 100 : +(100 * (num / den)).toFixed(2));
const problems: string[] = [];
for (const e of excusedList) {
  if (!existsSync(join(root, e.file))) problems.push(`expected-invalid entry does not exist: ${e.file}`);
}
const seenExcused = new Set<string>();
const groups: Record<string, string> = {
  "release examples": "fixtures/sysml-v2-release/sysml",
  "kerml examples": "fixtures/sysml-v2-release/kerml",
  "standard library": "fixtures/sysml-v2-release/sysml.library",
  "community models": "fixtures/sysml-v2-models",
};

// ---- soundness of the fast path -------------------------------------------------------------------
// The fast path (snapshot DFAs, prediction shortcuts, SLL then LL with bail) must never accept text the exact parser
// rejects, nor build a different tree. The reference is the generated parser as it is: full LL prediction on a freshly
// built cache, no shortcuts, default error handling.

const exactSim = newSim();
function exactParse(text: string): { tree: ParserRuleContext; errors: number } {
  let errors = 0;
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  lexer.addErrorListener({ syntaxError: () => void errors++, reportAmbiguity() {}, reportAttemptingFullContext() {}, reportContextSensitivity() {} });
  const tokens = new CommonTokenStream(lexer);
  const parser = new SysMLv2Parser(tokens);
  parser.interpreter = new ParserATNSimulator(parser, SysMLv2Parser._ATN, exactSim.dfas, exactSim.cache);
  parser.removeErrorListeners();
  parser.addErrorListener({ syntaxError: () => void errors++, reportAmbiguity() {}, reportAttemptingFullContext() {}, reportContextSensitivity() {} });
  const tree = parser.rootNamespace();
  tokens.fill();
  return { tree, errors };
}

/** A structural dump of one node: rule name, alternative number, token start and stop index. */
function nodeDump(n: ParseTree): string {
  if (n instanceof TerminalNode) return `token ${n.symbol.type}@${n.symbol.tokenIndex}`;
  const c = n as ParserRuleContext;
  const alt = (c as unknown as { getAltNumber?: () => number }).getAltNumber?.() ?? 0;
  return `${SysMLv2Parser.ruleNames[c.ruleIndex] ?? c.ruleIndex} alt=${alt} tokens ${c.start?.tokenIndex ?? "-"}..${c.stop?.tokenIndex ?? "-"} (line ${c.start?.line ?? "?"})`;
}

/** The first node (in document order) at which two parse trees differ, or undefined when they are the same. */
function firstDifference(a: ParseTree, b: ParseTree): string | undefined {
  const stack: [ParseTree, ParseTree][] = [[a, b]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const dx = nodeDump(x);
    const dy = nodeDump(y);
    if (dx !== dy) return `fast: ${dx}; exact: ${dy}`;
    const kx = x instanceof ParserRuleContext ? x.children : [];
    const ky = y instanceof ParserRuleContext ? y.children : [];
    if (kx.length !== ky.length) return `${dx}: fast has ${kx.length} children, exact ${ky.length}`;
    for (let i = kx.length - 1; i >= 0; i--) stack.push([kx[i]!, ky[i]!]);
  }
  return undefined;
}

const soundnessFailures: string[] = [];
let soundnessChecked = 0, soundnessSkipped = 0, soundnessMs = 0;
/** Compares the fast path with the exact parser on `text`; texts the fast path declines are not part of the claim. */
function checkSoundness(label: string, text: string): void {
  const f = tryFastParse(text, { ll: true });
  if (!f.ok) {
    soundnessSkipped++;
    return;
  }
  const t0 = performance.now();
  const e = exactParse(text);
  soundnessMs += performance.now() - t0;
  soundnessChecked++;
  if (e.errors > 0) soundnessFailures.push(`${label}: accepted by the fast path, rejected by the exact parser (${e.errors} errors)`);
  else {
    const d = firstDifference(f.result.tree, e.tree);
    if (d) soundnessFailures.push(`${label}: trees differ at ${d}`);
  }
}
/** A fixed sample (seeded) when the full comparison would be too slow for CI. */
const sample = <T,>(xs: T[], n: number, seed = 12345): T[] => {
  if (xs.length <= n) return xs;
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const idx = xs.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, n).sort((p, q) => p - q).map((i) => xs[i]!);
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
  const soundness0 = soundnessMs;
  for (const f of sysmlFiles) {
    const text = readFileSync(f, "utf8");
    const r = parse(text);
    const s = (summary[name]![".sysml"] ??= { files: 0, withErrors: 0, expectedInvalid: 0, percentClean: 0 });
    s.files++;
    gated++;
    rejoined++;
    const toks = r.tokens.getTokens().filter((t) => t.type !== -1);
    if (toks.map((t) => t.text ?? "").join("") !== text) rejoinFailures.push(relative(root, f));
    const rel2 = relative(root, f);
    if (!excused.has(rel2)) checkSoundness(rel2, text);
    if (excused.has(rel2)) seenExcused.add(rel2);
    if (!r.errors.length) {
      if (excused.has(rel2)) problems.push(`stale expected-invalid entry (file now parses clean): ${rel2}`);
      continue;
    }
    const first = `${r.errors[0]!.line}:${r.errors[0]!.column} ${r.errors[0]!.message}`;
    failing.push({ file: rel2, errors: r.errors.length, first });
    for (const e of r.errors) msgCounts.set(e.message, (msgCounts.get(e.message) ?? 0) + 1);
    const classes = r.errors.map((e) => classify(text, e));
    const firstClass = classes[0]!;
    classCounts[firstClass] = (classCounts[firstClass] ?? 0) + 1;
    // Errors of class "other" on a line that already has a classified error are follow-on errors.
    const knownLines = new Set(r.errors.filter((_, i) => classes[i] !== "other").map((e) => e.line));
    const stray = r.errors.filter((e, i) => classes[i] === "other" && !knownLines.has(e.line));
    if (excused.has(rel2)) {
      s.expectedInvalid++;
      expectedInvalid.push({ file: rel2, reason: excused.get(rel2)! });
    } else {
      s.withErrors++;
      gatedErr++;
      otherFailures.push({ file: rel2, errors: r.errors.length, first });
      if (firstClass !== "other") for (const e of stray) suspicious.push({ file: rel2, line: e.line, message: e.message });
    }
  }
  if (name === "standard library") libMs = performance.now() - t0 - (soundnessMs - soundness0);
  for (const s of Object.values(summary[name]!)) {
    s.percentClean = pct(s.files - s.expectedInvalid - s.withErrors, s.files - s.expectedInvalid);
  }
}
for (const e of excusedList) {
  if (existsSync(join(root, e.file)) && !seenExcused.has(e.file)) problems.push(`expected-invalid entry is not a gated .sysml file: ${e.file}`);
}
// Snippets of the DFA training sets: all of them, or (SYSML_GATE_SNIPPETS=n) a fixed seeded sample of n.
const snippetLimit = Number(process.env["SYSML_GATE_SNIPPETS"] ?? Infinity);
let snippets = 0;
for (const name of ["heldout-snippets.json", "training-snippets.json"]) {
  const all: string[] = JSON.parse(readFileSync(join(root, "scripts/dfa-training", name), "utf8"));
  const picked = sample(all, Math.min(all.length, snippetLimit));
  snippets += picked.length;
  for (const t of picked) checkSoundness(`${name} snippet ${all.indexOf(t)}`, t);
}
for (const p of soundnessFailures) problems.push(p);
const gatedTotal = gated - expectedInvalid.length;
const overallClean = pct(gatedTotal - gatedErr, gatedTotal);
// Excused files are an explicit list, so any other file with syntax errors is a regression.
const pass = gatedErr === 0 && rejoinFailures.length === 0 && problems.length === 0;
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
  gateProblems: problems,
  pass,
  otherFailures,
  stragglerErrorsInExpectedFiles: suspicious,
  topErrors: topErrors.map(([message, count]) => ({ message, count })),
};
if (process.argv.includes("--write")) {
  writeFileSync(join(root, "scripts/parser-gate-result.json"), JSON.stringify(result, null, 2) + "\n");
}

console.log(JSON.stringify(summary, null, 2));
console.log(`.kerml files: ${kerml.length} not parsed by this parser (handled by the KerML outline indexer)`);
console.log(`expected invalid (pre-release syntax): ${expectedInvalid.length} ${JSON.stringify(classCounts)}`);
console.log(`gated: ${gatedTotal}, clean: ${gatedTotal - gatedErr} (${overallClean}%)`);
console.log(`token re-join failures: ${rejoinFailures.length} of ${rejoined}`);
console.log(`fast-path soundness: ${soundnessChecked} texts compared with the exact parser (${soundnessSkipped} declined by the fast path, ${snippets} snippets), exact parsing took ${Math.round(soundnessMs)} ms, failures: ${soundnessFailures.length}`);
console.log(`standard library (.sysml) parse time: ${Math.round(libMs)} ms`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
for (const o of otherFailures) console.log(`  UNEXCUSED FAILURE ${o.file} [${o.errors}] ${o.first}`);
for (const o of suspicious) console.log(`  STRAY ${o.file}:${o.line} ${o.message}`);
console.log(pass ? "GATE: PASS" : "GATE: FAIL");
process.exitCode = pass ? 0 : 1;
