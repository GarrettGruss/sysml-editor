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
import { ParseWorkerClient } from "./parse-worker-client.js";
import { makeIndexFilter } from "./exclude.js";
import { ScanTracker } from "./scan-tracker.js";
import { uriKey } from "./uri-key.js";
import type { FolderChange } from "../tree/tree-model.js";

const DEBOUNCE_MS = 200;
const GLOB = "**/*.sysml";
/** Files read per batch during the workspace scan; each batch is indexed in one chunk. */
export const SCAN_BATCH = 16;
export const LIBRARY_CHUNK = 25;

export function isSysmlUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && uri.path.toLowerCase().endsWith(".sysml");
}

/** Delay after activation before the parse worker starts (and warms itself). */
const WORKER_START_MS = 2000;

export class WorkspaceModel implements vscode.Disposable {
  readonly index: ModelIndex;
  /** Computes precise syntax errors off the main thread; undefined if the worker script is missing. */
  private readonly worker: ParseWorkerClient | undefined;
  /** Resolves when the library and the initial workspace scan are loaded; rejects if loading fails. */
  readonly ready: Promise<void>;
  private readonly subs: vscode.Disposable[] = [];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly tracker = new ScanTracker();
  private readonly folderEmitter = new vscode.EventEmitter<FolderChange>();
  /** A folder (or other non-`.sysml` path) was created or deleted; carries the key of its parent folder. */
  readonly onDidChangeFolders = this.folderEmitter.event;
  private filterKey = "";
  private filter: (rel: string) => boolean = () => false;
  private disposed = false;

  constructor(extensionPath: string, private readonly log: (msg: string) => void = () => {}) {
    // dist/parse-worker.js sits next to the bundled extension (dist/extension.js).
    const workerPath = path.join(__dirname, "parse-worker.js");
    if (existsSync(workerPath)) {
      this.worker = new ParseWorkerClient({ workerPath, libraryDir: path.join(extensionPath, "dist", "sysml.library"), log });
      const t = setTimeout(() => this.worker?.start(), WORKER_START_MS);
      this.subs.push({ dispose: () => clearTimeout(t) }, { dispose: () => this.worker?.dispose() });
    } else {
      log(`parse worker not found at ${workerPath}; syntax errors are computed on the main thread`);
    }
    this.index = new ModelIndex(undefined, { details: this.worker });
    this.subs.push(this.index.onDidChange(() => (this.sortedUris = undefined)));
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
    const all = vscode.workspace.createFileSystemWatcher("**/*", false, true, false);
    this.subs.push(
      all,
      this.folderEmitter,
      all.onDidCreate((u) => this.pathChanged(u, false)),
      all.onDidDelete((u) => this.pathChanged(u, true)),
    );
    this.ready = this.start(extensionPath);
  }

  /** Folder events: a deleted folder takes its indexed files with it (the `.sysml` watcher may not report them one by one). */
  private pathChanged(uri: vscode.Uri, deleted: boolean): void {
    if (isSysmlUri(uri) || uri.scheme !== "file") return;
    const key = uriKey(uri);
    if (deleted) {
      const prefix = key + "/";
      if (this.hasUriWithPrefix(prefix)) {
        // Only unsaved edits are protected: a clean editor of a deleted file stays open in VS Code but its model must go.
        const open = new Set(vscode.workspace.textDocuments.filter((d) => !d.isClosed && d.isDirty).map((d) => uriKey(d.uri)));
        for (const u of this.index.uris()) if (u.startsWith(prefix) && !open.has(u)) this.index.removeDocument(u);
      }
    } else {
      void this.loadCreatedFolder(uri);
    }
    this.folderEmitter.fire({ parent: key.slice(0, key.lastIndexOf("/")), path: key, deleted });
  }

  private sortedUris: string[] | undefined;

  /** True when some indexed URI starts with `prefix`; binary search over a sorted list rebuilt after model changes. */
  private hasUriWithPrefix(prefix: string): boolean {
    const list = (this.sortedUris ??= this.index.uris().sort());
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]! < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo < list.length && list[lo]!.startsWith(prefix);
  }

  /** A moved or renamed folder may be reported as one created directory only: load the `.sysml` files inside it. */
  private async loadCreatedFolder(uri: vscode.Uri): Promise<void> {
    try {
      if (((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) === 0) return;
      const found = await vscode.workspace.findFiles(new vscode.RelativePattern(uri, GLOB));
      for (const f of found) if (!this.disposed) await this.fromDisk(f);
    } catch {
      // vanished again, or not readable
    }
  }

  private async start(extensionPath: string): Promise<void> {
    await yieldToEventLoop(); // activation returns before any loading work
    try {
      // Open editors first: their text wins and the scan skips them.
      for (const d of vscode.workspace.textDocuments) this.openDoc(d);
      await Promise.all([this.loadLibrary(extensionPath), this.scanWorkspace()]);
    } finally {
      this.tracker.end();
    }
  }

  private async loadLibrary(extensionPath: string): Promise<void> {
    await yieldToEventLoop();
    const lib = path.join(extensionPath, "dist", "sysml.library");
    if (!existsSync(lib)) {
      this.log(`standard library not found at ${lib}`);
      return;
    }
    const r = await loadLibraryChunked(this.index, lib, { chunk: LIBRARY_CHUNK, cancelled: () => this.disposed });
    for (const f of r.failed) this.log(`library file failed: ${f.path}: ${f.error}`);
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
    // Only unsaved edits are protected: a clean editor of a deleted file stays open in VS Code but its model must go.
    if (vscode.workspace.textDocuments.some((d) => uriKey(d.uri) === key && !d.isClosed && d.isDirty)) return;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    this.index.removeDocument(key);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const s of this.subs) s.dispose();
  }
}
