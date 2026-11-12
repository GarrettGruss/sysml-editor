/** The VS Code implementation of the diagram service the agent tools use (see `DiagramService`). */
import * as vscode from "vscode";
import { fsPathToToolPath, toolPathToFsPath, type FolderInfo } from "../agent-paths.js";
import { ToolError, type DiagramContent, type DiagramFileInfo, type DiagramImage, type DiagramService, type DiagramWriteResult } from "../agent-tools/types.js";
import { diagramTargetFolder, type DiagramFiles } from "./commands.js";
import type { DiagramEditorProvider } from "./diagram-editor.js";
import { parseDiagram, serializeDiagram, type DiagramDocument } from "./format.js";
import { defaultDiagramFileName, uniqueFileName } from "./new-diagram.js";
import { makeSourceMapper, type SourceMapper } from "./resolve.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const sourceMapperFor = (uri: vscode.Uri): SourceMapper => makeSourceMapper(vscode.workspace.getWorkspaceFolder(uri)?.uri.toString());
const exists = (uri: vscode.Uri) => Promise.resolve(vscode.workspace.fs.stat(uri)).then(() => true, () => false);

export class VsCodeDiagramService implements DiagramService {
  /** Writes are serialised so that two tool calls on one diagram never interleave. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly provider: DiagramEditorProvider,
    private readonly files: DiagramFiles,
    private readonly folders: () => FolderInfo[],
  ) {}

  isTrusted(): boolean {
    return vscode.workspace.isTrusted;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.queue.then(fn, fn);
    this.queue = r.catch(() => undefined);
    return r;
  }

  private toUri(path: string): vscode.Uri {
    const fsPath = toolPathToFsPath(this.folders(), path);
    if (fsPath === undefined) throw new ToolError(`"${path}" is outside the workspace. Diagram paths are relative to the workspace root.`);
    return vscode.Uri.file(fsPath);
  }

  private toPath(uri: vscode.Uri): string | undefined {
    return uri.scheme === "file" ? fsPathToToolPath(this.folders(), uri.fsPath) : undefined;
  }

  async list(): Promise<DiagramFileInfo[]> {
    await this.files.ready;
    const uris = new Set([...this.files.index.allUris(), ...this.provider.openUris()]);
    const out: DiagramFileInfo[] = [];
    for (const key of uris) {
      const uri = vscode.Uri.parse(key);
      const path = this.toPath(uri);
      if (path === undefined) continue;
      const open = this.provider.openDocument(uri);
      const doc = open ? open.state.doc : this.files.index.get(key);
      if (doc) out.push({ path, open: open !== undefined, doc });
      else out.push({ path, open: open !== undefined, problems: open?.state.problems ?? [{ path: "", message: "not a valid diagram file" }] });
    }
    return out;
  }

  private async load(uri: vscode.Uri, path: string): Promise<DiagramDocument> {
    let text: string;
    try {
      text = decoder.decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      throw new ToolError(`No diagram file "${path}". Use sysml_list_diagrams for the available paths.`);
    }
    const r = parseDiagram(text);
    if (!r.ok) throw new ToolError(`"${path}" is not a valid diagram file: ${r.problems.slice(0, 5).map((p) => `${p.path} ${p.message}`.trim()).join("; ")}`);
    return r.doc;
  }

  async read(path: string): Promise<DiagramContent> {
    const uri = this.toUri(path);
    const open = this.provider.openDocument(uri);
    if (open) {
      const doc = open.state.doc;
      if (!doc) throw new ToolError(`"${path}" is open but is not a valid diagram file: ${(open.state.problems ?? []).slice(0, 5).map((p) => `${p.path} ${p.message}`.trim()).join("; ")}`);
      return { path, open: true, unsaved: open.state.dirty, doc, sourceOf: sourceMapperFor(uri) };
    }
    return { path, open: false, unsaved: false, doc: await this.load(uri, path), sourceOf: sourceMapperFor(uri) };
  }

  async renderImage(path: string): Promise<DiagramImage> {
    try {
      const c = await this.read(path);
      const b64 = await this.provider.renderImage(this.toUri(path), serializeDiagram(c.doc));
      return { ok: true, png: new Uint8Array(Buffer.from(b64, "base64")) };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  create(request: Parameters<DiagramService["create"]>[0]): Promise<DiagramWriteResult> {
    return this.serial(async () => {
      let uri: vscode.Uri;
      if (request.path !== undefined) {
        uri = this.toUri(request.path);
        if (await exists(uri)) throw new ToolError(`"${request.path}" already exists; existing diagrams are never overwritten. Choose another path, or omit path.`);
      } else {
        const target = diagramTargetFolder(request.root);
        if (!target) throw new ToolError("No workspace folder is open, so there is nowhere to create a diagram.");
        const taken = new Set((await Promise.resolve(vscode.workspace.fs.readDirectory(target.dir)).then((d) => d, () => [] as [string, vscode.FileType][])).map(([n]) => n));
        uri = vscode.Uri.joinPath(target.dir, uniqueFileName(defaultDiagramFileName(request.root.name ?? "diagram"), (n) => taken.has(n)));
      }
      const path = this.toPath(uri);
      if (path === undefined) throw new ToolError("The diagram would be outside the workspace.");
      const sourceOf = sourceMapperFor(uri);
      const doc = request.make(sourceOf);
      const text = serializeDiagram(doc);
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
      if (await exists(uri)) throw new ToolError(`"${path}" appeared in the meantime; nothing was written.`);
      await vscode.workspace.fs.writeFile(uri, encoder.encode(text));
      this.files.index.set(uri.toString(), text);
      return { applied: "file", doc, sourceOf, path };
    });
  }

  edit(path: string, label: string, change: (doc: DiagramDocument, sourceOf: SourceMapper) => DiagramDocument | undefined): Promise<DiagramWriteResult> {
    return this.serial(async () => {
      const uri = this.toUri(path);
      const sourceOf = sourceMapperFor(uri);
      const open = this.provider.openDocument(uri);
      if (open) {
        const cur = open.state.doc;
        if (!cur) throw new ToolError(`"${path}" is open but is not a valid diagram file, so it cannot be edited.`);
        const next = change(cur, sourceOf);
        if (!next) return { applied: "none", doc: cur, sourceOf, path };
        // Undoable by the user, and left unsaved: the tab shows it as modified.
        this.provider.edit(open, next, `${label} (agent)`);
        return { applied: "editor", doc: open.state.doc ?? next, sourceOf, path };
      }
      const cur = await this.load(uri, path);
      const next = change(cur, sourceOf);
      if (!next) return { applied: "none", doc: cur, sourceOf, path };
      await this.write(uri, next);
      return { applied: "file", doc: next, sourceOf, path };
    });
  }

  private async write(uri: vscode.Uri, doc: DiagramDocument): Promise<void> {
    const text = serializeDiagram(doc);
    await vscode.workspace.fs.writeFile(uri, encoder.encode(text));
    this.files.index.set(uri.toString(), text);
  }

  layout(path: string): Promise<DiagramWriteResult> {
    return this.serial(async () => {
      const uri = this.toUri(path);
      const sourceOf = sourceMapperFor(uri);
      const open = this.provider.openDocument(uri);
      if (open) {
        const before = open.state.doc;
        if (!before) throw new ToolError(`"${path}" is open but is not a valid diagram file, so it cannot be laid out.`);
        const was = JSON.stringify(before);
        try {
          await this.provider.autoLayout(open);
        } catch (e) {
          throw new ToolError(`The layout could not be computed: ${e instanceof Error ? e.message : String(e)}`);
        }
        const now = open.state.doc ?? before;
        return { applied: JSON.stringify(now) === was ? "none" : "editor", doc: now, sourceOf, path };
      }
      const cur = await this.load(uri, path);
      const cleared: DiagramDocument = {
        ...cur,
        nodes: cur.nodes.map(({ x: _x, y: _y, w: _w, h: _h, ...n }) => n),
        edges: cur.edges.map(({ points: _p, ...e }) => e),
      };
      if (JSON.stringify(cleared) === JSON.stringify(cur)) return { applied: "none", doc: cur, sourceOf, path };
      await this.write(uri, cleared);
      return { applied: "file", doc: cleared, sourceOf, path };
    });
  }
}
