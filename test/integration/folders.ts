import * as assert from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ModelNode } from "./index.js";
import type { Ctx } from "./diagram-interaction.js";

type Test = [name: string, fn: () => Promise<void>];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The folder structure of the tree: workspace folder, folders, files, elements (Elements view) or diagram leaves (Diagrams view); empty folders; follow-cursor; folder create and delete; the filter. */
export function foldersTests(c: Ctx): Test[] {
  const { api, folder, artifactDir } = c;
  const dir = (...p: string[]) => path.join(folder.fsPath, "tmp-tree", ...p);
  const label = (n: ModelNode) => String(api.provider.getTreeItem(n).label);
  const kids = async (n?: ModelNode): Promise<ModelNode[]> => await api.provider.getChildren(n);
  const find = async (parent: ModelNode | undefined, l: string): Promise<ModelNode> => {
    const n = (await kids(parent)).find((k) => label(k) === l);
    assert.ok(n, `tree node ${l}`);
    return n;
  };
  /** Reads the children the way VS Code does, so the provider records the objects it refreshes by. */
  const vkids = async (n?: ModelNode): Promise<ModelNode[]> => await api.provider.viewGetChildren(n);
  const vfind = async (parent: ModelNode | undefined, l: string): Promise<ModelNode> => {
    const n = (await vkids(parent)).find((k) => label(k) === l);
    assert.ok(n, `tree node ${l}`);
    return n;
  };
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms: number, what: string) => {
    const end = performance.now() + ms;
    while (!(await cond())) {
      if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
      await sleep(50);
    }
  };
  const indexed = (...parts: string[]) => api.model.index.uris().some((u) => u.endsWith("/tmp-tree/" + parts.join("/")));
  const dump = async (n: ModelNode | undefined, depth: number, indent = ""): Promise<string[]> => {
    const out: string[] = [];
    for (const k of await kids(n)) {
      const item = api.provider.getTreeItem(k);
      out.push(`${indent}${label(k)}${item.description ? "  (" + String(item.description) + ")" : ""}`);
      if (depth > 1 && item.collapsibleState !== vscode.TreeItemCollapsibleState.None) out.push(...(await dump(k, depth - 1, indent + "  ")));
    }
    return out;
  };

  const withFilter = (filter: "elements" | "diagrams" | "all", fn: () => Promise<void>): (() => Promise<void>) => async () => {
    await api.provider.setFilter(filter);
    try {
      await fn();
    } finally {
      await api.provider.setFilter("elements");
    }
  };
  const withFolders = (fn: () => Promise<void>) => withFilter("elements", fn);
  const setup = () => {
    rmSync(dir(), { recursive: true, force: true });
    mkdirSync(dir("empty"), { recursive: true });
    mkdirSync(dir("Nest", "deep"), { recursive: true });
    mkdirSync(dir("docs", "sub"), { recursive: true });
    writeFileSync(dir("docs", "guide.md"), "# not sysml\n");
    writeFileSync(dir("Nest", "deep", "m.sysml"), "package Deep { part def X; }\n");
    writeFileSync(dir("b.sysml"), "package Bee;\n");
    writeFileSync(dir("a.sysml"), "package Aye;\n");
  };

  return [
    ["Elements view: workspace folder, folders before files sorted by name, excluded folders hidden, empty folders marked", withFolders(async () => {
      setup();
      try {
        await waitFor(() => indexed("Nest/deep/m.sysml") && indexed("a.sysml") && indexed("b.sysml"), 20000, "the files are indexed");
        const roots = await kids();
        assert.strictEqual(roots.length, 1, "one root per workspace folder");
        assert.strictEqual(label(roots[0]!), vscode.workspace.workspaceFolders![0]!.name);
        const top = await kids(roots[0]);
        const names = top.map(label);
        assert.ok(!names.includes("ignored"), "a sysml.exclude folder is not shown");
        assert.ok(names.includes("tmp-tree") && names.includes("vehicle.sysml"));
        const firstFile = top.findIndex((n) => n.kind === "file");
        assert.ok(top.slice(0, firstFile).every((n) => n.kind === "folder") && top.slice(firstFile).every((n) => n.kind === "file"), "folders come before files");
        const sortedNames = (xs: ModelNode[]) => xs.map(label).join("|");
        const ci = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
        assert.strictEqual(sortedNames(top.slice(0, firstFile)), top.slice(0, firstFile).map(label).sort(ci).join("|"), "folders sorted");
        assert.strictEqual(sortedNames(top.slice(firstFile)), top.slice(firstFile).map(label).sort(ci).join("|"), "files sorted");

        const tmp = await find(roots[0], "tmp-tree");
        assert.deepStrictEqual((await kids(tmp)).map(label), ["docs", "empty", "Nest", "a.sysml", "b.sysml"]);
        for (const empty of ["docs", "empty"]) {
          const n = await find(tmp, empty);
          const item = api.provider.getTreeItem(n);
          assert.strictEqual(item.description, "no SysML files");
          // lazy: expandable until a listing (possibly an earlier test's) found no subfolders
          if (empty === "docs") assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed, "a folder with subfolders can be expanded");
          assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "folder");
          assert.strictEqual(((item.iconPath as vscode.ThemeIcon).color as vscode.ThemeColor).id, "disabledForeground");
          const sub = await kids(n);
          assert.deepStrictEqual(sub.map(label), empty === "docs" ? ["sub"] : [], "only subfolders");
          for (const k of sub) {
            assert.strictEqual(api.provider.getTreeItem(k).description, "no SysML files");
            assert.strictEqual(api.provider.getTreeItem(k).collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
          }
          if (empty === "empty") assert.strictEqual(api.provider.getTreeItem(n).collapsibleState, vscode.TreeItemCollapsibleState.None, "no subfolders: a leaf");
        }
        const nest = await find(tmp, "Nest");
        assert.strictEqual(api.provider.getTreeItem(nest).description, undefined);
        assert.strictEqual(api.provider.getTreeItem(nest).collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

        // down to the elements
        const file = await find(await find(nest, "deep"), "m.sysml");
        assert.strictEqual(api.provider.getTreeItem(file).contextValue, "sysmlFile");
        assert.strictEqual(api.provider.getTreeItem(file).command?.command, "vscode.open");
        const pkg = await find(file, "Deep");
        const x = await find(pkg, "X");
        assert.strictEqual(api.provider.getTreeItem(pkg).contextValue, "sysmlElement");
        assert.strictEqual(api.provider.getTreeItem(x).description, "part def");

        // a text dump of the tree, as the artifact of this layout
        mkdirSync(artifactDir, { recursive: true });
        const lines = [label(roots[0]!), ...(await dump(roots[0], 4, "  "))];
        writeFileSync(path.join(artifactDir, "tree-folders.txt"), lines.join("\n") + "\n");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
      }
    })],
    ["Elements view: getParent walks element, file, folders; Go to Definition and follow-cursor reveal work on element nodes", withFolders(async () => {
      const vehicleUri = vscode.Uri.joinPath(folder, "vehicle.sysml");
      const root = (await kids())[0]!;
      const file = await find(root, "vehicle.sysml");
      const vehicle = await find(file, "Vehicle");
      const car = await find(vehicle, "Car");
      const engine = await find(car, "engine");
      assert.strictEqual(api.provider.getParent(engine)?.id, car.id);
      assert.strictEqual(api.provider.getParent(vehicle)?.id, file.id);
      assert.strictEqual(api.provider.getParent(file)?.id, root.id);
      assert.strictEqual(api.provider.getParent(root), undefined);

      const ed = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vehicleUri));
      assert.strictEqual(ed.document.uri.toString(), vehicleUri.toString());

      const calls: ModelNode[] = [];
      const reveals: Thenable<void>[] = [];
      const view = api.view;
      const orig = view.reveal.bind(view);
      (view as { reveal: typeof view.reveal }).reveal = (n, o) => { calls.push(n); const r = orig(n, o); reveals.push(r); return r; };
      try {
        await sleep(800); // let the previous test's batched tree refreshes (and the file deletions behind them) drain before the view shows
        await vscode.commands.executeCommand("sysmlModel.focus");
        await waitFor(() => view.visible, 3000, "view visible");
        const line = ed.document.getText().split("\n").findIndex((l) => l.includes("part engine"));
        ed.selection = new vscode.Selection(0, 0, 0, 0);
        ed.selection = new vscode.Selection(line, 11, line, 11);
        await waitFor(() => calls.some((n) => n.id === engine.id), 3000, "reveal of engine through file and folders");
        await Promise.all(reveals);
        await waitFor(() => view.selection[0]?.id === engine.id, 3000, "engine is selected in the view");
        assert.strictEqual(view.selection[0]!.id, engine.id);
      } finally {
        (view as { reveal: typeof view.reveal }).reveal = orig;
      }
    })],
    ["Elements view: creating and deleting folders refreshes only the parent node, and a deleted folder takes its files out of the model", withFolders(async () => {
      setup();
      const fired: unknown[] = [];
      const sub = api.provider.onDidChangeTreeData((e) => fired.push(e));
      try {
        await waitFor(() => indexed("Nest/deep/m.sysml"), 20000, "m.sysml indexed");
        const root = (await kids())[0]!;
        const tmp = await find(root, "tmp-tree");
        const ids = (e: unknown) => (Array.isArray(e) ? e : [e]).map((n) => (n as ModelNode | undefined)?.id);

        await sleep(600); // let setup's own batched events (150 ms) drain
        fired.length = 0;
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir("fresh")));
        await waitFor(() => fired.some((e) => ids(e).includes(tmp.id)), 15000, "the parent folder is refreshed after a folder is created");
        assert.ok(fired.every((e) => e !== undefined), "never a full refresh");
        assert.ok((await kids(tmp)).map(label).includes("fresh"));
        assert.strictEqual(api.provider.getTreeItem(await find(tmp, "fresh")).description, "no SysML files");

        // a first .sysml file flips the marker
        fired.length = 0;
        writeFileSync(dir("fresh", "f.sysml"), "package F;\n");
        await waitFor(() => indexed("fresh/f.sysml"), 15000, "f.sysml indexed");
        await waitFor(() => api.provider.getTreeItem(folderAt(tmp, "fresh")).description === undefined, 5000, "fresh is no longer empty");
        assert.ok(fired.some((e) => ids(e).includes(tmp.id) || ids(e).includes(root.id)), "its ancestors were refreshed");

        // deleting a folder that holds a model file
        fired.length = 0;
        await vscode.workspace.fs.delete(vscode.Uri.file(dir("Nest")), { recursive: true });
        await waitFor(() => !indexed("Nest/deep/m.sysml"), 15000, "the deleted folder's file leaves the model");
        await waitFor(() => fired.length > 0, 15000, "a refresh was fired");
        assert.ok(fired.every((e) => e !== undefined), "never a full refresh");
        await waitFor(async () => !(await kids(tmp)).map(label).includes("Nest"), 5000, "Nest is gone from the listing");
      } finally {
        sub.dispose();
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Filter: Elements is the default, Diagrams is remembered in the workspace state and the context key follows it", async () => {
      assert.strictEqual(api.provider.filter, "elements");
      const fired: unknown[] = [];
      const sub = api.provider.onDidChangeTreeData((e) => fired.push(e));
      try {
        await vscode.commands.executeCommand("sysml.tree.changeView", "diagrams");
        assert.strictEqual(api.provider.filter, "diagrams");
        assert.ok(fired.includes(undefined), "the whole tree is refreshed on a switch");
        const root = (await kids())[0]!;
        const top = await kids(root);
        assert.ok(top.every((n) => n.kind === "folder" || n.kind === "diagram"), "no .sysml files in the Diagrams view");
        assert.ok(top.some((n) => label(n) === "ports-general.sysmld"), "the fixture diagrams are leaves");
        assert.ok(top.every((n) => !n.kind || n.kind !== "file"));
        await vscode.commands.executeCommand("sysml.tree.changeView", "elements");
        assert.strictEqual(api.provider.filter, "elements");
        assert.ok((await kids(root)).some((n) => n.kind === "file" && label(n) === "vehicle.sysml"));
        assert.ok(!(await kids(root)).some((n) => n.kind === "diagram"), "no diagrams in the Elements view");
      } finally {
        sub.dispose();
        await api.provider.setFilter("elements");
      }
    }],
    ["Diagrams view: a diagram is a leaf with its kind, opens in the diagram editor, and folders without diagrams are marked 'no diagrams'", withFilter("diagrams", async () => {
      setup();
      writeFileSync(dir("Nest", "deep", "d.sysmld"), JSON.stringify({ version: 1, kind: "interconnection", root: "Deep", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "Deep" }], edges: [] }, null, 2) + "\n");
      writeFileSync(dir("Nest", "deep", "bad.sysmld"), "not json at all");
      try {
        const root = (await kids())[0]!;
        await waitFor(async () => {
          const t = (await kids(root)).find((n) => label(n) === "tmp-tree");
          if (!t || api.provider.getTreeItem(t).description !== undefined) return false;
          const nest = (await kids(t)).find((n) => label(n) === "Nest");
          const deep = nest && (await kids(nest)).find((n) => label(n) === "deep");
          const names = deep ? (await kids(deep)).map(label) : [];
          return names.includes("d.sysmld") && names.includes("bad.sysmld") && (await kids(t)).length === 3;
        }, 20000, "the new diagrams are found under Nest/deep");
        const tmp = await find(root, "tmp-tree");
        assert.deepStrictEqual((await kids(tmp)).map(label), ["docs", "empty", "Nest"], "folders only: the .sysml files are not shown");
        for (const empty of ["docs", "empty"]) {
          const n = await find(tmp, empty);
          const item = api.provider.getTreeItem(n);
          assert.strictEqual(item.description, "no diagrams");
          if (empty === "docs") assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
          assert.strictEqual(((item.iconPath as vscode.ThemeIcon).color as vscode.ThemeColor).id, "disabledForeground");
          const sub = await kids(n);
          assert.deepStrictEqual(sub.map(label), empty === "docs" ? ["sub"] : [], "only subfolders");
          for (const k of sub) assert.strictEqual(api.provider.getTreeItem(k).description, "no diagrams");
          if (empty === "empty") assert.strictEqual(api.provider.getTreeItem(n).collapsibleState, vscode.TreeItemCollapsibleState.None, "no subfolders: a leaf");
        }
        const deep = await find(await find(tmp, "Nest"), "deep");
        assert.strictEqual(api.provider.getTreeItem(deep).description, undefined);
        const leaf = await find(deep, "d.sysmld");
        const item = api.provider.getTreeItem(leaf);
        assert.strictEqual(item.description, "Interconnection");
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(item.contextValue, "sysmlDiagram");
        assert.deepStrictEqual(await kids(leaf), []);
        assert.strictEqual(api.provider.getParent(leaf)?.id, deep.id);
        assert.strictEqual(api.provider.getTreeItem(await find(deep, "bad.sysmld")).description, undefined, "an unreadable file has no description");

        // selecting it opens the diagram custom editor
        await vscode.commands.executeCommand(item.command!.command, ...(item.command!.arguments ?? []));
        await waitFor(() => {
          const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
          return input instanceof vscode.TabInputCustom && input.viewType === "sysml.diagram" && input.uri.fsPath === dir("Nest", "deep", "d.sysmld");
        }, 20000, "the diagram opens in the diagram editor");
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

        // deleting the only diagrams marks the folders again
        rmSync(dir("Nest", "deep", "d.sysmld"));
        rmSync(dir("Nest", "deep", "bad.sysmld"));
        // a folder with no diagrams below it has no children (spec), so Nest is reached by its URI, not through tmp-tree
        await waitFor(() => api.provider.getTreeItem(folderAt(tmp, "Nest")).description === "no diagrams", 20000, "Nest is marked once its diagrams are gone")
          .catch(async (e) => { throw new Error(`${(e as Error).message}\n${(await dump(root, 4)).join("\n")}`); });
        assert.strictEqual(api.provider.getTreeItem(tmp).description, "no diagrams", "and so is tmp-tree");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Targeted refresh: a created and a deleted .sysml file in an expanded folder fire the folder object the tree handed out, not a full refresh", withFolders(async () => {
      setup();
      const events: unknown[] = [];
      let targetedFires = 0;
      const sub = api.provider.onDidChangeTreeData((e) => {
        events.push(e);
        if (Array.isArray(e) && e.length > 0 && e.every((n) => api.provider.isHanded(n))) targetedFires++;
      });
      try {
        await waitFor(() => indexed("a.sysml") && indexed("b.sysml") && indexed("Nest/deep/m.sysml"), 20000, "the files are indexed");
        await waitFor(() => api.provider.pendingFolderRescans === 0, 30000, "earlier folder re-reads are done");
        const root = (await vkids())[0]!;
        await waitFor(async () => (await vkids(root)).some((n) => label(n) === "tmp-tree"), 20000, "tmp-tree is listed");
        const tmp = await vfind(root, "tmp-tree");
        await vkids(tmp);
        await sleep(500); // let late index-change refreshes from the setup land before counting events
        events.length = 0;
        targetedFires = 0;
        const targeted = () => targetedFires > 0;
        writeFileSync(dir("c.sysml"), "package Cee;\n");
        await waitFor(async () => targeted() && (await kids(tmp)).some((n) => label(n) === "c.sysml"), 20000, "c.sysml appears under tmp-tree");
        assert.ok(!events.includes(undefined), "no full refresh was fired");
        events.length = 0;
        targetedFires = 0;
        rmSync(dir("c.sysml"));
        await waitFor(async () => targeted() && !(await kids(tmp)).some((n) => label(n) === "c.sysml"), 20000, "c.sysml disappears from tmp-tree");
        assert.ok(!events.includes(undefined), "no full refresh was fired on delete");
      } finally {
        sub.dispose();
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Targeted refresh: a new .sysmld in an expanded folder of the Diagrams view fires handed-out folder objects, not a full refresh", withFilter("diagrams", async () => {
      setup();
      const diagram = JSON.stringify({ version: 1, kind: "interconnection", root: "Deep", sources: ["m.sysml"], nodes: [], edges: [] });
      writeFileSync(dir("Nest", "deep", "d.sysmld"), diagram);
      const events: unknown[] = [];
      let targetedFires = 0;
      const sub = api.provider.onDidChangeTreeData((e) => {
        events.push(e);
        if (Array.isArray(e) && e.length > 0 && e.every((n) => api.provider.isHanded(n))) targetedFires++;
      });
      try {
        const root = (await vkids())[0]!;
        await waitFor(async () => {
          const t = (await kids(root)).find((n) => label(n) === "tmp-tree");
          return !!t && (await kids(t)).some((n) => label(n) === "Nest");
        }, 20000, "the diagram is found");
        const tmp = await vfind(root, "tmp-tree");
        const nest = await vfind(tmp, "Nest");
        const deep = await vfind(nest, "deep");
        await vkids(deep);
        events.length = 0;
        targetedFires = 0;
        writeFileSync(dir("Nest", "deep", "e.sysmld"), diagram);
        await waitFor(async () => targetedFires > 0 && (await kids(deep)).some((n) => label(n) === "e.sysmld"), 20000, "e.sysmld appears");
        assert.ok(!events.includes(undefined), "no full refresh was fired");
      } finally {
        sub.dispose();
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Elements view: a folder with no .sysml file below it expands to dimmed subfolders", withFolders(async () => {
      // The fixture workspace has models, so the rule is exercised on a folder with none below it (tmp-tree/docs); the workspace root itself is covered by a unit test with an empty index.
      setup();
      try {
        await waitFor(() => indexed("a.sysml"), 20000, "files indexed");
        const tmp = await find((await kids())[0]!, "tmp-tree");
        const docs = await find(tmp, "docs");
        assert.strictEqual(api.provider.getTreeItem(docs).description, "no SysML files");
        const sub = await find(docs, "sub");
        assert.strictEqual(api.provider.getTreeItem(sub).description, "no SysML files");
        assert.strictEqual(api.provider.getTreeItem(sub).contextValue, "sysmlFolderEmpty");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Diagrams view: folders that have no diagrams below them are shown with their subfolders, marked 'no diagrams'", withFilter("diagrams", async () => {
      setup();
      try {
        const root = (await kids())[0]!;
        await waitFor(async () => (await kids(root)).some((n) => label(n) === "tmp-tree"), 20000, "tmp-tree is listed");
        const tmp = await find(root, "tmp-tree");
        assert.strictEqual(api.provider.getTreeItem(tmp).description, "no diagrams");
        assert.deepStrictEqual((await kids(tmp)).map(label), ["docs", "empty", "Nest"]);
        const nest = await find(tmp, "Nest");
        assert.deepStrictEqual((await kids(nest)).map(label), ["deep"]);
        assert.strictEqual(api.provider.getTreeItem(await find(nest, "deep")).description, "no diagrams");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["New SysML File: from a folder's context menu it is created in that folder, and the title bar offers it in the Elements view", withFolders(async () => {
      setup();
      try {
        await waitFor(() => indexed("a.sysml"), 20000, "files indexed");
        const root = (await kids())[0]!;
        const tmp = await find(root, "tmp-tree");
        await vscode.commands.executeCommand("sysml.tree.newFile", await find(tmp, "empty"));
        await waitFor(() => api.newEntry.active() !== undefined, 5000, "the input box opens");
        api.newEntry.type("model");
        await api.newEntry.accept();
        await waitFor(() => vscode.window.activeTextEditor?.document.uri.fsPath.endsWith(path.join("tmp-tree", "empty", "model.sysml")) === true, 10000, "model.sysml opens");
        assert.ok(vscode.window.activeTextEditor!.document.uri.fsPath.endsWith(path.join("tmp-tree", "empty", "model.sysml")));
        await waitFor(() => indexed("empty/model.sysml"), 20000, "the new file is indexed");
        assert.strictEqual(api.provider.getTreeItem(await find(tmp, "empty")).description, undefined, "the folder is no longer empty");
        const pkg = JSON.parse(readFileSync(path.join(c.ext.extensionPath, "package.json"), "utf8")) as { contributes: { menus: { "view/title": { command: string }[] } } };
        assert.ok(pkg.contributes.menus["view/title"].some((m) => m.command === "sysml.tree.newFile"));
        const ctxMenu = (pkg.contributes.menus as unknown as Record<string, { command: string }[]>)["view/item/context"]!;
        assert.ok(ctxMenu.some((m) => m.command === "sysml.tree.newFile") && ctxMenu.some((m) => m.command === "sysml.tree.newFolder") && !ctxMenu.some((m) => m.command === "sysml.newFile"));
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Search: a query filters the Elements view to the path to matching elements, expanded, including folders never opened; selecting a match works as usual", withFolders(async () => {
      setup();
      let expandedTmp: ModelNode | undefined;
      try {
        await waitFor(() => indexed("Nest/deep/m.sysml"), 20000, "m.sysml indexed");
        const root = (await kids())[0]!;
        const tmpBefore = await find(root, "tmp-tree");
        expandedTmp = tmpBefore;
        api.provider.setExpanded(tmpBefore, true);
        api.search.post({ type: "query", text: "DEEP" });
        assert.strictEqual(api.search.query(), "DEEP");
        assert.deepStrictEqual((await kids(root)).map(label), ["tmp-tree"], "only the path to the match");
        const tmp = await find(root, "tmp-tree");
        assert.strictEqual(api.provider.getTreeItem(tmp).collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        assert.notStrictEqual(api.provider.getTreeItem(tmp).id, tmp.id, "ids differ while filtering");
        const nest = await find(tmp, "Nest");
        assert.deepStrictEqual((await kids(tmp)).map(label), ["Nest"]);
        assert.strictEqual(api.provider.getTreeItem(nest).collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        const deep = await find(nest, "deep");
        const file = await find(deep, "m.sysml");
        assert.deepStrictEqual((await kids(file)).map(label), ["Deep"]);
        const el = (await kids(file))[0]!;
        const item = api.provider.getTreeItem(el);
        assert.deepStrictEqual(await kids(el), [], "the match's non-matching children are hidden");
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(item.command?.command, "sysml.goToDefinition");
        await vscode.commands.executeCommand(item.command!.command, ...(item.command!.arguments ?? []));
        const ed = vscode.window.activeTextEditor!;
        assert.ok(ed.document.uri.fsPath.endsWith(path.join("Nest", "deep", "m.sysml")));
        assert.strictEqual(ed.document.getText(ed.selection), "Deep");

        // a match in the workspace's own files, with the other folders left out
        api.search.post({ type: "query", text: "engine" });
        const top = await kids(root);
        assert.ok(top.some((n) => n.kind === "file"), "files with an engine are shown");
        assert.ok(!top.some((n) => label(n) === "tmp-tree"), "folders without a match are not");

        // nothing matches
        api.search.post({ type: "query", text: "qqqzzz" });
        const none = await kids();
        assert.deepStrictEqual(none.map(label), ["No matches"]);
        assert.strictEqual(none[0]!.kind, "message");
        assert.strictEqual(api.search.query(), "qqqzzz");

        // clearing restores the tree, the normal ids and what was expanded
        api.search.post({ type: "query", text: "" });
        const all = await kids(root);
        assert.ok(all.some((n) => label(n) === "tmp-tree") && all.some((n) => label(n) === "docs" || label(n) === "ignored" || n.kind === "file"));
        const restored = api.provider.getTreeItem(await find(root, "tmp-tree"));
        assert.strictEqual(restored.id, tmpBefore.id);
        assert.strictEqual(restored.collapsibleState, vscode.TreeItemCollapsibleState.Expanded, "previous expansion returns");
        const nestItem = api.provider.getTreeItem(folderAt(tmp, "Nest"));
        assert.strictEqual(nestItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
      } finally {
        api.search.post({ type: "query", text: "" });
        if (expandedTmp) api.provider.setExpanded(expandedTmp, false);
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Search: a query in the Diagrams view keeps the diagram files whose names match, with the folders leading to them", withFilter("diagrams", async () => {
      setup();
      writeFileSync(dir("Nest", "deep", "state-one.sysmld"), JSON.stringify({ version: 1, kind: "stateTransition", root: "Deep", sources: ["m.sysml"], nodes: [], edges: [] }));
      try {
        const root = (await kids())[0]!;
        await waitFor(async () => {
          const t = (await kids(root)).find((n) => label(n) === "tmp-tree");
          if (!t || api.provider.getTreeItem(t).description !== undefined) return false;
          const nest = (await kids(t)).find((n) => label(n) === "Nest");
          const deep = nest && (await kids(nest)).find((n) => label(n) === "deep");
          return !!deep && (await kids(deep)).some((n) => label(n) === "state-one.sysmld");
        }, 20000, "the new diagram is found under Nest/deep");
        api.search.post({ type: "query", text: "STATE-ONE" });
        try {
          assert.deepStrictEqual((await kids(root)).map(label), ["tmp-tree"]);
          const tmp = await find(root, "tmp-tree");
          assert.strictEqual(api.provider.getTreeItem(tmp).collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
          const deep = await find(await find(tmp, "Nest"), "deep");
          assert.deepStrictEqual((await kids(deep)).map(label), ["state-one.sysmld"]);
        } catch (e) {
          const tree = (await dump(undefined, 5)).join("\n");
          throw new Error(`${String(e)}\ndiagram set: ${JSON.stringify(api.provider.diagramUris.filter((u) => u.includes("/tmp-tree/")))}\ndiagram set changes:\n${api.provider.diagramLog.join("\n")}\nquery: ${api.provider.query}\ntree:\n${tree}`);
        }
        api.search.post({ type: "query", text: "qqqzzz" });
        assert.deepStrictEqual((await kids()).map(label), ["No matches"]);
        api.search.post({ type: "query", text: "" });
        assert.ok((await kids(root)).length > 1);
      } finally {
        api.search.post({ type: "query", text: "" });
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["Diagrams view: nested folders created at once show their diagram", withFilter("diagrams", async () => {
      rmSync(dir(), { recursive: true, force: true });
      mkdirSync(dir(), { recursive: true });
      try {
        const root = (await kids())[0]!;
        await kids(root);
        mkdirSync(dir("x", "y"), { recursive: true });
        writeFileSync(dir("x", "y", "z.sysmld"), JSON.stringify({ version: 1, kind: "stateTransition", root: "Deep", sources: ["m.sysml"], nodes: [], edges: [] }));
        await waitFor(async () => {
          const t = (await kids(root)).find((n) => label(n) === "tmp-tree");
          const x = t && (await kids(t)).find((n) => label(n) === "x");
          const y = x && (await kids(x)).find((n) => label(n) === "y");
          return !!y && (await kids(y)).some((n) => label(n) === "z.sysmld");
        }, 30000, "x/y/z.sysmld appears in the Diagrams view");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
      }
    })],
    ["Diagrams view: an idle workspace causes no workspace search or directory read", withFilter("diagrams", async () => {
      await waitFor(() => api.provider.pendingFolderRescans === 0, 30000, "earlier folder re-reads are done");
      await sleep(1000);
      const root = (await kids())[0]!;
      await kids(root);
      const before = api.provider.ioCalls;
      await sleep(5000);
      assert.strictEqual(api.provider.ioCalls, before, "no search or directory read while idle");
    })],
    ["All view: switching shows subfolders, then .sysml files, then diagrams; a diagram opens from it; empty folders are marked; search matches elements, files and diagrams", withFilter("all", async () => {
      setup();
      mkdirSync(dir("vacant")); // "empty" may still be indexed with the previous test's new file for a while, so a folder of our own is checked
      writeFileSync(dir("Nest", "deep", "d.sysmld"), JSON.stringify({ version: 1, kind: "interconnection", root: "Deep", sources: ["m.sysml"], nodes: [{ id: "n1", ref: "Deep" }], edges: [] }, null, 2) + "\n");
      try {
        assert.strictEqual(api.provider.filter, "all");
        await waitFor(() => indexed("Nest/deep/m.sysml"), 20000, "m.sysml indexed");
        const root = (await kids())[0]!;
        await waitFor(async () => {
          const t = (await kids(root)).find((n) => label(n) === "tmp-tree");
          const nest = t && (await kids(t)).find((n) => label(n) === "Nest");
          const deep = nest && (await kids(nest)).find((n) => label(n) === "deep");
          return !!deep && (await kids(deep)).some((n) => label(n) === "d.sysmld");
        }, 20000, "the diagram is found under Nest/deep");
        const tmp = await find(root, "tmp-tree");
        assert.deepStrictEqual((await kids(tmp)).map(label), ["docs", "empty", "Nest", "vacant", "a.sysml", "b.sysml"]);
        for (const e of ["docs", "vacant"]) assert.strictEqual(api.provider.getTreeItem(await find(tmp, e)).description, "no SysML files or diagrams");
        const deep = await find(await find(tmp, "Nest"), "deep");
        assert.strictEqual(api.provider.getTreeItem(deep).description, undefined);
        assert.deepStrictEqual((await kids(deep)).map((n) => `${n.kind}:${label(n)}`), ["file:m.sysml", "diagram:d.sysmld"]);
        const file = await find(deep, "m.sysml");
        assert.deepStrictEqual((await kids(file)).map(label), ["Deep"], "files still expand to elements");
        assert.strictEqual(api.provider.getTreeItem(file).contextValue, "sysmlFile");
        const leaf = await find(deep, "d.sysmld");
        const item = api.provider.getTreeItem(leaf);
        assert.strictEqual(item.description, "Interconnection");
        assert.strictEqual(item.contextValue, "sysmlDiagram");
        assert.strictEqual(api.provider.getParent(leaf)?.id, deep.id);
        await vscode.commands.executeCommand(item.command!.command, ...(item.command!.arguments ?? []));
        await waitFor(() => {
          const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
          return input instanceof vscode.TabInputCustom && input.viewType === "sysml.diagram" && input.uri.fsPath === dir("Nest", "deep", "d.sysmld");
        }, 20000, "the diagram opens in the diagram editor");
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

        // search: element name, .sysml file name and diagram name
        api.search.post({ type: "query", text: "DEEP" });
        let d = await find(await find(await find(root, "tmp-tree"), "Nest"), "deep");
        assert.deepStrictEqual((await kids(d)).map(label), ["m.sysml"], "the element Deep matches m.sysml's content");
        api.search.post({ type: "query", text: "d.sysmld" });
        d = await find(await find(await find(root, "tmp-tree"), "Nest"), "deep");
        assert.deepStrictEqual((await kids(d)).map(label), ["d.sysmld"]);
        api.search.post({ type: "query", text: "b.sysml" });
        assert.deepStrictEqual((await kids(await find(root, "tmp-tree"))).map(label), ["b.sysml"]);
        api.search.post({ type: "query", text: "qqqzzz" });
        assert.deepStrictEqual((await kids()).map(label), ["No matches"]);
        api.search.post({ type: "query", text: "" });
      } finally {
        api.search.post({ type: "query", text: "" });
        rmSync(dir(), { recursive: true, force: true });
        await waitFor(() => !indexed("a.sysml"), 15000, "cleanup reaches the index").catch(() => {});
      }
    })],
    ["All view: follow-cursor reveals the element through its file and folders", withFilter("all", async () => {
      const vehicleUri = vscode.Uri.joinPath(folder, "vehicle.sysml");
      const root = (await kids())[0]!;
      const file = await find(root, "vehicle.sysml");
      const engine = await find(await find(await find(file, "Vehicle"), "Car"), "engine");
      assert.strictEqual(api.provider.getParent(engine)?.id, (await find(await find(file, "Vehicle"), "Car")).id);
      const ed = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vehicleUri));
      assert.strictEqual(ed.document.uri.toString(), vehicleUri.toString());
      const calls: ModelNode[] = [];
      const reveals: Thenable<void>[] = [];
      const view = api.view;
      const orig = view.reveal.bind(view);
      (view as { reveal: typeof view.reveal }).reveal = (n, o) => { calls.push(n); const r = orig(n, o); reveals.push(r); return r; };
      try {
        await sleep(800);
        await vscode.commands.executeCommand("sysmlModel.focus");
        await waitFor(() => view.visible, 3000, "view visible");
        const line = ed.document.getText().split("\n").findIndex((l) => l.includes("part engine"));
        ed.selection = new vscode.Selection(0, 0, 0, 0);
        ed.selection = new vscode.Selection(line, 11, line, 11);
        await waitFor(() => calls.some((n) => n.id === engine.id), 3000, "reveal of engine in the All view");
        await Promise.all(reveals);
        await waitFor(() => view.selection[0]?.id === engine.id, 3000, "engine is selected in the view");
      } finally {
        (view as { reveal: typeof view.reveal }).reveal = orig;
      }
    })],
    ["Delete File: cancel keeps the file; a referenced file's confirmation lists the count and file; confirming removes an unreferenced file from disk, tree and agent tools", withFolders(async () => {
      rmSync(dir(), { recursive: true, force: true });
      mkdirSync(dir(), { recursive: true });
      writeFileSync(dir("dfa.sysml"), "package DfaLib { part def DfaEngine; }\n");
      writeFileSync(dir("dfb.sysml"), "package DfaUse { part def DfaCar { part e : DfaLib::DfaEngine; } }\n");
      writeFileSync(dir("dfc.sysml"), "package DfaLone { part def DfaZ; }\n");
      const asked: { message: string; detail: string }[] = [];
      let answer = false;
      api.diagram.setUi({ confirm: async (message, detail) => { asked.push({ message, detail }); return answer; } });
      try {
        await waitFor(() => indexed("dfa.sysml") && indexed("dfb.sysml") && indexed("dfc.sysml"), 30000, "the files are indexed");
        const root = (await vkids())[0]!;
        const tmp = await vfind(root, "tmp-tree");
        const nodeA = await vfind(tmp, "dfa.sysml");
        assert.strictEqual(api.provider.getTreeItem(nodeA).contextValue, "sysmlFile");
        await vscode.commands.executeCommand("sysml.tree.deleteFile", nodeA);
        assert.strictEqual(asked.length, 1);
        assert.ok(asked[0]!.message.includes("dfa.sysml"), asked[0]!.message);
        assert.ok(/1 reference in dfb\.sysml will no longer resolve/.test(asked[0]!.detail), asked[0]!.detail);
        assert.ok(readFileSync(dir("dfa.sysml"), "utf8").includes("DfaLib"), "cancel leaves the file");
        assert.ok(indexed("dfa.sysml"));
        asked.length = 0;
        answer = true;
        const nodeC = await vfind(tmp, "dfc.sysml");
        await vscode.commands.executeCommand("sysml.tree.deleteFile", nodeC);
        assert.strictEqual(asked.length, 1);
        assert.ok(!asked[0]!.detail.includes("no longer resolve"), asked[0]!.detail);
        await waitFor(() => !indexed("dfc.sysml"), 20000, "the file leaves the index");
        assert.ok(!existsSync(dir("dfc.sysml")), "gone from disk");
        await waitFor(async () => !(await vkids(tmp)).some((k) => label(k) === "dfc.sysml"), 20000, "the node leaves the tree");
        const r = await api.agent.testCallToolOverMcp("sysml_list_files", {});
        assert.ok(!r.text.includes("dfc.sysml") && r.text.includes("dfa.sysml"), r.text);
      } finally {
        api.diagram.setUi(undefined);
        rmSync(dir(), { recursive: true, force: true });
      }
    })],
    ["Deleting a folder that holds an indexed .sysml file (open in an editor, via fs.rmSync and via the VS Code API) drops it from the index, the tree and sysml_list_files", withFolders(async () => {
      for (const how of ["rmSync", "vscodeApi"]) {
        const name = `gone-${how}`;
        rmSync(dir(), { recursive: true, force: true });
        await sleep(1000); // let the watcher see the previous test's deletion before the same path is recreated
        mkdirSync(dir(name), { recursive: true });
        writeFileSync(dir(name, "gone.sysml"), `package Gone${how} { part def GoneThing${how}; }\n`);
        await waitFor(() => indexed(name, "gone.sysml"), 30000, `${how}: the file is indexed`);
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(dir(name, "gone.sysml"))));
        const root = (await vkids())[0]!;
        const tmp = await vfind(root, "tmp-tree");
        await vfind(tmp, name);
        if (how === "rmSync") rmSync(dir(name), { recursive: true, force: true });
        else await vscode.workspace.fs.delete(vscode.Uri.file(dir(name)), { recursive: true });
        await waitFor(() => !indexed(name, "gone.sysml"), 20000, `${how}: the deleted folder's open file leaves the index`);
        await waitFor(async () => !(await vkids(tmp)).some((k) => label(k) === name), 20000, `${how}: the folder leaves the tree`);
        const r = await api.agent.testCallToolOverMcp("sysml_list_files", {});
        assert.ok(!r.text.includes(`${name}/gone.sysml`), r.text);
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      }
      rmSync(dir(), { recursive: true, force: true });
    })],
    ["New File and New Folder: title bar commands exist; target rule uses the folder of a selected element; live label, duplicate, create, cancel", withFolders(async () => {
      rmSync(dir(), { recursive: true, force: true });
      mkdirSync(dir("a"), { recursive: true });
      writeFileSync(dir("a", "b.sysml"), "package NfB { part def NfPart; }\n");
      const cmds = await vscode.commands.getCommands(true);
      for (const id of ["sysml.tree.newFile", "sysml.tree.newFolder", "sysml.tree.refresh"]) assert.ok(cmds.includes(id), id);
      try {
        await waitFor(() => indexed("a/b.sysml"), 20000, "the file is indexed (a file written into a folder created moments earlier)").catch((e: unknown) => {
          throw new Error(`${String(e)}; on disk ${existsSync(dir("a", "b.sysml"))}; indexed under tmp-tree: ${api.model.index.uris().filter((u) => u.includes("/tmp-tree/")).join(",") || "none"}`);
        });
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        // Earlier tests leave the view with a selection that no longer exists; a refresh starts it afresh.
        await vscode.commands.executeCommand("sysml.tree.refresh");
        await vscode.commands.executeCommand("sysmlModel.focus");
        const root = (await vkids())[0]!;
        const tmp = await vfind(root, "tmp-tree");
        const a = await vfind(tmp, "a");
        const bFile = await vfind(a, "b.sysml");
        const pkg = (await vkids(bFile))[0]!;
        const part = (await vkids(pkg))[0]!;
        let lastErr = "";
        await waitFor(async () => {
          await api.view.reveal(part, { select: true, focus: false }).then(undefined, (e: unknown) => { lastErr = String(e); });
          return api.view.selection[0]?.id === part.id;
        }, 10000, `the part is selected (reveal error: ${lastErr}; selection ${api.view.selection.map((n) => n.id).join(",")}; query "${api.provider.query}")`);
        // Selected element: the file is created in folder a. The placeholder shows there first among the files.
        await vscode.commands.executeCommand("sysml.tree.newFile");
        await waitFor(() => api.newEntry.active() !== undefined, 5000, "the input box opens");
        await waitFor(async () => (await vkids(a)).some((k) => k.kind === "placeholder"), 5000, "the placeholder row appears in a");
        let ph = (await vkids(a)).find((k) => k.kind === "placeholder")!;
        assert.strictEqual(label(ph), "untitled.sysml");
        assert.strictEqual((await vkids(a)).findIndex((k) => k.kind === "placeholder"), 0, "first among a's entries (no subfolders)");
        assert.ok(!existsSync(dir("a", "untitled.sysml")), "nothing on disk yet");
        await waitFor(() => api.view.selection[0]?.kind === "placeholder", 5000, "the placeholder is selected");
        // Live label, staying in place while typing.
        api.newEntry.type("engine");
        assert.strictEqual(api.newEntry.active()!.label, "engine.sysml");
        ph = (await vkids(a)).find((k) => k.kind === "placeholder")!;
        assert.strictEqual(label(ph), "engine.sysml");
        assert.strictEqual((await vkids(a)).findIndex((k) => k.kind === "placeholder"), 0);
        assert.strictEqual(api.newEntry.active()!.validation?.severity, "info");
        // Duplicate: an error, and Enter does not create.
        api.newEntry.type("b");
        assert.strictEqual(api.newEntry.active()!.validation?.severity, "error");
        await api.newEntry.accept();
        assert.ok(api.newEntry.active(), "the input box stays open");
        assert.ok(!existsSync(dir("a", "b.sysml.sysml")) && readFileSync(dir("a", "b.sysml"), "utf8").includes("NfB"));
        api.newEntry.type("a/b");
        assert.strictEqual(api.newEntry.active()!.validation?.severity, "error", "invalid characters");
        // Cancel removes the placeholder and writes nothing.
        api.newEntry.type("never");
        await api.newEntry.cancel();
        await waitFor(async () => !(await vkids(a)).some((k) => k.kind === "placeholder"), 5000, "the placeholder is removed");
        assert.strictEqual(api.newEntry.active(), undefined);
        assert.ok(!existsSync(dir("a", "never.sysml")));
        // Create: Enter writes the file, the placeholder becomes the real node, the file opens.
        await api.view.reveal(part, { select: true, focus: false });
        await waitFor(() => api.view.selection[0]?.id === part.id, 5000, "the part is selected again");
        await vscode.commands.executeCommand("sysml.tree.newFile");
        await waitFor(() => api.newEntry.active() !== undefined, 5000, "the input box opens again");
        api.newEntry.type("engine");
        await api.newEntry.accept();
        assert.ok(existsSync(dir("a", "engine.sysml")), "created with .sysml appended");
        await waitFor(() => vscode.window.activeTextEditor?.document.uri.fsPath === dir("a", "engine.sysml"), 10000, "the file opens in the editor");
        await waitFor(async () => {
          const k = await vkids(a);
          return !k.some((n) => n.kind === "placeholder") && k.some((n) => label(n) === "engine.sysml");
        }, 20000, "the real node replaces the placeholder");
        // Folder: New Folder with a folder selected creates inside it.
        await api.view.reveal(a, { select: true, focus: false });
        await waitFor(() => api.view.selection[0]?.id === a.id, 5000, "a is selected");
        await vscode.commands.executeCommand("sysml.tree.newFolder");
        await waitFor(() => api.newEntry.active()?.kind === "folder", 5000, "the folder input box opens");
        assert.strictEqual(api.newEntry.active()!.label, "New Folder");
        api.newEntry.type("sub");
        assert.strictEqual(api.newEntry.active()!.label, "sub");
        await api.newEntry.accept();
        assert.ok(existsSync(dir("a", "sub")));
        await waitFor(async () => (await vkids(a)).some((k) => k.kind === "folder" && label(k) === "sub"), 20000, "the folder node appears");
        assert.ok(!(await vkids(a)).some((k) => k.kind === "placeholder"));
      } finally {
        await api.newEntry.cancel();
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        rmSync(dir(), { recursive: true, force: true });
      }
    })],
    ["New File: refused in an untrusted workspace; a search is cleared first", withFolders(async () => {
      api.newEntry.setTrusted(false);
      try {
        await vscode.commands.executeCommand("sysml.tree.newFile");
        assert.strictEqual(api.newEntry.active(), undefined, "no input box when untrusted");
      } finally {
        api.newEntry.setTrusted(undefined);
      }
      api.search.post({ type: "query", text: "zzzznomatch" });
      assert.strictEqual(api.search.query(), "zzzznomatch");
      try {
        const rootUri = vscode.workspace.workspaceFolders![0]!.uri.toString();
        const root: ModelNode = { id: rootUri, uri: rootUri, kind: "folder" };
        await vscode.commands.executeCommand("sysml.tree.newFile", root);
        await waitFor(() => api.newEntry.active() !== undefined, 5000, "the input box opens");
        assert.strictEqual(api.search.query(), "", "the search is cleared");
        await waitFor(async () => (await vkids(root)).some((k) => k.kind === "placeholder"), 5000, "the placeholder shows");
      } finally {
        await api.newEntry.cancel();
      }
    })],
    ["Refresh: a file added outside VS Code and the Refresh command shows it in the tree", withFolders(async () => {
      rmSync(dir(), { recursive: true, force: true });
      mkdirSync(dir(), { recursive: true });
      try {
        const root = (await vkids())[0]!;
        // An indexed file whose deletion the watcher never reported: only Refresh can drop it.
        const ghost = vscode.Uri.file(dir("ghost.sysml")).toString();
        (api.model.index as unknown as { setDocument(u: string, t: string): void }).setDocument(ghost, "package Ghost;\n");
        assert.ok(indexed("ghost.sysml"));
        writeFileSync(dir("fresh.sysml"), "package Fresh;\n");
        await vscode.commands.executeCommand("sysml.tree.refresh");
        await waitFor(() => indexed("fresh.sysml") && !indexed("ghost.sysml"), 20000, "the new file is indexed and the ghost is dropped");
        const tmp = await vfind(root, "tmp-tree");
        await waitFor(async () => (await vkids(tmp)).some((k) => label(k) === "fresh.sysml"), 20000, "the file appears");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
      }
    })],
  ];

  /** The node of a child folder, built from its URI (a folder node's id is its URI) so it can be polled synchronously. */
  function folderAt(parent: ModelNode, l: string): ModelNode {
    return { id: parent.id + "/" + l, uri: parent.uri + "/" + l, kind: "folder" };
  }
}
