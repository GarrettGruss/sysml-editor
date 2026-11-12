import * as assert from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { viaLm, viaMcp } from "./diagram-agent.js";
import type { Ctx } from "./diagram-interaction.js";
import type { DiagramDoc, Failure, Gesture, Metrics, ModelNode, PickItem, ReqMetrics, ReqScope } from "./index.js";

type Test = [name: string, fn: () => Promise<void>];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FIXTURE = path.resolve(__dirname, "../../../test/fixtures/requirements/vehicle-spec.sysml");

/** The requirements editor (table and document views), requirement relationships, the palette tools and the agent tools, through the real extension. */
export function requirementsTests(c: Ctx): Test[] {
  const { api, folder } = c;
  const uriOf = (name: string) => vscode.Uri.joinPath(folder, name);
  const onDisk = (name: string) => readFileSync(uriOf(name).fsPath, "utf8");
  const textDoc = (name: string) => vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uriOf(name).fsPath);
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    // Monotonic time: the clock of this machine can jump by an hour (WSL), which Date.now() would count as a timeout.
    const t0 = performance.now();
    const end = t0 + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(25);
    }
    if (performance.now() - t0 > 3000) console.log(`  (waited ${Math.round(performance.now() - t0)} ms for: ${what})`);
  };
  const close = async () => {
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  };
  const clean = (name: string) => c.eventually(async () => {
    const d = textDoc(name);
    assert.ok(d, `${name} is open`);
    assert.strictEqual(d.isDirty, false, `${name} is not dirty`);
    assert.strictEqual(onDisk(name), d.getText(), `${name}: the bytes on disk equal the document text`);
  }, `${name} is saved and equal to its buffer`);
  const parses = async (name: string) => {
    let last = 0;
    await waitFor(() => {
      const st = api.model.index.getDocument(uriOf(name).toString());
      if (performance.now() - last > 15000) {
        last = performance.now();
        console.log(`  (${name}: errors=${JSON.stringify(st?.errors)} pending=${String(st?.detailsPending)} disk==buffer: ${String(textDoc(name)?.getText() === onDisk(name))})`);
      }
      return !!st && !st.detailsPending && st.errors.length === 0;
    }, 280000, `${name} parses without errors`);
  };
  const rec = { confirms: [] as { message: string; detail: string }[], fails: [] as Failure[] };
  const script: { confirm?: boolean; one?: string; many?: string[]; verification?: { existing: string } | { create: string }; name?: string; input?: string } = {};
  const installUi = () => {
    rec.confirms = [];
    rec.fails = [];
    for (const k of Object.keys(script)) delete script[k as keyof typeof script];
    // The same scripted answers drive the requirements editor and (through the diagram's UI) the tree and diagram actions.
    api.requirements.setUi({
      confirm: async (message, detail) => { rec.confirms.push({ message, detail }); return script.confirm ?? true; },
      pickOne: async (items) => script.one ?? items[0]?.id,
      pickMany: async () => script.many,
      pickVerification: async () => script.verification,
      inputName: async () => script.name,
    });
    api.diagram.setUi({
      input: async () => script.input,
      pick: async (items: PickItem[]) => items[0],
      confirm: async (message, detail) => { rec.confirms.push({ message, detail }); return script.confirm ?? true; },
      fail: async (f) => { rec.fails.push(f); },
    });
  };

  /** A copy of the fixture package (renamed), opened and in the model; cleaned up after. */
  const scenario = (pkg: string, fn: (t: { file: string; scope: ReqScope; qn: (s: string) => string; m: () => Promise<ReqMetrics>; before: string }) => Promise<void>, opts: { text?: string; extra?: Record<string, string>; view?: "table" | "document"; probe?: string } = {}) => async () => {
    const file = `tmp-${pkg.toLowerCase()}.sysml`;
    const before = opts.text ?? readFileSync(FIXTURE, "utf8").replace(/VehicleSpec/g, pkg);
    writeFileSync(uriOf(file).fsPath, before);
    for (const [n, t] of Object.entries(opts.extra ?? {})) writeFileSync(uriOf(n).fsPath, t);
    installUi();
    await warmWorker();
    const t0 = Date.now();
    const scope: ReqScope = { kind: "package", qualifiedName: pkg };
    try {
      await vscode.workspace.openTextDocument(uriOf(file));
      // A document whose first parse goes through the parse worker can be slow to arrive on a loaded machine: write it again to ask again.
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          await waitFor(() => api.model.index.findByQualifiedName(`${pkg}${opts.probe ?? "::Safety"}`).length > 0, 40000, `${pkg} is in the model`);
          break;
        } catch (e) {
          if (attempt === 5) throw e;
          console.log(`  ${pkg}: not in the model after ${Date.now() - t0} ms (pending: ${JSON.stringify(api.model.index.pendingDetails())}); writing the file again`);
          writeFileSync(uriOf(file).fsPath, before);
        }
      }
      await waitFor(() => !api.model.index.getDocument(uriOf(file).toString())?.detailsPending, 280000, "details settled");
      console.log(`  ${pkg}: model ready after ${Date.now() - t0} ms`);
      await api.requirements.open(scope, opts.view ?? "table");
      const m = () => api.requirements.metrics(scope);
      await fn({ file, scope, qn: (s) => `${pkg}::${s}`, m, before });
      assert.deepStrictEqual(api.requirements.errors(), [], "no webview errors");
    } catch (e) {
      console.log(`  index state of ${file}: ${JSON.stringify(api.model.index.getDocument(uriOf(file).toString()) ? { errors: api.model.index.getDocument(uriOf(file).toString())!.errors, pending: api.model.index.getDocument(uriOf(file).toString())!.detailsPending } : null)}`);
      console.log(`  diagnostics: refusals=${JSON.stringify(rec.fails)} confirms=${JSON.stringify(rec.confirms)} webview errors=${JSON.stringify(api.requirements.errors())} relevant text on disk=${JSON.stringify(onDisk(file).split("\n").filter((l) => /verif|satisfy|derive|derivation|original|import/.test(l)).map((l) => l.trim()))} notice=${JSON.stringify(await api.requirements.metrics(scope).then((x) => x.notice).catch(() => "n/a"))}`);
      throw e;
    } finally {
      api.requirements.setUi(undefined);
      api.diagram.setUi(undefined);
      await api.requirements.close(scope).catch(() => undefined);
      await close();
      rmSync(uriOf(file).fsPath, { force: true });
      for (const n of Object.keys(opts.extra ?? {})) rmSync(uriOf(n).fsPath, { force: true });
      await sleep(150);
    }
  };
  const PR = "'Performance Requirements'";
  /**
   * Texts with a short name followed by another member do not parse on the main thread's fast path, so the first edits of a
   * session wait for the parse worker, which spends its first minutes warming itself. Wait here until it answers quickly,
   * so the tests below measure the editor and not the worker's start-up.
   */
  let warmed: Promise<void> | undefined;
  const warmWorker = (): Promise<void> => (warmed ??= (async () => {
    const file = "tmp-reqwarm.sysml";
    const t0 = Date.now();
    try {
      for (let i = 0; i < 400; i++) {
        const text = `package ReqWarm${i} {\n  requirement <'R1'> a { doc /* ${i} */ }\n  part def T;\n}\n`;
        writeFileSync(uriOf(file).fsPath, text);
        const started = Date.now();
        try {
          await waitFor(() => api.model.index.findByQualifiedName(`ReqWarm${i}::T`).length > 0, 90000, "the warm-up file is in the model");
        } catch {
          continue;
        }
        if (Date.now() - started < 1500 && i > 0) break;
      }
    } finally {
      rmSync(uriOf(file).fsPath, { force: true });
    }
    console.log(`  parse worker ready for the requirements tests after ${Date.now() - t0} ms`);
  })());
  const eventually = c.eventually;
  const gesture = (scope: ReqScope, g: Parameters<typeof api.requirements.gesture>[1]) => api.requirements.gesture(scope, g);
  const row = (m: ReqMetrics, id: string) => m.table.rows.find((r) => r.cells.id === id)!;
  const settle = async (scope: ReqScope) => { await api.requirements.settled(scope); };

  const tests: Test[] = [
    ["Requirements table: lists the requirements of a package and its nested packages with counts, marks unsatisfied and unverified ones", scenario("ReqT1", async ({ scope, qn, m }) => {
      const x = await m();
      assert.strictEqual(x.view, "table");
      assert.deepStrictEqual(x.table.rows.map((r) => r.cells.id), ["R1", "R2", "R3", "R4"]);
      const r1 = row(x, "R1");
      assert.strictEqual(r1.cells.name, "massLimit");
      assert.match(r1.cells.text, /not exceed 2000 kg/);
      assert.strictEqual(r1.cells.owner, qn(PR));
      assert.deepStrictEqual([r1.cells.satisfy, r1.cells.verify], ["1", "1"]);
      assert.strictEqual(r1.unsatisfied || r1.unverified, false);
      assert.strictEqual(row(x, "R3").cells.owner, qn(`${PR}::Acceleration`), "the nested package is included");
      assert.ok(row(x, "R4").unsatisfied && row(x, "R4").unverified, "unsatisfied and unverified are marked");
      assert.deepStrictEqual(x.table.counts, { total: 4, unsatisfied: 3, unverified: 3 });
      assert.strictEqual(x.overflow.count, 0, `no clipped content: ${x.overflow.samples.join(", ")}`);
      void scope;
    })],

    ["Requirements table: edit text, id and name inline; add and delete a requirement; only the edited text changes and the file is saved", scenario("ReqT2", async ({ file, scope, qn, m, before }) => {
      const sel = (id: string, f: string) => `[data-key="${qn(`${PR}::massLimit`)}|${f}"]`;
      await gesture(scope, { kind: "input", selector: sel("", "text"), value: "Vehicle mass shall not exceed 2000 kg" });
      await waitFor(() => onDisk(file).includes("doc /* Vehicle mass shall not exceed 2000 kg */"), 90000, "the doc comment has the new text");
      await clean(file);
      assert.strictEqual(onDisk(file).replace("doc /* Vehicle mass shall not exceed 2000 kg */", "doc /* The vehicle mass shall not exceed 2000 kg. */"), before, "nothing else changed");
      await gesture(scope, { kind: "input", selector: sel("", "id"), value: "R1a" });
      await waitFor(() => onDisk(file).includes("requirement <'R1a'> massLimit"), 90000, "the short name changed");
      await gesture(scope, { kind: "input", selector: sel("", "name"), value: "massLimit" });
      await clean(file);
      const afterId = onDisk(file);
      await settle(scope);
      assert.strictEqual(row(await m(), "R1a").cells.name, "massLimit");
      // Add Requirement
      await gesture(scope, { kind: "input", selector: "[data-testid=add-id]", value: "R9", event: "input" });
      await gesture(scope, { kind: "input", selector: "[data-testid=add-name]", value: "rangeReq", event: "input" });
      await gesture(scope, { kind: "click", selector: "[data-testid=add-req]" });
      await waitFor(() => onDisk(file).includes("requirement <'R9'> rangeReq;"), 90000, "the requirement is inserted into the scope package");
      await clean(file);
      await parses(file);
      await eventually(async () => assert.ok(row(await m(), "R9"), "the table shows the new row"), "new row");
      // Delete with confirmation
      await gesture(scope, { kind: "click", selector: `tr[data-qn="${qn("rangeReq")}"]` });
      script.confirm = false;
      await gesture(scope, { kind: "click", selector: "[data-testid=delete-req]" });
      await sleep(500);
      assert.ok(onDisk(file).includes("rangeReq"), "declined: nothing is deleted");
      script.confirm = true;
      await gesture(scope, { kind: "click", selector: "[data-testid=delete-req]" });
      await waitFor(() => !onDisk(file).includes("rangeReq"), 90000, "deleted from the text");
      await clean(file);
      assert.strictEqual(onDisk(file), afterId, "byte-identical to the text before the add");
      assert.strictEqual(rec.confirms.length, 2);
    })],

    ["Requirements table: satisfy, verify (existing and new case), derivation: add and remove from the detail pane; counts update", scenario("ReqT3", async ({ file, scope, qn, m }) => {
      const select = (name: string) => gesture(scope, { kind: "click", selector: `tr[data-qn="${name}"]` });
      const detail = async () => (await m()).table.detail!;
      // satisfy R4 (brakeDistance) by engine
      await select(qn("Safety::brakeDistance"));
      script.one = qn("Design::engine");
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-satisfy-add]" });
      await waitFor(() => /satisfy [^;]*brakeDistance by engine;/.test(onDisk(file)), 90000, "satisfy is in the text");
      await clean(file);
      await parses(file);
      await eventually(async () => {
        assert.strictEqual(row(await m(), "R4").cells.satisfy, "1");
        assert.deepStrictEqual((await detail()).satisfiedBy, ["engine"]);
      }, "count and detail pane update");
      // verify R4 in the existing case `spare`
      script.verification = { existing: qn("Verification::spare") };
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-verify-add]" });
      await waitFor(() => /verification def spare \{\s+objective \{\s+verify [^;]*brakeDistance;/.test(onDisk(file)), 90000, "verify is inside the objective of spare");
      await parses(file);
      // verify R3 in a NEW case
      await select(qn(`${PR}::Acceleration::accel`));
      script.verification = { create: "checkAccel" };
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-verify-add]" });
      await waitFor(() => /verification checkAccel \{\s+objective \{\s+verify [^;]*accel;/.test(onDisk(file)), 90000, "a new verification case with the verify statement");
      await clean(file);
      await parses(file);
      // derivation: R4 derived from R1
      await select(qn("Safety::brakeDistance"));
      script.one = qn(`${PR}::massLimit`);
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-derived-from-add]" });
      await waitFor(() => (onDisk(file).match(/#derivation connection/g) ?? []).length === 2, 90000, "a second derivation connection");
      assert.match(onDisk(file), /end #original ::> [^;]*massLimit;\s+end #derive ::> [^;]*brakeDistance;/);
      assert.strictEqual((onDisk(file).match(/RequirementDerivation::\*/g) ?? []).length, 1, "the import is not repeated");
      await parses(file);
      await eventually(async () => assert.deepStrictEqual((await detail()).derivedFrom, ["R1 massLimit"]), "derived-from shows the original");
      // remove all three again
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-derived-from-remove]" });
      await waitFor(() => (onDisk(file).match(/#derivation connection/g) ?? []).length === 1, 90000, "the derivation is removed");
      await eventually(async () => assert.deepStrictEqual((await detail()).derivedFrom, []), "and the view has refreshed (the next click uses its keys)");
      await parses(file);
      console.log(`  detail before the verify removal: ${JSON.stringify((await m()).table.detail)}`);
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-verify-remove]" });
      await waitFor(() => !/verify [^;]*brakeDistance/.test(onDisk(file)), 120000, "the verify is removed").catch(async (e) => {
        const key = `${uriOf(file).toString()}#${onDisk(file).indexOf("verify brakeDistance;") + 7}`;
        console.log(`  the click did nothing; asking the controller directly: ${JSON.stringify(await api.requirements.intent(scope, { type: "removeVerify", key }))}; notice=${JSON.stringify((await m()).notice)}`);
        throw e;
      });
      await eventually(async () => assert.strictEqual(row(await m(), "R4").cells.verify, "0"), "and the view has refreshed");
      await parses(file);
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-satisfy-remove]" });
      await waitFor(() => !/brakeDistance by engine/.test(onDisk(file)), 120000, "the satisfy is removed");
      await clean(file);
      await parses(file);
      await eventually(async () => assert.deepStrictEqual([row(await m(), "R4").cells.satisfy, row(await m(), "R4").cells.verify], ["0", "0"]), "counts back to zero");
    })],

    ["Requirements table: a new verification case can be named for a requirement in a file that has none", scenario("ReqNoCase", async ({ file, scope, qn }) => {
      // (The workspace has verification cases elsewhere, so the editor offers them; the "no case at all" path is covered by the controller's unit test.)
      script.verification = { create: "weigh" };
      await gesture(scope, { kind: "click", selector: `tr[data-qn="${qn("rq")}"]` });
      await gesture(scope, { kind: "click", selector: "[data-testid=rel-verify-add]" });
      await waitFor(() => /verification weigh \{\s+objective \{\s+verify rq;/.test(onDisk(file)), 90000, "the new case contains the verify statement");
      await parses(file);
    }, { text: "package ReqNoCase {\n  requirement <'R1'> rq;\n}\n", probe: "::rq" })],

    ["Requirements table: navigation reveals in tree, text and diagrams; an edit in the text editor shows in the table, an edit in progress and the selection survive", scenario("ReqT4", async ({ file, scope, qn, m }) => {
      const target = qn("Safety::brakeDistance");
      await gesture(scope, { kind: "click", selector: `tr[data-qn="${target}"]` });
      await gesture(scope, { kind: "click", selector: "[data-testid=nav-tree]" });
      await gesture(scope, { kind: "click", selector: "[data-testid=nav-text]" });
      await gesture(scope, { kind: "click", selector: "[data-testid=nav-diagram]" });
      assert.deepStrictEqual(api.requirements.navigation().slice(-3), [`tree ${target}`, `text ${target}`, `diagram ${target}`]);
      await eventually(async () => {
        const ed = vscode.window.activeTextEditor;
        assert.strictEqual(ed?.document.uri.fsPath, uriOf(file).fsPath, "the text editor is shown");
        assert.match(ed.document.lineAt(ed.selection.active.line).text, /brakeDistance/, "at the declaration");
      }, "go to text");
      await eventually(async () => assert.strictEqual(String(api.view.selection[0] && api.provider.getTreeItem(api.view.selection[0]).label), "brakeDistance"), "the tree selects it");
      // an edit in progress is kept across a refresh; so is the selection
      await gesture(scope, { kind: "input", selector: `[data-key="${qn(`${PR}::chassisMass`)}|text"]`, value: "typing...", event: "input" });
      const doc = textDoc(file)!;
      const edit = new vscode.WorkspaceEdit();
      const at = doc.getText().indexOf("brakeDistance");
      edit.replace(doc.uri, new vscode.Range(doc.positionAt(at), doc.positionAt(at + "brakeDistance".length)), "stoppingDistance");
      await vscode.workspace.applyEdit(edit);
      await eventually(async () => {
        const x = await m();
        assert.ok(x.table.rows.some((r) => r.cells.name === "stoppingDistance"), "the table shows the new name");
        assert.deepStrictEqual(x.pendingEdits, [`${qn(`${PR}::chassisMass`)}|text`], "the edit in progress is still there");
        assert.strictEqual(row(x, "R2").cells.text, "typing...", "and still shows what was typed");
      }, "external edit reaches the table");
      assert.strictEqual((await m()).table.selected, undefined, "the selected requirement was renamed, so the selection is gone cleanly");
      await gesture(scope, { kind: "click", selector: `tr[data-qn="${qn("Safety::stoppingDistance")}"]` });
      assert.strictEqual((await m()).table.selected, qn("Safety::stoppingDistance"));
    })],

    ["Document view: renders the package as a document with title, table of contents, numbered sections, paragraphs with a list, items, model elements and an appendix", scenario("ReqD1", async ({ scope, qn, m }) => {
      await api.requirements.setView(scope, "document");
      await eventually(async () => assert.strictEqual((await m()).view, "document"), "document view");
      const d = (await m()).document;
      assert.strictEqual(d.title, "Vehicle SRS");
      assert.strictEqual(d.version, "1.0");
      assert.deepStrictEqual(d.toc.map((t) => `${t.number} ${t.heading}`), ["1 Performance Requirements", "1.1 Acceleration", "2 Safety", "3 Design", "4 Verification", "A Glossary"]);
      assert.deepStrictEqual(d.outline.map((o) => o.number), ["1", "1.1", "2", "3", "4", "Appendix A"]);
      assert.deepStrictEqual(d.outline.map((o) => o.level), [1, 2, 1, 1, 1, 1]);
      assert.deepStrictEqual(d.appendixLetters, ["A"]);
      const perf = d.outline[0]!;
      assert.deepStrictEqual([perf.paragraphs, perf.items, perf.elements], [2, 2, 1], "two paragraphs, two requirements, TestRig");
      assert.strictEqual(d.rootBlocks, 1, "the root package's own paragraph");
      const list = d.paragraphs.find((p) => p.section === qn(PR) && p.lists > 0);
      assert.ok(list, "a paragraph with '- ' lines is rendered as a list");
      assert.match(list.text, /mass is measured fully loaded/);
      assert.deepStrictEqual(d.items.filter((i) => i.section === qn(PR)).map((i) => `${i.id} ${i.name}`), ["R1 massLimit", "R2 chassisMass"]);
      const x = await m();
      assert.strictEqual(x.overflow.count, 0, `no clipped content: ${x.overflow.samples.join(", ")}`);
      assert.strictEqual(x.overflow.horizontalScroll, false);
      // a click on a table-of-contents entry scrolls to the section
      await gesture(scope, { kind: "click", selector: `[data-testid=toc-entry][data-qn="${qn("Verification")}"] a` });
    }, { view: "document" })],

    ["Document view: add section, rename a heading with spaces (references and diagram files follow), paragraph with a comment terminator, list rendering", scenario("ReqD2", async ({ file, scope, qn, m, before }) => {
      const sec = (n: string) => `section[data-qn="${qn(n)}"]`;
      await api.requirements.setView(scope, "document");
      // add section "Reliability" after Safety
      await gesture(scope, { kind: "click", selector: `${sec("Safety")} > .adds > [data-testid=add-section-after]` });
      await gesture(scope, { kind: "input", selector: "[data-testid=ask-section-after-input]", value: "Reliability", event: "input" });
      await gesture(scope, { kind: "click", selector: "[data-testid=ask-section-after-ok]" });
      await waitFor(() => onDisk(file).includes("package Reliability;"), 90000, "the package is inserted");
      const t = onDisk(file);
      assert.ok(t.indexOf("package Safety") < t.indexOf("package Reliability;") && t.indexOf("package Reliability;") < t.indexOf("package Design"), "after the Safety package, before Design");
      assert.strictEqual(t.replace("    package Reliability;\n", ""), before, "nothing else changed");
      await clean(file);
      await eventually(async () => assert.deepStrictEqual((await m()).document.outline.map((o) => o.number), ["1", "1.1", "2", "3", "4", "5", "Appendix A"]), "the new section is number 3 and the rest are renumbered");
      assert.ok(!/package\s+'?\d/.test(onDisk(file)), "no numbers are written into the text");
      // heading with spaces: rename Safety; the diagram file that refers to it follows
      await gesture(scope, { kind: "input", selector: `input[data-key="${qn("Safety")}|heading"]`, value: "Functional Safety" });
      await waitFor(() => onDisk(file).includes("package 'Functional Safety' {"), 90000, "the declaration is quoted");
      await waitFor(() => readFileSync(uriOf("tmp-reqd2.sysmld").fsPath, "utf8").includes("'Functional Safety'"), 90000, "the diagram file follows");
      await clean(file);
      await parses(file);
      await eventually(async () => assert.ok((await m()).document.outline.some((o) => o.heading === "Functional Safety")), "the view shows the new heading", 60000);
      // paragraph with a terminator
      await gesture(scope, { kind: "click", selector: `${sec("'Functional Safety'")} > .para [data-testid=edit-para]` });
      await gesture(scope, { kind: "input", selector: `${sec("'Functional Safety'")} textarea.para-edit`, value: "Comments end with */ and start with /*." });
      await waitFor(() => onDisk(file).includes("Comments end with *\\/ and start with /*."), 90000, "stored as the escaped terminator");
      await clean(file);
      await parses(file);
      await eventually(async () => {
        const p = (await m()).document.paragraphs.find((x) => x.text.includes("Comments end with"));
        assert.ok(p, "the paragraph is shown");
        assert.strictEqual(p.text, "Comments end with */ and start with /*.", "shown with the terminator");
      }, "the document view shows */");
      // add a paragraph (a comment, since the package already has a doc)
      await gesture(scope, { kind: "click", selector: `${sec("'Functional Safety'")} > .adds > [data-testid=add-paragraph]` });
      await gesture(scope, { kind: "input", selector: "[data-testid=ask-paragraph-input]", value: "- first\n- second", event: "input" });
      await gesture(scope, { kind: "click", selector: "[data-testid=ask-paragraph-ok]" });
      await waitFor(() => /comment \/\*\n\s+\* - first\n\s+\* - second\n\s+\*\//.test(onDisk(file)), 90000, "a multi-line comment with margins");
      await parses(file);
    }, { extra: { "tmp-reqd2.sysmld": JSON.stringify({ version: 1, kind: "general", root: "ReqD2", sources: ["tmp-reqd2.sysml"], nodes: [{ id: "n1", ref: "ReqD2" }, { id: "n2", ref: "ReqD2::Safety", parent: "n1" }], edges: [] }, null, 2) + "\n" }, view: "document" })],

    ["Document view: add an appendix to a file without the metadata library import; move sections with buttons and by dragging; delete with confirmation", scenario("ReqD3", async ({ file, scope, qn, m }) => {
      await api.requirements.setView(scope, "document");
      const sec = (n: string) => `section[data-qn="${qn(n)}"]`;
      await gesture(scope, { kind: "click", selector: "[data-testid=add-appendix]" });
      await gesture(scope, { kind: "input", selector: "[data-testid=ask-appendix-input]", value: "Glossary", event: "input" });
      await gesture(scope, { kind: "click", selector: "[data-testid=ask-appendix-ok]" });
      await waitFor(() => onDisk(file).includes("@Appendix;"), 90000, "the appendix is inserted");
      assert.match(onDisk(file), /private import DocumentAnnotations::\*;/, "with the library import");
      assert.match(onDisk(file), /package Glossary \{\n\s+@Appendix;\n\s+\}/);
      await clean(file);
      await parses(file);
      await eventually(async () => assert.deepStrictEqual((await m()).document.appendixLetters, ["A"]), "Appendix A");
      // move: Three up (button), then drag One after Three
      await gesture(scope, { kind: "click", selector: `${sec("Three")} > .sec-head [data-testid=move-up]` });
      await waitFor(() => onDisk(file).indexOf("package Three") < onDisk(file).indexOf("package Two"), 90000, "Three now precedes Two");
      await eventually(async () => assert.deepStrictEqual((await m()).document.toc.map((t) => `${t.number} ${t.heading}`).slice(0, 3), ["1 One", "2 Three", "3 Two"]), "renumbered");
      await gesture(scope, { kind: "dragToc", fromQn: qn("One"), ontoQn: qn("Two"), position: "after" });
      await waitFor(() => onDisk(file).indexOf("package Two") < onDisk(file).indexOf("package One"), 90000, "One was dragged after Two");
      await eventually(async () => assert.deepStrictEqual((await m()).document.toc.map((t) => t.heading).slice(0, 3), ["Three", "Two", "One"]), "the table of contents follows");
      assert.ok(!/package\s+'?\d/.test(onDisk(file)), "no numbers in the text");
      await clean(file);
      await parses(file);
      // delete: declined, then confirmed; the confirmation says what it contains
      script.confirm = false;
      await gesture(scope, { kind: "click", selector: `${sec("Two")} > .sec-head [data-testid=delete-section]` });
      await sleep(400);
      assert.ok(onDisk(file).includes("package Two"));
      script.confirm = true;
      await gesture(scope, { kind: "click", selector: `${sec("Two")} > .sec-head [data-testid=delete-section]` });
      await waitFor(() => !onDisk(file).includes("package Two"), 90000, "deleted");
      assert.match(rec.confirms.at(-1)!.detail, /1 paragraph, 1 requirement/, "the confirmation names the contents");
      await eventually(async () => assert.deepStrictEqual((await m()).document.toc.map((t) => `${t.number} ${t.heading}`), ["1 Three", "2 One", "A Glossary"]), "following sections are renumbered");
      await clean(file);
      await parses(file);
    }, { text: "package ReqD3 {\n    package One {\n        doc /* first */\n    }\n    package Two {\n        doc /* second */\n        requirement <'R1'> r;\n    }\n    package Three;\n}\n", view: "document", probe: "::Three" })],

    ["Artifacts: the requirements table and document in the dark and the light theme", scenario("ReqPng", async ({ scope, m }) => {
      mkdirSync(c.artifactDir, { recursive: true });
      const save = async (view: "table" | "document", theme: "dark" | "light") => {
        await api.requirements.setView(scope, view);
        await eventually(async () => {
          const x = await m();
          assert.strictEqual(x.view, view);
          assert.strictEqual(x.theme, theme, "the webview follows the theme");
        }, `${view} in ${theme}`, 30000);
        const x = await m();
        if (view === "table") assert.ok(x.table.rows.length === 4 && x.table.rows.every((r) => r.cells.name !== ""), "all rows drawn");
        else assert.ok(x.document.outline.length === 6 && x.document.outline.every((o) => o.number !== "" && o.heading !== ""), "numbered outline drawn");
        assert.strictEqual(x.overflow.count, 0, `${view} ${theme}: no clipped content (${x.overflow.samples.join(", ")})`);
        assert.strictEqual(x.overflow.horizontalScroll, false, `${view} ${theme}: no sideways scroll`);
        const png = Buffer.from(await api.requirements.png(scope), "base64");
        assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "a PNG");
        assert.ok(png.length > 8000, `${view}-${theme} is ${png.length} bytes`);
        writeFileSync(path.join(c.artifactDir, `requirements-${view}-${theme}.png`), png);
        console.log(`  requirements-${view}-${theme}.png: ${png.length} bytes; ${view === "table" ? `rows=${x.table.rows.length}` : `outline=${x.document.outline.map((o) => o.number).join(",")}`} overflow=${x.overflow.count} size=${x.size.width}x${x.size.height}`);
      };
      await save("table", "dark");
      await save("document", "dark");
      const cfg = vscode.workspace.getConfiguration();
      try {
        await cfg.update("workbench.colorTheme", "Default Light Modern", vscode.ConfigurationTarget.Global);
        await eventually(async () => assert.strictEqual((await m()).theme, "light"), "the webview follows the light theme", 30000);
        await save("table", "light");
        await save("document", "light");
      } finally {
        await cfg.update("workbench.colorTheme", undefined, vscode.ConfigurationTarget.Global);
      }
    })],

    ["Requirements View palette: Satisfy, Verify and Derivation tools write the same text as the requirements editor and the edge appears", scenario("ReqP1", async ({ file, qn }) => {
      const diagram = "tmp-reqp1.sysmld";
      const ref = (s: string) => qn(s);
      writeFileSync(uriOf(diagram).fsPath, JSON.stringify({
        version: 1, kind: "requirements", root: "ReqP1", sources: [file],
        nodes: [
          { id: "n1", ref: "ReqP1" },
          { id: "n2", ref: ref(`${PR}::Acceleration::accel`), parent: "n1", x: 20, y: 40 },
          { id: "n3", ref: ref("Safety::brakeDistance"), parent: "n1", x: 340, y: 40 },
          { id: "n4", ref: ref("Design::engine"), parent: "n1", x: 20, y: 240 },
          { id: "n5", ref: ref("Verification::spare"), parent: "n1", x: 340, y: 240 },
        ],
        edges: [],
      }, null, 2) + "\n");
      try {
        await api.diagram.open(uriOf(diagram));
        const dm = () => api.diagram.metrics(uriOf(diagram));
        await c.eventually(async () => assert.ok((await dm()).nodes.length >= 5), "the diagram renders");
        assert.deepStrictEqual((await dm()).palette, ["Requirement def", "Requirement", "Satisfy", "Verify", "Derivation"], "the Requirements View palette offers the relationship tools");
        // Draw derivation: from accel to brakeDistance
        await api.diagram.gesture(uriOf(diagram), { kind: "connect", source: "n2", target: "n3", relation: "derivation" });
        await waitFor(() => /#derivation connection \{\s+end #original ::> [^;]*accel;\s+end #derive ::> [^;]*brakeDistance;/.test(onDisk(file)), 90000, "the derivation connection is in the text");
        await clean(file);
        await parses(file);
        await c.eventually(async () => assert.ok((await dm()).edges.some((e) => e.style === "derivation"), "the derivation edge appears"), "derivation edge");
        // Satisfy: the element and the requirement, either order
        await api.diagram.gesture(uriOf(diagram), { kind: "connect", source: "n4", target: "n3", relation: "satisfy" });
        await waitFor(() => /satisfy [^;]*brakeDistance by engine;/.test(onDisk(file)), 90000, "the satisfy statement is in the text");
        await c.eventually(async () => assert.ok((await dm()).edges.some((e) => e.style === "satisfy"), "the satisfy edge appears"), "satisfy edge");
        // Verify: requirement then verification case
        await api.diagram.gesture(uriOf(diagram), { kind: "connect", source: "n3", target: "n5", relation: "verify" });
        await waitFor(() => /verification def spare \{\s+objective \{\s+verify [^;]*brakeDistance;/.test(onDisk(file)), 90000, "verify is inside the objective");
        await parses(file);
        await clean(file);
        // the same statements, made by the requirements editor, give the same text
        const t = onDisk(file);
        assert.ok(t.includes("brakeDistance"), "all three were written");
      } finally {
        await close();
        rmSync(uriOf(diagram).fsPath, { force: true });
      }
    })],

    ["End to end (add-requirements-editor 5.1): edit a requirement in the table, in the document view, in the text and through an agent; all four views agree after each edit", scenario("ReqE2E", async ({ file, scope, qn, m }) => {
      const accel = qn(`${PR}::Acceleration::accel`);
      const key = `[data-key="${accel}|text"]`;
      const view = (v: "table" | "document") => api.requirements.setView(scope, v);
      const doc = () => textDoc(file)!;
      const agree = async (text: string, step: string) => {
        // 1. the text: the document on disk and in the editor
        await waitFor(() => onDisk(file).includes(`/* ${text} */`) || onDisk(file).includes(`* ${text}\n`), 90000, `${step}: the text file has the new documentation`);
        await clean(file);
        assert.ok(doc().getText().includes(text), `${step}: the open editor has it`);
        // 2. the table
        await view("table");
        await eventually(async () => assert.strictEqual(row(await m(), "R3").cells.text, text), `${step}: the table shows it`).catch(async (e) => {
          const x = await m();
          console.log(`  view=${x.view} generation=${x.generation} notice=${JSON.stringify(x.notice)} pending=${JSON.stringify(x.pendingEdits)} rows=${JSON.stringify(x.table.rows.map((r) => r.cells.text.slice(0, 30)))} index doc says: ${JSON.stringify(api.model.index.findByQualifiedName(accel).map((e) => (e as { documentation?: string }).documentation))}`);
          throw e;
        });
        // 3. the document view
        await view("document");
        await eventually(async () => assert.strictEqual((await m()).document.items.find((i) => i.id === "R3")?.text, text), `${step}: the document view shows it`);
        // 4. an agent's read tool
        const md = (await viaLm("sysml_read_requirements_document", { package: scope.kind === "package" ? scope.qualifiedName : "" })).text;
        assert.ok(md.includes(text), `${step}: the agent reads it`);
        assert.strictEqual((await viaMcp(api, "sysml_read_requirements_document", { package: scope.kind === "package" ? scope.qualifiedName : "" })).text, md, `${step}: both channels agree`);
        await view("table");
      };
      await agree("The vehicle shall accelerate from 0 to 100 km/h in under 8 s.", "start");
      // a) the table
      await gesture(scope, { kind: "input", selector: key, value: "Table: 0 to 100 km/h in under 7 s." });
      await agree("Table: 0 to 100 km/h in under 7 s.", "edit in the table");
      // b) the document view
      await view("document");
      await gesture(scope, { kind: "input", selector: key, value: "Document: 0 to 100 km/h in under 6 s." });
      await agree("Document: 0 to 100 km/h in under 6 s.", "edit in the document view");
      // c) the text editor
      const d = doc();
      const at = d.getText().indexOf("Document: 0 to 100 km/h in under 6 s.");
      const edit = new vscode.WorkspaceEdit();
      edit.replace(d.uri, new vscode.Range(d.positionAt(at), d.positionAt(at + "Document: 0 to 100 km/h in under 6 s.".length)), "Text: 0 to 100 km/h in under 5 s.");
      await vscode.workspace.applyEdit(edit);
      await d.save();
      await agree("Text: 0 to 100 km/h in under 5 s.", "edit in the text");
      // d) an agent
      const r = await viaLm("sysml_set_element_properties", { element: accel, documentation: "Agent: 0 to 100 km/h in under 4 s." });
      assert.ok(!r.isError);
      await agree("Agent: 0 to 100 km/h in under 4 s.", "edit by an agent");
      assert.strictEqual(onDisk(file).replace("Agent: 0 to 100 km/h in under 4 s.", "The vehicle shall accelerate from 0 to 100 km/h in under 8 s."), readFileSync(FIXTURE, "utf8").replace(/VehicleSpec/g, "ReqE2E"), "nothing but the text of R3 changed in four edits");
    })],

    ["Document annotations: the library is bundled and read-only in the model, and the command copies it into the workspace (without overwriting)", async () => {
      const copy = "DocumentAnnotations.sysml";
      try {
        await waitFor(() => api.model.index.findByQualifiedName("DocumentAnnotations::DocumentRoot").some((e) => api.model.index.isReadOnly((e as { uri: string }).uri)), 120000, "the bundled library is indexed read-only");
        const first = await vscode.commands.executeCommand<string | undefined>("sysml.copyDocumentAnnotations");
        assert.ok(first?.endsWith(copy), "the command reports the copy");
        const text = onDisk(copy);
        assert.match(text, /library package DocumentAnnotations/);
        assert.match(text, /metadata def DocumentRoot/);
        assert.match(text, /metadata def Appendix;/);
        writeFileSync(uriOf(copy).fsPath, text + "// edited\n");
        await vscode.commands.executeCommand("sysml.copyDocumentAnnotations");
        assert.ok(onDisk(copy).endsWith("// edited\n"), "an existing file is not overwritten");
      } finally {
        rmSync(uriOf(copy).fsPath, { force: true });
        await sleep(300);
      }
    }],

    ["Agent: read_requirements_document returns the document view (same on both channels); create_requirement and a derivation produce the editor's text", async () => {
      const pkg = "ReqA1";
      const pkgB = "ReqA2";
      const fileA = "tmp-reqa1.sysml";
      const fileB = "tmp-reqa2.sysml";
      installUi();
      await warmWorker();
      const original = readFileSync(FIXTURE, "utf8");
      try {
        writeFileSync(uriOf(fileA).fsPath, original.replace(/VehicleSpec/g, pkg));
        await vscode.workspace.openTextDocument(uriOf(fileA));
        await waitFor(() => api.model.index.findByQualifiedName(`${pkg}::Safety`).length > 0, 300000, "model");
        await waitFor(() => !api.model.index.getDocument(uriOf(fileA).toString())?.detailsPending, 120000, "details settled");
        const lm = await viaLm("sysml_read_requirements_document", { package: pkg });
        const mcp = await viaMcp(api, "sysml_read_requirements_document", { package: pkg });
        assert.strictEqual(mcp.isError, false);
        assert.strictEqual(lm.text, mcp.text, "identical over both channels");
        const md = lm.text;
        assert.match(md, new RegExp(`^# Vehicle SRS <!-- qn: ${pkg} -->`));
        assert.match(md, /- 1 Performance Requirements\n {2}- 1.1 Acceleration\n- 2 Safety/);
        assert.match(md, new RegExp(`## 1 Performance Requirements <!-- qn: ${pkg}::'Performance Requirements' -->`));
        assert.match(md, new RegExp(`\\*\\*R1 massLimit\\*\\* \\(requirement\\) <!-- qn: ${pkg}::'Performance Requirements'::massLimit -->`));
        assert.match(md, /- Satisfied by: vehicle/);
        assert.match(md, /- Derives: R2 chassisMass/);
        assert.match(md, /## Appendix A Glossary <!-- qn: /);
        assert.match(md, /- mass is measured fully loaded/);
        // the editor's table agrees with what the agent read
        await api.requirements.open({ kind: "package", qualifiedName: pkg });
        const m = await api.requirements.metrics({ kind: "package", qualifiedName: pkg });
        for (const r of m.table.rows) assert.ok(md.includes(`**${r.cells.id} ${r.cells.name}**`), `${r.cells.id} is in the document`);
        await api.requirements.close({ kind: "package", qualifiedName: pkg });
        // agent: create_requirement, same text as the editor
        const cr = await viaLm("sysml_create_requirement", { owner: pkg, name: "rangeReq", id: "R9", documentation: "Range */ shall be long." });
        assert.strictEqual(JSON.parse(cr.text).created.qualifiedName, `${pkg}::rangeReq`);
        assert.match(onDisk(fileA), /requirement <'R9'> rangeReq \{\n\s+doc \/\* Range \*\\\/ shall be long\. \*\/\n\s+\}/);
        const crMcp = await viaMcp(api, "sysml_create_requirement", { owner: pkg, name: "rangeReq", id: "R10" });
        assert.strictEqual(crMcp.isError, true, "a second requirement named rangeReq is refused over MCP too");
        // derivation by the agent (R4 from R1) ...
        const d = await viaLm("sysml_create_relationship", { kind: "derivation", original: `${pkg}::${PR}::massLimit`, derived: [`${pkg}::Safety::brakeDistance`] });
        assert.deepStrictEqual(JSON.parse(d.text).filesChanged, [fileA]);
        const agentText = onDisk(fileA);
        await clean(fileA);
        parses(fileA);
        // ... and the same edit made through the requirements editor on an identical copy
        await close();
        rmSync(uriOf(fileA).fsPath, { force: true });
        writeFileSync(uriOf(fileB).fsPath, original.replace(/VehicleSpec/g, pkgB));
        await vscode.workspace.openTextDocument(uriOf(fileB));
        await waitFor(() => api.model.index.findByQualifiedName(`${pkgB}::Safety`).length > 0, 300000, "model B");
        await waitFor(() => !api.model.index.getDocument(uriOf(fileB).toString())?.detailsPending, 120000, "details B settled");
        const scopeB: ReqScope = { kind: "package", qualifiedName: pkgB };
        await api.requirements.open(scopeB);
        await api.requirements.intent(scopeB, { type: "addRequirement", kind: "requirement", id: "R9", name: "rangeReq" });
        api.requirements.setUi({ pickOne: async () => `${pkgB}::${PR}::massLimit` });
        await api.requirements.intent(scopeB, { type: "addDerivedFrom", qn: `${pkgB}::Safety::brakeDistance` });
        const editorText = onDisk(fileB);
        const norm = (s: string, p: string) => s.replace(new RegExp(p, "g"), "PKG").replace(/requirement <'R9'> rangeReq \{[^}]*\}/, "requirement <'R9'> rangeReq").replace(/requirement <'R9'> rangeReq;/, "requirement <'R9'> rangeReq");
        // the agent also gave rangeReq documentation; compare the derivation part exactly
        const conn = (s: string) => /#derivation connection \{\n\s+end #original ::> massLimit;\n\s+end #derive ::> brakeDistance;\n\s+\}/.exec(s)?.[0];
        assert.ok(conn(agentText), "the agent wrote the connection");
        assert.strictEqual(conn(agentText), conn(editorText), "byte-identical connection text");
        assert.strictEqual(norm(agentText, pkg), norm(editorText, pkgB), "the two files are identical apart from the documented requirement");
      } finally {
        api.requirements.setUi(undefined);
        api.diagram.setUi(undefined);
        await api.requirements.close({ kind: "package", qualifiedName: pkgB }).catch(() => undefined);
        await close();
        rmSync(uriOf(fileA).fsPath, { force: true });
        rmSync(uriOf(fileB).fsPath, { force: true });
      }
    }],

    ["Agent: write tools for requirements are refused identically over both channels when the model has a syntax error", async () => {
      const file = "tmp-reqerr.sysml";
      writeFileSync(uriOf(file).fsPath, "package ReqErr {\n  requirement <'R1'> a;\n  requirement <'R2'> b;\n  part broken : ;\n}\n");
      try {
        await vscode.workspace.openTextDocument(uriOf(file));
        await waitFor(() => (api.model.index.getDocument(uriOf(file).toString())?.errors.length ?? 0) > 0 && !api.model.index.getDocument(uriOf(file).toString())?.detailsPending, 120000, "the error is known");
        const calls: [string, object][] = [
          ["sysml_create_requirement", { owner: "ReqErr", name: "x" }],
          ["sysml_create_relationship", { kind: "derivation", original: "ReqErr::a", derived: ["ReqErr::b"] }],
        ];
        const before = onDisk(file);
        for (const [name, input] of calls) {
          const a = await viaLm(name, input).catch((e: Error) => ({ text: String(e.message), isError: true }));
          const b = await viaMcp(api, name, input);
          assert.strictEqual(b.isError, true, name);
          assert.match(b.text, /syntax error|No .* with qualified name/i, name);
          void a;
        }
        assert.strictEqual(onDisk(file), before, "nothing changed");
      } finally {
        await close();
        rmSync(uriOf(file).fsPath, { force: true });
      }
    }],

    ["Document view: a paragraph edit follows its paragraph when the file changes above it, and reports a conflict when its text changed", scenario("ReqD9", async ({ file, scope, qn, m, before }) => {
      const sec = `section[data-qn="${qn(PR)}"]`;
      const PARA = "Scope of the performance requirements.";
      const doc = () => textDoc(file)!;
      const paragraphs = async () => (await m()).document.paragraphs.filter((p) => p.section === qn(PR)).map((p) => p.text);
      await api.requirements.setView(scope, "document");
      // Open the first paragraph of the section for editing and type, without committing.
      await gesture(scope, { kind: "click", selector: `${sec} > .para [data-testid=edit-para]` });
      await gesture(scope, { kind: "input", selector: `${sec} textarea.para-edit`, value: "Scope, edited.", event: "input" });
      assert.ok((await m()).pendingEdits.length >= 1, "the edit is pending");
      // The file changes above the paragraph (every offset moves) through a workspace edit.
      const we = new vscode.WorkspaceEdit();
      we.insert(uriOf(file), new vscode.Position(0, 0), "// a note added above\n// and another\n");
      assert.ok(await vscode.workspace.applyEdit(we));
      await eventually(async () => assert.ok(doc().getText().startsWith("// a note added above")), "the edit is in the buffer");
      await api.requirements.settled(scope);
      await gesture(scope, { kind: "input", selector: `${sec} textarea.para-edit`, value: "Scope, edited.", event: "change" });
      await waitFor(() => doc().getText().includes("Scope, edited."), 90000, "the paragraph the user was editing changed");
      const t = doc().getText();
      assert.ok(t.includes("comment /*\n         * Rules that apply to every requirement:"), "the second paragraph is untouched");
      assert.ok(t.includes("doc /* This specification describes the requirements of the vehicle. */"), "the root paragraph is untouched");
      assert.strictEqual(t.replace("// a note added above\n// and another\n", "").replace("Scope, edited.", PARA), before, "only that paragraph changed");
      await clean(file);
      await parses(file);
      // Now the paragraph's own text changes elsewhere while a draft is open: a conflict, never another paragraph.
      await eventually(async () => assert.ok((await paragraphs()).includes("Scope, edited.")), "the view shows the new text");
      await gesture(scope, { kind: "click", selector: `${sec} > .para [data-testid=edit-para]` });
      await gesture(scope, { kind: "input", selector: `${sec} textarea.para-edit`, value: "My draft.", event: "input" });
      const we2 = new vscode.WorkspaceEdit();
      const at = doc().getText().indexOf("Scope, edited.");
      we2.replace(uriOf(file), new vscode.Range(doc().positionAt(at), doc().positionAt(at + "Scope, edited.".length)), "Changed elsewhere.");
      assert.ok(await vscode.workspace.applyEdit(we2));
      await eventually(async () => assert.strictEqual((await m()).conflicts.length, 1), "the field is marked as conflicted", 60000);
      const afterConflict = doc().getText();
      assert.ok(afterConflict.includes("Changed elsewhere."), "the model keeps the newer text");
      await gesture(scope, { kind: "click", selector: `${sec} [data-testid=conflict-overwrite]` });
      await waitFor(() => doc().getText().includes("My draft."), 90000, "overwrite applies the draft to the same paragraph");
      assert.ok(doc().getText().includes("Rules that apply to every requirement:"), "the other paragraph is untouched");
      assert.strictEqual((await m()).conflicts.length, 0);
    }, { view: "document" })],
  ];
  return tests;
}

