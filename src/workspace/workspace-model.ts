/**
 * Thin VS Code adapter that keeps one shared ModelIndex in sync with the workspace: the bundled
 * standard library, `.sysml` files on disk, open editors (unsaved text wins) and file watching.
 */
import * as path from "node:path";
import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { ModelIndex, loadLibrary } from "../model/index.js";

const DEBOUNCE_MS = 200;
const GLOB = "**/*.sysml";
const EXCLUDE = "**/node_modules/**";

export function isSysmlUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && uri.path.toLowerCase().endsWith(".sysml");
}

export class WorkspaceModel implements vscode.Disposable {
  readonly index = new ModelIndex();
  /** Resolves when the library and the initial workspace scan are loaded. */
  readonly ready: Promise<void>;
  private readonly subs: vscode.Disposable[] = [];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(extensionPath: string) {
    this.ready = this.start(extensionPath);
    this.subs.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.openDoc(d)),
      vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document)),
      vscode.workspace.onDidCloseTextDocument((d) => void this.closed(d)),
    );
    const watcher = vscode.workspace.createFileSystemWatcher(GLOB);
    this.subs.push(
      watcher,
      watcher.onDidCreate((u) => void this.fromDisk(u)),
      watcher.onDidChange((u) => void this.fromDisk(u)),
      watcher.onDidDelete((u) => this.remove(u)),
    );
  }

  private async start(extensionPath: string): Promise<void> {
    const lib = path.join(extensionPath, "dist", "sysml.library");
    if (existsSync(lib)) {
      try {
        loadLibrary(this.index, lib);
      } catch (e) {
        console.error("SysML: loading the standard library failed", e);
      }
    } else {
      console.warn(`SysML: standard library not found at ${lib}`);
    }
    const files = await vscode.workspace.findFiles(GLOB, EXCLUDE);
    const entries: [string, string][] = [];
    await Promise.all(
      files.map(async (u) => {
        const text = await this.read(u);
        if (text !== undefined) entries.push([u.toString(), text]);
      }),
    );
    if (this.disposed) return;
    // Open editors may hold unsaved text: they win over the disk content.
    const open = new Map(entries);
    for (const d of vscode.workspace.textDocuments) if (isSysmlUri(d.uri)) open.set(d.uri.toString(), d.getText());
    this.index.setDocuments(open);
  }

  private async read(uri: vscode.Uri): Promise<string | undefined> {
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (doc) return doc.getText();
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      return undefined;
    }
  }

  private openDoc(d: vscode.TextDocument): void {
    if (isSysmlUri(d.uri)) this.index.setDocument(d.uri.toString(), d.getText());
  }

  private schedule(d: vscode.TextDocument): void {
    if (!isSysmlUri(d.uri)) return;
    const key = d.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (!this.disposed) this.index.setDocument(key, d.getText());
      }, DEBOUNCE_MS),
    );
  }

  private async closed(d: vscode.TextDocument): Promise<void> {
    if (!isSysmlUri(d.uri)) return;
    // Unsaved edits are discarded on close: go back to what is on disk.
    if (d.isDirty) await this.fromDisk(d.uri);
  }

  private async fromDisk(uri: vscode.Uri): Promise<void> {
    if (!isSysmlUri(uri)) return;
    const text = await this.read(uri);
    if (text !== undefined && !this.disposed) this.index.setDocument(uri.toString(), text);
  }

  private remove(uri: vscode.Uri): void {
    const key = uri.toString();
    if (vscode.workspace.textDocuments.some((d) => d.uri.toString() === key && !d.isClosed)) return;
    this.index.removeDocument(key);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const s of this.subs) s.dispose();
  }
}
