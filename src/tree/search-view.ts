/** The search box above the model tree: a webview view with one input; it talks to the host only through postMessage. */
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

export const SEARCH_VIEW_ID = "sysmlSearch";
const MAX_QUERY = 200;

export class SearchViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onQuery: (text: string) => void,
    private readonly current: () => string,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const webview = view.webview;
    webview.options = { enableScripts: true, localResourceRoots: [root] };
    webview.onDidReceiveMessage((m: unknown) => this.handle(m));
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    const nonce = randomBytes(16).toString("base64");
    const csp = ["default-src 'none'", `style-src ${webview.cspSource}`, `script-src 'nonce-${nonce}'`].join("; ");
    const css = webview.asWebviewUri(vscode.Uri.joinPath(root, "search.css"));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(root, "search.js"));
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${css}"><title>Search</title></head><body><div class="box"><input id="q" type="text" placeholder="Search" aria-label="Search the model tree" spellcheck="false" autocomplete="off"><button id="clear" type="button" title="Clear" aria-label="Clear search" hidden>&times;</button></div><script nonce="${nonce}" src="${js}"></script></body></html>`;
  }

  /** Set the text of the search box (the host cleared the search). */
  setText(text: string): void {
    void this.view?.webview.postMessage({ type: "set", text });
  }

  /** A message from the webview (also the entry point for tests); anything malformed is ignored. */
  handle(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const m = message as { type?: unknown; text?: unknown };
    if (m.type === "query" && typeof m.text === "string") this.onQuery(m.text.slice(0, MAX_QUERY));
    else if (m.type === "ready") void this.view?.webview.postMessage({ type: "set", text: this.current() });
  }
}
