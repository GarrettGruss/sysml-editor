/** The picker flow of `SysML: Generate DoDAF Document`, without `vscode`, so it runs under test. */
import { isLibraryUri, type ModelIndex } from "../model/index.js";
import type { ToolResult } from "../agent-tools/types.js";
import { DEFAULT_FOLDER, MISSING_LIBRARY_MESSAGE } from "./generate.js";

/** What the flow needs from the editor. */
export interface GenerateUi {
  pickRoot(items: { label: string; description?: string }[]): Promise<string | undefined>;
  inputFolder(initial: string): Promise<string | undefined>;
  /** Runs `sysml_dodaf_generate`. */
  run(input: Record<string, unknown>): Promise<ToolResult>;
  info(message: string): void;
  warn(message: string): void;
  /** Shows the missing-library error with an "Add DoDAF Library" button; true when the library was added and the user wants to generate again. */
  offerAddLibrary(message: string): Promise<boolean>;
}

/** Non-library top-level packages, as qualified names. */
export function rootCandidates(index: ModelIndex): string[] {
  const out: string[] = [];
  for (const uri of index.uris()) {
    if (isLibraryUri(uri)) continue;
    for (const e of index.getDocument(uri)?.model.roots ?? []) if (e.kind === "package" && e.qualifiedName) out.push(e.qualifiedName);
  }
  return out.sort();
}

export async function runGenerateCommand(index: ModelIndex, ui: GenerateUi): Promise<void> {
  const roots = rootCandidates(index);
  if (roots.length === 0) {
    ui.warn("No package found in the workspace to generate a DoDAF document from.");
    return;
  }
  const root = await ui.pickRoot(roots.map((label) => ({ label })));
  if (root === undefined) return;
  const folder = await ui.inputFolder(DEFAULT_FOLDER);
  if (folder === undefined) return;
  const input = { root, folder: folder.trim() || DEFAULT_FOLDER };
  let r = await ui.run(input);
  if (r.isError && r.text.includes(MISSING_LIBRARY_MESSAGE)) {
    if (!(await ui.offerAddLibrary(r.text))) return;
    r = await ui.run(input);
  }
  if (r.isError) {
    ui.warn(r.text);
    return;
  }
  const rep = JSON.parse(r.text) as { document: string; gaps: unknown[]; views: { status: string }[] };
  const skipped = rep.views.filter((v) => v.status === "skipped").length;
  ui.info(`Wrote ${rep.document}. ${rep.gaps.length} gap(s)${skipped ? `, ${skipped} diagram view(s) skipped` : ""}.`);
}
