import { toolDefinitions } from "./tools.js";

/** One `contributes.languageModelTools` entry. */
export interface LmToolManifestEntry {
  name: string;
  displayName: string;
  modelDescription: string;
  toolReferenceName: string;
  canBeReferencedInPrompt: boolean;
  /** Context-key expression; VS Code lists manifest tools even without an implementation, so this hides them in `mcp` mode. */
  when: string;
  inputSchema: unknown;
}

const words = (name: string) => name.replace(/^sysml_/, "").split("_");
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** The manifest section derived from the shared definitions; `npm run generate:manifest` writes it to package.json. */
export function lmToolManifest(): LmToolManifestEntry[] {
  return toolDefinitions.map((t) => ({
    name: t.name,
    displayName: "SysML: " + words(t.name).map(cap).join(" "),
    modelDescription: t.description,
    toolReferenceName: "sysml" + words(t.name).map(cap).join(""),
    canBeReferencedInPrompt: true,
    when: "config.sysml.agent.channels != 'mcp'",
    inputSchema: t.inputSchema,
  }));
}
