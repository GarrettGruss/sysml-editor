/** An in-memory `ModelHost` for tests (not part of the extension bundle). */
import { applyEdits, groupByUri, type DiagramUpdate, type LoadedDiagram, type TextEdit } from "../edit/index.js";
import { ModelIndex } from "../model/index.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "../diagram/format.js";
import { makeSourceMapper } from "../diagram/resolve.js";
import type { DiagramChange } from "./diagram-changes.js";
import type { ApplyOutcome, ModelHost, OpOk } from "./service.js";

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
  failSave = false;

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
    return this.buffers.get(uri);
  }

  async applyAndSave(edits: readonly TextEdit[], base: ReadonlyMap<string, string>): Promise<ApplyOutcome> {
    const hook = this.beforeApply;
    this.beforeApply = undefined;
    hook?.();
    for (const [uri, text] of base) if (this.buffers.get(uri) !== text) return { ok: false, stale: true };
    this.applied.push([...edits]);
    for (const [uri, es] of groupByUri([...edits])) {
      this.buffers.set(uri, applyEdits(this.buffers.get(uri)!, es));
      this.index.setDocument(uri, this.buffers.get(uri)!);
    }
    for (const uri of new Set(edits.map((e) => e.uri))) {
      if (this.failSave) return { ok: false, reason: "disk full" };
      this.disk.set(uri, this.buffers.get(uri)!);
      this.saves.push(uri);
    }
    return { ok: true };
  }

  async closedDiagrams(): Promise<LoadedDiagram[]> {
    const out: LoadedDiagram[] = [];
    for (const [uri, text] of this.diagramDisk) {
      if (this.diagramMemory.has(uri)) continue;
      const r = parseDiagram(text);
      if (r.ok) out.push({ uri, doc: r.doc });
    }
    return out;
  }

  async writeDiagramFiles(updates: readonly DiagramUpdate[]): Promise<void> {
    for (const u of updates) this.diagramDisk.set(u.uri, u.text);
  }

  async forceDiagramChange(change: DiagramChange, mode: "apply" | "revert"): Promise<string[]> {
    const written: string[] = [];
    for (const uri of this.diagramDisk.keys()) {
      if (change.target !== "all" && change.target.uri !== uri) continue;
      const ctx = { uri, sourceOf: makeSourceMapper("file:///w") };
      const f = mode === "apply" ? change.apply : change.revert;
      const saved = parseDiagram(this.diagramDisk.get(uri)!);
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
    return written;
  }

  recordUndoEntry(origin: string, result: OpOk): void {
    this.entries.push({ origin, result });
  }
}
