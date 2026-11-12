/** The palette of element kinds valid for each diagram kind. No `vscode` import, no DOM. */
import type { DiagramKind } from "./format.js";

export interface PaletteItem {
  /** A declaration kind (`part`, `part def`, ...) or `connection`. */
  kind: string;
  label: string;
}

const item = (kind: string, label?: string): PaletteItem => ({ kind, label: label ?? kind.charAt(0).toUpperCase() + kind.slice(1) });

const GENERAL: PaletteItem[] = ["part def", "port def", "attribute def", "item def", "action def", "part", "port", "attribute", "item", "action"].map((k) => item(k));
const INTERCONNECTION: PaletteItem[] = [item("part"), item("port"), item("attribute"), item("connection", "Connection")];
const REQUIREMENTS: PaletteItem[] = [item("requirement def"), item("requirement")];

export function paletteFor(kind: DiagramKind): PaletteItem[] {
  return kind === "general" ? GENERAL : kind === "interconnection" ? INTERCONNECTION : REQUIREMENTS;
}
