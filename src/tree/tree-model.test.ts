import { describe, expect, it } from "vitest";
import { ModelIndex, LIBRARY_URI_SCHEME } from "../model/index.js";
import {
  affectedNodes, childNodes, firstErrorText, iconKeyOf, nodeAtOffset, nodeInfo, resolveNode, rootNodes,
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

  it("computes affected nodes", () => {
    const ix = setup();
    const roots = rootNodes(ix).map((n) => n.id);
    expect(affectedNodes(ix, roots, [A])).toEqual({ full: false, ids: roots });
    expect(affectedNodes(ix, roots, [`${LIBRARY_URI_SCHEME}:///x.sysml`])).toEqual({ full: false, ids: [] });
    ix.setDocument("file:///w/b.sysml", "package B;");
    expect(affectedNodes(ix, roots, ["file:///w/b.sysml"]).full).toBe(true);
    ix.removeDocument(A);
    expect(affectedNodes(ix, roots, [A]).full).toBe(true);
  });
});
