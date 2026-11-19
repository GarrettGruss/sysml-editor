import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { TREE_NODE_COMMANDS, TREE_TITLE_COMMANDS, resolveInWorkspace, saveAnswerAllowed, treeCommandOffered, validateCommandArgs } from "./ui-support.js";

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
    expect(resolveInWorkspace("inside/a.sysml", [root])).toBe(path.join(root, "real", "a.sysml")) // the realpath, not the link;
    expect(resolveInWorkspace("real/new.sysml", [root])).toBe(path.join(root, "real", "new.sysml"));
  });
  it("accepts a root that is itself reached through a symlink", () => {
    const link = path.join(base, "wslink");
    symlinkSync(root, link);
    expect(resolveInWorkspace("real/x.sysml", [link])).toBe(path.join(root, "real", "x.sysml"));
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

describe("save answers and bare file names", () => {
  it("refuses hidden segments and a different extension", () => {
    expect(saveAnswerAllowed("/w/.git/hooks/pre-commit", undefined)).toBe(false);
    expect(saveAnswerAllowed("/w/.vscode/settings.json", "/w/a.json")).toBe(false);
    expect(saveAnswerAllowed("/w/out.sh", "/w/out.png")).toBe(false);
    expect(saveAnswerAllowed("/w/out.PNG", "/w/out.png")).toBe(true);
    expect(saveAnswerAllowed("/w/sub/out.txt", undefined)).toBe(true);
  });
  it("treats a bare file name argument as a path", () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "sysml-ui-")));
    const r = validateCommandArgs(["out.png", "Vehicle"], [root]);
    expect(r).toEqual({ ok: true, args: [expect.stringMatching(/^file:.*out\.png$/), "Vehicle"] });
    expect(validateCommandArgs([".git/hooks/x"], [root]).ok).toBe(true);
    expect(validateCommandArgs(["../out.png"], [root]).ok).toBe(false);
  });
});

describe("ActionGrace and diagram paths", () => {
  it("suppresses events during an action and for the grace window after it", async () => {
    const { ActionGrace } = await import("./ui-support.js");
    let t = 1000;
    const g = new ActionGrace(1500, () => t);
    expect(g.suppressing()).toBe(false);
    g.enter();
    expect(g.suppressing()).toBe(true);
    g.leave();
    t += 1000;
    expect(g.suppressing()).toBe(true);
    t += 600;
    expect(g.suppressing()).toBe(false);
  });
  it("drops queued events on clear so a later wait does not see them", async () => {
    const { UserEventQueue } = await import("./ui-support.js");
    const q = new UserEventQueue();
    q.push({ kind: "selection" });
    q.clear();
    expect(await q.wait(10)).toBeUndefined();
  });
  it("accepts only .sysmld paths", async () => {
    const { isDiagramPath } = await import("./ui-support.js");
    expect(isDiagramPath("/w/a.sysmld")).toBe(true);
    expect(isDiagramPath("/w/a.sysml")).toBe(false);
    expect(isDiagramPath("/w/a.png")).toBe(false);
  });
});
