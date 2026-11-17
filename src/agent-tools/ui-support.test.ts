import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { TREE_NODE_COMMANDS, TREE_TITLE_COMMANDS, resolveInWorkspace, treeCommandOffered } from "./ui-support.js";

describe("resolveInWorkspace and symlinks", () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "sysml-ui-")));
  const root = path.join(base, "ws");
  const outside = path.join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(path.join(outside, "secret.txt"), "x");
  mkdirSync(path.join(root, "real"));
  symlinkSync(outside, path.join(root, "escape"));
  symlinkSync(path.join(root, "real"), path.join(root, "inside"));
  symlinkSync(path.join(outside, "new.txt"), path.join(root, "dangling"));

  it("refuses a path through a symlink that leads outside", () => {
    expect(resolveInWorkspace("escape/secret.txt", [root])).toBeUndefined();
    expect(resolveInWorkspace("escape/new/file.sysml", [root])).toBeUndefined();
    expect(resolveInWorkspace(path.join(root, "escape"), [root])).toBeUndefined();
  });
  it("refuses a dangling symlink that points outside", () => {
    expect(resolveInWorkspace("dangling", [root])).toBeUndefined();
  });
  it("allows a symlink that stays inside, and new files below real folders", () => {
    expect(resolveInWorkspace("inside/a.sysml", [root])).toBe(path.join(root, "inside", "a.sysml"));
    expect(resolveInWorkspace("real/new.sysml", [root])).toBe(path.join(root, "real", "new.sysml"));
  });
  it("accepts a root that is itself reached through a symlink", () => {
    const link = path.join(base, "wslink");
    symlinkSync(root, link);
    expect(resolveInWorkspace("real/x.sysml", [link])).toBe(path.join(link, "real", "x.sysml"));
    expect(resolveInWorkspace("escape/secret.txt", [link])).toBeUndefined();
  });
});

describe("tree command table", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { contributes: { menus: Record<string, { command: string; when: string }[]> } };
  it("matches the view menus of package.json", () => {
    const title = pkg.contributes.menus["view/title"]!.filter((m) => m.when.includes("view == sysmlModel")).map((m) => m.command).sort();
    expect([...TREE_TITLE_COMMANDS].sort()).toEqual(title);
    const items = pkg.contributes.menus["view/item/context"]!.filter((m) => m.when.includes("view == sysmlModel") && m.when !== "false").map((m) => m.command);
    expect([...new Set(TREE_NODE_COMMANDS.map((c) => c.command))].sort()).toEqual([...new Set(items)].sort());
  });
  it("offers a command only where the menu does", () => {
    expect(treeCommandOffered("sysml.tree.rename", "sysmlElement")).toBe(true);
    expect(treeCommandOffered("sysml.tree.rename", "sysmlElementReadOnly")).toBe(false);
    expect(treeCommandOffered("sysml.tree.deleteFile", "sysmlElement")).toBe(false);
    expect(treeCommandOffered("sysml.tree.refresh", undefined)).toBe(true);
    expect(treeCommandOffered("sysml.tree.rename", undefined)).toBe(false);
  });
});
