import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { build } from "esbuild";
import { parse, parseStats } from "../src/parser/parse.js";
import { ModelIndex, loadLibraryChunked } from "../src/model/index.js";
import { ParseWorkerClient } from "../src/workspace/parse-worker-client.js";
import { SysMLv2Lexer } from "../src/parser/generated/SysMLv2Lexer.js";

// Usage: tsx scripts/parser-bench.ts [clean|cold|warm|session|activation]
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
const examples = join(root, "fixtures/sysml-v2-release/sysml/src/examples");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bundles the worker exactly like esbuild.mjs (no DFA snapshot) into a temporary directory. */
async function workerBundle(): Promise<string> {
  const out = join(mkdtempSync(join(tmpdir(), "sysml-bench-")), "parse-worker.js");
  await build({ entryPoints: [join(root, "src/parse-worker.ts")], outfile: out, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return out;
}

/** Main-thread time of `setDocument`, and wall-clock time until the details have arrived. */
async function timedSet(index: ModelIndex, uri: string, text: string): Promise<{ main: number; details: number; pending: boolean; first: string }> {
  const t0 = performance.now();
  index.setDocument(uri, text);
  const main = performance.now() - t0;
  const pending = index.getDocument(uri)!.detailsPending;
  await index.settled();
  const d = index.getDocument(uri)!;
  const first = d.errors[0] ? `line ${d.errors[0].line + 1}: ${d.errors[0].message}` : "clean";
  return { main: Math.round(main), details: Math.round(performance.now() - t0), pending, first };
}

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
  } else if (m === "startup") {
    // (a) as in the extension: the library is loaded first (activation), the worker is not yet warm.
    const workerPath = await workerBundle();
    const client = new ParseWorkerClient({ workerPath, warm: false });
    const index = new ModelIndex(undefined, { details: client });
    await loadLibraryChunked(index, lib, { chunk: 25 });
    const r = await timedSet(index, "file:///w/annex.sysml", erroring());
    rows.push(["(a) 1st erroring parse after library load, main thread", r.main]);
    rows.push(["(b) same, time to details (cold worker)", r.details]);
    client.dispose();
  } else if (m === "cold" || m === "warm") {
    // (a), (b), (c): the worker as the extension uses it; the main thread runs only the fast path.
    const workerPath = await workerBundle();
    let warmed: (v: { ms: number; files: number }) => void = () => {};
    const warmedP = new Promise<{ ms: number; files: number }>((r) => (warmed = r));
    const client = new ParseWorkerClient({ workerPath, warm: m === "warm", libraryDir: lib, onWarmed: (w) => warmed(w) });
    const index = new ModelIndex(undefined, { details: client });
    if (m === "warm") {
      const t0 = performance.now();
      client.start();
      const w = await warmedP;
      console.log(`worker warm-up: ${w.ms} ms in the worker over ${w.files} texts (${Math.round(performance.now() - t0)} ms wall incl. start)`);
    }
    const uri = "file:///w/annex.sysml";
    const e = erroring();
    const r = await timedSet(index, uri, e);
    rows.push([`(a) 1st erroring parse, main-thread time (${m} worker)`, r.main]);
    rows.push([`(b) 1st erroring parse, time to details (${m} worker)`, r.details]);
    console.log(`    pending after fast path: ${r.pending}; details: ${r.first}`);
    const lines = e.split("\n");
    for (let i = 1; i <= 5; i++) {
      lines[1571] = `            attribute broken${i} :> ;`; // the typing case: the text changes each time
      const x = await timedSet(index, uri, lines.join("\n"));
      rows.push([`(c) erroring edit ${i}: main-thread time`, x.main]);
      rows.push([`    erroring edit ${i}: time to details`, x.details]);
    }
    const c = await timedSet(index, uri, annexText());
    rows.push(["    clean edit after the failing ones: main-thread time", c.main]);
    client.dispose();
  } else if (m === "session") {
    // (e): longest main-thread block in a scripted session, measured with an event-loop delay monitor.
    const workerPath = await workerBundle();
    const client = new ParseWorkerClient({ workerPath, libraryDir: lib });
    const index = new ModelIndex(undefined, { details: client });
    const h = monitorEventLoopDelay({ resolution: 10 });
    h.enable();
    const step = async (name: string, f: () => Promise<void>) => {
      h.reset();
      const t0 = performance.now();
      await f();
      await sleep(20); // let the monitor sample the end of the step
      rows.push([`${name}: duration`, Math.round(performance.now() - t0)]);
      rows.push([`${name}: longest event-loop block`, Math.round(h.max / 1e6)]);
    };
    await step("load library (chunks of 25)", async () => {
      await loadLibraryChunked(index, lib, { chunk: 25 });
    });
    client.start(); // the extension starts it shortly after activation; it warms on its own thread
    const files = walk(examples);
    await step(`load workspace (${files.length} example files, batches of 16)`, async () => {
      for (let i = 0; i < files.length; i += 16) {
        index.setDocuments(files.slice(i, i + 16).map((f) => [`file://${f}`, readFileSync(f, "utf8")]));
        await sleep(0);
      }
    });
    const valid = annexText().split("\n");
    const uri = "file:///w/annex.sysml";
    await step("type 30 edits, alternating valid / invalid, 200 ms apart", async () => {
      for (let i = 0; i < 30; i++) {
        const lines = [...valid];
        lines[1571] = i % 2 ? `            attribute broken${i} :> ;` : `            attribute ok${i};`;
        index.setDocument(uri, lines.join("\n"));
        await sleep(200);
      }
      await index.settled();
    });
    console.log(`(pending after session: ${index.pendingDetails().length}; workspace files with errors: ${index.uris().filter((u) => u.startsWith("file:") && index.getDocument(u)!.errors.length).length})`);
    h.disable();
    client.dispose();
  } else if (m === "activation") {
    const index = new ModelIndex();
    const t0 = performance.now();
    const r = await loadLibraryChunked(index, lib, { chunk: 25 });
    rows.push([`activation: loadLibraryChunked, ${r.uris.length} files`, Math.round(performance.now() - t0)]);
  }
  print(rows);
  console.log(`(main-thread fast-path parses: ${parseStats.fastPath}, same-thread fallback parses: ${parseStats.fallback})`);
}

async function main(): Promise<void> {
const arg = process.argv[2];
if (arg) await mode(arg);
else {
  for (const m of ["clean", "cold", "startup", "warm", "session", "activation"]) {
    console.log(`\n== ${m} (fresh process) ==`);
    const r = spawnSync(process.execPath, ["--import", "tsx", __filename, m], { stdio: "inherit", cwd: root });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
}
void main();
