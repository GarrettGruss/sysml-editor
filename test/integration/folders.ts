import * as assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

  const withFilter = (filter: "elements" | "diagrams", fn: () => Promise<void>): (() => Promise<void>) => async () => {
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
    mkdirSync(dir("docs"), { recursive: true });
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
          assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
          assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "folder");
          assert.strictEqual(((item.iconPath as vscode.ThemeIcon).color as vscode.ThemeColor).id, "disabledForeground");
          assert.deepStrictEqual(await kids(n), []);
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

      await vscode.commands.executeCommand("sysml.goToDefinition", car);
      const ed = vscode.window.activeTextEditor!;
      assert.strictEqual(ed.document.uri.toString(), vehicleUri.toString());
      assert.strictEqual(ed.document.getText(ed.selection), "Car");

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
        await vscode.commands.executeCommand("sysml.tree.showDiagrams");
        assert.strictEqual(api.provider.filter, "diagrams");
        assert.ok(fired.includes(undefined), "the whole tree is refreshed on a switch");
        const root = (await kids())[0]!;
        const top = await kids(root);
        assert.ok(top.every((n) => n.kind === "folder" || n.kind === "diagram"), "no .sysml files in the Diagrams view");
        assert.ok(top.some((n) => label(n) === "ports-general.sysmld"), "the fixture diagrams are leaves");
        assert.ok(top.every((n) => !n.kind || n.kind !== "file"));
        await vscode.commands.executeCommand("sysml.tree.showElements");
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
          return !!t && api.provider.getTreeItem(t).description === undefined;
        }, 20000, "the new diagrams are found");
        const tmp = await find(root, "tmp-tree");
        assert.deepStrictEqual((await kids(tmp)).map(label), ["docs", "empty", "Nest"], "folders only: the .sysml files are not shown");
        for (const empty of ["docs", "empty"]) {
          const n = await find(tmp, empty);
          const item = api.provider.getTreeItem(n);
          assert.strictEqual(item.description, "no diagrams");
          assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
          assert.strictEqual(((item.iconPath as vscode.ThemeIcon).color as vscode.ThemeColor).id, "disabledForeground");
          assert.deepStrictEqual(await kids(n), []);
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
        await waitFor(() => indexed("a.sysml") && indexed("b.sysml"), 20000, "the files are indexed");
        const root = (await vkids())[0]!;
        const tmp = await vfind(root, "tmp-tree");
        await vkids(tmp);
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
  ];

  /** The node of a child folder, built from its URI (a folder node's id is its URI) so it can be polled synchronously. */
  function folderAt(parent: ModelNode, l: string): ModelNode {
    return { id: parent.id + "/" + l, uri: parent.uri + "/" + l, kind: "folder" };
  }
}
