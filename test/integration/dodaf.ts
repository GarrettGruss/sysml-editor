import * as assert from "node:assert";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { viaLm } from "./diagram-agent.js";
import type { Ctx } from "./diagram-interaction.js";

type Test = [name: string, fn: () => Promise<void>];

const VIEWS = ["AV-1", "AV-2", "CV-1", "CV-2", "OV-1", "OV-2", "OV-4", "OV-5a", "OV-5b", "OV-6c", "SV-1", "SV-2", "SV-4", "SV-5a", "SV-10c", "StdV-1", "DIV-2"];

/** The DoDAF generator against the real editor: a small tagged model, every view, every link. */
export function dodafTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const repo = process.env.SYSML_EXPECT_EXTENSION_PATH ?? path.resolve(__dirname, "../../..");
  const tmp = path.join(folder.fsPath, "tmp-dodaf");
  return [
    ["DoDAF generation: the example model yields all 17 views with images and every link resolves", async () => {
      mkdirSync(tmp, { recursive: true });
      copyFileSync(path.join(repo, "resources/dodaf/DoDAF.sysml"), path.join(tmp, "DoDAF.sysml"));
      copyFileSync(path.join(repo, "test/fixtures/dodaf-example/Rescue.sysml"), path.join(tmp, "Rescue.sysml"));
      try {
        await c.eventually(async () => assert.ok(api.model.index.findByQualifiedName("Rescue").length > 0 && api.model.index.findByQualifiedName("DoDAF").length > 0), "the example model is indexed");
        const plan = JSON.parse((await viaLm("sysml_dodaf_generate", { root: "Rescue", folder: "tmp-dodaf/out", plan: true })).text) as { planOnly: boolean };
        assert.strictEqual(plan.planOnly, true);
        assert.ok(!existsSync(path.join(tmp, "out")), "plan: true writes nothing");
        const r = JSON.parse((await viaLm("sysml_dodaf_generate", { root: "Rescue", folder: "tmp-dodaf/out", format: "png" })).text) as { document: string; views: { id: string; status: string; note?: string }[] };
        assert.strictEqual(r.document, "tmp-dodaf/out/Rescue.md");
        assert.deepStrictEqual([...new Set(r.views.map((v) => v.id))], VIEWS);
        assert.deepStrictEqual(r.views.filter((v) => v.status !== "written").map((v) => `${v.id}: ${v.status} ${v.note ?? ""}`), [], "every view is written");
        const md = readFileSync(path.join(folder.fsPath, r.document), "utf8");
        const links = [...md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!);
        assert.ok(links.length >= 9, "an image for each diagram view");
        for (const l of links) assert.ok(existsSync(path.join(tmp, "out", l)), `image ${l} exists`);
        assert.ok(existsSync(path.join(tmp, "Rescue-OV-2.sysmld")), "diagrams are created beside the root's source file");
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }],
  ];
}
