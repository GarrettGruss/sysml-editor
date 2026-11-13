import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { agentTests, isPng, viaLm, viaMcp } from "./diagram-agent.js";
import { behaviorTests } from "./behavior.js";
import { interactionTests } from "./diagram-interaction.js";
import { foldersTests } from "./folders.js";
import { editingTests } from "./editing.js";
import { requirementsTests } from "./requirements.js";
import { elementRoots } from "./tree-util.js";

// Structural copies of the extension's test API (importing src/ would pull the whole bundle into this compile).
export interface ModelNode { id: string; uri: string; kind?: "folder" | "file" | "diagram" | "message" }
export interface TestApi {
  model: { ready: Promise<void>; index: { uris(): string[]; isReadOnly(u: string): boolean; getDocument(u: string): { errors: unknown[]; detailsPending?: boolean } | undefined; findByQualifiedName(qn: string): readonly unknown[]; pendingDetails(): string[] } };
  provider: {
    /** An array below a file node (the elements); the folder levels, and the Diagrams view, answer with a promise (await it). */
    getChildren(n?: ModelNode): ModelNode[];
    /** Like getChildren, but records the nodes as VS Code would (targeted refreshes use those objects). */
    viewGetChildren(n?: ModelNode): ModelNode[];
    getParent(n: ModelNode): ModelNode | undefined;
    /** Whether the node is an object getChildren handed out (VS Code only refreshes such objects). */
    isHanded(n: ModelNode): boolean;
    readonly filter: "elements" | "diagrams" | "all";
    setFilter(filter: "elements" | "diagrams" | "all"): Promise<void>;
    getTreeItem(n: ModelNode): vscode.TreeItem;
    onDidChangeTreeData: vscode.Event<unknown>;
    /** Workspace searches and directory reads done for the tree so far. */
    readonly ioCalls: number;
    /** Re-reads of newly created folders still scheduled. */
    readonly pendingFolderRescans: number;
    setExpanded(n: ModelNode, expanded: boolean): void;
  };
  /** The search box above the tree; `post` delivers a message as its webview would. */
  search: { post(message: unknown): void; query(): string };
  view: vscode.TreeView<ModelNode>;
  agent: {
    apply(): Promise<void>;
    currentPlan(): { lmTools: boolean; mcpServer: boolean; registerWithVsCode: boolean };
    mcpEndpoint(): { url: string; port: number; token: string } | undefined;
    testCallToolOverMcp(name: string, input: object): Promise<{ text: string; isError: boolean; images: { mimeType: string; base64: string }[] }>;
  };
  diagram: {
    open(uri: vscode.Uri): Promise<void>;
    metrics(uri: vscode.Uri): Promise<Metrics>;
    png(uri: vscode.Uri): Promise<string>;
    pngEditor(uri: vscode.Uri): Promise<string>;
    pngWindow(uri: vscode.Uri, theme: "editor-dark" | "editor-light"): Promise<string>;
    save(uri: vscode.Uri): Promise<void>;
    edit(uri: vscode.Uri, moves: { id: string; x: number; y: number }[]): void;
    state(uri: vscode.Uri): { errorPage: boolean; dirty: boolean; problems: unknown[]; doc?: DiagramDoc };
    errors(): string[];
    gesture(uri: vscode.Uri, g: Gesture): Promise<void>;
    setUi(ui: { pick?: (items: PickItem[], options: unknown) => Promise<PickItem | undefined>; input?: (options: { value?: string; validateInput?: (v: string) => string | undefined }) => Promise<string | undefined>; confirm?: (message: string, detail: string, action: string) => Promise<boolean>; fail?: (f: Failure) => Promise<void>; choose?: (message: string, actions: readonly string[]) => Promise<string | undefined> } | undefined): void;
    activeUri(): string | undefined;
    hoverOf(uri: vscode.Uri): string | undefined;
  };
  dnd: { handleDrag(source: readonly ModelNode[], data: vscode.DataTransfer): void };
  requirements: {
    open(scope: ReqScope, view?: "table" | "document"): Promise<void>;
    close(scope: ReqScope): Promise<void>;
    metrics(scope: ReqScope): Promise<ReqMetrics>;
    png(scope: ReqScope): Promise<string>;
    gesture(scope: ReqScope, g: ReqGesture): Promise<void>;
    setWidth(scope: ReqScope, width: number | null): Promise<void>;
    intent(scope: ReqScope, intent: Record<string, unknown>): Promise<{ ok: boolean; message?: string }>;
    setView(scope: ReqScope, view: "table" | "document"): Promise<void>;
    setUi(ui: { confirm?: (m: string, d: string, a: string) => Promise<boolean>; pickOne?: (items: { id: string; label: string }[], title: string) => Promise<string | undefined>; pickMany?: (items: { id: string; label: string }[], title: string) => Promise<string[] | undefined>; pickVerification?: (cases: { id: string; label: string }[], title: string) => Promise<{ existing: string } | { create: string } | undefined>; inputName?: (p: string) => Promise<string | undefined> } | undefined): void;
    navigation(): string[];
    errors(): string[];
    settled(scope: ReqScope): Promise<void>;
  };
}
export type ReqScope = { kind: "package"; qualifiedName: string } | { kind: "file"; uri: string };
export type ReqGesture =
  | { kind: "click"; selector: string }
  | { kind: "input"; selector: string; value: string; event?: "change" | "input" }
  | { kind: "dragToc"; fromQn: string; ontoQn: string; position: "before" | "after" }
  | { kind: "key"; selector: string; key: string };
export interface ReqMetrics {
  view: "table" | "document"; theme: "light" | "dark"; generation: number; scopeName: string;
  table: { rows: { qn: string; cells: { id: string; name: string; text: string; owner: string; satisfy: string; verify: string }; selected: boolean; unsatisfied: boolean; unverified: boolean }[]; selected?: string; counts: { total: number; unsatisfied: number; unverified: number }; detail?: { qn: string; satisfiedBy: string[]; verifiedBy: string[]; derivedFrom: string[]; derives: string[] } };
  document: { title: string; version?: string; outline: { number: string; heading: string; level: number; appendix: boolean; paragraphs: number; items: number; elements: number }[]; toc: { number: string; heading: string; level: number }[]; appendixLetters: string[]; paragraphs: { section: string; text: string; lists: number; links: number }[]; items: { section: string; id: string; name: string; text: string }[]; rootBlocks: number };
  pendingEdits: string[]; conflicts: string[]; overflow: { count: number; horizontalScroll: boolean; samples: string[] }; notice?: { level: string; message: string }; errors: string[]; size: { width: number; height: number };
  layout: { width: number; mode: "table" | "card"; detail: "beside" | "below"; textWidths: number[]; rowWidths: number[] };
}
export interface Failure { reason: string; goToError?: { uri: string; line: number; column: number }; goToDefinition?: { uri: string; line: number; column: number; name: string } }
export interface PickItem { label: string; description?: string; detail?: string }
export interface DiagramDoc {
  version: number; kind: string; root: string; sources: string[];
  nodes: { id: string; ref?: string; parent?: string; x?: number; y?: number; w?: number; h?: number }[];
  edges: { id: string; ref?: string; locator?: { kind: string }; source: string; target: string; points?: { x: number; y: number }[]; label?: { dx: number; dy: number; w?: number; h?: number; wrap?: boolean } }[];
}
export type Gesture =
  | { kind: "select"; id: string; shift?: boolean }
  | { kind: "drag"; id: string; dx: number; dy: number; steps?: number }
  | { kind: "resize"; id: string; handle: string; dx: number; dy: number }
  | { kind: "key"; key: string; shift?: boolean; ctrl?: boolean; meta?: boolean }
  | { kind: "rubber"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "menu"; id: string; action: "remove" | "relink" | "deleteModel" | "rename" | "goto" }
  | { kind: "contextmenu"; id: string }
  | { kind: "drop"; names: string[] }
  | { kind: "palette"; item: string; id?: string; x?: number; y?: number }
  | { kind: "connect"; source: string; target: string; relation?: "satisfy" | "verify" | "derivation" | "succession" | "transition" | "message" }
  | { kind: "selectEdge"; id: string }
  | { kind: "dragEdge"; id: string; dy: number }
  | { kind: "dragSegment"; id: string; index: number; d: number }
  | { kind: "dragBend"; id: string; index: number; dx: number; dy: number }
  | { kind: "dblclickEdge"; id: string }
  | { kind: "labelDrag"; id: string; dx: number; dy: number }
  | { kind: "labelResize"; id: string; dw: number; dh: number }
  | { kind: "labelMenu"; id: string; action: "reset" | "wrap" }
  | { kind: "inlineRename"; id: string; text: string; commit: boolean }
  | { kind: "property"; field: "name" | "shortName" | "type" | "multiplicity" | "documentation" | "trigger" | "guard" | "effect"; value: string }
  | { kind: "hover"; id?: string }
  | { kind: "labelClick"; id: string }
  | { kind: "wheel"; deltaY: number; ctrl?: boolean }
  | { kind: "focusCanvas"; mouse: boolean }
  | { kind: "flush" };
export interface MNode { id: string; x: number; y: number; w: number; h: number; parent?: string; attachedTo?: string; shape?: string; text?: string; inherited?: boolean }
export interface Metrics {
  nodes: MNode[]; edges: { id: string; source: string; target: string; points: { x: number; y: number }[]; style?: string; label?: string; order?: number; unordered?: boolean; labelBox?: { x: number; y: number; w: number; h: number }; labelLines?: string[]; labelLaidOut?: boolean }[];
  overlaps: number; overflows: number; outsideParent: number; nodesOverCompartments: number; diagonalSegments: number; edgesThroughEndNodes: number; labelsOverEndNodes: number; labelsOnOwnEdge: number; portsOffBorder: number; labelsOverNodes: number; labelsOverLabels: number; edgeOverlaps: number; userLabelsOverNodes: number; userLabelsOffCanvas: number;
  selected: string[]; menu: string[]; selectedNamed: number; handles: number; routeHandles: number; labelHandles: number; focusable: boolean; zoom: number;
  view: { x: number; y: number; k: number }; canvas: { w: number; h: number }; highlights: number; staleDraws: number; focusOutline: boolean;
  inheritedNodes: number; palette: string[]; tool?: string; inlineEditor: boolean; theme: string;
  properties: { visible: boolean; id?: string; kind?: string; qualifiedName?: string; fields: Record<string, { value: string; disabled: boolean }>; note?: string };
}

type Test = [name: string, fn: () => Promise<void>];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean | Promise<boolean>, ms: number, what: string): Promise<void> {
  const end = performance.now() + ms;
  while (!(await cond())) {
    if (performance.now() > end) assert.fail(`timed out waiting for: ${what}`);
    await sleep(25);
  }
}

export async function run(): Promise<void> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === "sysml-editor");
  assert.ok(ext, "extension is installed in the development host");
  const norm = (p: string) => path.resolve(p).toLowerCase();
  const insideDir = process.env.SYSML_EXPECT_EXTENSIONS_DIR;
  const repoRoot = process.env.SYSML_EXPECT_EXTENSION_PATH;
  if (insideDir) {
    // Run against the installed .vsix: must never silently test the working tree.
    assert.ok((norm(ext.extensionPath) + path.sep).startsWith(norm(insideDir) + path.sep), `extension ${ext.extensionPath} is inside the installed-extensions dir ${insideDir}`);
  } else {
    assert.ok(repoRoot, "SYSML_EXPECT_EXTENSION_PATH is set by runTest");
    assert.strictEqual(norm(ext.extensionPath), norm(repoRoot), "normal run loads the extension from the repository root");
  }
  const api = (await ext.activate()) as TestApi;
  assert.strictEqual(ext.isActive, true, "extension activated");
  await api.model.ready;
  // The Elements view is the default; the suites below read the top-level elements of the workspace files through it (see elementRoots).
  const defaultFilter = api.provider.filter;

  const ix = api.model.index;
  const labelOf = (n: ModelNode) => String(api.provider.getTreeItem(n).label);
  const labels = (nodes: ModelNode[]) => nodes.map(labelOf);
  const rootOf = async (label: string) => {
    const n = (await elementRoots(api)).find((r) => labelOf(r) === label);
    assert.ok(n, `root ${label}`);
    return n;
  };
  const folder = vscode.workspace.workspaceFolders![0]!.uri;
  const vehicleUri = vscode.Uri.joinPath(folder, "vehicle.sysml");

  const artifactDir = process.env.SYSML_TEST_ARTIFACTS ?? path.join(process.env.SYSML_EXPECT_EXTENSION_PATH ?? os.tmpdir(), "out", "test-artifacts");
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const diagramUri = (name: string) => vscode.Uri.joinPath(folder, name);
  const bytesOf = (name: string) => readFileSync(diagramUri(name).fsPath);
  const byId = (m: Metrics) => new Map(m.nodes.map((n) => [n.id, n] as const));
  const sorted = (xs: string[]) => [...xs].sort();

  async function renders(file: string, ids: string[], edges: string[]): Promise<Metrics> {
    const uri = diagramUri(file);
    await api.diagram.open(uri);
    const m = await api.diagram.metrics(uri);
    assert.deepStrictEqual(sorted(m.nodes.map((n) => n.id)), sorted(ids), `${file}: node ids`);
    assert.deepStrictEqual(sorted(m.edges.map((e) => e.id)), sorted(edges), `${file}: edge ids`);
    assert.deepStrictEqual(api.diagram.errors(), [], "no webview errors");
    for (const n of m.nodes) assert.ok([n.x, n.y, n.w, n.h].every(Number.isFinite) && n.w > 0 && n.h > 0, `${file}: ${n.id} has finite geometry`);
    assert.strictEqual(m.overflows, 0, `${file}: text overflows its box`);
    assert.strictEqual(m.outsideParent, 0, `${file}: no child is drawn outside its parent`);
    assert.strictEqual(m.nodesOverCompartments, 0, `${file}: no child covers its parent's header or compartments`);
    assert.strictEqual(m.labelsOnOwnEdge, 0, `${file}: no edge label sits on its own edge`);
    assert.strictEqual(m.labelsOverNodes, 0, `${file}: no edge label touches a node`);
    assert.strictEqual(m.labelsOverLabels, 0, `${file}: no edge labels overlap`);
    assert.strictEqual(m.edgeOverlaps, 0, `${file}: no edge runs on top of another`);
    const png = Buffer.from(await api.diagram.png(uri), "base64");
    assert.deepStrictEqual([...png.subarray(0, 8)], PNG_SIGNATURE, `${file}: PNG signature`);
    assert.ok(png.length > 2048, `${file}: PNG is ${png.length} bytes`);
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(path.join(artifactDir, `diagram-${file.replace(/\.sysmld$/, "")}.png`), png);
    return m;
  }

  /** Distance from the centre of a box to the outline of a rectangle. */
  const distToBorder = (b: MNode, o: MNode) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dx = Math.max(o.x - cx, 0, cx - (o.x + o.w));
    const dy = Math.max(o.y - cy, 0, cy - (o.y + o.h));
    if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
    return Math.min(cx - o.x, o.x + o.w - cx, cy - o.y, o.y + o.h - cy);
  };

  /** Dirty state of the tab showing a diagram, as VS Code reports it. */
  const tabDirty = (uri: vscode.Uri): boolean | undefined => {
    for (const g of vscode.window.tabGroups.all)
      for (const t of g.tabs) if (t.input instanceof vscode.TabInputCustom && t.input.uri.toString() === uri.toString()) return t.isDirty;
    return undefined;
  };
  const eventually = async (fn: () => Promise<void>, what: string, ms = 15000): Promise<void> => {
    const end = performance.now() + ms; // monotonic: the wall clock of a WSL machine can jump by an hour mid-run
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (performance.now() > end) throw new Error(`timed out waiting for: ${what}: ${e instanceof Error ? e.message : String(e)}`);
        await sleep(100);
      }
    }
  };

  const diagramTests = (): Test[] => [
    ["a General View with stored positions renders in the custom editor and keeps its positions exactly", async () => {
      const m = await renders("ports-general.sysmld", ["n1", "n2", "n3", "n4", "n5"], ["d:composition:n4:n5", "d:typing:n5:n2"]);
      const n = byId(m);
      assert.deepStrictEqual([n.get("n1")!.x, n.get("n1")!.y], [520, 40]);
      assert.deepStrictEqual([n.get("n2")!.x, n.get("n2")!.y], [40, 260]);
      assert.deepStrictEqual([n.get("n3")!.x, n.get("n3")!.y], [300, 260]);
      assert.deepStrictEqual([n.get("n4")!.x, n.get("n4")!.y], [40, 40]);
      assert.ok(n.get("n4")!.w >= 220 && n.get("n4")!.h >= 150, "stored size is a minimum");
      assert.strictEqual(m.overlaps, 0);
      assert.strictEqual(api.diagram.state(diagramUri("ports-general.sysmld")).dirty, false, "nothing to lay out, so not dirty");
    }],
    ["opening and saving an untouched canonical diagram leaves the file byte-identical", async () => {
      const before = bytesOf("ports-general.sysmld");
      await api.diagram.open(diagramUri("ports-general.sysmld"));
      await api.diagram.save(diagramUri("ports-general.sysmld"));
      assert.ok(before.equals(bytesOf("ports-general.sysmld")));
    }],
    ["a General View without positions is laid out in memory: not dirty, positions available, file untouched until an explicit save", async () => {
      const file = "ports-general-auto.sysmld";
      const uri = diagramUri(file);
      const before = bytesOf(file);
      const m = await renders(file, ["n1", "n2", "n3", "n4", "n5"], ["d:composition:n4:n5", "d:typing:n5:n2"]);
      assert.strictEqual(m.overlaps, 0, "no sibling overlaps");
      await waitFor(() => api.diagram.state(uri).doc!.nodes.every((n) => n.x !== undefined && n.y !== undefined && n.w !== undefined), 5000, "positions held in memory");
      const st = api.diagram.state(uri);
      assert.strictEqual(st.errorPage, false);
      assert.strictEqual(st.dirty, false, "automatic layout is not an unsaved change");
      assert.strictEqual(tabDirty(uri), false, "the tab is not dirty");
      assert.ok(before.equals(bytesOf(file)), "the file on disk is unchanged");
      await api.diagram.save(uri);
      const saved = JSON.parse(readFileSync(uri.fsPath, "utf8")) as { nodes: { x?: number; y?: number }[] };
      assert.ok(saved.nodes.every((n) => typeof n.x === "number" && typeof n.y === "number"), "an explicit save writes the positions");
      writeFileSync(uri.fsPath, before);
    }],
    ["an Interconnection View nests parts, puts ports on their owner's border and connects ports", async () => {
      const m = await renders("drivetrain-interconnection.sysmld", ["n0", "n1", "n2", "n3", "n4", "n5"], ["e1"]);
      const n = byId(m);
      assert.strictEqual(m.overlaps, 0);
      for (const c of m.nodes.filter((x) => x.parent !== undefined)) {
        const p = n.get(c.parent!)!;
        assert.ok(c.x >= p.x && c.y >= p.y && c.x + c.w <= p.x + p.w && c.y + c.h <= p.y + p.h, `${c.id} lies inside ${p.id}`);
      }
      const ports = m.nodes.filter((x) => x.attachedTo !== undefined);
      assert.deepStrictEqual(sorted(ports.map((p) => p.id)), ["n3", "n4", "n5"]);
      for (const p of ports) assert.ok(distToBorder(p, n.get(p.attachedTo!)!) <= 2, `port ${p.id} is on the border of ${p.attachedTo}`);
      for (const e of m.edges) assert.ok(n.has(e.source) && n.has(e.target), `edge ${e.id} endpoints are on the diagram`);
      assert.deepStrictEqual(m.edges.map((e) => [e.source, e.target]), [["n3", "n4"]], "the connection joins the two port nodes");
    }],
    ["a .sysmld with invalid JSON shows the error page and the file is unchanged", async () => {
      const uri = diagramUri("invalid.sysmld");
      const before = bytesOf("invalid.sysmld");
      await api.diagram.open(uri);
      const st = api.diagram.state(uri);
      assert.strictEqual(st.errorPage, true);
      assert.ok(st.problems.length > 0);
      await assert.rejects(api.diagram.save(uri), /cannot be saved/, "saving a file that did not parse fails visibly");
      assert.ok(before.equals(bytesOf("invalid.sysmld")), "file content is never lost");
    }],
    ["save, undo, redo and revert through VS Code's own commands keep the dirty state and the file truthful", async () => {
      const file = "tmp-edit.sysmld";
      copyFileSync(diagramUri("ports-general.sysmld").fsPath, diagramUri(file).fsPath);
      const uri = diagramUri(file);
      const x = () => api.diagram.state(uri).doc!.nodes.find((n) => n.id === "n1")!.x;
      const onDisk = () => (JSON.parse(readFileSync(uri.fsPath, "utf8")) as { nodes: { id: string; x: number }[] }).nodes.find((n) => n.id === "n1")!.x;
      try {
        await api.diagram.open(uri);
        assert.strictEqual(x(), 520);
        api.diagram.edit(uri, [{ id: "n1", x: 600, y: 60 }]);
        await waitFor(() => tabDirty(uri) === true, 5000, "the edit dirties the tab");
        assert.strictEqual(onDisk(), 520, "nothing is written before save");
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitFor(() => tabDirty(uri) === false, 5000, "save cleans the tab");
        assert.strictEqual(onDisk(), 600, "save wrote the move");
        await vscode.commands.executeCommand("undo");
        await waitFor(() => tabDirty(uri) === true, 5000, "undo after save dirties the tab");
        assert.strictEqual(x(), 520);
        assert.strictEqual(onDisk(), 600);
        await vscode.commands.executeCommand("redo");
        await waitFor(() => tabDirty(uri) === false, 5000, "redo returns to the saved state");
        assert.strictEqual(x(), 600);
        await vscode.commands.executeCommand("undo");
        await waitFor(() => tabDirty(uri) === true, 5000, "dirty again");
        await vscode.commands.executeCommand("workbench.action.files.revert");
        await waitFor(() => tabDirty(uri) === false, 5000, "revert cleans the tab");
        // The tab can turn clean before the provider has finished re-reading the file.
        await waitFor(() => x() === 600, 5000, "revert shows the file on disk");
        await vscode.commands.executeCommand("undo");
        await sleep(300);
        assert.strictEqual(x(), 600, "undo after revert does nothing");
        assert.strictEqual(api.diagram.state(uri).dirty, false);
        assert.strictEqual(onDisk(), 600);
      } finally {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        rmSync(uri.fsPath, { force: true });
      }
    }],
    ["an external change to a clean diagram reloads it", async () => {
      const file = "tmp-external.sysmld";
      copyFileSync(diagramUri("ports-general.sysmld").fsPath, diagramUri(file).fsPath);
      const uri = diagramUri(file);
      try {
        await api.diagram.open(uri);
        const doc = JSON.parse(readFileSync(uri.fsPath, "utf8")) as { nodes: { id: string; x: number }[] };
        doc.nodes.find((n) => n.id === "n1")!.x = 700;
        writeFileSync(uri.fsPath, JSON.stringify(doc, null, 2) + "\n");
        await waitFor(() => api.diagram.state(uri).doc?.nodes.find((n) => n.id === "n1")?.x === 700, 15000, "reloaded from disk");
        assert.strictEqual(api.diagram.state(uri).dirty, false);
        await eventually(async () => assert.strictEqual(byId(await api.diagram.metrics(uri)).get("n1")!.x, 700), "the webview shows the new position");
      } finally {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        rmSync(uri.fsPath, { force: true });
      }
    }],
    ["an invalid file fixed on disk shows the diagram, and a valid file made invalid shows the problem and cannot be saved", async () => {
      const file = "tmp-switch.sysmld";
      const uri = diagramUri(file);
      const valid = readFileSync(diagramUri("ports-general.sysmld").fsPath);
      writeFileSync(uri.fsPath, readFileSync(diagramUri("invalid.sysmld").fsPath));
      try {
        await api.diagram.open(uri);
        assert.strictEqual(api.diagram.state(uri).errorPage, true);
        writeFileSync(uri.fsPath, valid);
        await waitFor(() => api.diagram.state(uri).errorPage === false, 15000, "diagram state after the fix");
        await eventually(async () => assert.strictEqual((await api.diagram.metrics(uri)).nodes.length, 5), "the diagram page replaced the error page");
        writeFileSync(uri.fsPath, "{ not json");
        await waitFor(() => api.diagram.state(uri).errorPage === true, 15000, "error state after breaking it");
        assert.ok(api.diagram.state(uri).problems.length > 0);
        await assert.rejects(api.diagram.save(uri), /cannot be saved/);
        assert.strictEqual(readFileSync(uri.fsPath, "utf8"), "{ not json", "the file is not overwritten");
      } finally {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        rmSync(uri.fsPath, { force: true });
      }
    }],
  ];

  const TOOL_COUNT = 19; // four model read tools, seven diagram tools (one reads the editor context), six model edit tools (one sets a transition) and two requirements tools

  const tests: Test[] = [
    ["the tree starts in the Elements view", async () => {
      assert.strictEqual(defaultFilter, "elements");
    }],
    ["the top-level elements of the workspace files are the packages, not the library", async () => {
      assert.deepStrictEqual(labels(await elementRoots(api)).sort(), ["Delivery", "Design", "Lamp", "Mobility", "Notes", "Ordering", "Ports", "Requirements", "Vehicle", "broken.sysml"]);
      assert.ok(ix.uris().some((u) => ix.isReadOnly(u)), "library is loaded");
      const lib = labels(await elementRoots(api));
      assert.ok(!lib.includes("ScalarValues") && !lib.includes("ISQ"), "library packages are not roots");
    }],
    ["files under sysml.exclude are not indexed", async () => {
      assert.ok(!ix.uris().some((u) => u.includes("/ignored/")), "ignored/ is not indexed");
      assert.ok(!labels(await elementRoots(api)).includes("Ignored"));
    }],
    ["a file that never parsed cleanly shows an error node", async () => {
      const node = await rootOf("broken.sysml");
      const item = api.provider.getTreeItem(node);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "error");
      assert.strictEqual(item.description, "syntax error");
      assert.match(String(item.tooltip), /line \d+, column \d+/);
      await vscode.commands.executeCommand("sysml.goToDefinition", node);
      const ed = vscode.window.activeTextEditor!;
      assert.ok(ed.document.uri.path.endsWith("/broken.sysml"));
      assert.ok(ed.selection.active.line >= 0);
    }],
    ["children of a part def and typed usage presentation", async () => {
      const vehicle = await rootOf("Vehicle");
      assert.deepStrictEqual(labels(api.provider.getChildren(vehicle)), ["Engine", "Car", "Wheel"]);
      const car = api.provider.getChildren(vehicle)[1]!;
      const kids = api.provider.getChildren(car);
      assert.deepStrictEqual(labels(kids), ["engine", "wheels"]);
      const item = api.provider.getTreeItem(kids[0]!);
      assert.strictEqual(item.label, "engine");
      assert.ok(String(item.description).includes("Engine"));
      assert.strictEqual(item.id, kids[0]!.id);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "symbol-field");
      assert.strictEqual(api.provider.getTreeItem(kids[1]!).description, ": Wheel [4]");
      assert.deepStrictEqual(labels(api.provider.getChildren(await rootOf("Notes"))), ["Mass"]);
    }],
    ["unsaved edit adds a node within one second and fires a targeted refresh", async () => {
      const doc = await vscode.workspace.openTextDocument(vehicleUri);
      const fired: unknown[] = [];
      const sub = api.provider.onDidChangeTreeData((e) => fired.push(e));
      // VS Code only refreshes the nodes it was handed: read the tree down to the file's elements the way it does.
      const vehicle = (await elementRoots(api, true)).find((r) => labelOf(r) === "Vehicle")!;
      api.provider.viewGetChildren(vehicle);
      const before = api.provider.getChildren(await rootOf("Vehicle")).map((n) => n.id);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(vehicleUri, new vscode.Position(1, 0), "  part def Gearbox;\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      assert.ok(doc.isDirty, "edit is unsaved");
      const t0 = performance.now();
      await waitFor(async () => labels(api.provider.getChildren(await rootOf("Vehicle"))).includes("Gearbox"), 1000, "Gearbox in tree");
      assert.ok(performance.now() - t0 < 1000);
      const after = api.provider.getChildren(await rootOf("Vehicle")).map((n) => n.id);
      for (const id of before) assert.ok(after.includes(id), "existing node ids are stable");
      assert.ok(fired.length > 0, "tree data change fired");
      assert.ok(fired.every((e) => e !== undefined), "targeted, not a full refresh");
      sub.dispose();
    }],
    ["syntax error keeps old children and sets the error state", async () => {
      const kidsBefore = labels(api.provider.getChildren(await rootOf("Vehicle")));
      const edit = new vscode.WorkspaceEdit();
      edit.insert(vehicleUri, new vscode.Position(1, 0), "  part def Broken\n");
      await vscode.workspace.applyEdit(edit);
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 0) > 0, 1500, "error recorded");
      const root = await rootOf("Vehicle");
      assert.deepStrictEqual(labels(api.provider.getChildren(root)), kidsBefore);
      const item = api.provider.getTreeItem(root);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "error");
      assert.match(String(item.description), /syntax error/);
      // The first report may be the provisional fast-path error; wait for the parse worker's details.
      await waitFor(() => ix.getDocument(vehicleUri.toString())?.detailsPending === false, 30000, "error details from the parse worker");
      const precise = String(api.provider.getTreeItem(await rootOf("Vehicle")).tooltip);
      assert.match(precise, /line 3, column 3: mismatched input 'part'/);
      assert.doesNotMatch(precise, /details pending/);
      // Undo the broken text so later tests see a clean model.
      const fix = new vscode.WorkspaceEdit();
      fix.delete(vehicleUri, new vscode.Range(1, 0, 2, 0));
      await vscode.workspace.applyEdit(fix);
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 1) === 0, 1500, "error cleared");
    }],
    ["sysml.goToDefinition selects the name range", async () => {
      const car = api.provider.getChildren(await rootOf("Vehicle")).find((n) => labelOf(n) === "Car")!;
      const item = api.provider.getTreeItem(car);
      assert.strictEqual(item.command?.command, "sysml.goToDefinition");
      await vscode.commands.executeCommand("sysml.goToDefinition", car);
      const ed = vscode.window.activeTextEditor!;
      assert.strictEqual(ed.document.uri.toString(), vehicleUri.toString());
      assert.strictEqual(ed.document.getText(ed.selection), "Car");
    }],
    ["cursor on a declaration reveals the tree node", async () => {
      const car = api.provider.getChildren(await rootOf("Vehicle")).find((n) => labelOf(n) === "Car")!;
      const engine = api.provider.getChildren(car)[0]!;
      const calls: ModelNode[] = [];
      const view = api.view;
      const orig = view.reveal.bind(view);
      (view as { reveal: typeof view.reveal }).reveal = (n, o) => { calls.push(n); return orig(n, o); };
      try {
        await vscode.commands.executeCommand("sysmlModel.focus");
        await waitFor(() => view.visible, 3000, "view visible");
        const ed = vscode.window.activeTextEditor!;
        const line = ed.document.getText().split("\n").findIndex((l) => l.includes("part engine"));
        ed.selection = new vscode.Selection(line, 11, line, 11);
        await waitFor(() => calls.some((c) => c.id === engine.id), 2000, "reveal of engine");
      } finally {
        (view as { reveal: typeof view.reveal }).reveal = orig;
      }
    }],
    ["channel contract: every tool gives identical text over Language Model Tools and MCP", async () => {
      await api.agent.apply();
      assert.ok(api.agent.mcpEndpoint(), "MCP server is running under the default channels");
      const lm = async (name: string, input: object) => (await viaLm(name, input)).text;
      await eventually(async () => assert.ok((await lm("sysml_list_diagrams", {})).includes("ports-general.sysmld")), "the diagram index is built");
      const calls: Array<[string, object]> = [
        ["sysml_list_files", {}],
        ["sysml_get_element_tree", { depth: 1 }],
        ["sysml_get_element", { qualifiedName: "Vehicle::Car" }],
        ["sysml_validate", {}],
        ["sysml_list_diagrams", {}],
        ["sysml_read_diagram", { path: "ports-general.sysmld" }],
        ["sysml_read_diagram", { path: "ports-general.sysmld", includeImage: true }],
        ["sysml_read_diagram", { path: "drivetrain-interconnection.sysmld" }],
        ["sysml_read_diagram", { path: "requirements.sysmld" }],
      ];
      for (const [name, input] of calls) {
        const a = await viaLm(name, input);
        const b = await viaMcp(api, name, input);
        assert.strictEqual(b.isError, false, `${name} over MCP`);
        assert.strictEqual(a.text, b.text, `${name}: identical results`);
        JSON.parse(a.text);
        const wantImage = (input as { includeImage?: boolean }).includeImage === true;
        assert.strictEqual(a.images.length, wantImage ? 1 : 0, `${name}: images over Language Model Tools`);
        assert.strictEqual(b.images.length, wantImage ? 1 : 0, `${name}: images over MCP`);
        for (const img of [...a.images, ...b.images]) assert.ok(img.mimeType === "image/png" && isPng(img.data) && img.data.length > 2048, `${name}: a PNG image`);
      }
      // the write tools give the same error text on both channels
      const badCall: [string, object] = ["sysml_add_to_diagram", { path: "missing.sysmld", elements: ["Vehicle::Car"] }];
      const ea = await viaLm(...badCall);
      const eb = await viaMcp(api, ...badCall);
      assert.strictEqual(eb.isError, true);
      assert.strictEqual(ea.text, eb.text, "identical error text");
      const car = JSON.parse(await lm("sysml_get_element", { qualifiedName: "Vehicle::Car" }));
      assert.ok(car.elements.length > 0, "in-editor agent reads an element");
    }],
    ["channel contract: both channels see unsaved edits", async () => {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(vehicleUri, new vscode.Position(1, 0), "  part def UnsavedClutch;\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      const doc = await vscode.workspace.openTextDocument(vehicleUri);
      assert.ok(doc.isDirty, "edit is unsaved");
      await waitFor(async () => labels(api.provider.getChildren(await rootOf("Vehicle"))).includes("UnsavedClutch"), 1500, "index sees the edit");
      const input = { qualifiedName: "Vehicle::UnsavedClutch" };
      const r = await vscode.lm.invokeTool("sysml_get_element", { toolInvocationToken: undefined, input });
      const viaLm = r.content.map((p) => (p as vscode.LanguageModelTextPart).value).join("");
      const viaMcp = await api.agent.testCallToolOverMcp("sysml_get_element", input);
      assert.ok(viaLm.includes("UnsavedClutch"), "LM tools see unsaved content");
      assert.ok(viaMcp.text.includes("UnsavedClutch"), "MCP sees unsaved content");
      assert.strictEqual(viaLm, viaMcp.text);
    }],
    ["end to end: tree, both tool channels and the document agree through edit, syntax error and fix", async () => {
      await api.agent.apply();
      assert.ok(api.agent.mcpEndpoint(), "MCP server is running");
      const lm = async (name: string, input: object) => {
        const r = await vscode.lm.invokeTool(name, { toolInvocationToken: undefined, input });
        return r.content.map((p) => (p as vscode.LanguageModelTextPart).value).join("");
      };
      const mcp = async (name: string, input: object) => {
        const r = await api.agent.testCallToolOverMcp(name, input);
        assert.strictEqual(r.isError, false, `${name} over MCP: ${r.text}`);
        return r.text;
      };
      const both = async (name: string, input: object) => {
        // The two calls are sequential, and the model can change between them (for example when the
        // parse worker's error details arrive). Compare again until two consecutive calls agree.
        let a = await lm(name, input);
        let b = await mcp(name, input);
        for (let i = 0; i < 5 && a !== b; i++) {
          await sleep(500);
          a = await lm(name, input);
          b = await mcp(name, input);
        }
        assert.strictEqual(a, b, `${name}: identical over both channels`);
        return JSON.parse(a);
      };
      const doc = await vscode.workspace.openTextDocument(vehicleUri);

      // (1) the tree as the provider presents it
      assert.ok(labels(await elementRoots(api)).includes("Vehicle"));
      assert.ok(!labels(api.provider.getChildren(await rootOf("Vehicle"))).includes("Trailer"));

      // (2) an unsaved edit adds a part def
      const add = new vscode.WorkspaceEdit();
      add.insert(vehicleUri, new vscode.Position(1, 0), "  part def Trailer;\n");
      assert.ok(await vscode.workspace.applyEdit(add));
      assert.ok(doc.isDirty, "edit is unsaved");
      await waitFor(async () => labels(api.provider.getChildren(await rootOf("Vehicle"))).includes("Trailer"), 2000, "Trailer in the tree");

      // (3) tree, both channels and document text agree
      const treeJson = await both("sysml_get_element_tree", { root: "Vehicle", depth: 2 });
      const names = (treeJson.nodes[0].children as { name: string }[]).map((c) => c.name);
      assert.ok(names.includes("Trailer"), `tool tree has Trailer: ${names}`);
      assert.deepStrictEqual(
        names.slice().sort(),
        labels(api.provider.getChildren(await rootOf("Vehicle"))).sort(),
        "tool tree and view tree list the same children",
      );
      const el = (await both("sysml_get_element", { qualifiedName: "Vehicle::Trailer" })).elements[0];
      assert.strictEqual(el.name, "Trailer");
      assert.match(String(el.file), /vehicle\.sysml$/);
      assert.ok(doc.lineAt(el.startLine - 1).text.includes("part def Trailer;"), "element line points at the declaration in the document");
      assert.ok(doc.getText().includes("part def Trailer;"));

      // (4) a syntax error: validate reports it on both channels, the tree keeps the previous contents
      const brokenLine = 3; // 1-based line of the text inserted below
      const bad = new vscode.WorkspaceEdit();
      bad.insert(vehicleUri, new vscode.Position(brokenLine - 1, 0), "  part def 123;\n");
      assert.ok(await vscode.workspace.applyEdit(bad));
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 0) > 0, 2000, "error recorded");
      const broken = await both("sysml_validate", { file: "vehicle.sysml" });
      const syntax = (broken.problems as { file: string; line: number; severity: string }[]).filter((p) => p.severity === "error");
      assert.ok(syntax.length > 0, "validate reports the syntax error");
      assert.ok(syntax.some((p) => p.line === brokenLine && /vehicle\.sysml$/.test(p.file)), `error on line ${brokenLine}: ${JSON.stringify(syntax)}`);
      assert.ok(doc.lineAt(brokenLine - 1).text.includes("123"), "the reported line holds the broken text");
      assert.ok(labels(api.provider.getChildren(await rootOf("Vehicle"))).includes("Trailer"), "tree keeps the previous contents");
      const keep = await both("sysml_get_element_tree", { root: "Vehicle", depth: 2 });
      assert.ok((keep.nodes[0].children as { name: string }[]).some((c) => c.name === "Trailer"), "tool tree keeps the previous contents");

      // (5) fix it: validate is clean for the file
      const fix = new vscode.WorkspaceEdit();
      fix.delete(vehicleUri, new vscode.Range(brokenLine - 1, 0, brokenLine, 0));
      assert.ok(await vscode.workspace.applyEdit(fix));
      await waitFor(() => (ix.getDocument(vehicleUri.toString())?.errors.length ?? 1) === 0, 2000, "error cleared");
      const clean = await both("sysml_validate", { file: "vehicle.sysml" });
      assert.deepStrictEqual(clean.problems, []);
    }],
    ["MCP rejects a wrong token; bridge reports no server for an unknown workspace", async () => {
      const ep = api.agent.mcpEndpoint()!;
      const res = await fetch(ep.url, { method: "POST", headers: { Authorization: "Bearer wrong", "content-type": "application/json" }, body: "{}" });
      assert.strictEqual(res.status, 401);
      const bridge = path.join(ext.extensionPath, "dist", "mcp-bridge.js");
      const r = spawnSync("node", [bridge, "--workspace", path.join(os.tmpdir(), "sysml-no-such-workspace")], { encoding: "utf8" });
      assert.strictEqual(r.status, 1);
      assert.strictEqual(r.stderr.trim(), "VS Code must be open on this workspace");
    }],
    ["sysml.agent.channels switches channels without a reload", async () => {
      const cfg = vscode.workspace.getConfiguration();
      const set = async (v: string | undefined) => {
        await cfg.update("sysml.agent.channels", v, vscode.ConfigurationTarget.Workspace);
        await api.agent.apply();
      };
      const lmNames = () => vscode.lm.tools.map((t) => t.name).filter((n) => n.startsWith("sysml_")).sort();
      const listing = async (expected: number) => {
        try {
          await waitFor(() => lmNames().length === expected, 3000, `${expected} sysml_ tools in vscode.lm.tools`);
        } catch (e) {
          throw new Error(`assertion A (vscode.lm.tools listing) failed: expected ${expected}, saw [${lmNames()}]; ${e}`);
        }
      };
      const invoke = async (shouldWork: boolean) => {
        let err: unknown;
        try {
          await vscode.lm.invokeTool("sysml_list_files", { toolInvocationToken: undefined, input: {} });
        } catch (e) {
          err = e;
        }
        if (shouldWork && err) throw new Error(`assertion B (invokeTool) failed: expected success, got ${err}`);
        if (!shouldWork && !err) throw new Error("assertion B (invokeTool) failed: expected rejection, but it succeeded");
      };
      try {
        await set("mcp");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: false, mcpServer: true, registerWithVsCode: true });
        // vscode.lm.tools lists every tool declared in the manifest, whatever the `when` clause says;
        // the clause only governs what VS Code's chat offers. So in mcp mode check the call fails.
        await invoke(false);
        assert.ok(api.agent.mcpEndpoint());
        await set("lmTools");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: true, mcpServer: false, registerWithVsCode: false });
        await listing(TOOL_COUNT);
        await invoke(true);
        assert.strictEqual(api.agent.mcpEndpoint(), undefined);
        await set("both");
        assert.deepStrictEqual(api.agent.currentPlan(), { lmTools: true, mcpServer: true, registerWithVsCode: false });
        await listing(TOOL_COUNT);
        await invoke(true);
        assert.ok(api.agent.mcpEndpoint());
      } finally {
        await set(undefined);
      }
    }],
    ...diagramTests(),
    ...interactionTests({ api, folder, ext, artifactDir, renders, tabDirty, eventually }),
    ...agentTests({ api, folder, ext, artifactDir, renders, tabDirty, eventually }),
    ...editingTests({ api, folder, ext, artifactDir, renders, tabDirty, eventually }),
    ...requirementsTests({ api, folder, ext, artifactDir, renders, tabDirty, eventually }),
    ...behaviorTests({ api, folder, ext, artifactDir, renders, tabDirty, eventually }),
    ...foldersTests({ api, folder, ext, artifactDir, renders, tabDirty, eventually }),
  ];

  const failures: string[] = [];
  const only = process.env.SYSML_TEST_FILTER ? new RegExp(process.env.SYSML_TEST_FILTER) : undefined;
  for (const [name, fn] of tests) {
    if (only && !only.test(name)) continue;
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (e) {
      failures.push(name);
      console.error(`not ok - ${name}\n${e instanceof Error ? e.stack : String(e)}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} integration test(s) failed: ${failures.join("; ")}`);
}
