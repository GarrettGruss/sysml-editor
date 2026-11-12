import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Inspects the .vsix produced by `npm run package` (a zip): required files are present, source and
// test material is absent. Reads the zip's central directory directly, so it needs no tools.
const root = resolve(__dirname, "..");
const arg = process.argv[2];
const file = arg ?? readdirSync(root).filter((f) => f.endsWith(".vsix")).sort().pop();
if (!file) {
  console.error("no .vsix found; run `npm run package` first");
  process.exit(1);
}

function entries(buf: Buffer): string[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString("utf8", p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

const path = resolve(root, file);
const names = entries(readFileSync(path));
const failures: string[] = [];
const has = (n: string) => names.includes(n);
const prefix = (pre: string) => names.some((n) => n.startsWith(pre));

for (const n of [
  "extension/package.json",
  "extension/dist/extension.js",
  "extension/dist/mcp-bridge.js",
  "extension/dist/parse-worker.js",
  "extension/dist/sysml.library/LICENSE",
  "extension/media/sysml.svg",
  "extension/vendor/sysml-v2-grammar/LICENSE",
]) if (!has(n)) failures.push(`missing ${n}`);
if (!prefix("extension/dist/sysml.library/Kernel Libraries/")) failures.push("missing standard library files under extension/dist/sysml.library/");
for (const pre of ["extension/src/", "extension/test/", "extension/fixtures/", "extension/openspec/", "extension/node_modules/", "extension/scripts/", "extension/out/"])
  if (prefix(pre)) failures.push(`must not contain ${pre}`);

console.log(`${file}: ${names.length} entries`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log("vsix contents OK");
