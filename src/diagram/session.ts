/**
 * The state behind one open `.sysmld` document, without `vscode`: parsed content or problems, the
 * edit history counters that drive the dirty flag, the reconcile snapshot, and layout merging.
 */
import type { ModelIndex } from "../model/index.js";
import { parseDiagram, serializeDiagram, type DiagramDocument, type DiagramProblem } from "./format.js";
import type { NodeBox } from "./protocol.js";
import { applyUpdates, reconcile, type Snapshot } from "./reconcile.js";
import type { ResolveOptions } from "./resolve.js";
import { buildViewModel, type ViewModel } from "./view-model.js";

export interface Edit {
  undo(): void;
  redo(): void;
}

export class DiagramState {
  doc?: DiagramDocument;
  problems?: DiagramProblem[];
  /** The text as read from disk; kept so a file that does not parse is never lost. */
  raw = "";
  snapshot?: Snapshot;
  private version = 0;
  private savedVersion = 0;

  constructor(text: string) {
    this.load(text);
  }

  /** Replace the content (open, revert, external change); clears the history counters. */
  load(text: string): void {
    this.raw = text;
    const r = parseDiagram(text);
    if (r.ok) {
      this.doc = r.doc;
      this.problems = undefined;
    } else {
      this.doc = undefined;
      this.problems = r.problems;
    }
    this.snapshot = undefined;
    this.version = this.savedVersion = 0;
  }

  /** Content restored from a backup: it differs from what is on disk. */
  loadDirty(text: string): void {
    this.load(text);
    this.version = 1;
  }

  get dirty(): boolean {
    return this.version !== this.savedVersion;
  }

  /** Text to write on save and backup: canonical when the document parsed, the original text otherwise. */
  text(): string {
    return this.doc ? serializeDiagram(this.doc) : this.raw;
  }

  markSaved(): void {
    this.savedVersion = this.version;
    if (this.doc) this.raw = serializeDiagram(this.doc);
  }

  /** Make `next` the current document as one edit. */
  apply(next: DiagramDocument): Edit {
    const prev = this.doc;
    if (!prev) throw new Error("no document to edit");
    this.doc = next;
    this.version++;
    return {
      undo: () => { this.doc = prev; this.version--; },
      redo: () => { this.doc = next; this.version++; },
    };
  }
}

export interface Refreshed {
  viewModel: ViewModel;
  /** Rename updates were found; apply `doc` as one edit. */
  renamed?: DiagramDocument;
}

/** Re-resolve against the model, keep the snapshot, and report renames as a proposed new document. */
export function refresh(state: DiagramState, index: ModelIndex, opts: ResolveOptions = {}): Refreshed | undefined {
  const doc = state.doc;
  if (!doc) return undefined;
  const r = reconcile(doc, index, state.snapshot, opts);
  state.snapshot = r.snapshot;
  if (r.updates.length) {
    const renamed = applyUpdates(doc, r.updates);
    return { viewModel: buildViewModel(renamed, r.resolution, index), renamed };
  }
  return { viewModel: buildViewModel(doc, r.resolution, index) };
}

/** Merge positions computed by the webview into nodes that have none; stored positions never change. */
export function applyLayout(doc: DiagramDocument, boxes: readonly NodeBox[]): DiagramDocument | undefined {
  const byId = new Map(boxes.map((b) => [b.id, b] as const));
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    const b = byId.get(n.id);
    if (!b || n.x !== undefined || n.y !== undefined) return n;
    changed = true;
    return { ...n, x: b.x, y: b.y, w: b.w, h: b.h };
  });
  return changed ? { ...doc, nodes } : undefined;
}
