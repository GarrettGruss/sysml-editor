import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class EventEmitter<T> {
    private ls: ((e: T) => void)[] = [];
    event = (l: (e: T) => void) => {
      this.ls.push(l);
      return { dispose() {} };
    };
    fire(e: T) {
      for (const l of this.ls) l(e);
    }
    dispose() {}
  }
  const ev = () => () => ({ dispose() {} });
  return {
    EventEmitter,
    commands: { executeCommand: async () => undefined },
    workspace: {
      createFileSystemWatcher: () => ({ dispose() {}, onDidCreate: ev(), onDidDelete: ev(), onDidChange: ev() }),
      onDidChangeWorkspaceFolders: ev(),
      onDidChangeConfiguration: ev(),
      workspaceFolders: [],
    },
    window: {},
    Uri: {},
    FileType: { Directory: 2 },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class {},
    ThemeColor: class {},
  };
});

import { ModelIndex } from "../model/index.js";
import { ModelTreeProvider } from "./tree-provider.js";
import type { FolderEnv, ModelNode } from "./tree-model.js";

const ROOT = "file:///w";

describe("ModelTreeProvider targeted refresh", () => {
  it("fires the objects getChildren handed out, like VS Code which keys nodes by identity", async () => {
    const ix = new ModelIndex();
    ix.setDocument(`${ROOT}/sub/a.sysml`, "package A;");
    const env: FolderEnv = {
      roots: [{ name: "w", uri: ROOT }],
      list: async (f) => (f === ROOT ? [{ name: "sub", isDir: true }] : [{ name: "a.sysml", isDir: false }, { name: "b.sysml", isDir: false }]),
      child: (f, n) => `${f}/${n}`,
      excluded: () => false,
    };
    const p = new ModelTreeProvider(ix, env);
    const known = new Set<ModelNode>();
    const fired: unknown[] = [];
    p.onDidChangeTreeData((e) => fired.push(e));
    const roots = await p.getChildren();
    const sub = (await p.getChildren(roots[0]))[0]!;
    await p.getChildren(sub);
    for (const n of [roots[0]!, sub]) known.add(n);
    // The view knows only handed-out objects; a fire with unknown objects is ignored.
    ix.setDocument(`${ROOT}/sub/b.sysml`, "package B;");
    expect(fired).toHaveLength(1);
    const batch = fired[0] as ModelNode[];
    expect(batch.length).toBeGreaterThan(0);
    for (const n of batch) expect(known.has(n)).toBe(true);
    p.dispose();
  });
});

describe("ModelTreeProvider search", () => {
  const env: FolderEnv = {
    roots: [{ name: "w", uri: ROOT }],
    list: async (f) => (f === ROOT ? [{ name: "sub", isDir: true }, { name: "z", isDir: true }] : f.endsWith("/sub") ? [{ name: "a.sysml", isDir: false }] : []),
    child: (f, n) => `${f}/${n}`,
    excluded: () => false,
  };

  it("shows only the path to matches, a single No matches item otherwise, and the full tree again when cleared", async () => {
    const ix = new ModelIndex();
    ix.setDocument(`${ROOT}/sub/a.sysml`, "package A { part engine; part wheel; }");
    const p = new ModelTreeProvider(ix, env);
    const fired: unknown[] = [];
    p.onDidChangeTreeData((e) => fired.push(e));
    p.setQuery("ENGINE");
    expect(fired).toEqual([undefined]);
    const roots = await p.getChildren();
    const sub = (await p.getChildren(roots[0]))[0]!;
    expect(sub.uri).toBe(`${ROOT}/sub`);
    expect(await p.getChildren(roots[0])).toHaveLength(1);
    const file = (await p.getChildren(sub))[0]!;
    const pkg = (await p.getChildren(file))[0]!;
    const members = await p.getChildren(pkg);
    expect(members).toHaveLength(1);

    p.setQuery("nothing");
    const none = await p.getChildren();
    expect(none).toHaveLength(1);
    expect(none[0]!.kind).toBe("message");

    p.setQuery("");
    expect(await p.getChildren(roots[0])).toHaveLength(2);
    p.dispose();
  });
});
