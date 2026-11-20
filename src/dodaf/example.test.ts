import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ModelIndex } from "../model/index.js";
import { generateDocument } from "./generate.js";
import { FakeDiagrams } from "../agent-tools/test-support.js";
import { VIEW_IDS } from "./mapping.js";

const dir = join(__dirname, "../../test/fixtures/dodaf-example");
const expectedPath = join(dir, "expected/Rescue.md");

async function run() {
  const index = new ModelIndex();
  index.setDocument("file:///w/DoDAF.sysml", readFileSync(join(__dirname, "../../resources/dodaf/DoDAF.sysml"), "utf8"));
  index.setDocument("file:///w/Rescue.sysml", readFileSync(join(dir, "Rescue.sysml"), "utf8"));
  const out = new Map<string, string | Uint8Array>();
  const report = await generateDocument({
    index,
    root: index.findByQualifiedName("Rescue")[0]!,
    folder: "docs/dodaf",
    imageFormat: "svg",
    plan: false,
    uriToPath: (u) => (u.startsWith("file:///w/") ? u.slice(10) : undefined),
    files: { isTrusted: () => true, exists: async (p) => out.has(p), writeText: async (p, t) => void out.set(p, t), writeBytes: async (p, b) => void out.set(p, b), readBytes: async () => { throw new Error("none"); } },
    diagrams: new FakeDiagrams(),
  });
  return { report, out, md: out.get("docs/dodaf/Rescue.md") as string };
}

describe("DoDAF acceptance example", () => {
  it("covers all 17 views", async () => {
    const { report } = await run();
    expect(report.views.map((v) => v.id)).toEqual(expect.arrayContaining([...VIEW_IDS]));
    expect(report.views.filter((v) => v.status === "empty" || v.status === "skipped").map((v) => `${v.id}: ${v.note ?? ""}`)).toEqual([]);
    expect(report.gaps).toEqual([]);
    expect(report.missing).toEqual({ "OV-1": ["OV1Graphic"] }); // the optional author graphic; OV-1 is drawn instead
  });
  it("matches the expected Markdown byte for byte", async () => {
    const { md } = await run();
    if (process.env["UPDATE_DODAF_EXPECTED"] || !existsSync(expectedPath)) {
      mkdirSync(join(dir, "expected"), { recursive: true });
      writeFileSync(expectedPath, md);
    }
    expect(md).toBe(readFileSync(expectedPath, "utf8"));
  });
  it("writes an image for every link", async () => {
    const { md, out } = await run();
    for (const m of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) expect(out.has(`docs/dodaf/${m[1]}`), m[1]).toBe(true);
  });
});
