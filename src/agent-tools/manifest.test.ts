import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lmToolManifest } from "./manifest.js";

describe("languageModelTools manifest", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  it("package.json is up to date (run `npm run generate:manifest`)", () => {
    expect(pkg.contributes.languageModelTools).toEqual(JSON.parse(JSON.stringify(lmToolManifest())));
  });
  it("names satisfy VS Code's rule and are unique", () => {
    const names = lmToolManifest().map((t) => t.name);
    for (const n of names) expect(n).toMatch(/^[\w-]+$/);
    expect(new Set(names).size).toBe(names.length);
  });
  it("declares the setting, the MCP provider and the minimum VS Code", () => {
    expect(pkg.contributes.configuration.properties["sysml.agent.channels"].default).toBe("both");
    expect(pkg.contributes.mcpServerDefinitionProviders).toEqual([{ id: "sysml.mcpServer", label: "SysML Editor" }]);
    expect(pkg.engines.vscode).toBe("^" + pkg.devDependencies["@types/vscode"].replace("~", ""));
  });
});
