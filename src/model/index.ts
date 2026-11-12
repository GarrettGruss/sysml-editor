import { antlrDocumentParser } from "./antlr-parser.js";
import { kermlOutlineParser } from "./kerml-outline.js";
import { isLibraryUri } from "./library-uri.js";
import { Resolver } from "./resolve.js";
import {
  emptyModel,
  type DetailsProvider,
  type DetailsReply,
  type DocumentModel,
  type DocumentParser,
  type DocumentState,
  type Element,
  type ModelSyntaxError,
  type ParsedDocument,
} from "./types.js";

/** Picks the parser by file extension: `.kerml` uses the outline indexer, anything else ANTLR. */
export const defaultDocumentParser: DocumentParser = (uri, text, opts) => {
  const path = uri.split(/[?#]/, 1)[0]!.toLowerCase();
  return path.endsWith(".kerml") ? kermlOutlineParser(uri, text) : antlrDocumentParser(uri, text, opts);
};

export const DETAILS_UNAVAILABLE_MESSAGE = "Syntax error (details unavailable)";

export interface ModelIndexOptions {
  /**
   * Computes precise results for texts that fail the parser's fast path. When given, the parser
   * is called with `fastOnly` and never blocks on a slow parse; when absent, every parse is the
   * full synchronous one (tests, scripts).
   */
  details?: DetailsProvider;
}

export interface ModelChangeEvent {
  /** URIs whose model or error state changed (removed documents included). */
  uris: string[];
}

export interface Disposable {
  dispose(): void;
}

interface Entry {
  text: string;
  model: DocumentModel;
  errors: ModelSyntaxError[];
  everParsedCleanly: boolean;
  /** Sequence number of `text`; increases on every change. */
  version: number;
  detailsPending: boolean;
}

let nextVersion = 1;

/**
 * Holds the models of many documents, keyed by URI string, with a workspace-wide qualified-name
 * index and name resolution. Synchronous and free of debouncing; callers (the VS Code adapter)
 * decide when to call `setDocument`.
 */
export class ModelIndex {
  private readonly docs = new Map<string, Entry>();
  private readonly byQn = new Map<string, Element[]>();
  private readonly roots = new Map<string, Element[]>();
  private readonly listeners = new Set<(e: ModelChangeEvent) => void>();
  private readonly resolver: Resolver;
  private readonly details?: DetailsProvider;
  /** Last text per URI that was parsed synchronously because details were unavailable, with its result. */
  private readonly syncResolved = new Map<string, { text: string; parsed: ParsedDocument }>();
  private readonly inFlight = new Set<Promise<void>>();
  /** Set on forks: the key arrays that are still shared with the original index (copy before writing). */
  private shared?: { byQn: Set<string>; roots: Set<string> };
  /** Bumped by every change of any document; derived caches (inherited members) are valid for one revision. */
  revision = 0;

  constructor(
    private readonly parser: DocumentParser = defaultDocumentParser,
    opts: ModelIndexOptions = {},
  ) {
    this.details = opts.details;
    this.resolver = new Resolver({
      modelOf: (uri) => this.docs.get(uri)?.model,
      rootsNamed: (name) => this.roots.get(name) ?? [],
      withQualifiedName: (qn) => this.byQn.get(qn) ?? [],
    });
  }

  /**
   * Parse `text` and (re)build the model for `uri`. On syntax errors the last good model is kept
   * (empty if there never was one) and the errors are recorded.
   */
  setDocument(uri: string, text: string): void {
    if (this.apply(uri, text)) this.emit([uri]);
  }

  /** Several documents with a single change event. */
  setDocuments(entries: Iterable<[uri: string, text: string]>): void {
    const changed: string[] = [];
    for (const [uri, text] of entries) if (this.apply(uri, text)) changed.push(uri);
    if (changed.length) this.emit(changed);
  }

  removeDocument(uri: string): boolean {
    const e = this.docs.get(uri);
    if (!e) return false;
    this.clearResolver();
    this.unindex(e.model);
    this.docs.delete(uri);
    this.syncResolved.delete(uri);
    this.emit([uri]);
    return true;
  }

  getDocument(uri: string): DocumentState | undefined {
    const e = this.docs.get(uri);
    if (!e) return undefined;
    return {
      uri,
      text: e.text,
      model: e.model,
      errors: e.errors,
      stale: e.errors.length > 0,
      everParsedCleanly: e.everParsedCleanly,
      detailsPending: e.detailsPending,
    };
  }

  /**
   * A copy of this index in which the given documents have the given texts (parsed synchronously,
   * no details provider). Unchanged documents are shared, not re-parsed; the original is not
   * modified. Used to check what an edit would do before it is applied.
   */
  withTexts(changes: ReadonlyMap<string, string>): ModelIndex {
    const f = new ModelIndex(this.parser);
    for (const [uri, e] of this.docs) f.docs.set(uri, { ...e });
    for (const [k, v] of this.byQn) f.byQn.set(k, v);
    for (const [k, v] of this.roots) f.roots.set(k, v);
    f.shared = { byQn: new Set(this.byQn.keys()), roots: new Set(this.roots.keys()) };
    for (const [uri, text] of changes) f.apply(uri, text);
    return f;
  }

  private clearResolver(): void {
    this.revision++;
    this.resolver.clear();
  }

  /** The array for `key` in one of the maps, copied first when the original index still shares it. */
  private writable(which: "byQn" | "roots", key: string): Element[] | undefined {
    const map = this[which];
    const a = map.get(key);
    if (a && this.shared?.[which].delete(key)) {
      const copy = [...a];
      map.set(key, copy);
      return copy;
    }
    return a;
  }

  /** True for standard-library documents and the elements in them (read-only content). */
  isReadOnly(target: string | Element): boolean {
    return isLibraryUri(typeof target === "string" ? target : target.uri);
  }

  uris(): string[] {
    return [...this.docs.keys()];
  }

  /** All elements with this qualified name (more than one when a package is declared in several files). */
  findByQualifiedName(qn: string): readonly Element[] {
    return this.byQn.get(qn) ?? [];
  }

  /** Resolve a name as written in the source from the point of view of `from`. */
  resolve(nameText: string, from: Element): Element | undefined {
    return this.resolver.resolve(nameText, from);
  }

  /** All candidates for a name in priority order (see `Resolver.resolveAll`); more than one means ambiguity. */
  resolveAll(nameText: string, from: Element): Element[] {
    return this.resolver.resolveAll(nameText, from);
  }

  /** URIs whose error details are still being computed. */
  pendingDetails(): string[] {
    return [...this.docs].filter(([, e]) => e.detailsPending).map(([u]) => u);
  }

  /** Resolves when no detail request is outstanding (including ones started meanwhile). */
  async settled(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  onDidChange(listener: (e: ModelChangeEvent) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  }

  // ---------------------------------------------------------------- internals

  private apply(uri: string, text: string): boolean {
    this.clearResolver();
    const old = this.docs.get(uri);
    if (old && old.text === text) return false;
    let parsed;
    const cached = this.syncResolved.get(uri);
    try {
      // Library texts are known to be valid and are never edited: always allow the LL retry.
      parsed = cached && cached.text === text ? cached.parsed : this.parser(uri, text, this.details ? { fastOnly: true, fullContextRetry: isLibraryUri(uri) } : undefined);
    } catch (e) {
      parsed = { model: emptyModel(uri), errors: [{ line: 0, column: 0, message: `internal parser error: ${String(e)}` }] };
    }
    const version = nextVersion++;
    const pending = !!parsed.detailsPending && !!this.details;
    if (parsed.errors.length === 0 && !parsed.detailsPending) {
      this.setClean(uri, text, version, parsed.model, old);
    } else {
      // Keep the last good model (or an empty one); only the text and errors change.
      const model = old?.model ?? emptyModel(uri);
      this.docs.set(uri, {
        text,
        model,
        errors: parsed.errors,
        everParsedCleanly: old?.everParsedCleanly ?? false,
        version,
        detailsPending: pending,
      });
      if (pending) this.requestDetails(uri, version, text);
    }
    return true;
  }

  private setClean(uri: string, text: string, version: number, model: DocumentModel, old: Entry | undefined): void {
    if (old) this.unindex(old.model);
    this.index(model);
    this.docs.set(uri, { text, model, errors: [], everParsedCleanly: true, version, detailsPending: false });
  }

  private requestDetails(uri: string, version: number, text: string): void {
    let reply: Promise<DetailsReply | undefined>;
    try {
      reply = this.details!.request({ uri, version, text });
    } catch (e) {
      reply = Promise.reject(e);
    }
    const p = reply.then(
      (r) => this.onDetails(uri, version, r),
      (e) => {
        console.error("details provider failed:", e);
        this.onDetails(uri, version, undefined);
      },
    );
    this.inFlight.add(p);
    void p.finally(() => this.inFlight.delete(p));
  }

  /** Applies a reply unless the document changed (or went away) since the request. */
  private onDetails(uri: string, version: number, r: DetailsReply | undefined): void {
    const e = this.docs.get(uri);
    if (!e || e.version !== version || !e.detailsPending) return;
    this.clearResolver();
    if (!r) {
      // Details are unavailable: parse exactly, once, on this thread (a one-off slow path) so the
      // outcome is always correct.
      const parsed = this.syncFallback(uri, e.text);
      if (parsed && parsed.errors.length === 0 && !parsed.detailsPending) {
        this.setClean(uri, e.text, version, parsed.model, e);
      } else {
        e.errors = parsed && parsed.errors.length > 0 && !parsed.detailsPending ? parsed.errors : e.errors.map((x) => ({ ...x, message: DETAILS_UNAVAILABLE_MESSAGE }));
        e.detailsPending = false;
      }
    } else if (r.errors.length === 0 && r.model) {
      this.setClean(uri, e.text, version, r.model, e);
    } else {
      e.errors = r.errors.length > 0 ? r.errors : e.errors;
      e.detailsPending = false;
    }
    this.emit([uri]);
  }

  private syncFallback(uri: string, text: string): ParsedDocument | undefined {
    const c = this.syncResolved.get(uri);
    if (c && c.text === text) return c.parsed;
    console.warn(`sysml: syntax error details unavailable for ${uri}; parsing synchronously on the main thread`);
    try {
      const parsed = this.parser(uri, text);
      this.syncResolved.set(uri, { text, parsed });
      return parsed;
    } catch (err) {
      console.error("synchronous fallback parse failed:", err);
      return undefined;
    }
  }

  private index(model: DocumentModel): void {
    const add = (which: "byQn" | "roots", key: string, e: Element) => {
      const a = this.writable(which, key);
      if (a) a.push(e);
      else this[which].set(key, [e]);
    };
    const walk = (e: Element) => {
      if (e.qualifiedName !== undefined) add("byQn", e.qualifiedName, e);
      for (const m of e.members) walk(m);
    };
    for (const r of model.roots) {
      if (r.name !== undefined) add("roots", r.name, r);
      if (r.shortName !== undefined && r.shortName !== r.name) add("roots", r.shortName, r);
      walk(r);
    }
  }

  private unindex(model: DocumentModel): void {
    const drop = (which: "byQn" | "roots", key: string, e: Element) => {
      const a = this.writable(which, key);
      if (!a) return;
      const i = a.indexOf(e);
      if (i >= 0) a.splice(i, 1);
      if (a.length === 0) this[which].delete(key);
    };
    const walk = (e: Element) => {
      if (e.qualifiedName !== undefined) drop("byQn", e.qualifiedName, e);
      for (const m of e.members) walk(m);
    };
    for (const r of model.roots) {
      if (r.name !== undefined) drop("roots", r.name, r);
      if (r.shortName !== undefined) drop("roots", r.shortName, r);
      walk(r);
    }
  }

  private emit(uris: string[]): void {
    this.clearResolver();
    for (const l of [...this.listeners]) {
      try {
        l({ uris });
      } catch (e) {
        console.error("ModelIndex listener threw:", e);
      }
    }
  }
}

export * from "./types.js";
export { kermlOutlineParser, buildKermlOutline } from "./kerml-outline.js";
export { LIBRARY_URI_SCHEME, isLibraryUri } from "./library-uri.js";
export { loadLibrary } from "./library.js";
export { loadLibraryChunked } from "./library.js";
export { buildDocumentModel, documentFromParse, mapSyntaxErrors } from "./antlr-builder.js";
export { antlrDocumentParser, DETAILS_PENDING_MESSAGE } from "./antlr-parser.js";
export { serializeModel, deserializeModel, type SerializedModel } from "./serialize.js";
export { quoteName, unquoteName, splitQualified } from "./names.js";
export { inheritedMembers, inheritedFrom, inheritedVia, isInheritedIn, supertypesOf, locate, type InheritedMember, type Located } from "./inherited.js";
