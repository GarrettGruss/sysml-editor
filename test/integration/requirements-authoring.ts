import * as assert from "node:assert";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Ctx } from "./diagram-interaction.js";
import type { ReqMetrics, ReqScope } from "./index.js";

type Test = [name: string, fn: () => Promise<void>];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FIXTURE = path.resolve(__dirname, "../../../test/fixtures/requirements/mining-frigate.sysml");

/** The requirements document: plain packages, inline add, hierarchy, right-click palette with ghost and live gaps, drag and move (add-requirements-authoring 1.1 to 2.2). */
export function requirementsAuthoringTests(c: Ctx): Test[] {
  const { api, folder, eventually } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const onDisk = (name: string) => readFileSync(uriOf(name).fsPath, "utf8");
  const textDoc = (name: string) => vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uriOf(name).fsPath);
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    const end = performance.now() + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(25);
    }
  };
  const clean = (name: string) => eventually(async () => {
    const d = textDoc(name);
    assert.ok(d, `${name} is open`);
    assert.strictEqual(d.isDirty, false, `${name} is not dirty`);
    assert.strictEqual(onDisk(name), d.getText(), `${name}: the bytes on disk equal the document text`);
  }, `${name} is saved and equal to its buffer`);
  const parses = (name: string) => waitFor(() => {
    const st = api.model.index.getDocument(uriOf(name).toString());
    return !!st && !st.detailsPending && st.errors.length === 0;
  }, 280000, `${name} parses without errors`);
  const warm = async () => {
    const file = "tmp-reqauthwarm.sysml";
    try {
      for (let i = 0; i < 400; i++) {
        writeFileSync(uriOf(file).fsPath, `package ReqAuthWarm${i} {\n  requirement <'R1'> a { doc /* ${i} */ }\n  part def T;\n}\n`);
        const started = performance.now();
        try {
          await waitFor(() => api.model.index.findByQualifiedName(`ReqAuthWarm${i}::T`).length > 0, 90000, "the warm-up file is in the model");
        } catch {
          continue;
        }
        if (performance.now() - started < 1500 && i > 0) break;
      }
    } finally {
      rmSync(uriOf(file).fsPath, { force: true });
    }
  };

  type T = { file: string; scope: ReqScope; qn: (s: string) => string; m: () => Promise<ReqMetrics>; g: (x: Parameters<typeof api.requirements.gesture>[1]) => Promise<void>; text: () => string; order: () => string[]; before: string };
  const DEF = "MiningFrigateRequirementsDef";
  const ORE = "OreExtractionEfficiencyRequirement";
  /** The fixture (package renamed), opened in the document view on `pkg::MiningFrigateRequirementsDef` (or on the package itself with `root: "pkg"`); cleaned up after. */
  const scenario = (pkg: string, fn: (t: T) => Promise<void>, opts: { text?: string; root?: string; view?: "table" | "document"; probe?: string } = {}) => async () => {
    const file = `tmp-${pkg.toLowerCase()}.sysml`;
    const before = opts.text ?? readFileSync(FIXTURE, "utf8").replace(/MiningFrigate\b/g, pkg);
    writeFileSync(uriOf(file).fsPath, before);
    api.requirements.setUi({ confirm: async () => true, pickOne: async (items) => items[0]?.id, pickMany: async () => undefined, pickVerification: async () => undefined, inputName: async () => undefined });
    await warm();
    const scope: ReqScope = { kind: "package", qualifiedName: opts.root ?? `${pkg}::${DEF}` };
    try {
      await vscode.workspace.openTextDocument(uriOf(file));
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          await waitFor(() => api.model.index.findByQualifiedName(opts.probe ?? `${pkg}::${DEF}::MFRQ03`).length > 0 || api.model.index.findByQualifiedName(`${pkg}::${DEF}`).length > 0, 40000, `${pkg} is in the model`);
          break;
        } catch (e) {
          if (attempt === 5) throw e;
          writeFileSync(uriOf(file).fsPath, before);
        }
      }
      await waitFor(() => !api.model.index.getDocument(uriOf(file).toString())?.detailsPending, 280000, "details settled");
      await (opts.view ? api.requirements.open(scope, opts.view) : api.requirements.open(scope));
      const text = () => onDisk(file);
      await fn({
        file, scope, qn: (s) => `${pkg}::${DEF}::${s}`, before, text,
        m: () => api.requirements.metrics(scope),
        g: (x) => api.requirements.gesture(scope, x),
        order: () => [...text().matchAll(/<'(MFRQ[\w]+)'>/g)].map((x) => x[1]!),
      });
      assert.deepStrictEqual(api.requirements.errors(), [], "no webview errors");
    } finally {
      api.requirements.setUi(undefined);
      await api.requirements.close(scope).catch(() => undefined);
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      rmSync(uriOf(file).fsPath, { force: true });
      await sleep(150);
    }
  };
  const gap = (owner: string, before?: string) => `[data-gap="requirement|${owner}|${before ?? "end"}"]`;
  const item = (qn: string) => `[data-testid=item][data-qn="${qn}"]`;
  const head = (qn: string) => `${item(qn)} > .item-head`;
  const handle = (qn: string) => `${head(qn)} [data-testid=drag-handle]`;
  const owner = (n: string) => (api.model.index.findByQualifiedName(n)[0] as { owner?: { qualifiedName?: string } } | undefined)?.owner?.qualifiedName;

  const tests: Test[] = [
    ["Requirements document 1.1: a plain requirement definition opens as a document (default view) with the owner heading, '<id> : <name>' and the text", scenario("MFA1", async ({ m, qn }) => {
      const x = await m();
      assert.strictEqual(x.view, "document", "the document is the default view");
      assert.strictEqual(x.document.heading, DEF, "the owner is the heading");
      const it = x.document.items.find((i) => i.id === "MFRQ01");
      assert.ok(it, "MFRQ01 is a sub-heading");
      assert.strictEqual(it.name, ORE);
      assert.match(it.text, /Mining Frigate shall extract ore/);
      assert.strictEqual(it.owner, `MFA1::${DEF}`);
      assert.strictEqual(x.overflow.count, 0, x.overflow.samples.join(", "));
      void qn;
    })],

    ["Requirements document 1.1: a plain package renders as a document too, and the table at normal width does not overlap", scenario("MFA2", async ({ m, scope, g }) => {
      const x = await m();
      assert.strictEqual(x.view, "document");
      assert.strictEqual(x.document.heading, "MFA2");
      assert.ok(x.document.outline.some((o) => o.heading === "Appendices"), "the nested package is a section");
      assert.ok(x.document.items.some((i) => i.id === "MFRQ02"), "requirements of the nested definition are shown");
      await g({ kind: "click", selector: "[data-testid=tab-table]" });
      await api.requirements.setWidth(scope, 1100);
      try {
        const t = await m();
        assert.strictEqual(t.view, "table");
        assert.strictEqual(t.overflow.count, 0, `no overlap in the table: ${t.overflow.samples.join(", ")}`);
        assert.ok(t.layout.textWidths.every((w) => w >= 200), "the text cell keeps its width");
      } finally {
        await api.requirements.setWidth(scope, null);
      }
    }, { root: "MFA2" })],

    ["Requirements document 1.1: editing the paragraph and the heading of a requirement in place rewrites the doc and the id at once", scenario("MFA3", async ({ m, g, qn, file, text, before }) => {
      const key = (f: string) => `[data-key="${qn("MFRQ02Cargo".replace("MFRQ02Cargo", "CargoCapacityRequirement"))}|${f}"]`;
      await g({ kind: "input", selector: key("text"), value: "The cargo hold shall carry at least 15000 tonnes of ore." });
      await waitFor(() => text().includes("15000 tonnes"), 90000, "the doc has the new text");
      await clean(file);
      await g({ kind: "input", selector: key("id"), value: "MFRQ02a" });
      await waitFor(() => text().includes("<'MFRQ02a'> CargoCapacityRequirement"), 90000, "the id was rewritten");
      await clean(file);
      await parses(file);
      assert.ok(!text().includes("12000 tonnes"));
      assert.notStrictEqual(text(), before);
      assert.strictEqual((await m()).document.items.find((i) => i.id === "MFRQ02a")?.name, "CargoCapacityRequirement");
    })],

    ["Requirements document 1.2: '+ requirement' opens inline id and name inputs, writes on confirm, and Escape writes nothing; there is no Add Requirement bar", scenario("MFA4", async ({ m, g, file, text, before, order }) => {
      await g({ kind: "click", selector: "[data-testid=tab-table]" });
      await assert.rejects(g({ kind: "click", selector: "[data-testid=add-req]" }), "the Add Requirement bar is gone");
      await g({ kind: "click", selector: "[data-testid=tab-document]" });
      await g({ kind: "click", selector: "[data-testid=add-root-requirement]" });
      let a = (await m()).document.authoring;
      assert.strictEqual(a.inputs, true, "inline inputs are open");
      await g({ kind: "input", selector: "[data-testid=new-id]", value: "MFRQ09", event: "input" });
      await g({ kind: "input", selector: "[data-testid=new-name]", value: "Typed", event: "input" });
      assert.strictEqual(text(), before, "nothing is written before confirming");
      await g({ kind: "key", selector: "[data-testid=new-name]", key: "Escape" });
      a = (await m()).document.authoring;
      assert.strictEqual(a.inputs, false, "Escape closes the inputs");
      await sleep(400);
      assert.strictEqual(text(), before, "Escape wrote nothing");
      await g({ kind: "click", selector: "[data-testid=add-root-requirement]" });
      await g({ kind: "input", selector: "[data-testid=new-id]", value: "MFRQ04", event: "input" });
      await g({ kind: "input", selector: "[data-testid=new-name]", value: "WarpRequirement", event: "input" });
      await g({ kind: "key", selector: "[data-testid=new-name]", key: "Enter" });
      await waitFor(() => text().includes("<'MFRQ04'> WarpRequirement"), 90000, "the requirement is written on confirm");
      assert.deepStrictEqual(order().slice(-1), ["MFRQ04"], "at the end of the section");
      await clean(file);
      await parses(file);
    })],

    ["Requirements document 1.3: nesting by ownership gives computed numbers 1, 1.1, 1.2, none in the text; the table of contents lists requirements; collapse hides sub-headings", scenario("MFA5", async ({ m, g, qn, text }) => {
      const x = await m();
      const nums = x.document.items.map((i) => `${i.number} ${i.id}`);
      assert.deepStrictEqual(nums, ["1 MFRQ01", "1.1 MFRQ01_1", "1.2 MFRQ01_2", "2 MFRQ02", "3 MFRQ03"]);
      assert.ok(!/\b1\.1\b/.test(text()), "no number is stored in the text");
      assert.deepStrictEqual(x.document.toc.filter((t) => t.kind === "requirement").map((t) => `${t.number} ${t.heading}`), ["1 MFRQ01 : OreExtractionEfficiencyRequirement", "1.1 MFRQ01_1 : ExtractorYield", "1.2 MFRQ01_2 : ExtractorWear", "2 MFRQ02 : CargoCapacityRequirement", "3 MFRQ03 : ShieldRequirement"]);
      assert.ok(x.document.items.every((i) => i.visible));
      await g({ kind: "click", selector: `${head(qn(ORE))} [data-testid=collapse]` });
      const y = await m();
      assert.strictEqual(y.document.items.find((i) => i.id === "MFRQ01")?.collapsed, true);
      assert.deepStrictEqual(y.document.items.filter((i) => !i.visible).map((i) => i.id), ["MFRQ01_1", "MFRQ01_2"], "the sub-headings are hidden");
      await g({ kind: "click", selector: `${head(qn(ORE))} [data-testid=collapse]` });
      assert.ok((await m()).document.items.every((i) => i.visible), "expanded again");
    })],

    ["Requirements palette 2.1: right-click opens the palette; Child Requirement shows a ghost and a live gap below MFRQ01; a click confirms, inline inputs, the requirement is written inside MFRQ01; screenshot", scenario("MFA6", async ({ m, g, qn, file, text, before, scope }) => {
      mkdirSync(c.artifactDir, { recursive: true });
      await g({ kind: "mouse", type: "contextmenu", selector: ".titleblock .hint" });
      assert.strictEqual((await m()).document.authoring.mode, "palette");
      await g({ kind: "click", selector: "[data-testid=palette-child]" });
      let a = (await m()).document.authoring;
      assert.strictEqual(a.mode, "add");
      assert.strictEqual(a.what, "child");
      assert.ok(a.visibleGaps > 0, "the allowed gaps show");
      // a gap inside a requirement; the ones at the top level of the owner do not accept a child
      await g({ kind: "mouse", type: "pointermove", selector: gap(qn(ORE)), at: "left" });
      a = (await m()).document.authoring;
      assert.ok(a.ghost, "the ghost follows the pointer");
      assert.deepStrictEqual(a.activeGap && { owner: a.activeGap.owner, level: a.activeGap.level }, { owner: qn(ORE), level: 1 }, "the live gap is the end of MFRQ01, one level in");
      assert.strictEqual(text(), before, "nothing is written while moving");
      const png = Buffer.from(await api.requirements.png(scope), "base64");
      assert.ok(png.length > 8000);
      writeFileSync(path.join(c.artifactDir, `requirements-palette-gap-${(await m()).theme}.png`), png);
      // moving to the end of another owner level moves the gap
      await g({ kind: "mouse", type: "pointermove", selector: gap(`MFA6::${DEF}`), at: "left" });
      assert.strictEqual((await m()).document.authoring.activeGap?.level, 0, "the sibling level");
      await g({ kind: "mouse", type: "pointermove", selector: gap(qn(ORE)), at: "left" });
      await g({ kind: "mouse", type: "click", selector: gap(qn(ORE)), at: "left" });
      a = (await m()).document.authoring;
      assert.strictEqual(a.mode, "naming");
      assert.strictEqual(a.inputs, true);
      assert.strictEqual(text(), before, "still nothing written");
      await g({ kind: "input", selector: "[data-testid=new-id]", value: "MFRQ01_3", event: "input" });
      await g({ kind: "input", selector: "[data-testid=new-name]", value: "ExtractorNoise", event: "input" });
      await g({ kind: "key", selector: "[data-testid=new-name]", key: "Enter" });
      await waitFor(() => text().includes("<'MFRQ01_3'> ExtractorNoise"), 90000, "written");
      await clean(file);
      await parses(file);
      await waitFor(() => owner(qn(`${ORE}::ExtractorNoise`)) === qn(ORE), 20000, "the new requirement is owned by MFRQ01");
      assert.strictEqual((await m()).document.items.find((i) => i.id === "MFRQ01_3")?.number, "1.3");
    })],

    ["Requirements palette 2.1: a Package ghost over a requirement opens no gap; Escape after the click writes nothing", scenario("MFA7", async ({ m, g, qn, text, before }) => {
      await g({ kind: "mouse", type: "contextmenu", selector: ".titleblock .hint" });
      await g({ kind: "click", selector: "[data-testid=palette-package]" });
      let a = (await m()).document.authoring;
      assert.strictEqual(a.what, "package");
      await g({ kind: "mouse", type: "pointermove", selector: item(qn("CargoCapacityRequirement")) });
      a = (await m()).document.authoring;
      assert.strictEqual(a.activeGap, undefined, "no gap opens over a requirement");
      assert.strictEqual(a.ghost, true, "the ghost still follows");
      await g({ kind: "mouse", type: "pointermove", selector: "[data-target=section]" });
      a = (await m()).document.authoring;
      assert.strictEqual(a.activeGap?.target, "section", "a gap between sections opens");
      await g({ kind: "mouse", type: "click", selector: "[data-target=section].open" });
      assert.strictEqual((await m()).document.authoring.inputs, true);
      await g({ kind: "input", selector: "[data-testid=new-name]", value: "Typed", event: "input" });
      await g({ kind: "key", selector: "[data-testid=new-name]", key: "Escape" });
      assert.strictEqual((await m()).document.authoring.mode, "none");
      await sleep(400);
      assert.strictEqual(text(), before, "Escape wrote nothing");
    }, { root: "MFA7" })],

    ["Requirements palette 2.1: Requirement writes a sibling at the chosen gap, above MFRQ02", scenario("MFA8", async ({ m, g, qn, file, text, order }) => {
      await g({ kind: "mouse", type: "contextmenu", selector: ".titleblock .hint" });
      await g({ kind: "click", selector: "[data-testid=palette-requirement]" });
      await g({ kind: "mouse", type: "pointermove", selector: gap(`MFA8::${DEF}`, qn("CargoCapacityRequirement")), at: "left" });
      assert.strictEqual((await m()).document.authoring.activeGap?.before, qn("CargoCapacityRequirement"));
      await g({ kind: "mouse", type: "click", selector: gap(`MFA8::${DEF}`, qn("CargoCapacityRequirement")), at: "left" });
      await g({ kind: "input", selector: "[data-testid=new-id]", value: "MFRQ01B", event: "input" });
      await g({ kind: "input", selector: "[data-testid=new-name]", value: "Between", event: "input" });
      await g({ kind: "key", selector: "[data-testid=new-name]", key: "Enter" });
      await waitFor(() => text().includes("MFRQ01B"), 90000, "written");
      assert.deepStrictEqual(order(), ["MFRQ01", "MFRQ01_1", "MFRQ01_2", "MFRQ01B", "MFRQ02", "MFRQ03"]);
      await clean(file);
      await parses(file);
      await m();
    })],

    ["Requirements drag 2.2: dropping MFRQ02 above MFRQ01 moves the declaration; Move down and Alt+Down; nesting by dropping onto a requirement creates { }; dragging out un-nests", scenario("MFA9", async ({ m, g, qn, file, text, order }) => {
      const def = `MFA9::${DEF}`;
      await g({ kind: "mouse", type: "pointerdown", selector: handle(qn("CargoCapacityRequirement")) });
      await g({ kind: "mouse", type: "pointermove", selector: gap(def, qn(ORE)), at: "left" });
      const a = (await m()).document.authoring;
      assert.strictEqual(a.mode, "drag");
      assert.strictEqual(a.activeGap?.before, qn(ORE), "the live gap above MFRQ01");
      assert.ok(a.ghost);
      await g({ kind: "mouse", type: "pointerup", selector: gap(def, qn(ORE)), at: "left" });
      await waitFor(() => order()[0] === "MFRQ02", 90000, "MFRQ02 was moved above");
      await clean(file);
      await parses(file);
      assert.deepStrictEqual(order(), ["MFRQ02", "MFRQ01", "MFRQ01_1", "MFRQ01_2", "MFRQ03"]);
      // Move down (button), then Alt+Down from the keyboard
      await g({ kind: "click", selector: `${head(qn("CargoCapacityRequirement"))} [data-testid=req-move-down]` });
      await waitFor(() => order()[0] === "MFRQ01", 90000, "moved down");
      await g({ kind: "key", selector: `${head(qn("CargoCapacityRequirement"))} input.name`, key: "ArrowDown", alt: true });
      await waitFor(() => order().at(-1) === "MFRQ02", 90000, "moved down again");
      assert.deepStrictEqual(order(), ["MFRQ01", "MFRQ01_1", "MFRQ01_2", "MFRQ03", "MFRQ02"]);
      // nest MFRQ02 into MFRQ03 (it has no body: { } is created)
      await g({ kind: "mouse", type: "pointerdown", selector: handle(qn("CargoCapacityRequirement")) });
      await g({ kind: "mouse", type: "pointermove", selector: head(qn("ShieldRequirement")) });
      assert.strictEqual((await m()).document.authoring.nestTarget, qn("ShieldRequirement"), "dropping onto a requirement nests");
      await g({ kind: "mouse", type: "pointerup", selector: head(qn("ShieldRequirement")) });
      await waitFor(() => owner(qn("ShieldRequirement::CargoCapacityRequirement")) === qn("ShieldRequirement"), 90000, "nested");
      assert.match(text(), /<'MFRQ03'> ShieldRequirement \{[\s\S]*<'MFRQ02'> CargoCapacityRequirement/);
      await clean(file);
      await parses(file);
      await eventually(async () => assert.strictEqual((await m()).document.items.find((i) => i.id === "MFRQ02")?.number, "2.1"), "renumbered");
      // drag it out to the end of the owner
      await g({ kind: "mouse", type: "pointerdown", selector: handle(qn("ShieldRequirement::CargoCapacityRequirement")) });
      await g({ kind: "mouse", type: "pointermove", selector: gap(def), at: "left" });
      await g({ kind: "mouse", type: "pointerup", selector: gap(def), at: "left" });
      await waitFor(() => owner(qn("CargoCapacityRequirement")) === def, 90000, "un-nested");
      await clean(file);
      await parses(file);
    })],

    ["Requirements drag 2.2: a move that would change what a name resolves to is refused with a reason and nothing changes", scenario("MFA10", async ({ m, scope, text, before }) => {
      const r = await api.requirements.intent(scope, { type: "moveRequirement", qn: "MFA10::B::X", how: { ownerQn: "MFA10::C" } });
      assert.strictEqual(r.ok, false);
      assert.match(r.message ?? "", /change what existing names refer to|no longer resolve|resolve/i);
      await eventually(async () => assert.strictEqual((await m()).notice?.level, "error"), "the reason is shown");
      assert.strictEqual(text(), before);
    }, { root: "MFA10", probe: "MFA10::C", text: "package MFA10 {\n    package A {\n        requirement <'RA'> X;\n    }\n    package B {\n        requirement <'RB'> X;\n    }\n    package C {\n        private import A::*;\n        part y : X;\n    }\n}\n" })],

    ["Artifacts: the requirements document in the dark and the light theme", scenario("MFA11", async ({ m, scope }) => {
      mkdirSync(c.artifactDir, { recursive: true });
      const save = async (theme: "dark" | "light") => {
        await eventually(async () => assert.strictEqual((await m()).theme, theme), `the webview follows the ${theme} theme`, 30000);
        const x = await m();
        assert.strictEqual(x.overflow.count, 0, `${theme}: ${x.overflow.samples.join(", ")}`);
        const png = Buffer.from(await api.requirements.png(scope), "base64");
        assert.ok(png.length > 8000);
        writeFileSync(path.join(c.artifactDir, `requirements-document-${theme}.png`), png);
      };
      await save("dark");
      const cfg = vscode.workspace.getConfiguration();
      try {
        await cfg.update("workbench.colorTheme", "Default Light Modern", vscode.ConfigurationTarget.Global);
        await save("light");
      } finally {
        await cfg.update("workbench.colorTheme", undefined, vscode.ConfigurationTarget.Global);
      }
    })],
  ];
  return tests;
}
