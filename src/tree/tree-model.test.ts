import { describe, expect, it } from "vitest";
import { makeExcludeFilter } from "../workspace/exclude.js";
import { ModelIndex, LIBRARY_URI_SCHEME } from "../model/index.js";
import {
  affectedDiagramNodes, affectedFolderNodes, diagramRoots, diagramChildren, diagramFolderInfo, diagramKindLabel, diagramNode, folderChain, isExcludedPath, visibleDiagrams, hasDiagramBelow, childNodes, fileChildren, folderChildren, folderInfo, folderParent, folderRoots, hasSysmlBelow, fileNode, folderNode, type FolderEnv, elementNames, nodeForElement, firstErrorPosition, firstErrorText, isErrorNode, iconKeyOf, nodeAtOffset, nodeInfo, resolveNode, rootNodes,
  allChildren, allFolderInfo, buildAllFilter, buildDiagramFilter, buildElementFilter, keepElementNodes, keepFolderNodes, matchesQuery,
  type ModelNode,
} from "./tree-model.js";

const A = "file:///w/a.sysml";
const SRC = `package P {
  private import ISQ::*;
  doc /* hello */
  part def Engine;
  part engine : Engine [1..2];
  part;
  port p;
  attribute def Mass;
  action def Run;
  state s;
  requirement def R;
  connection c;
  connect engine to p;
  package Inner { part def Deep; }
}
`;

function setup(text = SRC) {
  const ix = new ModelIndex();
  ix.setDocument(A, text);
  return ix;
}
const kids = (ix: ModelIndex, n: ModelNode) => childNodes(ix, n);
const info = (ix: ModelIndex, n: ModelNode) => nodeInfo(ix, n)!;

describe("tree model", () => {
  it("lists workspace roots only, not library documents", () => {
    const ix = setup();
    ix.setDocument(`${LIBRARY_URI_SCHEME}:///Lib.sysml`, "package Lib { part def X; }");
    const roots = rootNodes(ix);
    expect(roots).toHaveLength(1);
    expect(info(ix, roots[0]!).label).toBe("P");
  });

  it("hides imports and docs, keeps source order, shows relationships as unnamed leaves", () => {
    const ix = setup();
    const p = rootNodes(ix)[0]!;
    const labels = kids(ix, p).map((n) => info(ix, n).label);
    expect(labels.slice(0, 3)).toEqual(["Engine", "engine", "<unnamed>"]);
    expect(labels).not.toContain("ISQ");
    expect(labels.at(-1)).toBe("Inner");
    const connect = kids(ix, p).map((n) => info(ix, n)).find((i) => i.description?.includes("→"));
    expect(connect?.label).toBe("<unnamed>");
    expect(connect?.description).toBe("engine → p");
    expect(connect?.hasChildren).toBe(false);
  });

  it("describes typed usages, definitions and root files", () => {
    const ix = setup();
    const p = rootNodes(ix)[0]!;
    const [engineDef, engine] = kids(ix, p);
    expect(info(ix, engineDef!)).toMatchObject({ label: "Engine", description: "part def", icon: "part-def" });
    expect(info(ix, engine!)).toMatchObject({ label: "engine", description: ": Engine [1..2]", icon: "part-usage" });
    expect(info(ix, p)).toMatchObject({ description: "a.sysml", icon: "package", isRoot: true });
  });

  it("picks icons per kind with a generic fallback", () => {
    const ix = setup();
    const byLabel = new Map(kids(ix, rootNodes(ix)[0]!).map((n) => [info(ix, n).label, info(ix, n).icon]));
    expect(byLabel.get("p")).toBe("port-usage");
    expect(byLabel.get("Mass")).toBe("attribute-def");
    expect(byLabel.get("Run")).toBe("action-def");
    expect(byLabel.get("s")).toBe("state-usage");
    expect(byLabel.get("R")).toBe("requirement-def");
    expect(byLabel.get("c")).toBe("connection-usage");
    expect(byLabel.get("Inner")).toBe("package");
    const ix2 = setup("package Q { view v; }");
    const v = kids(ix2, rootNodes(ix2)[0]!)[0]!;
    expect(iconKeyOf(resolveNode(ix2, v)!)).toBe("element");
  });

  it("uses the short name when there is no name", () => {
    const ix = setup("package P { part def <x>; }");
    expect(info(ix, kids(ix, rootNodes(ix)[0]!)[0]!).label).toBe("x");
  });

  it("keeps node ids stable across a re-parse", () => {
    const ix = setup();
    const before = kids(ix, rootNodes(ix)[0]!).map((n) => n.id);
    ix.setDocument(A, SRC.replace("part def Engine;", "part def Wheel;\n  part def Engine;"));
    const after = kids(ix, rootNodes(ix)[0]!).map((n) => n.id);
    expect(after).toContain(before[1]!);
    expect(after).toHaveLength(before.length + 1);
    expect(new Set(after).size).toBe(after.length);
    expect(resolveNode(ix, { uri: A, id: before[1]! })?.name).toBe("engine");
  });

  it("describes a syntax error and keeps the old children", () => {
    const ix = setup();
    ix.setDocument(A, SRC.replace("part def Engine;", "part def Engine"));
    const p = rootNodes(ix)[0]!;
    expect(info(ix, p).description).toMatch(/^a\.sysml \(\d+ syntax errors?\)$/);
    expect(kids(ix, p).length).toBeGreaterThan(3);
    expect(firstErrorText(ix, A)).toMatch(/^line \d+, column \d+: /);
  });

  it("finds the deepest element at an offset", () => {
    const ix = setup();
    const at = (s: string) => nodeAtOffset(ix, A, SRC.indexOf(s))!;
    expect(resolveNode(ix, at("engine : Engine"))?.name).toBe("engine");
    expect(resolveNode(ix, at("Deep"))?.name).toBe("Deep");
    expect(resolveNode(ix, at("package Inner"))?.name).toBe("Inner");
    expect(nodeAtOffset(ix, A, SRC.length + 5)).toBeUndefined();
  });
});

describe("files that never parsed cleanly", () => {
  const B = "file:///w/broken.sysml";
  it("show an error root with the file name, and keep clean files unchanged", () => {
    const ix = new ModelIndex();
    ix.setDocument(B, "package Broken {\n  part def\n");
    const roots = rootNodes(ix);
    expect(roots).toHaveLength(1);
    expect(isErrorNode(roots[0]!)).toBe(true);
    expect(nodeInfo(ix, roots[0]!)).toMatchObject({ label: "broken.sysml", description: "syntax error", icon: "error", isRoot: true, hasChildren: false });
    expect(childNodes(ix, roots[0]!)).toEqual([]);
    expect(firstErrorText(ix, B)).toMatch(/^line \d+, column \d+/);
    expect(firstErrorPosition(ix, B)).toMatchObject({ line: expect.any(Number), column: expect.any(Number) });
  });
  it("is replaced by the real roots once the file parses", () => {
    const ix = new ModelIndex();
    ix.setDocument(B, "package Broken {\n  part def\n");
    expect(isErrorNode(rootNodes(ix)[0]!)).toBe(true);
    ix.setDocument(B, "package Broken { part def X; }");
    expect(isErrorNode(rootNodes(ix)[0]!)).toBe(false);
    expect(info(ix, rootNodes(ix)[0]!).label).toBe("Broken");
  });
  it("a file that parsed before keeps its last good model instead", () => {
    const ix = setup();
    ix.setDocument(A, SRC + "package {");
    const roots = rootNodes(ix);
    expect(roots.every((n) => !isErrorNode(n))).toBe(true);
    expect(info(ix, roots[0]!).label).toBe("P");
  });
});

describe("elements and tree nodes", () => {
  it("finds the node of an element, also among same-named siblings, and lists names for dragging", () => {
    const ix = setup();
    const p = rootNodes(ix)[0]!;
    const deep = ix.findByQualifiedName("P::Inner::Deep")[0]!;
    const node = nodeForElement(ix, deep)!;
    expect(resolveNode(ix, node)).toBe(deep);
    const engine = ix.findByQualifiedName("P::engine")[0]!;
    const n2 = nodeForElement(ix, engine)!;
    expect(kids(ix, p).map((k) => k.id)).toContain(n2.id);
    expect(elementNames(ix, [node, n2, node])).toEqual(["P::Inner::Deep", "P::engine"]);
  });
  it("has no node for library elements", () => {
    const ix = setup();
    ix.setDocument(`${LIBRARY_URI_SCHEME}:///Lib.sysml`, "package Lib { part def X; }");
    expect(nodeForElement(ix, ix.findByQualifiedName("Lib::X")[0]!)).toBeUndefined();
  });
});

describe("Elements view", () => {
  // A fake disk: folder uri -> entries.
  const disk: Record<string, { name: string; isDir: boolean }[]> = {
    "file:///w": [
      { name: "zeta", isDir: true }, { name: "Alpha", isDir: true }, { name: "docs", isDir: true }, { name: "node_modules", isDir: true }, { name: "top.sysml", isDir: false },
      { name: "a.sysml", isDir: false }, { name: "readme.md", isDir: false }, { name: "hidden.sysml", isDir: false },
    ],
    "file:///w/Alpha": [{ name: "m.sysml", isDir: false }, { name: "sub", isDir: true }],
    "file:///w/Alpha/sub": [{ name: "deep.sysml", isDir: false }],
    "file:///w/zeta": [],
    "file:///w/docs": [{ name: "guide.md", isDir: false }],
    "file:///w/node_modules": [{ name: "x.sysml", isDir: false }],
    "file:///v": [{ name: "o.sysml", isDir: false }],
  };
  const filter = makeExcludeFilter(["**/node_modules/**", "hidden.sysml"]);
  const env: FolderEnv = {
    roots: [{ name: "w", uri: "file:///w" }, { name: "v", uri: "file:///v" }],
    list: async (u) => disk[u] ?? [],
    child: (f, n) => `${f}/${n}`,
    excluded: filter,
  };
  function ix() {
    const i = new ModelIndex();
    for (const u of ["file:///w/top.sysml", "file:///w/a.sysml", "file:///w/hidden.sysml", "file:///w/Alpha/m.sysml", "file:///w/Alpha/sub/deep.sysml", "file:///w/node_modules/x.sysml", "file:///v/o.sysml"])
      i.setDocument(u, "package " + u.split("/").pop()!.replace(".sysml", "") + " { part def X; }");
    return i;
  }
  const names = (ns: ModelNode[]) => ns.map((n) => n.id.split("/").pop());

  it("has one root per workspace folder, also with no files (none only when no folder is open)", () => {
    expect(folderRoots(ix(), env).map((n) => n.id)).toEqual(["file:///w", "file:///v"]);
    expect(folderRoots(new ModelIndex(), env).map((n) => n.id)).toEqual(["file:///w", "file:///v"]);
  });

  it("lists folders before files, sorted by name, without excluded entries or non-SysML files", async () => {
    const kids = await folderChildren(ix(), env, folderNode("file:///w"));
    expect(names(kids)).toEqual(["Alpha", "docs", "zeta", "a.sysml", "top.sysml"]);
    expect(kids.map((k) => k.kind)).toEqual(["folder", "folder", "folder", "file", "file"]);
  });

  it("marks folders with no SysML file below as empty, listing only their subfolders", async () => {
    const i = ix();
    expect(folderInfo(i, env, folderNode("file:///w/docs"))).toEqual({ label: "docs", description: "no SysML files", empty: true });
    expect(folderInfo(i, env, folderNode("file:///w/Alpha"))).toMatchObject({ empty: false, description: undefined });
    expect(folderInfo(i, env, folderNode("file:///w"))).toMatchObject({ label: "w" });
    const docsKids = await folderChildren(i, env, folderNode("file:///w/docs"));
    expect(docsKids.every((n) => n.kind === "folder")).toBe(true);
    const wKids = await folderChildren(new ModelIndex(), env, folderNode("file:///w"));
    expect(wKids.length).toBeGreaterThan(0);
    expect(wKids.every((n) => n.kind === "folder")).toBe(true);
    expect(hasSysmlBelow(i, "file:///w/Alpha")).toBe(true);
    expect(hasSysmlBelow(i, "file:///w/zeta")).toBe(false);
    // a file below an excluded folder does not count when it is not indexed
    const j = new ModelIndex();
    expect(folderInfo(j, env, folderNode("file:///w/Alpha")).empty).toBe(true);
  });

  it("does not hide folders for a `**/_*` pattern, but hides a `dir/**` folder itself", async () => {
    const e2: FolderEnv = { ...env, excluded: makeExcludeFilter(["**/_*", "zeta/**"]) };
    expect(names(await folderChildren(ix(), e2, folderNode("file:///w")))).toEqual(["Alpha", "docs", "node_modules", "a.sysml", "hidden.sysml", "top.sysml"]);
  });

  it("returns no parent outside the workspace roots and lists a nested root only once", async () => {
    expect(folderParent(env, fileNode("file:///lib/x.sysml"))).toBeUndefined();
    expect(folderParent(env, folderNode("file:///lib"))).toBeUndefined();
    const nested: FolderEnv = { ...env, roots: [...env.roots, { name: "in", uri: "file:///w/Alpha" }] };
    expect(names(await folderChildren(ix(), nested, folderNode("file:///w")))).not.toContain("Alpha");
  });

  it("walks down to the elements", async () => {
    const i = ix();
    const sub = (await folderChildren(i, env, folderNode("file:///w/Alpha")))[0]!;
    expect(sub.id).toBe("file:///w/Alpha/sub");
    const file = (await folderChildren(i, env, sub))[0]!;
    expect(file).toEqual(fileNode("file:///w/Alpha/sub/deep.sysml"));
    const elements = fileChildren(i, file);
    expect(elements.map((n) => n.id)).toEqual(rootNodes(i).filter((n) => n.uri === file.uri).map((n) => n.id));
    expect(nodeInfo(i, elements[0]!)?.label).toBe("deep");
    expect(childNodes(i, elements[0]!)).toHaveLength(1);
  });

  it("parents walk element, file, folders, workspace folder", () => {
    const i = ix();
    const el = fileChildren(i, fileNode("file:///w/Alpha/sub/deep.sysml"))[0]!;
    const inner = childNodes(i, el)[0]!;
    expect(folderParent(env, inner)).toEqual(el);
    expect(folderParent(env, el)).toEqual(fileNode("file:///w/Alpha/sub/deep.sysml"));
    expect(folderParent(env, fileNode("file:///w/Alpha/sub/deep.sysml"))).toEqual(folderNode("file:///w/Alpha/sub"));
    expect(folderParent(env, folderNode("file:///w/Alpha/sub"))).toEqual(folderNode("file:///w/Alpha"));
    expect(folderParent(env, folderNode("file:///w/Alpha"))).toEqual(folderNode("file:///w"));
    expect(folderParent(env, folderNode("file:///w"))).toBeUndefined();
  });

  it("refreshes the folders above an added or removed file, and only the file for a content change", () => {
    const i = ix();
    const before = new Set(i.uris().filter((u) => !u.startsWith(LIBRARY_URI_SCHEME)));
    i.setDocument("file:///w/Alpha/sub/new.sysml", "package N;");
    expect(affectedFolderNodes(i, env, before, ["file:///w/Alpha/sub/new.sysml"]).map((n) => n.id)).toEqual(["file:///w", "file:///w/Alpha", "file:///w/Alpha/sub"]);
    i.setDocument("file:///w/a.sysml", "package A2;");
    expect(affectedFolderNodes(i, env, before, ["file:///w/a.sysml"])).toEqual([fileNode("file:///w/a.sysml")]);
    expect(affectedFolderNodes(i, env, before, [`${LIBRARY_URI_SCHEME}:///Lib.sysml`])).toEqual([]);
  });

  it("keeps the error node under a file that never parsed", () => {
    const i = new ModelIndex();
    i.setDocument("file:///w/top.sysml", "package Broken {\n  part def\n");
    const kids = fileChildren(i, fileNode("file:///w/top.sysml"));
    expect(kids).toHaveLength(1);
    expect(isErrorNode(kids[0]!)).toBe(true);
    expect(folderParent(env, kids[0]!)).toEqual(fileNode("file:///w/top.sysml"));
  });
});

describe("Diagrams view", () => {
  const disk: Record<string, { name: string; isDir: boolean }[]> = {
    "file:///w": [
      { name: "zeta", isDir: true }, { name: "Alpha", isDir: true }, { name: "docs", isDir: true }, { name: "node_modules", isDir: true },
      { name: "top.sysmld", isDir: false }, { name: "B.sysmld", isDir: false }, { name: "a.sysmld", isDir: false }, { name: "x.sysml", isDir: false }, { name: "skip.sysmld", isDir: false },
    ],
    "file:///w/Alpha": [{ name: "g.sysmld", isDir: false }, { name: "sub", isDir: true }],
    "file:///w/Alpha/sub": [{ name: "deep.sysmld", isDir: false }],
    "file:///w/zeta": [],
    "file:///w/docs": [{ name: "guide.md", isDir: false }, { name: "m.sysml", isDir: false }],
    "file:///w/node_modules": [{ name: "n.sysmld", isDir: false }],
  };
  const env: FolderEnv = {
    roots: [{ name: "w", uri: "file:///w" }],
    list: async (u) => disk[u] ?? [],
    child: (f, n) => `${f}/${n}`,
    excluded: makeExcludeFilter(["**/node_modules/**", "skip.sysmld"]),
  };
  const all = ["top", "B", "a", "skip"].map((n) => `file:///w/${n}.sysmld`).concat(["file:///w/Alpha/g.sysmld", "file:///w/Alpha/sub/deep.sysmld", "file:///w/node_modules/n.sysmld", "file:///w/other/outside.sysmld"]);
  const diagrams = visibleDiagrams(env, all.slice(0, 7));
  const names = (ns: ModelNode[]) => ns.map((n) => n.id.split("/").pop());

  it("drops excluded files, also below an excluded folder", () => {
    expect([...diagrams].sort()).toEqual(["file:///w/Alpha/g.sysmld", "file:///w/Alpha/sub/deep.sysmld", "file:///w/B.sysmld", "file:///w/a.sysmld", "file:///w/top.sysmld"]);
    expect(isExcludedPath(env, "file:///w/node_modules/n.sysmld")).toBe(true);
    expect(isExcludedPath(env, "file:///elsewhere/x.sysmld")).toBe(true);
    expect(isExcludedPath(env, "file:///w/a.sysmld")).toBe(false);
  });

  it("lists folders then diagram leaves, sorted, without .sysml files or excluded entries", async () => {
    const kids = await diagramChildren(diagrams, env, folderNode("file:///w"));
    expect(names(kids)).toEqual(["Alpha", "docs", "zeta", "a.sysmld", "B.sysmld", "top.sysmld"]);
    expect(kids.map((k) => k.kind)).toEqual(["folder", "folder", "folder", "diagram", "diagram", "diagram"]);
  });

  it("diagram nodes are leaves with their folder as parent", async () => {
    const leaf = diagramNode("file:///w/Alpha/g.sysmld");
    expect(await diagramChildren(diagrams, env, leaf)).toEqual([]);
    expect(folderParent(env, leaf)).toEqual(folderNode("file:///w/Alpha"));
  });

  it("marks folders without diagrams 'no diagrams', listing only their subfolders", async () => {
    expect(diagramFolderInfo(diagrams, env, folderNode("file:///w/docs"))).toEqual({ label: "docs", description: "no diagrams", empty: true });
    expect(diagramFolderInfo(diagrams, env, folderNode("file:///w/Alpha"))).toMatchObject({ empty: false, description: undefined });
    expect(diagramFolderInfo(diagrams, env, folderNode("file:///w"))).toMatchObject({ label: "w", empty: false });
    expect((await diagramChildren(diagrams, env, folderNode("file:///w/docs"))).every((n) => n.kind === "folder")).toBe(true);
    expect(hasDiagramBelow(diagrams, "file:///w/zeta")).toBe(false);
    const none = await diagramChildren(new Set(), env, folderNode("file:///w/Alpha"));
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((n) => n.kind === "folder")).toBe(true);
  });

  it("reads the kind cheaply and falls back to nothing", () => {
    expect(diagramKindLabel('{\n  "version": 1,\n  "kind": "actionFlow",\n  "root": "P"\n}')).toBe("Action Flow");
    expect(diagramKindLabel('{"version":1,"kind":"stateTransition"}')).toBe("State Transition");
    for (const [k, l] of [["general", "General"], ["interconnection", "Interconnection"], ["sequence", "Sequence"], ["requirements", "Requirements"]]) expect(diagramKindLabel(`{"kind":"${k}"}`)).toBe(l);
    expect(diagramKindLabel("not json")).toBeUndefined();
    expect(diagramKindLabel('{"kind":"mystery"}')).toBeUndefined();
    expect(diagramKindLabel("")).toBeUndefined();
  });

  it("refreshes the folders above an added or removed diagram, and only the file for a rewrite", () => {
    const added = new Set([...diagrams, "file:///w/zeta/new.sysmld"]);
    expect(affectedDiagramNodes(env, diagrams, added).map((n) => n.id)).toEqual(["file:///w", "file:///w/zeta"]);
    const removed = new Set([...diagrams].filter((u) => u !== "file:///w/Alpha/sub/deep.sysmld"));
    expect(affectedDiagramNodes(env, diagrams, removed).map((n) => n.id)).toEqual(["file:///w", "file:///w/Alpha", "file:///w/Alpha/sub"]);
    expect(affectedDiagramNodes(env, diagrams, diagrams, ["file:///w/a.sysmld"])).toEqual([diagramNode("file:///w/a.sysmld")]);
    expect(affectedDiagramNodes(env, diagrams, diagrams, ["file:///w/gone.sysmld"])).toEqual([]);
    expect(folderChain(env, "file:///w/zeta/new.sysmld").map((n) => n.id)).toEqual(["file:///w", "file:///w/zeta"]);
  });
});

describe("diagramRoots", () => {
  const env = { roots: [{ name: "w", uri: "file:///w" }] } as unknown as FolderEnv;
  it("returns the workspace roots, also without diagrams", () => {
    expect(diagramRoots(env, new Set()).map((n) => n.uri)).toEqual(["file:///w"]);
    expect(diagramRoots(env, new Set(["file:///w/a.sysmld"])).map((n) => n.uri)).toEqual(["file:///w"]);
  });
});

describe("search filtering", () => {
  it("matches case-insensitively on a trimmed query and never on an empty one", () => {
    expect(matchesQuery("Engine", " ENG ")).toBe(true);
    expect(matchesQuery("Wheel", "eng")).toBe(false);
    expect(matchesQuery(undefined, "eng")).toBe(false);
    expect(matchesQuery("Engine", "  ")).toBe(false);
  });

  it("keeps matching elements (name or short name) and their owners across files", () => {
    const ix = setup();
    ix.setDocument("file:///w/sub/b.sysml", "package B { part def <e1> Motor; part def Wheel; }");
    const f = buildElementFilter(ix, "engine");
    const p = rootNodes(ix).find((n) => n.uri === A)!;
    expect([...f.files]).toEqual([A]);
    expect(f.folders.has("file:///w")).toBe(true);
    expect(f.expanded.has(p.id)).toBe(true);
    const shown = keepElementNodes(childNodes(ix, p), f).map((n) => info(ix, n).label);
    expect(shown).toEqual(["Engine", "engine"]);
    // a nested match keeps its owner chain
    const g = buildElementFilter(ix, "deep");
    const inner = keepElementNodes(childNodes(ix, p), g);
    expect(inner.map((n) => info(ix, n).label)).toEqual(["Inner"]);
    expect(keepElementNodes(childNodes(ix, inner[0]!), g).map((n) => info(ix, n).label)).toEqual(["Deep"]);
    // short names match, in the other file
    const s = buildElementFilter(ix, "E1");
    expect([...s.files]).toEqual(["file:///w/sub/b.sysml"]);
    expect(s.folders.has("file:///w/sub")).toBe(true);
    expect(buildElementFilter(ix, "zzz").files.size).toBe(0);
  });

  it("filters diagram files by name and keeps the folders above", () => {
    const f = buildDiagramFilter(["file:///w/a/State One.sysmld", "file:///w/b/ports.sysmld"], "state");
    expect([...f.files]).toEqual(["file:///w/a/State One.sysmld"]);
    expect(f.folders.has("file:///w") && f.folders.has("file:///w/a") && !f.folders.has("file:///w/b")).toBe(true);
    const kept = keepFolderNodes([folderNode("file:///w/a"), folderNode("file:///w/b"), diagramNode("file:///w/a/State One.sysmld")], f);
    expect(kept.map((n) => n.uri)).toEqual(["file:///w/a", "file:///w/a/State One.sysmld"]);
  });
});

describe("All view", () => {
  const disk: Record<string, { name: string; isDir: boolean }[]> = {
    "file:///w": [
      { name: "zeta", isDir: true }, { name: "Alpha", isDir: true }, { name: "b.sysmld", isDir: false }, { name: "z.sysml", isDir: false },
      { name: "a.sysmld", isDir: false }, { name: "m.sysml", isDir: false }, { name: "x.md", isDir: false },
    ],
    "file:///w/Alpha": [{ name: "g.sysmld", isDir: false }],
    "file:///w/zeta": [],
  };
  const env: FolderEnv = { roots: [{ name: "w", uri: "file:///w" }], list: async (u) => disk[u] ?? [], child: (f, n) => `${f}/${n}`, excluded: () => false };
  const ix = new ModelIndex();
  for (const n of ["z", "m"]) ix.setDocument(`file:///w/${n}.sysml`, `package ${n}Pkg { part def Engine; }`);
  const diagrams = new Set(["file:///w/b.sysmld", "file:///w/a.sysmld", "file:///w/Alpha/g.sysmld"]);

  it("lists subfolders, then .sysml files, then diagrams, each sorted by name", async () => {
    const kids = await allChildren(ix, diagrams, env, folderNode("file:///w"));
    expect(kids.map((k) => `${k.kind}:${k.id.split("/").pop()}`)).toEqual(["folder:Alpha", "folder:zeta", "file:m.sysml", "file:z.sysml", "diagram:a.sysmld", "diagram:b.sysmld"]);
  });

  it("is empty only when neither a .sysml file nor a diagram is below", async () => {
    expect(allFolderInfo(ix, diagrams, env, folderNode("file:///w/Alpha"))).toMatchObject({ empty: false, description: undefined });
    expect(allFolderInfo(ix, diagrams, env, folderNode("file:///w/zeta"))).toEqual({ label: "zeta", description: "no SysML files or diagrams", empty: true });
    expect(allFolderInfo(new ModelIndex(), new Set(), env, folderNode("file:///w/Alpha")).empty).toBe(true);
    const onlyEmpty = await allChildren(new ModelIndex(), new Set(), env, folderNode("file:///w"));
    expect(onlyEmpty.every((n) => n.kind === "folder")).toBe(true);
  });

  it("searches element, .sysml file and diagram names", () => {
    const byElement = buildAllFilter(ix, diagrams, "engine");
    expect([...byElement.files].sort()).toEqual(["file:///w/m.sysml", "file:///w/z.sysml"]);
    const byFile = buildAllFilter(ix, diagrams, "g.sysmld");
    expect([...byFile.files]).toEqual(["file:///w/Alpha/g.sysmld"]);
    expect(byFile.folders.has("file:///w/Alpha")).toBe(true);
    expect(byFile.matches).toBe(1);
    expect([...buildAllFilter(ix, diagrams, "m.sysml").files]).toEqual(["file:///w/m.sysml"]);
  });
});
