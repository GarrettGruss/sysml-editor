import { chmodSync, cpSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("cli/dist", { recursive: true, force: true });
await build({
  bundle: true, platform: "node", format: "cjs", target: "node22",
  entryPoints: ["cli/src/sysml.ts"], outfile: "cli/dist/sysml.js",
  banner: { js: "#!/usr/bin/env node" },
});
chmodSync("cli/dist/sysml.js", 0o755);
cpSync("src/skills", "cli/dist/skills", { recursive: true, filter: (p) => !p.endsWith(".test.ts") });
