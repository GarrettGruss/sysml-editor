/**
 * An index of the diagram files in the workspace: which diagram shows which element. The files
 * are parsed once and kept; the VS Code adapter keeps it current with a file watcher. No `vscode` import.
 */
import type { Element, ModelIndex } from "../model/index.js";
import { parseDiagram, type DiagramDocument } from "./format.js";
import { resolveDiagram, type SourceMapper } from "./resolve.js";

export interface DiagramHit {
  /** URI string of the diagram file. */
  uri: string;
  /** The node (or edge) that shows the element. */
  itemId: string;
}

export class DiagramFileIndex {
  private readonly docs = new Map<string, DiagramDocument>();

  /** Parse and store a file's text; a file that does not parse is not indexed. */
  set(uri: string, text: string): boolean {
    const r = parseDiagram(text);
    if (!r.ok) {
      this.docs.delete(uri);
      return false;
    }
    this.docs.set(uri, r.doc);
    return true;
  }

  delete(uri: string): void {
    this.docs.delete(uri);
  }

  uris(): string[] {
    return [...this.docs.keys()].sort();
  }

  get(uri: string): DiagramDocument | undefined {
    return this.docs.get(uri);
  }

  /**
   * The diagrams in which `element` appears, found by resolving every file against the model.
   * `overrides` hold the in-memory content of diagrams that are open.
   */
  showing(element: Element, index: ModelIndex, sourceOf: (diagramUri: string) => SourceMapper, overrides: ReadonlyMap<string, DiagramDocument> = new Map()): DiagramHit[] {
    const out: DiagramHit[] = [];
    const uris = new Set([...this.docs.keys(), ...overrides.keys()]);
    for (const uri of [...uris].sort()) {
      const doc = overrides.get(uri) ?? this.docs.get(uri);
      if (!doc) continue;
      const res = resolveDiagram(doc, index, { sourceOf: sourceOf(uri) });
      const hit = doc.nodes.find((n) => res.get(n.id) === element);
      if (hit) out.push({ uri, itemId: hit.id });
    }
    return out;
  }
}
