/**
 * The state behind one open `.sysmld` document, without `vscode`: parsed content or problems, the
 * edit history counters that drive the dirty flag, the reconcile snapshot, and layout merging.
 */
import { createHash } from "node:crypto";
import type { ModelIndex } from "../model/index.js";
import { parseDiagram, serializeDiagram, type DiagramDocument, type DiagramProblem } from "./format.js";
import type { EdgePoints, NodeBox } from "./protocol.js";
import { removeItems } from "./edits.js";
import { referenceKey } from "./resolve.js";
import { applyUpdates, reconcile, type ReferenceUpdate, type Snapshot } from "./reconcile.js";
import type { ResolveOptions } from "./resolve.js";
import { buildViewModel, type ViewModel } from "./view-model.js";

export interface Edit {
  /** Both return false (and do nothing) when the edit belongs to an earlier load of the document. */
  undo(): boolean;
  redo(): boolean;
}

export class DiagramState {
  doc?: DiagramDocument;
  problems?: DiagramProblem[];
  /** The text as read from disk; kept so a file that does not parse is never lost. */
  raw = "";
  /** The last text known to be on disk (read or written by us); a different text on disk is an external change. */
  disk = "";
  /** An external change arrived while the document had unsaved changes. */
  conflicted = false;
  /** Bumped by every load; edits made in an earlier generation cannot be undone or redone. */
  generation = 0;
  snapshot?: Snapshot;
  private version = 0;
  private savedVersion = 0;
  /** Rename follow-ups applied since the last load; re-applied after undo/redo restores an older document. */
  follows: ReferenceUpdate[][] = [];
  /** Model-forced changes applied since the last load (new node, removed entries); re-applied after undo/redo restores an older document. */
  forced: { token: object; fn: (doc: DiagramDocument) => DiagramDocument }[] = [];
  /** Reference keys of items that model edits of this session created (see `takeVanished`). */
  created = new Set<string>();
  /** Kind of the element each item resolved to the last time it did; lets "Re-link…" offer elements of the same kind after the element is gone. */
  kinds = new Map<string, string>();
  /** The view model last computed, to expand removals and to know what is drawn. */
  viewModel?: ViewModel;

  constructor(text: string) {
    this.load(text);
  }

  /** Replace the content (open, revert, external change); clears the history counters. */
  load(text: string): void {
    this.raw = this.disk = text;
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
    this.conflicted = false;
    this.follows = [];
    this.forced = [];
    this.generation++;
  }

  /** Content restored from a backup: it differs from what is on disk (`disk`). */
  loadDirty(text: string, disk: string): void {
    this.load(text);
    this.disk = disk;
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
    this.disk = this.text();
    this.conflicted = false;
  }

  private refollow(doc: DiagramDocument): DiagramDocument {
    return this.forced.reduce((d, f) => f.fn(d), this.follows.reduce((d, u) => applyUpdates(d, u), doc));
  }

  /** Make `next` the current document as one undoable, dirtying edit. */
  apply(next: DiagramDocument): Edit {
    const prev = this.doc;
    if (!prev) throw new Error("no document to edit");
    const gen = this.generation;
    this.doc = next;
    this.version++;
    return {
      undo: () => {
        if (gen !== this.generation) return false;
        this.doc = this.refollow(prev);
        this.version--;
        return true;
      },
      redo: () => {
        if (gen !== this.generation) return false;
        this.doc = this.refollow(next);
        this.version++;
        return true;
      },
    };
  }

  /** Merge computed positions into the in-memory document: not dirty, no undo entry. */
  mergeLayout(boxes: readonly NodeBox[], edges: readonly EdgePoints[] = []): boolean {
    const next = this.doc && applyLayout(this.doc, boxes, edges);
    if (!next) return false;
    this.doc = next;
    return true;
  }
}

/** What happens when the file changes on disk behind an open document. */
export type ExternalChange = "ignore" | "reload" | "conflict";

export function noteExternalChange(state: DiagramState, diskText: string): ExternalChange {
  if (diskText === state.disk) return "ignore";
  if (!state.dirty) {
    state.load(diskText);
    return "reload";
  }
  if (state.conflicted) return "ignore";
  state.conflicted = true;
  return "conflict";
}

export type SaveDecision = "write" | "conflict" | "unparsed";

/** `diskText` is the current file content, or undefined when the file does not exist. */
export function decideSave(state: DiagramState, diskText: string | undefined): SaveDecision {
  if (!state.doc) return "unparsed";
  if (diskText !== undefined && diskText !== state.disk) return "conflict";
  return "write";
}

export type RenameFollow =
  | { kind: "none" }
  /** The disk changed under a clean document: it was reloaded, rename detection will run again. */
  | { kind: "reloaded" }
  /** Write `text` to the file; memory has the updates too. */
  | { kind: "write"; text: string };

/**
 * Reference updates found by rename detection are model-forced: they go to the file at once, on
 * top of its last saved (or externally changed) state, and into memory without dirtying or an undo
 * entry. Pending in-memory layout is not written.
 */
export function followRename(state: DiagramState, updates: readonly ReferenceUpdate[], diskText: string | undefined): RenameFollow {
  if (!state.doc || !updates.length) return { kind: "none" };
  let base = state.disk;
  if (diskText !== undefined && diskText !== state.disk) {
    if (!state.dirty) {
      state.load(diskText);
      return { kind: "reloaded" };
    }
    state.conflicted = true;
    base = diskText;
  }
  state.doc = applyUpdates(state.doc, updates);
  state.follows.push([...updates]);
  const parsed = parseDiagram(base);
  if (!parsed.ok) return { kind: "none" };
  const text = serializeDiagram(applyUpdates(parsed.doc, updates));
  if (text === base) return { kind: "none" };
  state.raw = state.disk = text;
  return { kind: "write", text };
}

export type ForcedWrite = { kind: "none" } | { kind: "write"; text: string };

/**
 * A change a model edit forces on the diagram (a node for the element just created, entries removed
 * on delete): applied to memory without dirtying or an undo entry, and to the file's last saved
 * (or externally changed) state, which is written at once. Pending layout is not written.
 * `fn` must be idempotent. `token` identifies the change for `unforceChange`.
 */
export function forceChange(state: DiagramState, token: object, fn: (doc: DiagramDocument) => DiagramDocument, diskText: string | undefined): ForcedWrite {
  if (!state.doc) return { kind: "none" };
  let base = state.disk;
  if (diskText !== undefined && diskText !== state.disk) {
    if (!state.dirty) {
      state.load(diskText);
      base = state.disk;
    } else {
      state.conflicted = true;
      base = diskText;
    }
  }
  state.doc = fn(state.doc!);
  if (!state.forced.some((f) => f.token === token)) state.forced.push({ token, fn });
  return writeBase(state, base, fn);
}

/** Take a forced change back (undo of the model edit): `revert` applies to memory and to the saved state. */
export function unforceChange(state: DiagramState, token: object, revert: (doc: DiagramDocument) => DiagramDocument, diskText: string | undefined): ForcedWrite {
  if (!state.doc) return { kind: "none" };
  state.forced = state.forced.filter((f) => f.token !== token);
  let base = state.disk;
  if (diskText !== undefined && diskText !== state.disk) {
    if (!state.dirty) {
      state.load(diskText);
      base = state.disk;
    } else {
      state.conflicted = true;
      base = diskText;
    }
  }
  state.doc = revert(state.doc!);
  return writeBase(state, base, revert);
}

function writeBase(state: DiagramState, base: string, fn: (doc: DiagramDocument) => DiagramDocument): ForcedWrite {
  const parsed = parseDiagram(base);
  if (!parsed.ok) return { kind: "none" };
  const text = serializeDiagram(fn(parsed.doc));
  if (text === base) return { kind: "none" };
  state.raw = state.disk = text;
  return { kind: "write", text };
}

/** Closed diagram file: the same change on its saved text; undefined when it does not change or does not parse. */
export function forceOnText(text: string, fn: (doc: DiagramDocument) => DiagramDocument): string | undefined {
  const parsed = parseDiagram(text);
  if (!parsed.ok) return undefined;
  const next = serializeDiagram(fn(parsed.doc));
  return next === text ? undefined : next;
}

/**
 * Items this session created whose element has since disappeared from the text (for example by Undo in
 * the text editor): the keys to drop, so no unresolved placeholder is left for them.
 */
export function vanishedKeys(state: DiagramState, doc: DiagramDocument, resolution: ReadonlyMap<string, unknown>): string[] {
  if (!state.created.size) return [];
  return [...doc.nodes, ...doc.edges].filter((i) => !resolution.get(i.id) && state.created.has(referenceKey(i))).map((i) => referenceKey(i));
}

/** Remove the items whose reference key is in `keys`, with what hangs off them. */
export function dropKeys(doc: DiagramDocument, keys: readonly string[]): DiagramDocument {
  const set = new Set(keys);
  const ids = [...doc.nodes, ...doc.edges].filter((i) => set.has(referenceKey(i))).map((i) => i.id);
  return ids.length ? removeItems(doc, ids) : doc;
}

/** Stable hash of a view model, to skip re-posting an unchanged one. */
export function hashViewModel(vm: ViewModel): string {
  return createHash("sha1").update(JSON.stringify(vm)).digest("hex");
}

export interface Refreshed {
  viewModel: ViewModel;
  /** Rename updates were found; the document with them applied. */
  renamed?: DiagramDocument;
  updates?: ReferenceUpdate[];
  /** Reference keys of items created by this session's model edits whose element is gone: drop them. */
  vanished?: string[];
}

/** Re-resolve against the model, keep the snapshot, and report renames as a proposed new document. */
export function refresh(state: DiagramState, index: ModelIndex, opts: ResolveOptions = {}, readOnly?: (uri: string) => string | undefined): Refreshed | undefined {
  const doc = state.doc;
  if (!doc) return undefined;
  const r = reconcile(doc, index, state.snapshot, opts);
  state.snapshot = r.snapshot;
  for (const [id, el] of r.resolution) if (el) state.kinds.set(id, el.kind);
  const vanished = vanishedKeys(state, doc, r.resolution);
  const extra = vanished.length ? { vanished } : {};
  if (r.updates.length) {
    const renamed = applyUpdates(doc, r.updates);
    return { viewModel: (state.viewModel = buildViewModel(renamed, r.resolution, index, readOnly)), renamed, updates: [...r.updates], ...extra };
  }
  return { viewModel: (state.viewModel = buildViewModel(doc, r.resolution, index, readOnly)), ...extra };
}

export const MAX_COORD = 1_000_000;

/** A box from the webview is trusted only when it is finite, positive in size and of bounded magnitude. */
export function validBox(b: NodeBox): boolean {
  if (!b || typeof b.id !== "string") return false;
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;
  return ok(b.x) && ok(b.y) && ok(b.w) && ok(b.h) && b.w > 0 && b.h > 0;
}

/** Merge positions computed by the webview into nodes that have none; stored positions never change. */
export function applyLayout(doc: DiagramDocument, boxes: readonly NodeBox[], routes: readonly EdgePoints[] = []): DiagramDocument | undefined {
  const byId = new Map(boxes.filter(validBox).map((b) => [b.id, b] as const));
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    const b = byId.get(n.id);
    if (!b || n.x !== undefined || n.y !== undefined) return n;
    changed = true;
    return { ...n, x: b.x, y: b.y, w: b.w, h: b.h };
  });
  const pts = new Map(routes.filter((r) => Array.isArray(r?.points) && r.points.length >= 2 && r.points.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Math.abs(p.x) <= MAX_COORD && Math.abs(p.y) <= MAX_COORD)).map((r) => [r.id, r.points] as const));
  const edges = doc.edges.map((e) => {
    const p = pts.get(e.id);
    if (!p || e.points !== undefined) return e;
    changed = true;
    return { ...e, points: p.map((q) => ({ x: q.x, y: q.y })) };
  });
  return changed ? { ...doc, nodes, edges } : undefined;
}
