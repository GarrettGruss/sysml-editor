// Regenerates the DFA snapshot into a temporary file and fails if it differs from the checked-in
// src/parser/dfa-snapshot.json (the snapshot must be reproducible from the grammar, the training
// sets and the parser code). Run via `npm run check:dfa`; fix with `npm run generate:dfa`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), "sysml-dfa-"));
const out = join(dir, "dfa-snapshot.json");
try {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "scripts/generate-dfa-snapshot.ts"), "fixtures/sysml-v2-release,fixtures/sysml-v2-models", out], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) throw new Error("snapshot generation failed");
  const fresh = readFileSync(out);
  const checkedIn = readFileSync(join(root, "src/parser/dfa-snapshot.json"));
  const same = fresh.equals(checkedIn);
  console.log(`regenerated ${fresh.length} bytes in ${Math.round(performance.now() - t0)} ms; checked-in ${checkedIn.length} bytes: ${same ? "identical" : "DIFFERENT"}`);
  if (!same) {
    console.error("src/parser/dfa-snapshot.json is stale or not reproducible; run `npm run generate:dfa` and commit the result.");
    process.exitCode = 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
