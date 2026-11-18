/**
 * Records the `sysml.*` commands that run, for `sysml_ui_wait_for_user` (D67). Commands are registered through
 * `registerCommand` here instead of `vscode.commands`; the UI driver sets the sink.
 */
import * as vscode from "vscode";

let sink: ((id: string) => void) | undefined;
export const setCommandSink = (f: ((id: string) => void) | undefined): void => { sink = f; };

export function registerCommand(id: string, fn: (...args: any[]) => unknown): vscode.Disposable {
  return vscode.commands.registerCommand(id, (...args: unknown[]) => {
    try {
      sink?.(id);
    } catch {
      // Recording must never stop a command.
    }
    return fn(...args);
  });
}
