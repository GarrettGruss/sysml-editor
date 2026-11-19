/**
 * Messages shown to the user (information, warning, error) as plain notifications. They go through here so the agent UI
 * state can report them (D58); with no sink set this is exactly `vscode.window.show*Message`.
 */
import * as vscode from "vscode";
import type { MessageLevel } from "./agent-tools/ui-driver.js";

type Sink = (level: MessageLevel, text: string) => void;
let sink: Sink | undefined;

/** Where shown messages are also reported; undefined stops reporting. */
export function setMessageSink(s: Sink | undefined): void {
  sink = s;
}

/** Report a message that was shown some other way (with action buttons, for example). */
export const reportMessage = (level: MessageLevel, text: string): void => report(level, text);

const report = (level: MessageLevel, text: string): void => {
  try {
    sink?.(level, text);
  } catch {
    // Reporting must never stop a message from being shown.
  }
};

export const showInfo = (message: string): Thenable<string | undefined> => (report("information", message), vscode.window.showInformationMessage(message));
export const showWarning = (message: string): Thenable<string | undefined> => (report("warning", message), vscode.window.showWarningMessage(message));
export const showError = (message: string): Thenable<string | undefined> => (report("error", message), vscode.window.showErrorMessage(message));
