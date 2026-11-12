/** Entry point of the diagram webview bundle (`dist/webview/diagram.js`). */
import ELK from "elkjs/lib/elk.bundled.js";
import type { DiagramEdit, HostToWebview, NodeBox, PngTheme, WebviewToHost } from "../../diagram/protocol.js";
import type { ViewModel } from "../../diagram/view-model.js";
import { FONT_FAMILY, FONT_SIZE, SMALL_SIZE, type Measure, type TextStyle } from "./geometry.js";
import { layoutDiagram, type ElkLike } from "./layout.js";
import { SvgRenderer, type View } from "./renderer.js";

interface VsCodeApi {
  postMessage(m: WebviewToHost): void;
  getState(): { view?: View } | undefined;
  setState(s: { view?: View }): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const post = (m: WebviewToHost) => vscode.postMessage(m);

const ctx = document.createElement("canvas").getContext("2d")!;
const measure: Measure = (text: string, style: TextStyle) => {
  const size = style === "small" ? SMALL_SIZE : FONT_SIZE;
  ctx.font = `${style === "italic" ? "italic " : ""}${style === "bold" ? "bold " : ""}${size}px ${FONT_FAMILY}`;
  return ctx.measureText(text).width;
};

const elk = new ELK() as unknown as ElkLike;
const saved = vscode.getState();
const renderer = new SvgRenderer(document.body, measure, {
  onView: (view) => vscode.setState({ view }),
  onEdit: (edit: DiagramEdit) => post({ type: "edit", edit }),
  onSelection: (ids) => post({ type: "selection", ids }),
  onRelink: (id) => post({ type: "relink", id }),
  onDrop: (names) => post({ type: "dropElements", names }),
});
let first = true;
let queue: Promise<void> = Promise.resolve();
let current: ViewModel | undefined;
/** Where every node was last drawn (relative to its parent): a node the host has not stored a position for yet keeps it across re-renders. */
let lastBoxes = new Map<string, { x: number; y: number }>();

function withKnownPositions(vm: ViewModel): ViewModel {
  return {
    ...vm,
    nodes: vm.nodes.map((n) => {
      const k = lastBoxes.get(n.id);
      if (!k || n.geometry?.x !== undefined || n.geometry?.y !== undefined) return n;
      return { ...n, geometry: { ...n.geometry, x: k.x, y: k.y } };
    }),
  };
}

async function render(vm: ViewModel): Promise<void> {
  renderer.ia.flushNudge();
  current = vm;
  const layout = await layoutDiagram(withKnownPositions(vm), elk, measure);
  renderer.render(vm, layout);
  lastBoxes = new Map([...layout.boxes].map(([id, b]) => [id, { x: b.x, y: b.y }]));
  if (first) {
    first = false;
    if (saved?.view) renderer.setView(saved.view);
    else renderer.fit();
  }
  if (layout.placed.size) {
    const nodes: NodeBox[] = [...layout.placed].map((id) => ({ id, ...layout.boxes.get(id)! }));
    const edges = [...layout.routes].filter(([id]) => vm.edges.some((e) => e.id === id && !e.derived)).map(([id, points]) => ({ id, points }));
    post({ type: "layoutChanged", nodes, edges });
  }
}

/** Auto-layout: everything is laid out again, ignoring stored positions and routes, and sent as one edit. */
async function autoLayout(): Promise<void> {
  const vm = current;
  if (!vm) return;
  const stripped: ViewModel = {
    ...vm,
    nodes: vm.nodes.map(({ geometry: _g, ...n }) => n),
    edges: vm.edges.map(({ points: _p, ...e }) => e),
  };
  const layout = await layoutDiagram(stripped, elk, measure);
  const boxes: NodeBox[] = vm.nodes.flatMap((n) => (layout.boxes.has(n.id) ? [{ id: n.id, ...layout.boxes.get(n.id)! }] : []));
  const edges = vm.edges.filter((e) => !e.derived && layout.routes.has(e.id)).map((e) => ({ id: e.id, points: layout.routes.get(e.id)! }));
  post({ type: "edit", edit: { kind: "autoLayout", boxes, edges } });
}

function toolbar(): void {
  const bar = document.createElement("div");
  bar.className = "toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Diagram");
  const add = (label: string, title: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", () => { fn(); renderer.svg.focus({ preventScroll: true }); });
    bar.append(b);
  };
  add("Fit", "Fit diagram to window", () => renderer.fit());
  add("+", "Zoom in", () => renderer.zoomBy(1.25));
  add("\u2212", "Zoom out", () => renderer.zoomBy(0.8));
  add("Auto-layout", "Auto-layout: arrange all elements again", () => void autoLayout().catch(fail));
  add("Show Element\u2026", "Show an existing model element on this diagram", () => post({ type: "showElement" }));
  document.body.append(bar);
}
toolbar();

const MAX_SIDE = 16_000;
const MAX_PIXELS = 16_000_000;

async function exportPng(theme: PngTheme): Promise<string> {
  const svg = renderer.toSvgString(theme);
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = Number(m?.[1] ?? 800);
  const h = Number(m?.[2] ?? 600);
  // Cap by width, height and total pixels so the canvas is never too large to encode.
  const scale = Math.min(2, 1600 / w, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_PIXELS / (w * h)));
  const cw = Math.max(1, Math.floor(w * scale));
  const ch = Math.max(1, Math.floor(h * scale));
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("PNG export failed: no canvas context");
  // The exported SVG paints its own background; this only fills any rounding gap.
  c.fillStyle = theme === "light" ? "#ffffff" : "#1e1e1e";
  c.fillRect(0, 0, cw, ch);
  c.drawImage(img, 0, 0, cw, ch);
  const b64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
  if (!b64) throw new Error(`PNG export failed: the ${cw}x${ch} canvas produced no image`);
  return b64;
}

const fail = (e: unknown) => post({ type: "error", message: e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e) });
window.addEventListener("error", (e) => fail(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));

window.addEventListener("message", (ev: MessageEvent<HostToWebview>) => {
  const m = ev.data;
  switch (m.type) {
    case "render":
      queue = queue.then(() => render(m.viewModel)).catch(fail);
      break;
    case "getMetrics":
      queue = queue.then(() => post({ type: "metricsResult", requestId: m.requestId, ...renderer.getMetrics() })).catch(fail);
      break;
    case "exportPng":
      queue = queue
        .then(async () => post({ type: "pngResult", requestId: m.requestId, base64: await exportPng(m.theme) }))
        .catch((e) => post({ type: "pngResult", requestId: m.requestId, base64: "", error: e instanceof Error ? e.message : String(e) }));
      break;
    case "command":
      queue = queue.then(async () => {
        if (m.name === "autoLayout") await autoLayout();
        else if (m.name === "fit") renderer.fit();
        else if (m.name === "zoomIn") renderer.zoomBy(1.25);
        else if (m.name === "zoomOut") renderer.zoomBy(0.8);
        else if (m.name === "selectAll") renderer.selectAll();
      }).catch(fail);
      break;
    case "select":
      queue = queue.then(() => renderer.select(m.ids)).catch(fail);
      break;
    case "testGesture":
      queue = queue
        .then(() => { renderer.testGesture(m.gesture); post({ type: "gestureResult", requestId: m.requestId }); })
        .catch((e) => post({ type: "gestureResult", requestId: m.requestId, error: e instanceof Error ? e.message : String(e) }));
      break;
  }
});
post({ type: "ready" });
