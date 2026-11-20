import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelIndex } from "../model/index.js";
import { planViews } from "./plan.js";
import { escapeMd, renderMarkdown } from "./render.js";
import { writeDocument } from "./document.js";
import { workspaceFiles } from "./workspace-files.js";

const LIB = readFileSync(join(__dirname, "../../resources/dodaf/DoDAF.sysml"), "utf8");

describe("planViews OV-5b names", () => {
  const ix = new ModelIndex();
  ix.setDocument("file:///DoDAF.sysml", LIB);
  ix.setDocument("file:///m.sysml", "package M { private import DoDAF::*; package A { #OperationalActivity action same; } package B { #OperationalActivity action same; } #OperationalActivity action 'we ird/..name'; }");
  const plan = planViews(ix, ix.findByQualifiedName("M")[0]!, ["OV-5b"]);
  it("sanitizes and de-duplicates file names", () => {
    const names = plan.map((p) => p.fileName!);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const n of names) expect(n).toMatch(/^[\w.-]+$/);
  });
});

describe("markdown escaping", () => {
  it("escapes HTML, links, images and pipes in cells, titles and skipped text", () => {
    expect(escapeMd("<b>&[x](y)|")).toBe("&lt;b&gt;&amp;\\[x\\](y)\\|");
    expect(escapeMd("![a](b)")).not.toContain("![");
    const t = renderMarkdown({ columns: ["<i>"], rows: [["<script>"]], gaps: [] });
    expect(t).not.toContain("<script>");
    const d = writeDocument("<x>", [{ id: "AV-1", skipped: "<y>" }, { id: "OV-1", image: "images/a b).svg" }]);
    expect(d).not.toContain("<x>");
    expect(d).not.toContain("<y>");
    expect(d).toContain("(images/a%20b%29.svg)");
  });
});

describe("workspaceFiles", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const tmp = () => (dirs.push(mkdtempSync(join(tmpdir(), "dodaf-"))), dirs.at(-1)!);

  it("writes inside the workspace and creates folders", async () => {
    const root = tmp();
    const f = workspaceFiles(() => [{ name: "w", fsPath: root }], () => true);
    await f.writeText("a/b/c.md", "hi");
    expect(readFileSync(join(root, "a/b/c.md"), "utf8")).toBe("hi");
    expect(await f.exists("a/b/c.md")).toBe(true);
  });

  it("refuses traversal, a symlinked parent and a symlinked target", async () => {
    const root = tmp();
    const outside = tmp();
    mkdirSync(join(root, "docs"));
    symlinkSync(outside, join(root, "docs/linked"));
    writeFileSync(join(outside, "t.txt"), "keep");
    symlinkSync(join(outside, "t.txt"), join(root, "docs/file.md"));
    const f = workspaceFiles(() => [{ name: "w", fsPath: root }], () => true);
    await expect(f.writeText("../x.md", "z")).rejects.toThrow();
    await expect(f.writeText("docs/linked/x.md", "z")).rejects.toThrow();
    await expect(f.writeText("docs/file.md", "z")).rejects.toThrow();
    expect(existsSync(join(outside, "x.md"))).toBe(false);
    expect(readFileSync(join(outside, "t.txt"), "utf8")).toBe("keep");
  });

  it("maps a second folder by its name, like the diagram tools", async () => {
    const a = tmp();
    const b = tmp();
    const f = workspaceFiles(() => [{ name: "one", fsPath: a }, { name: "two", fsPath: b }], () => true);
    await f.writeText("two/docs/x.md", "in b");
    expect(readFileSync(join(b, "docs/x.md"), "utf8")).toBe("in b");
    expect(existsSync(join(a, "two"))).toBe(false);
  });
});
