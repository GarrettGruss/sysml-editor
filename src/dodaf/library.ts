/** The DoDAF annotation library: selecting elements by metadata (D76) and copying the file (D85). No `vscode` import. */
import type { Element } from "../model/index.js";
import type { ModelIndex } from "../model/index.js";

export const DODAF_PACKAGE = "DoDAF";
export const DODAF_FILE_NAME = "DoDAF.sysml";

/** The metadata annotations of `el` as written: `#Name` prefixes and owned `@Name` / `metadata Name` members. */
export function annotationNames(index: ModelIndex, el: Element): string[] {
  const text = index.getDocument(el.uri)?.text;
  if (text === undefined) return [];
  const out: string[] = [];
  const head = text.slice(el.range.start.offset, el.range.end.offset);
  const prefix = /^(?:\s*#\s*((?:[^\s#;{}:]|::)+))+/.exec(head);
  if (prefix) for (const m of prefix[0].matchAll(/#\s*((?:[^\s#;{}:]|::)+)/g)) out.push(m[1]!);
  for (const m of el.members) {
    if (m.kind !== "metadata" || m.uri !== el.uri) continue;
    const body = text.slice(m.range.start.offset, m.range.end.offset);
    const t = /^(?:@|metadata\b)\s*(?:[^\s;{}:]+\s*(?::|typed\s+by)\s*)?((?:[^\s;{}:]|::)+)/.exec(body);
    if (t) out.push(t[1]!);
  }
  return out;
}

/** The metadata definition named by `def` (a qualified name, or the element). */
function definitionOf(index: ModelIndex, def: string | Element): Element | undefined {
  if (typeof def !== "string") return def;
  return index.findByQualifiedName(def).find((e) => e.kind === "metadata def") ?? index.findByQualifiedName(`${DODAF_PACKAGE}::${def}`)[0];
}

/** Every element annotated with the metadata definition `def`, in document order. Unannotated elements and unresolved annotations are not selected. */
export function selectByMetadata(index: ModelIndex, def: string | Element): Element[] {
  const target = definitionOf(index, def);
  if (!target) return [];
  const out: Element[] = [];
  const visit = (el: Element): void => {
    if (el.kind !== "metadata" && el.kind !== "doc" && el.kind !== "import" && (el.isUsage || el.isDefinition)) {
      for (const name of annotationNames(index, el)) {
        if (index.resolve(name, el) === target) {
          out.push(el);
          break;
        }
      }
    }
    for (const m of el.members) visit(m);
  };
  for (const uri of index.uris()) for (const r of index.getDocument(uri)?.model.roots ?? []) visit(r);
  return out;
}

/** The file operations `addLibrary` needs; the extension supplies `vscode.workspace.fs`, tests a fake. */
export interface LibraryFs {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  mkdirs(path: string): Promise<void>;
}

export interface AddLibraryResult {
  status: "copied" | "exists";
  /** Destination path of `DoDAF.sysml`. */
  path: string;
}

/** Copy `DoDAF.sysml` from `source` into `destDir`. An existing file is never overwritten. */
export async function addLibrary(fs: LibraryFs, source: string, destDir: string): Promise<AddLibraryResult> {
  const path = `${destDir.replace(/\/+$/, "")}/${DODAF_FILE_NAME}`;
  if (await fs.exists(path)) return { status: "exists", path };
  const text = await fs.readText(source);
  await fs.mkdirs(destDir);
  await fs.writeText(path, text);
  return { status: "copied", path };
}
