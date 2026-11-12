import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { parse, parseStats, warmFallbackParser } from "../src/parser/parse.js";
import { SysMLv2Lexer } from "../src/parser/generated/SysMLv2Lexer.js";

// Usage: tsx scripts/parser-bench.ts [clean|a|b|c|activation]
// With no argument it runs every mode, each in its own fresh process (cold start matters).
const root = resolve(__dirname, "..");
const lib = join(root, "fixtures/sysml-v2-release/sysml.library");
const annex = join(root, "fixtures/sysml-v2-release/sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (extname(p) === ".sysml") out.push(p);
  }
  return out.sort();
}
const ms = (f: () => void) => { const t = performance.now(); f(); return Math.round(performance.now() - t); };
const print = (rows: [string, number][]) => { for (const [k, v] of rows) console.log(k.padEnd(52), String(v).padStart(7), "ms"); };
const annexText = () => readFileSync(annex, "utf8");
/** Annex A (1,581 lines) with one incomplete declaration (line 1572) near the end. */
const erroring = () => {
  const lines = annexText().split("\n");
  lines[1571] = "            attribute broken :> ;";
  return lines.join("\n");
};
const libTexts = () => walk(lib).map((f) => readFileSync(f, "utf8"));
const warmUp = async (texts: string[]) => {
  const steps: number[] = [];
  const t0 = performance.now();
  await warmFallbackParser(texts, () => new Promise((r) => setTimeout(r, 0)), { onStep: (m) => steps.push(m) });
  return { total: Math.round(performance.now() - t0), max: Math.round(Math.max(...steps)), n: steps.length, over50: steps.filter((x) => x > 50).length, cpu: Math.round(steps.reduce((a, b) => a + b, 0)) };
};

async function mode(m: string): Promise<void> {
  const rows: [string, number][] = [];
  if (m === "clean") {
    const shape = readFileSync(walk(lib).find((f) => f.endsWith("ShapeItems.sysml"))!, "utf8");
    const a = annexText();
    const texts = libTexts();
    for (let i = 0; i < 4; i++) rows.push([i === 0 ? "Annex A parse 1 (COLD)" : `Annex A parse ${i + 1} (warm)`, ms(() => parse(a))]);
    for (let i = 0; i < 3; i++) rows.push([`ShapeItems parse ${i + 1}${i ? " (warm)" : " (after Annex A)"}`, ms(() => parse(shape))]);
    rows.push([`Library ${texts.length} files pass 1`, ms(() => texts.forEach((t) => parse(t)))]);
    rows.push([`Library ${texts.length} files pass 2`, ms(() => texts.forEach((t) => parse(t)))]);
    rows.push(["Annex A lex only (warm)", ms(() => { const ts = new CommonTokenStream(new SysMLv2Lexer(CharStream.fromString(a))); ts.fill(); })]);
    rows.push(["Annex A full parse (warm, incl. lex)", ms(() => parse(a))]);
  } else if (m === "a") {
    const e = erroring();
    rows.push(["(a) 1st parse, 1 syntax error, NO warm-up", ms(() => parse(e))]);
    for (let i = 2; i <= 4; i++) rows.push([`    parse ${i} of the same text, still no warm-up`, ms(() => parse(e))]);
  } else if (m === "b" || m === "c") {
    const e = erroring();
    const w = await warmUp(libTexts());
    console.log(`warm-up over ${w.n} steps: total ${w.total} ms, longest step ${w.max} ms, steps over 50 ms: ${w.over50}`);
    rows.push(["(b) 1st erroring parse after warm-up", ms(() => parse(e))]);
    const lines = erroring().split("\n");
    for (let i = 1; i <= 5; i++) {
      lines[1571] = `            attribute broken${i} :> ;`; // the typing case: the text changes each time
      const t = lines.join("\n");
      rows.push([`(c) repeated erroring parse ${i} (edited text)`, ms(() => parse(t))]);
    }
    const clean = annexText();
    rows.push(["    clean parse after the failing ones (fast path)", ms(() => parse(clean))]);
  } else if (m === "activation") {
    const { ModelIndex, loadLibraryChunked } = await import("../src/model/index.js");
    const index = new ModelIndex();
    let t0 = performance.now();
    const r = await loadLibraryChunked(index, lib, { chunk: 25 });
    rows.push([`activation: loadLibraryChunked, ${r.uris.length} files`, Math.round(performance.now() - t0)]);
    t0 = performance.now();
    const w = await warmUp(r.sysmlTexts);
    rows.push(["background fallback warm-up total (with yields)", w.total]);
    rows.push(["background fallback warm-up parse time (sum of steps)", w.cpu]);
    rows.push(["background fallback warm-up longest single step", w.max]);
    rows.push([`background fallback warm-up steps over 50 ms (of ${w.n})`, w.over50]);
  }
  print(rows);
  console.log(`(fast-path parses: ${parseStats.fastPath}, fallback parses: ${parseStats.fallback})`);
}

async function main(): Promise<void> {
const arg = process.argv[2];
if (arg) await mode(arg);
else {
  for (const m of ["clean", "a", "b", "activation"]) {
    console.log(`\n== ${m} (fresh process) ==`);
    const r = spawnSync(process.execPath, ["--import", "tsx", __filename, m], { stdio: "inherit", cwd: root });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
}
void main();
