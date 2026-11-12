import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModelIndex, antlrDocumentParser } from "../model/index.js";
import { ParseWorkerClient } from "./parse-worker-client.js";

// Runs the real worker, bundled from src/parse-worker.ts exactly like esbuild.mjs does.
let dir: string;
let client: ParseWorkerClient;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sysml-worker-"));
  const out = join(dir, "parse-worker.js");
  const r = await build({ entryPoints: [join(__dirname, "../parse-worker.ts")], outfile: out, bundle: true, platform: "node", format: "cjs", metafile: true, logLevel: "silent" });
  expect(Object.keys(r.metafile.inputs).some((f) => f.includes("dfa-snapshot"))).toBe(false);
  client = new ParseWorkerClient({ workerPath: out, warm: false });
}, 60_000);
afterAll(() => {
  client?.dispose();
  rmSync(dir, { recursive: true, force: true });
});

const BAD = "package P {\n  part def A;\n  part a : ;\n  attribute b :> ;\n  part def B;\n}\n";
const GOOD = "package P {\n  part def A { attribute m : Real; }\n  part a : A [1];\n  connect a to a;\n}\n";

describe("parse worker (real worker thread)", () => {
  it("returns the same precise errors as a same-thread full parse", async () => {
    const r = await client.request({ uri: "file:///w/bad.sysml", version: 1, text: BAD });
    expect(r).toBeDefined();
    expect(r!.model).toBeUndefined();
    expect(r!.errors.length).toBeGreaterThan(0);
    expect(r!.errors).toEqual(antlrDocumentParser("file:///w/bad.sysml", BAD).errors);
  }, 60_000);

  it("returns the model for valid text, equal to the directly built one", async () => {
    const r = await client.request({ uri: "file:///w/good.sysml", version: 2, text: GOOD });
    expect(r!.errors).toEqual([]);
    expect(r!.model).toStrictEqual(antlrDocumentParser("file:///w/good.sysml", GOOD).model);
    // This text happens to fail the main thread's fast path (package-level `connect`), so the
    // index gets its model from the worker: a snapshot gap, handled without a main-thread parse.
    const ix = new ModelIndex(undefined, { details: client });
    ix.setDocument("file:///w/good.sysml", GOOD);
    await ix.settled();
    expect(ix.getDocument("file:///w/good.sysml")!.errors).toEqual([]);
    expect(ix.findByQualifiedName("P::a")).toHaveLength(1);
  }, 60_000);

  it("drives a ModelIndex end to end", async () => {
    const ix = new ModelIndex(undefined, { details: client });
    ix.setDocument("file:///w/x.sysml", "package P { part def A; }");
    ix.setDocument("file:///w/x.sysml", BAD);
    expect(ix.getDocument("file:///w/x.sysml")!.detailsPending).toBe(true);
    await ix.settled();
    const d = ix.getDocument("file:///w/x.sysml")!;
    expect(d.detailsPending).toBe(false);
    expect(d.errors).toEqual(antlrDocumentParser("file:///w/x.sysml", BAD).errors);
    expect(ix.findByQualifiedName("P::A")).toHaveLength(1);
  }, 60_000);
});
