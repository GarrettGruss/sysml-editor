/** Entry point of the diagram webview bundle (`dist/webview/diagram.js`). */
import ELK from "elkjs/lib/elk.bundled.js";
import type { HostToWebview, NodeBox, WebviewToHost } from "../../diagram/protocol.js";
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
const renderer = new SvgRenderer(document.body, measure, (view) => vscode.setState({ view }));
let first = true;
let queue: Promise<void> = Promise.resolve();

async function render(vm: ViewModel): Promise<void> {
  const layout = await layoutDiagram(vm, elk, measure);
  renderer.render(vm, layout);
  if (first) {
    first = false;
    if (saved?.view) renderer.setView(saved.view);
    else renderer.fit();
  }
  if (layout.placed.size) {
    const nodes: NodeBox[] = [...layout.placed].map((id) => ({ id, ...layout.boxes.get(id)! }));
    post({ type: "layoutChanged", nodes, edges: [] });
  }
}

async function exportPng(): Promise<string> {
  const svg = renderer.toSvgString("light");
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = Number(m?.[1] ?? 800);
  const h = Number(m?.[2] ?? 600);
  const scale = Math.min(2, 1600 / w);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png").split(",")[1] ?? "";
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
      queue = queue.then(async () => post({ type: "pngResult", requestId: m.requestId, base64: await exportPng() })).catch(fail);
      break;
  }
});
post({ type: "ready" });
