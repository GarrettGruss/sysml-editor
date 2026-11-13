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
  /** `read-only`, `edits-diagram` or `edits-model`, so clients can tell the write tools. */
  tags: string[];
  inputSchema: unknown;
}

const MODEL_TOOLS = /^sysml_(create_element|delete_element|rename_element|set_element_properties|create_relationship|create_requirement)$/;
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
    tags: ["sysml", t.readOnly ? "read-only" : MODEL_TOOLS.test(t.name) ? "edits-model" : "edits-diagram"],
    inputSchema: t.inputSchema,
  }));
}
