/** Entry point of the diagram webview bundle (`dist/webview/diagram.js`). */
import ELK from "elkjs/lib/elk.bundled.js";
import type { DiagramEdit, HostToWebview, NodeBox, PngTheme, WebviewToHost } from "../../diagram/protocol.js";
import type { ViewModel } from "../../diagram/view-model.js";
import { FONT_FAMILY, FONT_SIZE, SMALL_SIZE, type Measure, type TextStyle } from "./geometry.js";
import { layoutDiagram, type ElkLike } from "./layout.js";
import { layoutSelection } from "./selection-layout.js";
import { SvgRenderer, type View } from "./renderer.js";
import { exportBackground } from "./svg.js";

interface VsCodeApi {
  postMessage(m: WebviewToHost): void;
  getState(): { view?: View } | undefined;
  setState(s: { view?: View }): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const post = (m: WebviewToHost) => vscode.postMessage(m);
const fail = (e: unknown) => post({ type: "error", message: e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e) });
window.addEventListener("error", (e) => fail(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));
// `ready` goes out before anything else can fail: messages are delivered after this script has run, so
// the listener registered below still sees the first render, and an error in set-up is reported rather than silent.
post({ type: "ready" });
let generation: number | undefined;

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
  onEdit: (edit: DiagramEdit) => post({ type: "edit", edit, ...(generation !== undefined ? { generation } : {}) }),
  onSelection: (ids) => post({ type: "selection", ids }),
  onHover: (id) => hoverReport(id),
  onRelink: (id) => post({ type: "relink", id }),
  onDrop: (names) => post({ type: "dropElements", names }),
  onModel: (intent) => post({ type: "model", intent, ...(generation !== undefined ? { generation } : {}) }),
  suggest: (id, query) => new Promise((resolve) => {
    const requestId = ++suggestId;
    suggestions.set(requestId, resolve);
    post({ type: "typeSuggestions", requestId, id, query });
  }),
});
let suggestId = 0;
/** Hover reports are throttled (leading edge, then at most one per 100 ms); the last state always goes out. */
const HOVER_MS = 100;
let hoverSent = Date.now() - HOVER_MS;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoverNow: string | undefined;
function hoverReport(id: string | undefined): void {
  hoverNow = id;
  if (hoverTimer !== undefined) return;
  const wait = Math.max(0, hoverSent + HOVER_MS - Date.now());
  hoverTimer = setTimeout(() => {
    hoverTimer = undefined;
    hoverSent = Date.now();
    post({ type: "hover", ...(hoverNow !== undefined ? { id: hoverNow } : {}) });
  }, wait);
}
const suggestions = new Map<number, (items: { name: string; qualifiedName: string; library: boolean }[]) => void>();
let first = true;
let queue: Promise<void> = Promise.resolve();
let current: ViewModel | undefined;
/** Where every node was last drawn (relative to its parent): a node the host has not stored a position for yet keeps it across re-renders. */
let lastBoxes = new Map<string, { x: number; y: number; w: number; h: number }>();

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

async function render(vm: ViewModel, gen: number): Promise<void> {
  renderer.ia.flushNudge();
  current = vm;
  const layout = await layoutDiagram(withKnownPositions(vm), elk, measure);
  renderer.render(vm, layout);
  generation = gen;
  lastBoxes = new Map([...layout.boxes].map(([id, b]) => [id, { x: b.x, y: b.y, w: b.w, h: b.h }]));
  if (first) {
    first = false;
    if (saved?.view) renderer.setView(saved.view);
    else renderer.fitOnOpen();
  }
  if (layout.placed.size) {
    const nodes: NodeBox[] = [...layout.placed].map((id) => ({ id, ...layout.boxes.get(id)! }));
    const edges = [...layout.routes].filter(([id]) => vm.edges.some((e) => e.id === id && !e.derived)).map(([id, points]) => ({ id, points }));
    post({ type: "layoutChanged", nodes, edges });
  }
}

/** Auto-layout: the selected nodes, or everything when none is selected, are laid out again and sent as one edit. */
async function autoLayout(whole = false): Promise<void> {
  const vm = current;
  if (!vm) return;
  const gen = generation;
  const part = whole ? undefined : await layoutSelection(vm, renderer.ia.selection, lastBoxes, elk, measure);
  if (part) {
    post({ type: "edit", edit: { kind: "autoLayout", boxes: part.boxes, edges: part.edges }, ...(gen !== undefined ? { generation: gen } : {}) });
    return;
  }
  const stripped: ViewModel = {
    ...vm,
    nodes: vm.nodes.map(({ geometry: _g, ...n }) => n),
    edges: vm.edges.map(({ points: _p, ...e }) => e),
  };
  const layout = await layoutDiagram(stripped, elk, measure);
  const boxes: NodeBox[] = vm.nodes.flatMap((n) => (layout.boxes.has(n.id) ? [{ id: n.id, ...layout.boxes.get(n.id)! }] : []));
  const edges = vm.edges.filter((e) => !e.derived && layout.routes.has(e.id)).map((e) => ({ id: e.id, points: layout.routes.get(e.id)! }));
  post({ type: "edit", edit: { kind: "autoLayout", boxes, edges }, ...(gen !== undefined ? { generation: gen } : {}) });
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
  add("Auto-layout", "Auto-layout: arrange the selected elements again (all of them when none is selected)", () => void autoLayout().catch(fail));
  add("Show Element\u2026", "Show an existing model element on this diagram", () => post({ type: "showElement" }));
  document.body.append(bar);
}
toolbar();

const MAX_SIDE = 16_000;
const MAX_PIXELS = 16_000_000;

/** A copy of a DOM subtree with its computed styles inlined, so it draws the same inside an SVG image. */
function styledCopy(src: Element): Element {
  const dst = src.cloneNode(false) as Element;
  const cs = getComputedStyle(src);
  let css = "";
  for (let i = 0; i < cs.length; i++) css += `${cs[i]!}:${cs.getPropertyValue(cs[i]!)};`;
  dst.setAttribute("style", css);
  if (src instanceof HTMLInputElement) dst.setAttribute("value", src.value);
  if (src instanceof HTMLTextAreaElement) dst.textContent = src.value;
  else for (const c of Array.from(src.childNodes)) dst.append(c.nodeType === 1 ? styledCopy(c as Element) : c.cloneNode(true));
  return dst;
}

/** The editor window as an SVG: the drawing and, as foreignObjects, the toolbar, palette and properties panel. */
function windowSvg(theme: PngTheme): { svg: string; width: number; height: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const inner = renderer.toSvgString(theme);
  const m = /width="(\d+)" height="(\d+)"/.exec(inner);
  const dw = Number(m?.[1] ?? 800);
  const dh = Number(m?.[2] ?? 600);
  const left = 150;
  const right = 270;
  const top = 64;
  const k = Math.min(1, (W - left - right - 20) / dw, (H - top - 10) / dh);
  const nested = inner.replace(/width="\d+" height="\d+"/, `x="${left + 10}" y="${top}" width="${Math.round(dw * k)}" height="${Math.round(dh * k)}"`);
  let panels = "";
  for (const sel of [".toolbar", ".palette", ".props"]) {
    const e = document.querySelector(sel);
    if (!e) continue;
    const r = e.getBoundingClientRect();
    const copy = styledCopy(e);
    copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    copy.setAttribute("style", (copy.getAttribute("style") ?? "") + ";position:static;margin:0;top:auto;left:auto;right:auto;");
    panels += `<foreignObject x="${r.left}" y="${r.top}" width="${Math.ceil(r.width)}" height="${Math.ceil(r.height)}">${new XMLSerializer().serializeToString(copy)}</foreignObject>`;
  }
  const bg = exportBackground(theme);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${nested}${panels}</svg>`, width: W, height: H };
}

async function exportPng(theme: PngTheme, maxWidth = 1600, panels = false): Promise<string> {
  const svg = panels ? windowSvg(theme).svg : renderer.toSvgString(theme);
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = Number(m?.[1] ?? 800);
  const h = Number(m?.[2] ?? 600);
  // Cap by width, height and total pixels so the canvas is never too large to encode.
  const scale = Math.min(2, maxWidth / w, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_PIXELS / (w * h)));
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
  c.fillStyle = exportBackground(theme);
  c.fillRect(0, 0, cw, ch);
  c.drawImage(img, 0, 0, cw, ch);
  const b64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
  if (!b64) throw new Error(`PNG export failed: the ${cw}x${ch} canvas produced no image`);
  return b64;
}

window.addEventListener("message", (ev: MessageEvent<HostToWebview>) => {
  const m = ev.data;
  switch (m.type) {
    case "render":
      queue = queue.then(() => render(m.viewModel, m.generation)).catch(fail);
      break;
    case "getMetrics":
      queue = queue.then(() => post({ type: "metricsResult", requestId: m.requestId, ...renderer.getMetrics() })).catch(fail);
      break;
    case "exportPng":
      queue = queue
        .then(async () => post({ type: "pngResult", requestId: m.requestId, base64: await exportPng(m.theme, m.maxWidth, m.panels === true) }))
        .catch((e) => post({ type: "pngResult", requestId: m.requestId, base64: "", error: e instanceof Error ? e.message : String(e) }));
      break;
    case "resetHover":
      renderer.resetHover();
      break;
    case "command":
      queue = queue.then(async () => {
        if (m.name === "autoLayout") await autoLayout(m.whole === true);
        else if (m.name === "fit") renderer.fit();
        else if (m.name === "zoomIn") renderer.zoomBy(1.25);
        else if (m.name === "zoomOut") renderer.zoomBy(0.8);
        else if (m.name === "selectAll") renderer.selectAll();
      }).catch(fail);
      break;
    case "select":
      queue = queue.then(() => renderer.select(m.ids)).catch(fail);
      break;
    case "typeSuggestionsResult":
      suggestions.get(m.requestId)?.(m.items);
      suggestions.delete(m.requestId);
      break;
    case "editRejected":
      renderer.editRejected();
      break;
    case "notice":
      renderer.tools.notice(m.message);
      break;
    case "testGesture":
      queue = queue
        .then(() => { renderer.testGesture(m.gesture); post({ type: "gestureResult", requestId: m.requestId }); })
        .catch((e) => post({ type: "gestureResult", requestId: m.requestId, error: e instanceof Error ? e.message : String(e) }));
      break;
  }
});
