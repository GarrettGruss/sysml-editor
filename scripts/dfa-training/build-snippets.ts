// Verifies the generated training and held-out snippets with the exact parser (no snapshot, full
// LL with recovery) and writes the valid ones to scripts/dfa-training/*.json. Run:
//   npx tsx scripts/dfa-training/build-snippets.ts
// The JSON files are checked in; `generate:dfa` trains on them and does not regenerate them.
process.env["SYSML_DFA_SNAPSHOT"] = "off";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { newSim, twoStage } from "../../src/parser/parse-core.js";
import { heldOutSnippets, trainingSnippets } from "./snippets.js";

const dir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const sim = newSim();
const valid = (t: string): boolean => twoStage(t, sim).errors.length === 0;

const train = trainingSnippets();
const trainSet = new Set(train);
const held = heldOutSnippets(400).filter((t) => !trainSet.has(t));
const keep = (all: string[]) => all.filter(valid);
const tv = keep(train);
const hv = keep(held);
writeFileSync(join(dir, "training-snippets.json"), JSON.stringify(tv, null, 0).replace(/","/g, '",\n"') + "\n");
writeFileSync(join(dir, "heldout-snippets.json"), JSON.stringify(hv, null, 0).replace(/","/g, '",\n"') + "\n");
console.log(`training ${tv.length}/${train.length} valid, held-out ${hv.length}/${held.length} valid`);
