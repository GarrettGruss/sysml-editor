import * as vscode from "vscode";
import { createFileExclusive, writeFileAtomic } from "./write-file.js";

/** Writes diagram content: atomically for `file:` URIs, through the workspace file system otherwise. */
export async function writeDiagramFile(uri: vscode.Uri, bytes: Uint8Array): Promise<void> {
  if (uri.scheme === "file") await writeFileAtomic(uri.fsPath, bytes);
  else await vscode.workspace.fs.writeFile(uri, bytes);
}

/** Creates a diagram file that must not exist yet; an existing file is never replaced. */
export async function createDiagramFile(uri: vscode.Uri, bytes: Uint8Array): Promise<void> {
  if (uri.scheme === "file") await createFileExclusive(uri.fsPath, bytes);
  else await vscode.workspace.fs.writeFile(uri, bytes);
}
