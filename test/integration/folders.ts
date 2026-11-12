import * as assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ModelNode } from "./index.js";
import type { Ctx } from "./diagram-interaction.js";

type Test = [name: string, fn: () => Promise<void>];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The Folders layout of the tree: workspace folder, folders, files, elements; empty folders; follow-cursor; folder create and delete. */
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

  const withFolders = (fn: () => Promise<void>): (() => Promise<void>) => async () => {
    await api.provider.setLayout("folders");
    try {
      await fn();
    } finally {
      await api.provider.setLayout("packages");
    }
  };
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
    ["Folders layout: workspace folder, folders before files sorted by name, excluded folders hidden, empty folders marked", withFolders(async () => {
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

        // down to the elements, which keep the ids they have in the Packages layout
        const file = await find(await find(nest, "deep"), "m.sysml");
        assert.strictEqual(api.provider.getTreeItem(file).contextValue, "sysmlFile");
        assert.strictEqual(api.provider.getTreeItem(file).command?.command, "vscode.open");
        const pkg = await find(file, "Deep");
        const x = await find(pkg, "X");
        assert.strictEqual(api.provider.getTreeItem(pkg).contextValue, "sysmlElement");
        assert.strictEqual(api.provider.getTreeItem(x).description, "part def");
        await api.provider.setLayout("packages");
        assert.ok((await kids()).some((n) => n.id === pkg.id), "the package keeps its id in the Packages layout");
        await api.provider.setLayout("folders");

        // a text dump of the tree, as the artifact of this layout
        mkdirSync(artifactDir, { recursive: true });
        const lines = [label(roots[0]!), ...(await dump(roots[0], 4, "  "))];
        writeFileSync(path.join(artifactDir, "tree-folders.txt"), lines.join("\n") + "\n");
      } finally {
        rmSync(dir(), { recursive: true, force: true });
      }
    })],
    ["Folders layout: getParent walks element, file, folders; Go to Definition and follow-cursor reveal work on element nodes", withFolders(async () => {
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
      const view = api.view;
      const orig = view.reveal.bind(view);
      (view as { reveal: typeof view.reveal }).reveal = (n, o) => { calls.push(n); return orig(n, o); };
      try {
        await vscode.commands.executeCommand("sysmlModel.focus");
        await waitFor(() => view.visible, 3000, "view visible");
        const line = ed.document.getText().split("\n").findIndex((l) => l.includes("part engine"));
        ed.selection = new vscode.Selection(line, 11, line, 11);
        await waitFor(() => calls.some((n) => n.id === engine.id), 3000, "reveal of engine through file and folders");
      } finally {
        (view as { reveal: typeof view.reveal }).reveal = orig;
      }
    })],
    ["Folders layout: creating and deleting folders refreshes only the parent node, and a deleted folder takes its files out of the model", withFolders(async () => {
      setup();
      const fired: unknown[] = [];
      const sub = api.provider.onDidChangeTreeData((e) => fired.push(e));
      try {
        await waitFor(() => indexed("Nest/deep/m.sysml"), 20000, "m.sysml indexed");
        const root = (await kids())[0]!;
        const tmp = await find(root, "tmp-tree");
        const ids = (e: unknown) => (Array.isArray(e) ? e : [e]).map((n) => (n as ModelNode | undefined)?.id);

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
  ];

  /** The node of a child folder, built from its URI (a folder node's id is its URI) so it can be polled synchronously. */
  function folderAt(parent: ModelNode, l: string): ModelNode {
    return { id: parent.id + "/" + l, uri: parent.uri + "/" + l, kind: "folder" };
  }
}
