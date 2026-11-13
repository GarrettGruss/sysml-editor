/**
 * Parse worker (bundled to dist/parse-worker.js). Gives precise syntax errors, or the model when
 * the text turns out to be valid, for texts that failed the main thread's fast path.
 *
 * It imports only `parse-core`, never `parse.ts`, so the DFA snapshot is not loaded here: this
 * thread's static prediction DFAs are built normally from the ATN, grow with use and stay warm
 * for the life of the worker. After start-up it warms them by parsing the standard library texts
 * (and a few error-containing variants) one file per step; requests are served between steps.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { twoStage } from "./parser/parse-core.js";
import { documentFromParse } from "./model/antlr-builder.js";
import { serializeModel } from "./model/serialize.js";
import type { WorkerData, WorkerReply, WorkerRequest } from "./workspace/parse-worker-protocol.js";

const port = parentPort!;
const data = (workerData ?? {}) as WorkerData;

function handle(req: WorkerRequest): WorkerReply {
  try {
    const t0 = performance.now();
    const doc = documentFromParse(req.uri, req.text, twoStage(req.text));
    const ms = performance.now() - t0;
    const valid = doc.errors.length === 0;
    return { type: "result", id: req.id, uri: req.uri, version: req.version, errors: doc.errors, model: valid ? serializeModel(doc.model) : undefined, ms };
  } catch (e) {
    return { type: "failed", id: req.id, message: String(e) };
  }
}

port.on("message", (req: WorkerRequest) => port.postMessage(handle(req)));

function sysmlFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sysmlFiles(p, out);
    else if (e.name.endsWith(".sysml")) out.push(p);
  }
  return out;
}

/** A copy of `text` with one incomplete declaration in the middle, to exercise error recovery. */
function broken(text: string): string {
  const lines = text.split("\n");
  lines.splice(Math.floor(lines.length / 2), 0, "    attribute broken :> ;");
  return lines.join("\n");
}

async function warm(): Promise<void> {
  if (!data.libraryDir) return;
  const t0 = performance.now();
  let files: string[] = [];
  try {
    files = sysmlFiles(data.libraryDir).sort();
  } catch {
    /* no library: nothing to warm */
  }
  const texts: string[] = [];
  for (const f of files) texts.push(readFileSync(f, "utf8"));
  // Every fourth file again with an error, so recovery paths are warm too.
  texts.push(...texts.filter((_, i) => i % 4 === 0).map(broken));
  for (const t of texts) {
    await new Promise((r) => setImmediate(r)); // let queued requests go first
    try {
      twoStage(t);
    } catch {
      /* warm-up results are discarded */
    }
  }
  port.postMessage({ type: "warmed", ms: Math.round(performance.now() - t0), files: texts.length } satisfies WorkerReply);
}

if (data.warm !== false) void warm();
