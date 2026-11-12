import * as assert from "node:assert";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === "sysml-editor");
  assert.ok(ext, "extension is installed in the development host");
  await ext.activate();
  assert.strictEqual(ext.isActive, true, "extension activated");
}
