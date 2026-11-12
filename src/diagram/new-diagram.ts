/** Naming and choosing for "New Diagram…" and the element pickers. No `vscode` import. */
import type { Element, ModelIndex } from "../model/index.js";
import { isLibraryUri } from "../model/index.js";
import { isVisible, workspaceUris } from "../tree/tree-model.js";
import type { DiagramKind } from "./format.js";
import { relationOf } from "./relations.js";

export const DIAGRAM_EXTENSION = ".sysmld";

export const KIND_LABELS: Record<DiagramKind, { label: string; detail: string }> = {
  general: { label: "General View", detail: "Definitions and usages with specialization, composition and typing" },
  interconnection: { label: "Interconnection View", detail: "Parts nested in a part, with ports and connections" },
  requirements: { label: "Requirements View", detail: "Requirements with satisfy, verify and derivation relationships" },
};

const RESERVED = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i;

/** Windows device names, which cannot be file names there (with or without an extension). */
export function isReservedFileName(stem: string): boolean {
  return RESERVED.test(stem.split(".")[0]!.trimEnd());
}

/** `<element name>.sysmld`, with characters a file name cannot hold replaced, and Windows-reserved names and trailing dots or spaces avoided. */
export function defaultDiagramFileName(elementName: string): string {
  let base = elementName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").replace(/[. ]+$/, "").trim() || "diagram";
  if (isReservedFileName(base)) base = "_" + base;
  return base + DIAGRAM_EXTENSION;
}

/** `name.sysmld`, or `name 2.sysmld`, `name 3.sysmld`... when taken. */
export function uniqueFileName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) return name;
  const stem = name.endsWith(DIAGRAM_EXTENSION) ? name.slice(0, -DIAGRAM_EXTENSION.length) : name;
  for (let i = 2; ; i++) {
    const c = `${stem} ${i}${DIAGRAM_EXTENSION}`;
    if (!exists(c)) return c;
  }
}

/** Why a typed file name cannot be used, or undefined when it can. */
export function fileNameProblem(name: string, exists: (candidate: string) => boolean): string | undefined {
  if (!name.trim()) return "Enter a file name";
  if (/[\\/]/.test(name)) return "Enter a file name, not a path";
  if (!name.endsWith(DIAGRAM_EXTENSION)) return `The name must end with ${DIAGRAM_EXTENSION}`;
  if (name.length === DIAGRAM_EXTENSION.length) return "Enter a name before the extension";
  const stem = name.slice(0, -DIAGRAM_EXTENSION.length);
  if (/[. ]$/.test(stem) || /^\s/.test(name)) return "The name cannot start with a space or end with a dot or a space";
  if (isReservedFileName(stem)) return `${stem} is a reserved file name on Windows`;
  if (/[:*?"<>|\u0000-\u001f]/.test(name)) return "The name contains characters a file name cannot hold";
  if (exists(name)) return `${name} already exists`;
  return undefined;
}

/** Named, non-relationship elements of the workspace model (not the standard library), by qualified name. */
export function listElements(index: ModelIndex): Element[] {
  const seen = new Set<string>();
  const out: Element[] = [];
  const walk = (e: Element) => {
    if (!isVisible(e)) return;
    if (e.qualifiedName !== undefined && e.name !== undefined && !relationOf(e, index) && !seen.has(e.qualifiedName)) {
      seen.add(e.qualifiedName);
      out.push(e);
    }
    for (const m of e.members) walk(m);
  };
  for (const uri of workspaceUris(index)) for (const r of index.getDocument(uri)?.model.roots ?? []) walk(r);
  return out.filter((e) => !isLibraryUri(e.uri)).sort((a, b) => a.qualifiedName!.localeCompare(b.qualifiedName!));
}

/** Elements "Re-link…" offers: those of the kind the lost element had, when that is known. */
export function relinkCandidates(index: ModelIndex, kind: string | undefined): Element[] {
  const all = listElements(index);
  return kind === undefined ? all : all.filter((e) => e.kind === kind);
}
