import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { antlrDocumentParser } from "./antlr-parser.js";
import { deserializeModel, serializeModel } from "./serialize.js";
import type { Element } from "./types.js";

const examples = resolve(__dirname, "../../fixtures/sysml-v2-release/sysml/src/examples");
const have = existsSync(examples);
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (n.endsWith(".sysml")) out.push(p);
  }
  return out.sort();
}

describe("model serialisation", () => {
  it("drops owner links and restores them", () => {
    const { model } = antlrDocumentParser("file:///a.sysml", "package P { part def A { part b; } }");
    const s = serializeModel(model);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s); // plain tree, no cycles
    const back = deserializeModel(s);
    expect(back).toStrictEqual(model);
    const b = back.roots[0]!.members[0]!.members[0]!;
    expect(b.owner).toBe(back.roots[0]!.members[0]);
  });

  it.skipIf(!have)("round-trips the example fixtures to a deeply equal model (needs fixtures submodule)", () => {
    const list = files(examples).filter((_, i) => i % 3 === 0);
    expect(list.length).toBeGreaterThan(10);
    for (const f of list) {
      const { model } = antlrDocumentParser("file:///" + f, readFileSync(f, "utf8"));
      const back = deserializeModel(structuredClone(serializeModel(model)));
      expect(back, f).toStrictEqual(model);
      const check = (e: Element, owner: Element | undefined) => {
        expect(e.owner).toBe(owner);
        e.members.forEach((m) => check(m, e));
      };
      back.roots.forEach((r) => check(r, undefined));
    }
  }, 120_000);
});
