/** Pure helpers for "Delete File": the references from other files that stop resolving, and the confirmation text. `vscode`-free. */
import { walkReferences } from "../edit/refscan.js";
import { isLibraryUri, type Element, type ModelIndex } from "../model/index.js";

export interface FileReferences {
  /** References in other user files to elements declared in the file. */
  count: number;
  /** The files holding them (uri to count), in index order. */
  files: { uri: string; count: number }[];
}

const nameOf = (uri: string) => {
  const base = uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
};

/** Count the references in other workspace files (not the file itself, not library files) to elements the file declares. */
export function referencesToFile(index: ModelIndex, uri: string): FileReferences {
  const targets = new Set<Element>();
  const collect = (e: Element) => {
    targets.add(e);
    e.members.forEach(collect);
  };
  index.getDocument(uri)?.model.roots.forEach(collect);
  const per = new Map<string, number>();
  if (targets.size) {
    walkReferences(
      index,
      (v) => {
        if (v.uri === uri || isLibraryUri(v.uri)) return;
        if (!v.resolved.some((r) => r !== undefined && targets.has(r))) return;
        per.set(v.uri, (per.get(v.uri) ?? 0) + 1);
      },
      { targets },
    );
  }
  const files = [...per].map(([u, count]) => ({ uri: u, count }));
  return { count: files.reduce((n, f) => n + f.count, 0), files };
}

export function deleteFileConfirmation(uri: string, refs: FileReferences, dirty: boolean): { message: string; detail: string } {
  const name = nameOf(uri);
  const bits: string[] = [];
  if (dirty) bits.push("It has unsaved changes, which will be lost.");
  if (refs.count) {
    const where = refs.files.map((f) => nameOf(f.uri)).join(", ");
    bits.push(`${refs.count} reference${refs.count === 1 ? "" : "s"} in ${where} will no longer resolve.`);
  }
  bits.push("The file is moved to the trash when possible.");
  return { message: `Delete ${name}?`, detail: bits.join(" ") };
}
