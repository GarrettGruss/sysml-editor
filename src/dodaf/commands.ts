/** The VS Code side of the DoDAF commands. */
import * as vscode from "vscode";
import { registerCommand } from "../command-events.js";
import { showInfo, showWarning } from "../ui-messages.js";
import type { AgentIntegration } from "../agent-integration.js";
import type { ModelIndex } from "../model/index.js";
import { runGenerateCommand } from "./command-flow.js";
import { addLibrary, DODAF_FILE_NAME, type LibraryFs } from "./library.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const uri = (p: string) => vscode.Uri.file(p);

const vscodeFs: LibraryFs = {
  exists: (p) => Promise.resolve(vscode.workspace.fs.stat(uri(p))).then(() => true, () => false),
  readText: async (p) => decoder.decode(await vscode.workspace.fs.readFile(uri(p))),
  writeText: (p, t) => Promise.resolve(vscode.workspace.fs.writeFile(uri(p), encoder.encode(t))),
  mkdirs: (p) => Promise.resolve(vscode.workspace.fs.createDirectory(uri(p))),
};

export function registerDodafCommands(extensionUri: vscode.Uri, agent: AgentIntegration, index: () => ModelIndex): vscode.Disposable {
  const generate = registerCommand("sysml.dodaf.generate", () =>
    runGenerateCommand(index(), {
      pickRoot: async (items) => (await vscode.window.showQuickPick(items, { title: "DoDAF architecture root", placeHolder: "Package to describe" }))?.label,
      inputFolder: async (initial) => vscode.window.showInputBox({ title: "Output folder (relative to the workspace)", value: initial }),
      run: (input) => agent.call("sysml_dodaf_generate", input),
      info: (m) => void showInfo(m),
      warn: (m) => void showWarning(m),
      offerAddLibrary: async (m) => {
        if ((await vscode.window.showErrorMessage(m, "Add DoDAF Library")) !== "Add DoDAF Library") return false;
        await vscode.commands.executeCommand("sysml.dodaf.addLibrary");
        return (await vscode.window.showInformationMessage("DoDAF library added. Generate the document now?", "Generate")) === "Generate";
      },
    }),
  );
  const add = registerCommand("sysml.dodaf.addLibrary", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      await showWarning("Open a folder first: the DoDAF library is copied into the workspace.");
      return;
    }
    const source = vscode.Uri.joinPath(extensionUri, "dist", "resources", "dodaf", DODAF_FILE_NAME).fsPath;
    const result = await addLibrary(vscodeFs, source, folder.uri.fsPath);
    await showInfo(
      result.status === "copied"
        ? `Added ${DODAF_FILE_NAME} to the workspace root.`
        : `${DODAF_FILE_NAME} already exists in the workspace root; it was not changed.`,
    );
  });
  return vscode.Disposable.from(add, generate);
}
