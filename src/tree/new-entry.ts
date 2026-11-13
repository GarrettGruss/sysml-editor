/**
 * New File and New Folder in the tree: where the entry goes, how the typed text becomes a name, and
 * where the placeholder row sits. No `vscode` import.
 */
import type { ModelNode } from "./tree-model.js";

export type NewEntryKind = "file" | "folder";

export const PLACEHOLDER_ID = "!new-entry";

export function defaultName(kind: NewEntryKind): string {
  return kind === "file" ? "untitled.sysml" : "New Folder";
}

export function placeholderNode(folderUri: string): ModelNode {
  return { id: PLACEHOLDER_ID, uri: folderUri, kind: "placeholder" };
}

/** The folder URI for a new entry: the selected folder, else the folder of the selected file or element, else the first workspace folder. */
export function newEntryTarget(roots: readonly { uri: string }[], selection: readonly ModelNode[]): string | undefined {
  const n = selection.find((s) => s.kind !== "message" && s.kind !== "placeholder");
  if (n) {
    if (n.kind === "folder") return n.uri;
    const i = n.uri.lastIndexOf("/");
    if (i > 0) return n.uri.slice(0, i);
  }
  return roots[0]?.uri;
}

/** The name the typed text stands for: the default when empty, and `.sysml` appended to a file name that lacks it. */
export function effectiveName(kind: NewEntryKind, text: string): string {
  const t = text.trim();
  if (!t) return defaultName(kind);
  return kind === "file" && !t.toLowerCase().endsWith(".sysml") ? t + ".sysml" : t;
}

export interface NameCheck {
  severity: "error" | "info";
  message: string;
}

// eslint-disable-next-line no-control-regex
const INVALID = /[\\/:*?"<>|\u0000-\u001f]/;

/** An error for invalid characters or a name already in the folder, else an info when `.sysml` is appended. */
export function validateName(kind: NewEntryKind, text: string, existing: readonly string[]): NameCheck | undefined {
  const t = text.trim();
  const name = effectiveName(kind, text);
  if (INVALID.test(t)) return { severity: "error", message: 'A name cannot contain \\ / : * ? " < > | or control characters.' };
  if (name === "." || name === ".." || (kind === "file" && name.toLowerCase() === ".sysml")) return { severity: "error", message: `"${name}" is not a valid name.` };
  if (/[. ]$/.test(t)) return { severity: "error", message: "A name cannot end with a dot or a space." };
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) return { severity: "error", message: `"${name}" is a reserved name on Windows.` };
  const lower = name.toLowerCase();
  if (existing.some((e) => e.toLowerCase() === lower)) return { severity: "error", message: `A file or folder named "${name}" already exists here.` };
  if (kind === "file" && t && name !== t) return { severity: "info", message: `Will be created as ${name}.` };
  return undefined;
}

/** `kids` with the placeholder first among its kind: before the folders for a folder, before the files for a file. */
export function withPlaceholder(kids: readonly ModelNode[], folderUri: string, kind: NewEntryKind): ModelNode[] {
  const ph = placeholderNode(folderUri);
  const at = kind === "folder" ? 0 : kids.findIndex((k) => k.kind === "file" || k.kind === "diagram");
  const i = at < 0 ? kids.length : at;
  return [...kids.slice(0, i), ph, ...kids.slice(i)];
}
