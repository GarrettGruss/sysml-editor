import { readFileSync, writeFileSync } from "node:fs";
import { lmToolManifest } from "../src/agent-tools/manifest.js";

const file = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(file, "utf8"));
pkg.contributes.languageModelTools = lmToolManifest();
writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
console.log(`wrote ${pkg.contributes.languageModelTools.length} languageModelTools to package.json`);
