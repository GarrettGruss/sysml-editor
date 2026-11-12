/**
 * Thin VS Code adapter that keeps one shared ModelIndex in sync with the workspace: the bundled
 * standard library, `.sysml` files on disk, open editors (unsaved text wins) and file watching.
 * Loading happens in the background in small chunks; `ready` resolves when it is done.
 */
import * as path from "node:path";
import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { ModelIndex, loadLibraryChunked } from "../model/index.js";
import { inBatches, yieldToEventLoop } from "./chunked.js";
import { warmFallbackParser } from "../parser/parse.js";
import { makeIndexFilter } from "./exclude.js";
import { ScanTracker } from "./scan-tracker.js";
import { uriKey } from "./uri-key.js";

const DEBOUNCE_MS = 200;
const GLOB = "**/*.sysml";
/** Files read per batch during the workspace scan; each batch is indexed in one chunk. */
export const SCAN_BATCH = 16;
export const LIBRARY_CHUNK = 25;

export function isSysmlUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && uri.path.toLowerCase().endsWith(".sysml");
}

export class WorkspaceModel implements vscode.Disposable {
  readonly index = new ModelIndex();
  /** Resolves when the library and the initial workspace scan are loaded; rejects if loading fails. */
  readonly ready: Promise<void>;
  private readonly subs: vscode.Disposable[] = [];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly tracker = new ScanTracker();
  private filterKey = "";
  private filter: (rel: string) => boolean = () => false;
  private disposed = false;

  constructor(extensionPath: string, private readonly log: (msg: string) => void = () => {}) {
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
    this.ready = this.start(extensionPath);
  }

  private async start(extensionPath: string): Promise<void> {
    await yieldToEventLoop(); // activation returns before any loading work
    try {
      // Open editors first: their text wins and the scan skips them.
      for (const d of vscode.workspace.textDocuments) this.openDoc(d);
      const [texts] = await Promise.all([this.loadLibrary(extensionPath), this.scanWorkspace()]);
      // Background and not awaited: `ready` never waits for it, and results never depend on it.
      if (texts.length > 0 && !this.disposed) void this.warmParser(texts);
    } finally {
      this.tracker.end();
    }
  }

  private async warmParser(texts: string[]): Promise<void> {
    try {
      const t0 = Date.now();
      // One file per step, then a short pause so the extension host stays responsive.
      await warmFallbackParser(texts, () => new Promise((r) => setTimeout(r, 10)), { cancelled: () => this.disposed });
      this.log(`parser fallback warmed in ${Date.now() - t0} ms`);
    } catch (e) {
      this.log(`parser warm-up failed: ${String(e)}`);
    }
  }

  private async loadLibrary(extensionPath: string): Promise<string[]> {
    await yieldToEventLoop();
    const lib = path.join(extensionPath, "dist", "sysml.library");
    if (!existsSync(lib)) {
      this.log(`standard library not found at ${lib}`);
      return [];
    }
    const r = await loadLibraryChunked(this.index, lib, { chunk: LIBRARY_CHUNK, cancelled: () => this.disposed });
    for (const f of r.failed) this.log(`library file failed: ${f.path}: ${f.error}`);
    return r.sysmlTexts;
  }

  private async scanWorkspace(): Promise<void> {
    // Passing no exclude keeps the user's `files.exclude`; sysml.exclude and search.exclude are applied below.
    const found = await vscode.workspace.findFiles(GLOB, undefined);
    const files = found.filter((u) => this.indexable(u));
    await inBatches(
      files,
      SCAN_BATCH,
      async (batch) => {
        const entries: [string, string][] = [];
        await Promise.all(
          batch.map(async (u) => {
            const key = uriKey(u);
            if (this.tracker.isTouched(key)) return;
            const text = await this.read(u);
            // Re-check: an event may have landed while the file was being read.
            const t = this.tracker.resolve(key, text);
            if (t !== undefined) entries.push([key, t]);
          }),
        );
        if (!this.disposed) this.index.setDocuments(entries);
      },
      { cancelled: () => this.disposed },
    );
  }

  private currentFilter(): (rel: string) => boolean {
    const sysml = vscode.workspace.getConfiguration("sysml").get<string[]>("exclude", ["**/node_modules/**"]);
    const search = vscode.workspace.getConfiguration("search").get<Record<string, unknown>>("exclude");
    const key = JSON.stringify([sysml, search]);
    if (key !== this.filterKey) {
      this.filterKey = key;
      this.filter = makeIndexFilter(sysml, search);
    }
    return this.filter;
  }

  /** The one predicate for scan results, watcher events and opened documents. */
  private indexable(uri: vscode.Uri): boolean {
    return isSysmlUri(uri) && !this.currentFilter()(vscode.workspace.asRelativePath(uri, false));
  }

  /** Text of the document: open editor text unless `diskOnly`, else the file on disk. */
  private async read(uri: vscode.Uri, diskOnly = false): Promise<string | undefined> {
    if (!diskOnly) {
      const key = uriKey(uri);
      const doc = vscode.workspace.textDocuments.find((d) => uriKey(d.uri) === key);
      if (doc) return doc.getText();
    }
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      return undefined;
    }
  }

  private openDoc(d: vscode.TextDocument): void {
    if (!this.indexable(d.uri)) return;
    const key = uriKey(d.uri);
    this.tracker.touch(key);
    this.index.setDocument(key, d.getText());
  }

  private schedule(d: vscode.TextDocument): void {
    if (!this.indexable(d.uri)) return;
    const key = uriKey(d.uri);
    this.tracker.touch(key);
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
    const key = uriKey(d.uri);
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    this.tracker.touch(key);
    // Unsaved edits are discarded on close: always go back to what is on disk.
    const text = this.indexable(d.uri) ? await this.read(d.uri, true) : undefined;
    if (this.disposed) return;
    if (text !== undefined) this.index.setDocument(key, text);
    else this.index.removeDocument(key);
  }

  private async fromDisk(uri: vscode.Uri): Promise<void> {
    if (!isSysmlUri(uri)) return;
    const key = uriKey(uri);
    this.tracker.touch(key);
    if (!this.indexable(uri)) {
      this.index.removeDocument(key);
      return;
    }
    const text = await this.read(uri);
    if (text !== undefined && !this.disposed) this.index.setDocument(key, text);
  }

  private remove(uri: vscode.Uri): void {
    const key = uriKey(uri);
    this.tracker.touch(key);
    if (vscode.workspace.textDocuments.some((d) => uriKey(d.uri) === key && !d.isClosed)) return;
    this.index.removeDocument(key);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const s of this.subs) s.dispose();
  }
}
