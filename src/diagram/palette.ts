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
const GENERAL: PaletteItem[] = ALL_KINDS.filter((k) => k !== "package" && !k.startsWith("requirement") && !k.startsWith("verification")).map((k) => item(k));
const INTERCONNECTION: PaletteItem[] = [...USAGE_KINDS.filter((k) => k === "part" || k === "port" || k === "attribute").map((k) => item(k)), item("connection", "Connection")];
const REQUIREMENTS: PaletteItem[] = ALL_KINDS.filter((k) => k.startsWith("requirement")).map((k) => item(k));

export function paletteFor(kind: DiagramKind): PaletteItem[] {
  return kind === "general" ? GENERAL : kind === "interconnection" ? INTERCONNECTION : REQUIREMENTS;
}
