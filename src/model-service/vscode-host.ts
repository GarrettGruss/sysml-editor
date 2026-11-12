/** The VS Code side of `ModelService`: applies plans as one workspace edit, saves, and forces diagram changes. */
import * as vscode from "vscode";
import { applyEdits, groupByUri, type DiagramUpdate, type LoadedDiagram, type TextEdit } from "../edit/index.js";
import type { DiagramEditorProvider } from "../diagram/diagram-editor.js";
import type { DiagramFiles } from "../diagram/commands.js";
import { parseDiagram } from "../diagram/format.js";
import { forceOnText } from "../diagram/session.js";
import { makeSourceMapper } from "../diagram/resolve.js";
import { writeDiagramFile } from "../diagram/write-uri.js";
import { uriKey } from "../workspace/uri-key.js";
import type { WorkspaceModel } from "../workspace/workspace-model.js";
import type { DiagramChange } from "./diagram-changes.js";
import type { ApplyOutcome, ModelHost, ModelService, OpFailure, OpOk } from "./service.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const nameOf = (uri: string) => decodeURIComponent(uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri);

export class VsCodeModelHost implements ModelHost {
  readonly index;
  /** Set by the extension once the service exists (undo entries call back into it). */
  service?: ModelService;

  constructor(
    private readonly model: WorkspaceModel,
    private readonly diagrams: DiagramEditorProvider,
    private readonly files: DiagramFiles,
    private readonly log: (m: string) => void = () => {},
  ) {
    this.index = model.index;
  }

  async sync(): Promise<void> {
    for (const d of vscode.workspace.textDocuments) {
      if (d.isClosed || d.uri.scheme !== "file" || !d.uri.path.toLowerCase().endsWith(".sysml")) continue;
      const key = uriKey(d.uri);
      if (this.index.getDocument(key)) this.index.setDocument(key, d.getText());
    }
    await this.index.settled();
  }

  async currentText(uri: string): Promise<string | undefined> {
    const u = vscode.Uri.parse(uri);
    const open = vscode.workspace.textDocuments.find((d) => uriKey(d.uri) === uri && !d.isClosed);
    if (open) return open.getText();
    try {
      return decoder.decode(await vscode.workspace.fs.readFile(u));
    } catch {
      return undefined;
    }
  }

  async applyAndSave(edits: readonly TextEdit[], base: ReadonlyMap<string, string>): Promise<ApplyOutcome> {
    const docs = new Map<string, vscode.TextDocument>();
    for (const uri of new Set(edits.map((e) => e.uri))) {
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
      } catch (e) {
        return { ok: false, reason: `${nameOf(uri)} could not be opened: ${e instanceof Error ? e.message : String(e)}` };
      }
      // The plan was computed from `base`; if the document is different now, the offsets are not valid.
      if (doc.getText() !== base.get(uri)) return { ok: false, stale: true };
      docs.set(uri, doc);
    }
    const we = new vscode.WorkspaceEdit();
    for (const [uri, es] of groupByUri([...edits])) {
      const doc = docs.get(uri)!;
      for (const e of es) we.replace(doc.uri, new vscode.Range(doc.positionAt(e.range.start), doc.positionAt(e.range.end)), e.newText);
    }
    let applied: boolean;
    try {
      applied = await vscode.workspace.applyEdit(we);
    } catch (e) {
      return { ok: false, reason: `VS Code could not apply the edit: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!applied) {
      // A document changed under us between the check and the application: let the caller re-plan once.
      const changed = [...docs].some(([uri, d]) => d.getText() !== base.get(uri) && d.getText() !== applyEdits(base.get(uri)!, groupByUri([...edits]).get(uri) ?? []));
      return changed ? { ok: false, stale: true } : { ok: false, reason: "VS Code refused the edit (the file may be read-only)." };
    }
    const failed: string[] = [];
    for (const [uri, doc] of docs) {
      let saved = false;
      try {
        saved = doc.isDirty ? await doc.save() : true;
      } catch (e) {
        this.log(`saving ${uri} failed: ${String(e)}`);
      }
      if (!saved) failed.push(nameOf(uri));
    }
    if (failed.length) return { ok: false, reason: `The edit was applied, but ${failed.join(", ")} could not be saved. The document${failed.length > 1 ? "s are" : " is"} left as VS Code has ${failed.length > 1 ? "them" : "it"}; save ${failed.length > 1 ? "them" : "it"} manually.` };
    return { ok: true };
  }

  async closedDiagrams(): Promise<LoadedDiagram[]> {
    await this.files.ready;
    const out: LoadedDiagram[] = [];
    for (const uri of this.files.index.allUris()) {
      if (this.diagrams.openDocument(vscode.Uri.parse(uri))) continue;
      try {
        const r = parseDiagram(decoder.decode(await vscode.workspace.fs.readFile(vscode.Uri.parse(uri))));
        if (r.ok) out.push({ uri, doc: r.doc });
      } catch {
        /* gone */
      }
    }
    return out;
  }

  async writeDiagramFiles(updates: readonly DiagramUpdate[]): Promise<void> {
    for (const u of updates) {
      await writeDiagramFile(vscode.Uri.parse(u.uri), encoder.encode(u.text));
      this.files.index.set(u.uri, u.text);
    }
  }

  async forceDiagramChange(change: DiagramChange, mode: "apply" | "revert"): Promise<string[]> {
    await this.files.ready;
    const uris = change.target === "all" ? new Set([...this.files.index.allUris(), ...this.diagrams.openUris()]) : new Set([change.target.uri]);
    const written: string[] = [];
    for (const key of uris) {
      const uri = vscode.Uri.parse(key);
      try {
        const open = this.diagrams.openDocument(uri);
        if (open) {
          if (await this.diagrams.forceOpen(open, change, mode)) written.push(key);
          continue;
        }
        const text = decoder.decode(await vscode.workspace.fs.readFile(uri));
        const ctx = { uri: key, sourceOf: makeSourceMapper(vscode.workspace.getWorkspaceFolder(uri)?.uri.toString()) };
        const next = forceOnText(text, (d) => (mode === "apply" ? change.apply(d, ctx) : change.revert(d, ctx)));
        if (next !== undefined) {
          await writeDiagramFile(uri, encoder.encode(next));
          this.files.index.set(key, next);
          written.push(key);
        }
      } catch (e) {
        this.log(`forcing a diagram change on ${key} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return written;
  }

  recordUndoEntry(origin: string, result: OpOk): void {
    const svc = this.service;
    if (!svc) return;
    this.diagrams.recordModelEdit(
      vscode.Uri.parse(origin),
      result.description,
      async () => {
        const r = await svc.undo(result);
        if (r.warning) void vscode.window.showWarningMessage(`Undo: ${r.warning} The diagram change was undone; the text was left as it is.`);
      },
      async () => {
        const r = await svc.redo(result);
        if (r.warning) void vscode.window.showWarningMessage(`Redo: ${r.warning} The diagram change was redone; the text was left as it is.`);
      },
    );
  }
}

/** Shows a refusal with the actions it offers: "Go to error" for syntax errors, "Go to Definition" for inherited features. */
export async function showFailure(f: OpFailure): Promise<void> {
  const actions: string[] = [];
  if (f.goToError) actions.push("Go to error");
  if (f.goToDefinition) actions.push("Go to Definition");
  const pick = await vscode.window.showWarningMessage(f.reason, ...actions);
  const spot = pick === "Go to error" ? f.goToError : pick === "Go to Definition" ? f.goToDefinition : undefined;
  if (!spot) return;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(spot.uri));
  const p = new vscode.Position(spot.line, spot.column);
  await vscode.window.showTextDocument(doc, { selection: new vscode.Range(p, p) });
}
