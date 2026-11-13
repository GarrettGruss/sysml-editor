/** Test support: a diagram service over memory (not part of the extension bundle). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDiagram, type DiagramDocument } from "../diagram/format.js";
import { makeSourceMapper } from "../diagram/resolve.js";
import { ToolError, type DiagramFileInfo, type DiagramImage, type DiagramService, type EditorState, type DiagramWriteResult } from "./types.js";

export const fixtures = resolve(__dirname, "../../test/fixtures/workspace-basic");
export const fixtureText = (f: string) => readFileSync(resolve(fixtures, f), "utf8");
export const fixtureDiagram = (f: string): DiagramDocument => {
  const r = parseDiagram(fixtureText(f));
  if (!r.ok) throw new Error(f);
  return r.doc;
};

export const sourceOf = makeSourceMapper("file:///w");

/** A diagram service over memory: files, the set of open ones, and what the last write did. */
export class FakeDiagrams implements DiagramService {
  files = new Map<string, DiagramDocument | "invalid">();
  open = new Set<string>();
  unsaved = new Set<string>();
  trusted = true;
  image: DiagramImage = { ok: true, png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) };
  laidOut: string[] = [];
  editor: EditorState = { open: [] };
  editorState() { return this.editor; }
  isTrusted() { return this.trusted; }
  async list(): Promise<DiagramFileInfo[]> {
    return [...this.files].map(([path, d]) => (d === "invalid" ? { path, open: this.open.has(path), problems: [{ path: "", message: "not valid" }] } : { path, open: this.open.has(path), doc: d }));
  }
  private get(path: string): DiagramDocument {
    const d = this.files.get(path);
    if (d === undefined) throw new ToolError(`No diagram file "${path}".`);
    if (d === "invalid") throw new ToolError(`"${path}" is not a valid diagram file`);
    return d;
  }
  async read(path: string) {
    return { path, open: this.open.has(path), unsaved: this.unsaved.has(path), doc: this.get(path), sourceOf };
  }
  async renderImage() { return this.image; }
  async create(req: Parameters<DiagramService["create"]>[0]): Promise<DiagramWriteResult> {
    const path = req.path ?? `${req.root.name}.sysmld`;
    if (this.files.has(path)) throw new ToolError(`"${path}" already exists`);
    const doc = req.make(sourceOf);
    this.files.set(path, doc);
    return { applied: "file", doc, sourceOf, path };
  }
  async edit(path: string, _l: string, change: (d: DiagramDocument, s: typeof sourceOf) => DiagramDocument | undefined): Promise<DiagramWriteResult> {
    const cur = this.get(path);
    const next = change(cur, sourceOf);
    if (!next) return { applied: "none", doc: cur, sourceOf, path };
    this.files.set(path, next);
    if (this.open.has(path)) this.unsaved.add(path);
    return { applied: this.open.has(path) ? "editor" : "file", doc: next, sourceOf, path };
  }
  async layout(path: string): Promise<DiagramWriteResult> {
    const cur = this.get(path);
    this.laidOut.push(path);
    return { applied: this.open.has(path) ? "editor" : "file", doc: cur, sourceOf, path };
  }
}

