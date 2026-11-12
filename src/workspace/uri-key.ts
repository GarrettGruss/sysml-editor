import * as vscode from "vscode";

/** The one way to turn a URI into an index key (file URIs go through fsPath so drive-letter case is stable). */
export function uriKey(uri: vscode.Uri): string {
  return uri.scheme === "file" ? vscode.Uri.file(uri.fsPath).toString() : uri.toString();
}
