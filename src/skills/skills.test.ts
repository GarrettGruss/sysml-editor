import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toolDefinitions } from "../agent-tools/tools.js";

const root = __dirname;
const skills = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const toolNames = new Set(toolDefinitions.map((t) => t.name));

describe("agent skills", () => {
  it("finds the skills", () => expect(skills.length).toBeGreaterThanOrEqual(3));
  for (const dir of skills) {
    const text = readFileSync(join(root, dir, "SKILL.md"), "utf8");
    it(`${dir} has name and description frontmatter`, () => {
      const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
      expect(m).not.toBeNull();
      expect(m![1]).toMatch(new RegExp(`^name: ${dir}$`, "m"));
      expect(m![1]).toMatch(/^description: \S/m);
    });
    it(`${dir} mentions only existing tools`, () => {
      for (const m of text.matchAll(/`(sysml_[a-z_]+)`/g)) expect(toolNames.has(m[1]!), m[1]!).toBe(true);
    });
  }
});
