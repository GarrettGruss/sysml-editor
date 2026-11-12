import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { parse } from "../src/parser/parse.js";
import { SysMLv2Lexer } from "../src/parser/generated/SysMLv2Lexer.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
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
const annexText = readFileSync(annex, "utf8");
const shape = readFileSync(walk(lib).find((f) => f.endsWith("ShapeItems.sysml"))!, "utf8");
const libTexts = walk(lib).map((f) => readFileSync(f, "utf8"));
const rows: [string, number][] = [];
for (let i = 0; i < 4; i++) rows.push([i === 0 ? "Annex A parse 1 (COLD)" : `Annex A parse ${i + 1} (warm)`, ms(() => parse(annexText))]);
for (let i = 0; i < 3; i++) rows.push([`ShapeItems parse ${i + 1}${i ? " (warm)" : " (after Annex A)"}`, ms(() => parse(shape))]);
rows.push([`Library ${libTexts.length} files pass 1`, ms(() => libTexts.forEach((t) => parse(t)))]);
rows.push([`Library ${libTexts.length} files pass 2`, ms(() => libTexts.forEach((t) => parse(t)))]);
rows.push(["Annex A lex only (warm)", ms(() => { const ts = new CommonTokenStream(new SysMLv2Lexer(CharStream.fromString(annexText))); ts.fill(); })]);
rows.push(["Annex A full parse (warm, incl. lex)", ms(() => parse(annexText))]);
for (const [k, v] of rows) console.log(k.padEnd(40), String(v).padStart(7), "ms");
