import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import { build } from "esbuild";

const common = { bundle: true, platform: "node", format: "cjs", sourcemap: true, target: "node22" };

await build({ ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] });
await build({ ...common, entryPoints: ["src/mcp-bridge.ts"], outfile: "dist/mcp-bridge.js" });
// The parse worker must build its prediction cache normally: the DFA snapshot must not be in it.
const worker = await build({ ...common, entryPoints: ["src/parse-worker.ts"], outfile: "dist/parse-worker.js", metafile: true });
if (Object.keys(worker.metafile.inputs).some((f) => f.includes("dfa-snapshot"))) throw new Error("dist/parse-worker.js must not include the DFA snapshot");

// Bundle the standard library (EPL-2.0) next to the extension; the loader reads it from a directory.
const release = "fixtures/sysml-v2-release";
if (existsSync(`${release}/sysml.library`)) {
  rmSync("dist/sysml.library", { recursive: true, force: true });
  cpSync(`${release}/sysml.library`, "dist/sysml.library", {
    recursive: true,
    filter: (src) => !statSync(src).isFile() || /\.(sysml|kerml)$/.test(src),
  });
  cpSync(`${release}/LICENSE`, "dist/sysml.library/LICENSE");
} else {
  console.warn(`${release} is missing (submodule not initialised): standard library not bundled`);
}
