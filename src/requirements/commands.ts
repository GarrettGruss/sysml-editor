/** Commands of the requirements editor and the document annotations library. */
import * as vscode from "vscode";
import { createFileExclusive } from "../diagram/write-file.js";
import { isLibraryUri } from "../model/index.js";
import { resolveNode, type ModelNode } from "../tree/tree-model.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import type { RequirementsEditor } from "./editor.js";
import type { RequirementsScope } from "./protocol.js";

export function registerRequirementsCommands(deps: { model: WorkspaceModel; editor: RequirementsEditor; extensionUri: vscode.Uri; selection: () => readonly ModelNode[] }): vscode.Disposable[] {
  const pickPackage = async (): Promise<RequirementsScope | undefined> => {
    await deps.model.ready;
    const pkgs: { label: string; description: string; qn: string }[] = [];
    for (const u of deps.model.index.uris().filter((x) => !isLibraryUri(x)).sort()) {
      const walk = (e: import("../model/index.js").Element) => {
        if (e.kind === "package" && e.qualifiedName !== undefined) pkgs.push({ label: e.qualifiedName, description: vscode.workspace.asRelativePath(vscode.Uri.parse(u)), qn: e.qualifiedName });
        e.members.forEach(walk);
      };
      deps.model.index.getDocument(u)?.model.roots.forEach(walk);
    }
    if (!pkgs.length) {
      void vscode.window.showInformationMessage("No SysML packages were found in the workspace.");
      return undefined;
    }
    const pick = await vscode.window.showQuickPick(pkgs, { title: "Open Requirements Editor", placeHolder: "Choose a package" });
    return pick ? { kind: "package", qualifiedName: pick.qn } : undefined;
  };
  const scopeFrom = async (arg: unknown): Promise<RequirementsScope | undefined> => {
    await deps.model.ready;
    if (arg instanceof vscode.Uri) return { kind: "file", uri: arg.toString() };
    const node = (arg as ModelNode | undefined) ?? deps.selection()[0];
    if (node && typeof (node as ModelNode).id === "string") {
      const el = resolveNode(deps.model.index, node as ModelNode);
      const scope = deps.editor.scopeOf(el);
      if (scope) return scope;
      if (el) {
        void vscode.window.showInformationMessage("Choose a package (or a .sysml file) to open the requirements editor on.");
        return undefined;
      }
    }
    return pickPackage();
  };
  return [
    vscode.commands.registerCommand("sysml.openRequirementsEditor", async (arg?: unknown) => {
      const scope = await scopeFrom(arg);
      if (scope) await deps.editor.open(scope);
    }),
    vscode.commands.registerCommand("sysml.copyDocumentAnnotations", async () => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        void vscode.window.showInformationMessage("Open a folder first: the library is copied into the workspace.");
        return undefined;
      }
      let folder = folders[0]!;
      if (folders.length > 1) {
        const pick = await vscode.window.showQuickPick(folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f })), { title: "Copy DocumentAnnotations.sysml into which folder?" });
        if (!pick) return undefined;
        folder = pick.folder;
      }
      const target = vscode.Uri.joinPath(folder.uri, "DocumentAnnotations.sysml");
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(deps.extensionUri, "dist", "sysml.library", "DocumentAnnotations.sysml"));
      try {
        // Exclusive: an existing file (even one created a moment ago) is never replaced.
        if (target.scheme === "file") await createFileExclusive(target.fsPath, bytes);
        else if (await vscode.workspace.fs.stat(target).then(() => true, () => false)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
        else await vscode.workspace.fs.writeFile(target, bytes);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") {
          void vscode.window.showWarningMessage("DocumentAnnotations.sysml already exists in that folder; it was not overwritten.");
          return target.toString();
        }
        void vscode.window.showErrorMessage(`Could not copy DocumentAnnotations.sysml: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      }
      void vscode.window.showInformationMessage("Copied DocumentAnnotations.sysml into the workspace. It replaces the bundled copy for name resolution, and other SysML tools can resolve @DocumentRoot and @Appendix.");
      return target.toString();
    }),
  ];
}
