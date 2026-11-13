/** The palette of element kinds valid for each diagram kind. No `vscode` import, no DOM. */
import type { DiagramKind } from "./format.js";
import { ALL_KINDS, USAGE_KINDS } from "../model-service/kinds.js";

export interface PaletteItem {
  /** A declaration kind (`part`, `part def`, ...) or `connection`. */
  kind: string;
  label: string;
}

const item = (kind: string, label?: string): PaletteItem => ({ kind, label: label ?? kind.charAt(0).toUpperCase() + kind.slice(1) });

// Every palette kind comes from the one list of kinds the model service accepts (`ALL_KINDS`).
const GENERAL: PaletteItem[] = ALL_KINDS.filter((k) => k !== "package" && !k.startsWith("requirement") && !k.startsWith("verification") && !k.startsWith("state")).map((k) => item(k));
const INTERCONNECTION: PaletteItem[] = [...USAGE_KINDS.filter((k) => k === "part" || k === "port" || k === "attribute").map((k) => item(k)), item("connection", "Connection")];
// The relationship tools go through the same model operations as the requirements editor (click the source, then the target).
const REQUIREMENTS: PaletteItem[] = [
  ...ALL_KINDS.filter((k) => k.startsWith("requirement")).map((k) => item(k)),
  item("satisfy", "Satisfy"),
  item("verify", "Verify"),
  item("derivation", "Derivation"),
];

// Behaviour views (design D20): the nodes of the view and the tool that draws its edge. The edge tools are click-source-then-target tools.
const ACTION_FLOW: PaletteItem[] = [item("action", "Action"), item("fork", "Fork"), item("join", "Join"), item("decide", "Decide"), item("merge", "Merge"), item("succession", "Succession"), item("flow", "Flow")];
const STATE_TRANSITION: PaletteItem[] = [item("state", "State"), item("transition", "Transition")];
const SEQUENCE: PaletteItem[] = [item("message", "Message")];

/** Palette kinds that are relationship tools (click the source, then the target) rather than elements to create. */
export const CONNECT_TOOLS: ReadonlySet<string> = new Set(["connection", "satisfy", "verify", "derivation", "succession", "transition", "message", "flow"]);

export function paletteFor(kind: DiagramKind): PaletteItem[] {
  switch (kind) {
    case "general": return GENERAL;
    case "interconnection": return INTERCONNECTION;
    case "actionFlow": return ACTION_FLOW;
    case "stateTransition": return STATE_TRANSITION;
    case "sequence": return SEQUENCE;
    default: return REQUIREMENTS;
  }
}
