import * as vscode from "vscode";
import { defaultName, effectiveName, validateName, type NewEntryKind } from "./new-entry.js";
import { folderNode, type ModelNode } from "./tree-model.js";
import type { ModelTreeProvider } from "./tree-provider.js";

/** What integration tests see and drive of the open input box. */
export interface NewEntryTestApi {
  active(): { kind: NewEntryKind; value: string; validation: { severity: "error" | "info"; message: string } | undefined; label: string | undefined } | undefined;
  /** Type `text` as the user would (the input box value and its change event). */
  type(text: string): void;
  /** Press Enter. Resolves when the entry is created, or at once when validation refuses. */
  accept(): Promise<void>;
  /** Press Escape. */
  cancel(): Promise<void>;
  /** Pretend the workspace is (not) trusted. */
  setTrusted(trusted: boolean | undefined): void;
}

/** New File and New Folder: a placeholder row in the tree, named through an input box at the top. */
export class NewEntryFlow {
  private current: { box: vscode.InputBox; kind: NewEntryKind; folder: vscode.Uri; existing: string[]; done: boolean; check: ReturnType<typeof validateName> } | undefined;

  constructor(
    private readonly provider: ModelTreeProvider,
    private readonly view: vscode.TreeView<ModelNode>,
    private readonly log: (m: string) => void,
    private readonly clearSearch: () => void = () => {},
    private readonly indexFile: (uri: vscode.Uri) => Promise<void> = async () => {},
  ) {}

  /** Tests set this to pretend the workspace is untrusted. */
  trusted: () => boolean = () => vscode.workspace.isTrusted;

  async start(kind: NewEntryKind, folderKey: string | undefined): Promise<void> {
    if (!this.trusted()) {
      void vscode.window.showWarningMessage("New File and New Folder are not available in an untrusted workspace.");
      return;
    }
    if (this.provider.filter === "diagrams") return;
    if (!folderKey) {
      void vscode.window.showInformationMessage("SysML: open a folder first.");
      return;
    }
    this.close();
    if (this.provider.query) this.clearSearch();
    const folder = vscode.Uri.parse(folderKey);
    let existing: string[] = [];
    try {
      existing = (await vscode.workspace.fs.readDirectory(folder)).map(([n]) => n);
    } catch {
      // A folder that cannot be listed: creation will report the error.
    }
    const box = vscode.window.createInputBox();
    const cur = { box, kind, folder, existing, done: false, check: undefined as ReturnType<typeof validateName> };
    this.current = cur;
    box.title = kind === "file" ? "New SysML File" : "New Folder";
    box.prompt = `Name of the new ${kind === "file" ? "file" : "folder"} (${vscode.workspace.asRelativePath(folder, true) || folder.path}). Enter to create, Escape to cancel.`;
    box.placeholder = defaultName(kind);
    box.ignoreFocusOut = false;
    box.onDidChangeValue((t) => this.change(cur, t));
    box.onDidAccept(() => void this.accept(cur));
    box.onDidHide(() => {
      if (!cur.done) this.finish(cur);
      box.dispose();
    });
    const ph = this.provider.startNewEntry(folderKey, kind);
    box.show();
    try {
      await this.view.reveal(ph, { select: true, focus: false, expand: true });
    } catch (e) {
      this.log(`SysML tree: reveal of the new entry failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private change(cur: NonNullable<NewEntryFlow["current"]>, text: string): void {
    if (cur.done) return;
    cur.check = validateName(cur.kind, text, cur.existing);
    cur.box.validationMessage = cur.check ? { message: cur.check.message, severity: cur.check.severity === "error" ? vscode.InputBoxValidationSeverity.Error : vscode.InputBoxValidationSeverity.Info } : undefined;
    this.provider.updateNewEntry(text);
  }

  private async accept(cur: NonNullable<NewEntryFlow["current"]>): Promise<void> {
    if (cur.done) return;
    // Re-read: the folder may have changed while the box was open.
    try {
      cur.existing = (await vscode.workspace.fs.readDirectory(cur.folder)).map(([n]) => n);
    } catch {
      // keep the earlier listing
    }
    if (cur.done) return;
    const text = cur.box.value;
    this.change(cur, text);
    if (cur.check?.severity === "error") return;
    cur.done = true;
    const name = effectiveName(cur.kind, text);
    const uri = vscode.Uri.joinPath(cur.folder, name);
    cur.box.hide();
    try {
      if (cur.kind === "file") await vscode.workspace.fs.writeFile(uri, new Uint8Array());
      else await vscode.workspace.fs.createDirectory(uri);
    } catch (e) {
      this.finish(cur);
      void vscode.window.showErrorMessage(`SysML: could not create ${name}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (cur.kind === "file") await this.indexFile(uri).catch(() => {});
    this.finish(cur);
    if (cur.kind === "file") await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    else {
      try {
        await this.view.reveal(folderNode(uri.toString()), { select: true, focus: false, expand: false });
      } catch (e) {
        this.log(`SysML tree: reveal of the new folder failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private finish(cur: NonNullable<NewEntryFlow["current"]>): void {
    cur.done = true;
    if (this.current === cur) {
      this.current = undefined;
      this.provider.endNewEntry();
    }
  }

  private close(): void {
    const c = this.current;
    if (!c) return;
    this.finish(c);
    c.box.hide();
  }

  dispose(): void {
    this.close();
  }

  readonly testApi: NewEntryTestApi = {
    active: () => {
      const c = this.current;
      return c && !c.done ? { kind: c.kind, value: c.box.value, validation: c.check, label: this.provider.newEntryLabel } : undefined;
    },
    type: (text) => {
      const c = this.current;
      if (!c) throw new Error("no new entry input box is open");
      c.box.value = text;
      this.change(c, text);
    },
    accept: async () => {
      const c = this.current;
      if (c) await this.accept(c);
    },
    setTrusted: (t) => {
      this.trusted = t === undefined ? () => vscode.workspace.isTrusted : () => t;
    },
    cancel: async () => {
      this.close();
    },
  };
}
