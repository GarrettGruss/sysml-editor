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
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
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
