import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  contributes: { commands: { command: string }[]; walkthroughs: { id: string; title: string; steps: { id: string; completionEvents?: string[]; media: { markdown: string } }[] }[] };
};
const CORE = ["workbench.action.files.save"];

describe("walkthroughs (D68)", () => {
  const ws = pkg.contributes.walkthroughs;
  it("has First steps and Diagram basics", () => {
    expect(ws.map((w) => w.title)).toEqual(["SysML: First Steps", "SysML: Diagram Basics"]);
  });
  it("every completion event names an existing command, and every media file exists", () => {
    const own = new Set(pkg.contributes.commands.map((c) => c.command));
    for (const w of ws) for (const s of w.steps) {
      for (const e of s.completionEvents ?? []) {
        const id = e.replace(/^onCommand:/, "");
        expect(own.has(id) || CORE.includes(id), `${w.id}/${s.id}: ${id}`).toBe(true);
      }
      expect(existsSync(new URL(`../${s.media.markdown}`, import.meta.url)), s.media.markdown).toBe(true);
    }
  });
});
