import { antlrDocumentParser } from "./antlr-builder.js";
import { kermlOutlineParser } from "./kerml-outline.js";
import { isLibraryUri } from "./library-uri.js";
import { Resolver } from "./resolve.js";
import {
  emptyModel,
  type DocumentModel,
  type DocumentParser,
  type DocumentState,
  type Element,
  type ModelSyntaxError,
} from "./types.js";

/** Picks the parser by file extension: `.kerml` uses the outline indexer, anything else ANTLR. */
export const defaultDocumentParser: DocumentParser = (uri, text) => {
  const path = uri.split(/[?#]/, 1)[0]!.toLowerCase();
  return path.endsWith(".kerml") ? kermlOutlineParser(uri, text) : antlrDocumentParser(uri, text);
};

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
}

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

  constructor(private readonly parser: DocumentParser = defaultDocumentParser) {
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
    this.resolver.clear();
    this.unindex(e.model);
    this.docs.delete(uri);
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
    };
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

  onDidChange(listener: (e: ModelChangeEvent) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  }

  // ---------------------------------------------------------------- internals

  private apply(uri: string, text: string): boolean {
    this.resolver.clear();
    const old = this.docs.get(uri);
    if (old && old.text === text) return false;
    let parsed;
    try {
      parsed = this.parser(uri, text);
    } catch (e) {
      parsed = { model: emptyModel(uri), errors: [{ line: 0, column: 0, message: `internal parser error: ${String(e)}` }] };
    }
    const clean = parsed.errors.length === 0;
    if (clean) {
      if (old) this.unindex(old.model);
      this.index(parsed.model);
      this.docs.set(uri, { text, model: parsed.model, errors: [], everParsedCleanly: true });
    } else {
      // Keep the last good model (or an empty one); only the text and errors change.
      const model = old?.model ?? emptyModel(uri);
      this.docs.set(uri, { text, model, errors: parsed.errors, everParsedCleanly: old?.everParsedCleanly ?? false });
    }
    return true;
  }

  private index(model: DocumentModel): void {
    const walk = (e: Element) => {
      if (e.qualifiedName !== undefined) push(this.byQn, e.qualifiedName, e);
      for (const m of e.members) walk(m);
    };
    for (const r of model.roots) {
      if (r.name !== undefined) push(this.roots, r.name, r);
      if (r.shortName !== undefined && r.shortName !== r.name) push(this.roots, r.shortName, r);
      walk(r);
    }
  }

  private unindex(model: DocumentModel): void {
    const drop = (m: Map<string, Element[]>, key: string, e: Element) => {
      const a = m.get(key);
      if (!a) return;
      const i = a.indexOf(e);
      if (i >= 0) a.splice(i, 1);
      if (a.length === 0) m.delete(key);
    };
    const walk = (e: Element) => {
      if (e.qualifiedName !== undefined) drop(this.byQn, e.qualifiedName, e);
      for (const m of e.members) walk(m);
    };
    for (const r of model.roots) {
      if (r.name !== undefined) drop(this.roots, r.name, r);
      if (r.shortName !== undefined) drop(this.roots, r.shortName, r);
      walk(r);
    }
  }

  private emit(uris: string[]): void {
    this.resolver.clear();
    for (const l of [...this.listeners]) {
      try {
        l({ uris });
      } catch (e) {
        console.error("ModelIndex listener threw:", e);
      }
    }
  }
}

function push(m: Map<string, Element[]>, key: string, e: Element): void {
  const a = m.get(key);
  if (a) a.push(e);
  else m.set(key, [e]);
}

export * from "./types.js";
export { kermlOutlineParser, buildKermlOutline } from "./kerml-outline.js";
export { LIBRARY_URI_SCHEME, isLibraryUri } from "./library-uri.js";
export { loadLibrary } from "./library.js";
export { loadLibraryChunked } from "./library.js";
export { antlrDocumentParser, buildDocumentModel } from "./antlr-builder.js";
export { quoteName, unquoteName, splitQualified } from "./names.js";
