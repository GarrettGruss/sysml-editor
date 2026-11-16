import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("./", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir), "utf8");
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

describe("editor theme", () => {
  it("uses no colour literal in the stylesheet except as the fallback inside var(--vscode-...)", () => {
    // Remove var(...) calls with their fallbacks (which may nest), leaving anything that is a real literal.
    let css = read("diagram.css");
    for (let i = 0; i < 6; i++) css = css.replace(/var\([^()]*\)/g, "");
    expect(css.match(COLOUR)).toBeNull();
  });

  it("takes every colour of the live view from CSS classes bound to theme variables", () => {
    const css = read("diagram.css");
    for (const cls of ["f-bg", "f-node", "f-line", "f-edge", "f-text", "f-subtext", "f-warn", "s-line", "s-edge", "s-warn", "s-sel", "sel-line", "sel-fill", "band"]) {
      const rule = new RegExp(`\\.${cls}[^{]*\\{([^}]*)\\}`).exec(css);
      expect(rule, cls).not.toBeNull();
      expect(rule![1], cls).toMatch(/var\(--vscode-/);
    }
  });

  it("uses the contrast border variable for borders and a thicker line in high contrast", () => {
    const css = read("diagram.css");
    expect(css).toMatch(/\.s-line[^{]*\{[^}]*--vscode-contrastBorder/);
    expect(css).toMatch(/vscode-high-contrast[^{]*\{[^}]*stroke-width/);
    expect(css).toMatch(/focus-visible[^{]*\{[^}]*--vscode-focusBorder/);
  });

  it("has colour literals in the TypeScript only inside the fixed export palettes", () => {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      let src = read(f);
      src = src.replace(/export const (LIGHT|DARK)_PALETTE[^]*?\n\};/g, ""); // the two fixed export palettes
      src = src.replace(/\/\/.*$/gm, "");
      expect(src.match(COLOUR), `${f} has a colour literal outside the export palettes`).toBeNull();
    }
  });

  it("draws the live view with classes, never with colour attributes", () => {
    const svg = read("svg.ts");
    expect(svg).toMatch(/paint\(/);
    // `paint` emits attributes only when a palette (export mode) is given.
    expect(/function paint[^]*?\n\}/.exec(svg)![0]).toMatch(/if \(o\.palette\)/);
  });
});
