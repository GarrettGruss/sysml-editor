/**
 * The seam between the diagram and whatever draws it (design D7): the SysML notation sits behind
 * this interface so the drawing technology can be replaced. This implementation is hand-built SVG.
 */
import type { MetricsNode } from "../../diagram/protocol.js";
import type { ViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, countOutsideParent, countOverlaps, type Box, type Measure } from "./geometry.js";
import type { LayoutResult } from "./layout.js";
import { LIGHT_PALETTE, buildSvg, wrapStandalone } from "./svg.js";

export interface Metrics {
  nodes: MetricsNode[];
  edges: { id: string; source: string; target: string }[];
  overlaps: number;
  overflows: number;
  outsideParent: number;
}

export interface DiagramRenderer {
  render(viewModel: ViewModel, layout: LayoutResult): void;
  getMetrics(): Metrics;
  /** Standalone SVG in a fixed theme, without editor chrome. */
  toSvgString(theme: "light"): string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Pan and zoom state. */
export interface View { x: number; y: number; k: number }

export class SvgRenderer implements DiagramRenderer {
  private vm?: ViewModel;
  private rel = new Map<string, Box>();
  private readonly world: SVGGElement;
  private view: View = { x: 0, y: 0, k: 1 };
  readonly svg: SVGSVGElement;

  constructor(host: HTMLElement, private readonly measure: Measure, private readonly onView: (v: View) => void = () => {}) {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "diagram");
    this.svg.setAttribute("tabindex", "0");
    this.world = document.createElementNS(SVG_NS, "g");
    this.world.setAttribute("class", "world");
    this.svg.append(this.world);
    host.append(this.svg);
    this.interact();
  }

  render(viewModel: ViewModel, layout: LayoutResult): void {
    this.vm = viewModel;
    this.rel = new Map(layout.boxes);
    const r = buildSvg(viewModel, layout.boxes, this.measure);
    this.world.innerHTML = r.content;
    this.applyView();
  }

  getView(): View { return { ...this.view }; }

  setView(v: View): void {
    this.view = { ...v };
    this.applyView();
  }

  fit(): void {
    if (!this.vm) return;
    const abs = [...absoluteBoxes(this.vm, this.rel).values()];
    const w = this.svg.clientWidth || 800;
    const h = this.svg.clientHeight || 600;
    if (!abs.length) return;
    const x0 = Math.min(...abs.map((b) => b.x)), y0 = Math.min(...abs.map((b) => b.y));
    const x1 = Math.max(...abs.map((b) => b.x + b.w)), y1 = Math.max(...abs.map((b) => b.y + b.h));
    const k = Math.min(1, (w - 40) / (x1 - x0), (h - 40) / (y1 - y0));
    this.setView({ k, x: (w - (x1 - x0) * k) / 2 - x0 * k, y: (h - (y1 - y0) * k) / 2 - y0 * k });
  }

  private applyView(): void {
    const { x, y, k } = this.view;
    this.world.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
  }

  private interact(): void {
    let drag: { px: number; py: number; vx: number; vy: number } | undefined;
    this.svg.addEventListener("pointerdown", (e) => {
      drag = { px: e.clientX, py: e.clientY, vx: this.view.x, vy: this.view.y };
      this.svg.setPointerCapture(e.pointerId);
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.view = { ...this.view, x: drag.vx + e.clientX - drag.px, y: drag.vy + e.clientY - drag.py };
      this.applyView();
    });
    const end = () => {
      if (drag) this.onView(this.getView());
      drag = undefined;
    };
    this.svg.addEventListener("pointerup", end);
    this.svg.addEventListener("pointercancel", end);
    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = this.svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const k = Math.min(4, Math.max(0.1, this.view.k * Math.exp(-e.deltaY * 0.0015)));
      const s = k / this.view.k;
      this.view = { k, x: mx - (mx - this.view.x) * s, y: my - (my - this.view.y) * s };
      this.applyView();
      this.onView(this.getView());
    }, { passive: false });
  }

  getMetrics(): Metrics {
    const vm = this.vm;
    if (!vm) return { nodes: [], edges: [], overlaps: 0, overflows: 0, outsideParent: 0 };
    const abs = absoluteBoxes(vm, this.rel);
    const nodes: MetricsNode[] = vm.nodes.flatMap((n) => {
      const b = abs.get(n.id);
      if (!b) return [];
      return [{ id: n.id, x: b.x, y: b.y, w: b.w, h: b.h, ...(n.parent !== undefined ? { parent: n.parent } : {}), ...(n.attachedTo !== undefined ? { attachedTo: n.attachedTo } : {}) }];
    });
    // Text wider than its node: measured on the real rendering.
    let overflows = 0;
    for (const g of this.world.querySelectorAll<SVGGElement>("g[data-node]")) {
      const box = abs.get(g.getAttribute("data-node") ?? "");
      if (!box || g.getAttribute("data-shape") === "port") continue;
      for (const t of g.querySelectorAll<SVGTextElement>("text")) if (t.getBBox().width > box.w + 0.5) overflows++;
    }
    return { nodes, edges: vm.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })), overlaps: countOverlaps(vm, abs), overflows, outsideParent: countOutsideParent(vm, abs) };
  }

  toSvgString(_theme: "light"): string {
    if (!this.vm) return "";
    const r = buildSvg(this.vm, this.rel, this.measure, { palette: LIGHT_PALETTE });
    return wrapStandalone(r, { palette: LIGHT_PALETTE }).svg;
  }
}
