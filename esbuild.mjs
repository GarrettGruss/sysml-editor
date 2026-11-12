import { build } from "esbuild";

const common = { bundle: true, platform: "node", format: "cjs", sourcemap: true, target: "node22" };

await build({ ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] });
await build({ ...common, entryPoints: ["src/mcp-bridge.ts"], outfile: "dist/mcp-bridge.js" });
