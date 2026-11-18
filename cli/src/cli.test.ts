import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { run, type Io } from "./main.js";

let root: string;
let io: Io;
let out: string;
let err: string;
const NAMES = ["sysml-modeling", "sysml-tutor", "sysml-ui-testing"];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sysml-cli-"));
  const src = join(root, "src");
  for (const n of NAMES) {
    mkdirSync(join(src, n), { recursive: true });
    writeFileSync(join(src, n, "SKILL.md"), `skill ${n}\n`);
  }
  mkdirSync(join(root, "home"));
  mkdirSync(join(root, "cwd"));
  out = err = "";
  io = { out: (s) => (out += s), err: (s) => (err += s), cwd: join(root, "cwd"), home: join(root, "home"), skillsSource: src };
});

const user = () => join(root, "home", ".claude", "skills");

describe("sysml cli", () => {
  it("prints help, version and command help with exit 0", () => {
    expect(run(["-h"], io)).toBe(0);
    expect(out).toMatch(/USAGE[\s\S]*OPTIONS[\s\S]*EXAMPLES/);
    out = "";
    expect(run(["skills", "-h"], io)).toBe(0);
    expect(out).toMatch(/USAGE[\s\S]*OPTIONS[\s\S]*EXAMPLES/);
    out = "";
    expect(run(["help", "skills"], io)).toBe(0);
    expect(out).toContain("sysml skills");
    out = "";
    expect(run(["-V"], io)).toBe(0);
    expect(out).toBe("0.3.0\n");
    expect(err).toBe("");
  });

  it("usage errors exit 2 and print the error then the help to stderr", () => {
    expect(run([], io)).toBe(2);
    expect(err).toMatch(/^sysml: missing command\n[\s\S]*USAGE/);
    err = "";
    expect(run(["bogus"], io)).toBe(2);
    expect(err).toMatch(/^sysml: unknown command 'bogus'/);
    err = "";
    expect(run(["skills", "--nope"], io)).toBe(2);
    expect(err).toMatch(/^sysml: [\s\S]*sysml skills: install/);
    err = "";
    expect(run(["skills", "extra"], io)).toBe(2);
    expect(run(["skills", "-p", "-d", "x"], io)).toBe(2);
    expect(run(["help", "zzz"], io)).toBe(2);
    expect(out).toBe("");
  });

  it("installs silently into ~/.claude/skills by default", () => {
    expect(run(["skills"], io)).toBe(0);
    expect(out + err).toBe("");
    for (const n of NAMES) expect(readFileSync(join(user(), n, "SKILL.md"), "utf8")).toBe(`skill ${n}\n`);
  });

  it("-p installs into ./.claude/skills and -v lists", () => {
    expect(run(["skills", "-pv"], io)).toBe(0);
    expect(existsSync(join(root, "cwd", ".claude", "skills", "sysml-tutor", "SKILL.md"))).toBe(true);
    expect(out.trim().split("\n")).toHaveLength(3);
  });

  it("-d and --dir=DIR choose the folder; -- ends options", () => {
    expect(run(["skills", "-d", "a"], io)).toBe(0);
    expect(existsSync(join(root, "cwd", "a", "sysml-tutor"))).toBe(true);
    expect(run(["skills", "--dir=b"], io)).toBe(0);
    expect(existsSync(join(root, "cwd", "b", "sysml-tutor"))).toBe(true);
    expect(run(["skills", "--", "-p"], io)).toBe(2);
    expect(err).toContain("unexpected argument '-p'");
  });

  it("skips identical, refuses different, overwrites with -f", () => {
    run(["skills"], io);
    expect(run(["skills", "-v"], io)).toBe(0);
    expect(out).toContain("skip sysml-tutor");
    out = "";
    writeFileSync(join(user(), "sysml-tutor", "SKILL.md"), "edited\n");
    expect(run(["skills"], io)).toBe(1);
    expect(err).toMatch(/^sysml: sysml-tutor already exists[\s\S]*-f[\s\S]*USAGE/);
    expect(readFileSync(join(user(), "sysml-tutor", "SKILL.md"), "utf8")).toBe("edited\n");
    expect(run(["skills", "-f"], io)).toBe(0);
    expect(readFileSync(join(user(), "sysml-tutor", "SKILL.md"), "utf8")).toBe("skill sysml-tutor\n");
  });

  it("-pf groups short flags", () => {
    run(["skills", "-p"], io);
    writeFileSync(join(root, "cwd", ".claude", "skills", "sysml-tutor", "SKILL.md"), "x");
    expect(run(["skills", "-pf"], io)).toBe(0);
    expect(readFileSync(join(root, "cwd", ".claude", "skills", "sysml-tutor", "SKILL.md"), "utf8")).toBe("skill sysml-tutor\n");
  });

  it("-n changes nothing", () => {
    expect(run(["skills", "-nv"], io)).toBe(0);
    expect(out).toContain("would install");
    expect(existsSync(user())).toBe(false);
  });

  it("-q suppresses -v output; missing bundle is a failure", () => {
    expect(run(["skills", "-qv"], io)).toBe(0);
    expect(out).toBe("");
    io.skillsSource = join(root, "nope");
    expect(run(["skills"], io)).toBe(1);
    expect(err).toMatch(/^sysml: bundled skills not found/);
  });
});
