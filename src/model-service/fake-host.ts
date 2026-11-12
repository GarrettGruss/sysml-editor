/** An in-memory `ModelHost` for tests (not part of the extension bundle). */
import { applyEdits, groupByUri, sourceMatches, type DiagramUpdate, type LoadedDiagram, type PlanSource, type TextEdit } from "../edit/index.js";
import { ModelIndex } from "../model/index.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "../diagram/format.js";
import { makeSourceMapper } from "../diagram/resolve.js";
import type { DiagramChange } from "./diagram-changes.js";
import type { ApplyOutcome, ForceOutcome, ModelHost, OpOk } from "./service.js";

export class FakeHost implements ModelHost {
  readonly index: ModelIndex;

  constructor(index: ModelIndex = new ModelIndex()) {
    this.index = index;
  }

  /** Open buffer text per document. */
  readonly buffers = new Map<string, string>();
  /** Text on disk per document. */
  readonly disk = new Map<string, string>();
  readonly applied: TextEdit[][] = [];
  readonly saves: string[] = [];
  /** Diagram files: last saved text (disk) and in-memory document. */
  readonly diagramDisk = new Map<string, string>();
  readonly diagramMemory = new Map<string, DiagramDocument>();
  readonly entries: { origin: string; result: OpOk }[] = [];
  /** Runs once before the next apply (to simulate a change between planning and applying). */
  beforeApply?: () => void;
  /** Saving fails for every document (true) or for the listed ones. */
  failSave: boolean | Set<string> = false;
  /** Documents the host refuses to edit, with the reason. */
  readonly blocked = new Map<string, string>();
  readonly warnings: { message: string; action?: { label: string; command: string } }[] = [];
  /** Diagram files whose forced change throws. */
  readonly failDiagrams = new Set<string>();

  addDocument(uri: string, text: string): void {
    this.buffers.set(uri, text);
    this.disk.set(uri, text);
    this.index.setDocument(uri, text);
  }

  addDiagram(uri: string, text: string, open = false): void {
    this.diagramDisk.set(uri, text);
    if (open) {
      const r = parseDiagram(text);
      if (!r.ok) throw new Error("bad diagram");
      this.diagramMemory.set(uri, r.doc);
    }
  }

  diagramOnDisk(uri: string): DiagramDocument {
    const r = parseDiagram(this.diagramDisk.get(uri)!);
    if (!r.ok) throw new Error("bad diagram on disk");
    return r.doc;
  }

  async sync(): Promise<void> {
    for (const [uri, text] of this.buffers) this.index.setDocument(uri, text);
  }

  async currentText(uri: string): Promise<string | undefined> {
    return this.buffers.get(uri) ?? this.diagramDisk.get(uri);
  }

  async applyAndSave(edits: readonly TextEdit[], sources: readonly PlanSource[]): Promise<ApplyOutcome> {
    const hook = this.beforeApply;
    this.beforeApply = undefined;
    hook?.();
    const edited = new Set(edits.map((e) => e.uri));
    for (const s of sources) if (edited.has(s.uri) && !sourceMatches(s, this.buffers.get(s.uri))) return { ok: false, stale: true };
    for (const u of edited) if (!sources.some((s) => s.uri === u)) return { ok: false, stale: true };
    this.applied.push([...edits]);
    for (const [uri, es] of groupByUri([...edits])) {
      this.buffers.set(uri, applyEdits(this.buffers.get(uri)!, es));
      this.index.setDocument(uri, this.buffers.get(uri)!);
    }
    const unsaved: string[] = [];
    for (const uri of new Set(edits.map((e) => e.uri))) {
      if (this.failSave === true || (this.failSave && this.failSave.has(uri))) {
        unsaved.push(uri);
        continue;
      }
      this.disk.set(uri, this.buffers.get(uri)!);
      this.saves.push(uri);
    }
    return unsaved.length ? { ok: true, unsaved } : { ok: true };
  }

  editBlocker(uri: string): string | undefined {
    return this.blocked.get(uri);
  }

  warn(message: string, action?: { label: string; command: string }): void {
    this.warnings.push({ message, ...(action ? { action } : {}) });
  }

  async closedDiagrams(): Promise<LoadedDiagram[]> {
    const out: LoadedDiagram[] = [];
    for (const [uri, text] of this.diagramDisk) {
      if (this.diagramMemory.has(uri)) continue;
      const r = parseDiagram(text);
      out.push(r.ok ? { uri, doc: r.doc, text } : { uri, text });
    }
    return out;
  }

  async writeDiagramFiles(updates: readonly DiagramUpdate[]): Promise<void> {
    for (const u of updates) this.diagramDisk.set(u.uri, u.text);
  }

  async forceDiagramChange(change: DiagramChange, mode: "apply" | "revert"): Promise<ForceOutcome> {
    const written: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];
    for (const uri of this.diagramDisk.keys()) {
      if (change.target !== "all" && change.target.uri !== uri) continue;
      if (this.failDiagrams.has(uri)) {
        failed.push(uri);
        continue;
      }
      const ctx = { uri, sourceOf: makeSourceMapper("file:///w") };
      const f = mode === "apply" ? change.apply : change.revert;
      const saved = parseDiagram(this.diagramDisk.get(uri)!);
      if (!saved.ok) skipped.push(uri);
      if (saved.ok) {
        const next = f.call(change, saved.doc, ctx);
        const text = serializeDiagram(next);
        if (text !== this.diagramDisk.get(uri)) {
          this.diagramDisk.set(uri, text);
          written.push(uri);
        }
      }
      const mem = this.diagramMemory.get(uri);
      if (mem) this.diagramMemory.set(uri, f.call(change, mem, ctx));
    }
    return { written, failed, skipped };
  }

  recordUndoEntry(origin: string, result: OpOk): void {
    this.entries.push({ origin, result });
  }
}
