/**
 * The seam between the diagram and whatever draws it (design D7): the SysML notation sits behind
 * this class so the drawing technology can be replaced. This implementation is hand-built SVG,
 * with the interaction logic in `interaction.ts` and the drawing in `svg.ts`.
 */
import { ELEMENT_MIME, type ConnectRelation, type DiagramEdit, type EdgePatch, type DiagramMetrics, type ModelIntent, type PngTheme, type TestGesture } from "../../diagram/protocol.js";
import type { ViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, boundsOf, countOutsideParent, countOverCompartments, countOverlaps, type Box, type Measure, type Pt } from "./geometry.js";
import { DRAG_THRESHOLD, handleBoxes, Interaction, snap, type InteractionHost, type PointerInput, type Scene } from "./interaction.js";
import type { LayoutResult } from "./layout.js";
import { checkEdges } from "./metrics.js";
import { showMenu, type MenuItem } from "./menu.js";
import { labelHit, layoutAt, moveBox, resizeBox, toggleWrap, type LabelLayout } from "./labels.js";
import { addBend, adjustRoute, dragBend, dragSegment, isHorizontal, routeHandleAt, segmentAt } from "./route-edit.js";
import { clean, routeFits } from "./routing.js";
import { buildScene } from "./scene.js";
import { Tools, type Suggestion, type Tool } from "./tools.js";
import { DARK_PALETTE, LIGHT_PALETTE, buildSvg, edgeHandlesSvg, overlaySvg, wrapStandalone } from "./svg.js";

export type Metrics = DiagramMetrics;

export interface DiagramRenderer {
  render(viewModel: ViewModel, layout: LayoutResult): void;
  getMetrics(): Metrics;
  /** Standalone SVG in a fixed theme, without editor chrome (`light`), or the editor appearance with selection (`editor-dark`). */
  toSvgString(theme: PngTheme): string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Pan and zoom state. */
export interface View { x: number; y: number; k: number }

export interface RendererCallbacks {
  onView(v: View): void;
  onEdit(edit: DiagramEdit): void;
  onSelection(ids: string[]): void;
  /** The node or edge id under the pointer; undefined when it left the diagram. Called only on a change. */
  onHover(id: string | undefined): void;
  onRelink(id: string): void;
  onDrop(names: string[]): void;
  onModel(intent: ModelIntent): void;
  suggest(id: string, query: string): Promise<Suggestion[]>;
}

export class SvgRenderer implements DiagramRenderer {
  private vm?: ViewModel;
  private rel = new Map<string, Box>();
  private mins = new Map<string, { w: number; h: number }>();
  private layoutRoutes = new Map<string, Pt[]>();
  private scene: Scene;
  private preview?: Map<string, Box>;
  private band?: Box;
  private drawn = { routes: new Map<string, Pt[]>(), labels: new Map<string, Box>(), labelLines: new Map<string, string[]>(), laidOut: new Set<string>() };
  /** A route or label gesture in progress, and what it draws instead of the stored layout. */
  private rg?: LineGesture;
  private overrides = new Map<string, { points?: Pt[]; label?: LabelLayout | null }>();
  private readonly world: SVGGElement;
  private readonly overlay: SVGGElement;
  private view: View = { x: 0, y: 0, k: 1 };
  private space = false;
  private panStart?: View;
  readonly svg: SVGSVGElement;
  readonly ia: Interaction;
  readonly tools: Tools;
  private tool?: Tool;
  /** First click of the connection tool. */
  private connectFrom?: string;
  private editor?: HTMLInputElement;
  /** An edge (succession, transition, message) selected by a click on it; edges are not part of the node selection. */
  private selectedEdge?: string;

  constructor(host: HTMLElement, private readonly measure: Measure, private readonly cb: RendererCallbacks) {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "diagram");
    this.svg.setAttribute("tabindex", "0");
    this.svg.setAttribute("role", "application");
    this.svg.setAttribute("aria-label", "SysML diagram. Tab selects the next element, arrow keys move it, Delete removes it from the diagram.");
    this.world = document.createElementNS(SVG_NS, "g");
    this.world.setAttribute("class", "world");
    this.overlay = document.createElementNS(SVG_NS, "g");
    this.overlay.setAttribute("class", "overlay");
    this.svg.append(this.world, this.overlay);
    host.append(this.svg);
    const ihost: InteractionHost = {
      onSelection: (ids) => { this.selectedEdge = undefined; this.repaint(); this.tools.setSelection(this.vm, ids); cb.onSelection(ids); },
      onPreview: (boxes, band) => { this.preview = boxes; this.band = band; this.repaint(); },
      onEdit: (edit) => cb.onEdit(this.withRoutes(edit)),
      onPan: (dx, dy) => {
        this.panStart ??= { ...this.view };
        this.view = { ...this.view, x: this.view.x + dx, y: this.view.y + dy };
        this.applyView();
      },
      onPanEnd: () => { this.panStart = undefined; cb.onView(this.getView()); },
      onMenu: (id) => this.openMenu(id),
      zoom: () => this.view.k,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    };
    this.ia = new Interaction(ihost);
    this.scene = this.ia.scene;
    this.tools = new Tools(host, { onModel: (i) => cb.onModel(i), suggest: (id, q) => cb.suggest(id, q), chooseTool: (t) => this.setTool(t) });
    this.wire();
  }

  // ---- drawing ---------------------------------------------------------------------------

  render(viewModel: ViewModel, layout: LayoutResult): void {
    this.vm = viewModel;
    this.rel = new Map(layout.boxes);
    this.mins = new Map(layout.mins);
    this.layoutRoutes = new Map(layout.routes);
    this.preview = undefined;
    this.band = undefined;
    this.scene = buildScene(viewModel, this.rel, this.mins, this.measure);
    this.ia.setScene(this.scene);
    this.tools.setDiagram(viewModel);
    this.closeEditor();
    const edge = this.selectedEdge !== undefined ? viewModel.edges.find((e) => e.id === this.selectedEdge) : undefined;
    if (!edge) this.selectedEdge = undefined;
    this.repaint();
    if (edge) this.tools.setEdgeSelection(edge);
    else this.tools.setSelection(viewModel, this.ia.selection);
  }

  /** Boxes as drawn now: the stored layout with the gesture's preview on top. */
  private currentRel(): Map<string, Box> {
    if (!this.preview) return this.rel;
    const m = new Map(this.rel);
    for (const [id, b] of this.preview) m.set(id, b);
    return m;
  }

  private repaint(): void {
    if (!this.vm) return;
    const rel = this.currentRel();
    const r = buildSvg(this.vm, rel, this.measure, {}, { routes: this.layoutRoutes, selected: this.selectedSet(), overrides: this.overrides });
    this.drawn = { routes: r.routes, labels: r.labels, labelLines: r.labelLines, laidOut: r.laidOut };
    this.world.innerHTML = r.content;
    this.applyView();
    this.repaintOverlay();
  }

  private selectedSet(): Set<string> {
    return new Set([...this.ia.selection, ...(this.selectedEdge !== undefined ? [this.selectedEdge] : [])]);
  }

  /** Distance from `p` to the nearest edge route within reach, if any. */
  private edgeAt(p: Pt): string | undefined {
    if (!this.vm) return undefined;
    const reach = 5 / this.view.k + 1;
    let best: { id: string; d: number } | undefined;
    for (const [id, pts] of this.drawn.routes) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
        if (d <= reach && (!best || d < best.d)) best = { id, d };
      }
    }
    return best?.id;
  }

  /** An edge under the point, unless a node that is not a container is there (nodes win at their borders). */
  private edgeHit(p: Pt): string | undefined {
    const edge = this.edgeAt(p);
    if (edge === undefined) return undefined;
    const node = hit(this.scene, p);
    return node === undefined || this.vm?.nodes.some((n) => n.parent === node) || this.vm?.nodes.find((n) => n.id === node)?.shape === "lifeline" ? edge : undefined;
  }

  selectEdge(id: string): void {
    this.ia.setSelection([], false);
    this.selectedEdge = id;
    this.repaint();
    this.tools.setEdgeSelection(this.vm?.edges.find((e) => e.id === id));
    this.cb.onSelection([id]);
  }

  /** Handles of the selected line: its route (when adjustable) and its label. */
  private edgeHandles(o: { palette?: Parameters<typeof edgeHandlesSvg>[2]["palette"] }): string {
    const id = this.selectedEdge;
    if (id === undefined) return "";
    return edgeHandlesSvg(this.routeOf(id)?.pts, this.labelOf(id)?.box, o, this.view.k);
  }

  /** The route of a line the user may edit: stored routes only, so not derived lines, sequence messages or loops. */
  private routeOf(id: string): { pts: Pt[]; src: Box; tgt: Box } | undefined {
    const e = this.vm?.edges.find((x) => x.id === id);
    if (!e || e.derived || e.fixed || e.source === e.target) return undefined;
    const pts = this.drawn.routes.get(id);
    const src = this.scene.get(e.source)?.abs, tgt = this.scene.get(e.target)?.abs;
    return pts && pts.length >= 2 && src && tgt ? { pts: clean(pts), src, tgt } : undefined;
  }

  /** The label of a line the user may adjust, as drawn. */
  private labelOf(id: string): { box: Box; pts: Pt[]; layout?: LabelLayout } | undefined {
    const e = this.vm?.edges.find((x) => x.id === id);
    if (!e || e.derived || e.fixed || !e.label) return undefined;
    const box = this.drawn.labels.get(id), pts = this.drawn.routes.get(id);
    return box && pts ? { box, pts, ...(e.labelLayout ? { layout: e.labelLayout } : {}) } : undefined;
  }

  /** The line whose label is under the point (that of the selected line first). */
  private labelAtPoint(p: Pt): string | undefined {
    const ids = [...(this.selectedEdge !== undefined ? [this.selectedEdge] : []), ...this.drawn.labels.keys()];
    // A label over a node only takes the press when its line is selected, so it never steals clicks, drags or connections from the node.
    const nodeUnder = hit(this.scene, p) !== undefined;
    return ids.find((id) => { const l = this.labelOf(id); return l !== undefined && (id === this.selectedEdge || !nodeUnder) && labelHit(l.box, p, this.view.k) !== undefined; });
  }

  /** A move or resize edit also carries the stored routes of the lines at the changed nodes, adjusted (or to be dropped), so the file holds what is drawn. */
  private withRoutes(edit: DiagramEdit): DiagramEdit {
    const vm = this.vm;
    if (edit.kind !== "layout" || !vm) return edit;
    const old = absoluteBoxes(vm, this.rel);
    const nrel = new Map(this.rel);
    for (const b of edit.boxes) {
      const cur = this.rel.get(b.id);
      if (cur) nrel.set(b.id, { x: b.x, y: b.y, w: b.w ?? cur.w, h: b.h ?? cur.h });
    }
    const now = absoluteBoxes(vm, nrel);
    const routes: { id: string; points: Pt[] }[] = [];
    const drop: string[] = [];
    const same = (a: Box | undefined, b: Box | undefined) => a !== undefined && b !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    for (const e of vm.edges) {
      if (e.derived || e.fixed || !e.points?.length) continue;
      const os = old.get(e.source), ot = old.get(e.target), ns = now.get(e.source), nt = now.get(e.target);
      if (!os || !ot || !ns || !nt || (same(os, ns) && same(ot, nt))) continue;
      const r = adjustRoute(e.points, os, ot, ns, nt);
      if (!r) drop.push(e.id);
      else routes.push({ id: e.id, points: r.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 })) });
    }
    return routes.length || drop.length ? { ...edit, ...(routes.length ? { routes } : {}), ...(drop.length ? { drop } : {}) } : edit;
  }

  private emitEdge(label: "Route" | "Label", patch: EdgePatch): void {
    this.cb.onEdit({ kind: "edgeLayout", label, edges: [patch] });
  }

  /** Press on a line, its handles or its label: starts a route or label gesture. Returns whether the press was used. */
  private beginLineGesture(p: PointerInput): boolean {
    const zoom = this.view.k;
    const reach = 6 / zoom + 2;
    const begin = (id: string, area: ReturnType<typeof labelHit>): boolean => {
      const l = this.labelOf(id);
      if (l && area !== undefined) {
        this.rg = { kind: area === "resize" ? "lresize" : "lmove", id, start: p, box: l.box, pts: l.pts, sized: l.layout?.w !== undefined, ...(l.layout ? { cur: l.layout } : {}), moved: false };
        return true;
      }
      return false;
    };
    const sel = this.selectedEdge;
    if (sel !== undefined) {
      const l = this.labelOf(sel);
      if (l && begin(sel, labelHit(l.box, p, zoom))) return true;
      const r = this.routeOf(sel);
      const h = r ? routeHandleAt(r.pts, p, reach) : undefined;
      if (r && h) {
        this.rg = h.kind === "bend" ? { kind: "bend", id: sel, k: h.index, start: p, base: r.pts, src: r.src, tgt: r.tgt, moved: false } : { kind: "seg", id: sel, i: h.index, start: p, base: r.pts, src: r.src, tgt: r.tgt, moved: false };
        return true;
      }
    }
    const lab = this.labelAtPoint(p);
    if (lab !== undefined) {
      this.selectEdge(lab);
      return begin(lab, labelHit(this.labelOf(lab)!.box, p, zoom));
    }
    const edge = this.edgeHit(p);
    if (edge === undefined) return false;
    this.selectEdge(edge);
    const r = this.routeOf(edge);
    const s = r ? segmentAt(r.pts, p, reach) : undefined;
    if (r && s) this.rg = { kind: "seg", id: edge, i: s.index, start: p, base: r.pts, src: r.src, tgt: r.tgt, moved: false };
    return true;
  }

  private moveLineGesture(p: PointerInput): void {
    const g = this.rg;
    if (!g) return;
    const dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;
    if (g.kind === "seg" || g.kind === "bend") {
      const cand = g.kind === "seg" ? dragSegment(g.base, g.i, isHorizontal(g.base[g.i]!, g.base[g.i + 1]!) ? dy : dx, g.src, g.tgt) : dragBend(g.base, g.k, dx, dy, g.src, g.tgt);
      g.out = routeFits(cand, g.src, g.tgt) ? cand : undefined;
      if (g.out) this.overrides.set(g.id, { points: g.out });
      else this.overrides.delete(g.id);
    } else {
      const box = g.kind === "lmove" ? moveBox(g.box, dx, dy) : resizeBox(g.box, dx, dy);
      g.out = layoutAt(box, g.pts, g.kind === "lresize" || g.sized, g.cur?.wrap);
      this.overrides.set(g.id, { label: g.out });
    }
    this.repaint();
  }

  private endLineGesture(): void {
    const g = this.rg;
    this.rg = undefined;
    if (!g) return;
    this.overrides.clear();
    if (g.moved && g.out) {
      if (g.kind === "seg" || g.kind === "bend") this.emitEdge("Route", { id: g.id, points: g.out.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 })) });
      else this.emitEdge("Label", { id: g.id, label: g.out });
    }
    this.repaint();
  }

  private cancelLineGesture(): boolean {
    if (!this.rg) return false;
    this.rg = undefined;
    this.overrides.clear();
    this.repaint();
    return true;
  }

  private bendAt(id: string, p: Pt): void {
    const r = this.routeOf(id);
    const next = r ? addBend(r.pts, p, r.src, r.tgt) : undefined;
    if (next) this.emitEdge("Route", { id, points: next.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 })) });
  }

  private openLabelMenu(id: string, cx: number, cy: number): void {
    const l = this.labelOf(id);
    if (!l) return;
    const items: MenuItem<"reset" | "wrap">[] = [
      { label: "Reset Position and Size", action: "reset" },
      { label: "Wrap Text", action: "wrap", checked: l.layout?.wrap !== false },
    ];
    showMenu(document.body, cx, cy, items, (a) => {
      if (a === "reset") { if (l.layout) this.emitEdge("Label", { id, label: null }); }
      else this.emitEdge("Label", { id, label: toggleWrap(l.layout, l.box, l.pts) });
    }, () => this.svg.focus({ preventScroll: true }));
  }

  private selectionBoxes(): { boxes: Box[]; handles?: Box } {
    if (!this.vm) return { boxes: [] };
    const abs = absoluteBoxes(this.vm, this.currentRel());
    const ids = this.ia.selection.filter((id) => abs.has(id));
    const only = ids.length === 1 ? this.vm.nodes.find((n) => n.id === ids[0]) : undefined;
    return { boxes: ids.map((id) => abs.get(id)!), ...(only && only.attachedTo === undefined ? { handles: abs.get(only.id)! } : {}) };
  }

  private repaintOverlay(): void {
    const { boxes, handles } = this.selectionBoxes();
    this.overlay.innerHTML = overlaySvg(boxes, handles, this.band, {}, this.view.k) + this.edgeHandles({});
    // The drawing's `selected` flags follow the selection.
    for (const g of this.world.querySelectorAll<SVGGElement>("g[data-node]")) {
      const on = this.ia.selection.includes(g.getAttribute("data-node") ?? "");
      if (on) { g.setAttribute("data-selected", "true"); g.setAttribute("aria-current", "true"); }
      else { g.removeAttribute("data-selected"); g.removeAttribute("aria-current"); }
    }
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
    const b = boundsOf(abs);
    const k = Math.min(1, (w - 40) / b.w, (h - 40) / b.h);
    this.setView({ k, x: (w - b.w * k) / 2 - b.x * k, y: (h - b.h * k) / 2 - b.y * k });
    this.cb.onView(this.getView());
  }

  zoomBy(factor: number): void {
    const w = this.svg.clientWidth || 800, h = this.svg.clientHeight || 600;
    this.zoomAt(w / 2, h / 2, factor);
  }

  private zoomAt(mx: number, my: number, factor: number): void {
    const k = Math.min(4, Math.max(0.1, this.view.k * factor));
    const s = k / this.view.k;
    this.view = { k, x: mx - (mx - this.view.x) * s, y: my - (my - this.view.y) * s };
    this.applyView();
    this.repaintOverlay();
    this.cb.onView(this.getView());
  }

  private applyView(): void {
    const { x, y, k } = this.view;
    const t = `translate(${x} ${y}) scale(${k})`;
    this.world.setAttribute("transform", t);
    this.overlay.setAttribute("transform", t);
  }

  // ---- selection -------------------------------------------------------------------------

  select(ids: string[]): void {
    if (ids.length === 1 && this.vm?.edges.some((e) => e.id === ids[0]) && !this.vm.nodes.some((n) => n.id === ids[0])) {
      this.selectEdge(ids[0]!);
      return;
    }
    this.ia.setSelection(ids, false);
    this.repaintOverlay();
  }

  selectAll(): void {
    this.ia.keyDown({ key: "a", shift: false, mod: true });
  }

  // ---- input -----------------------------------------------------------------------------

  private toInput(e: PointerEvent | MouseEvent, button = (e as PointerEvent).button): PointerInput {
    const r = this.svg.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { x: (sx - this.view.x) / this.view.k, y: (sy - this.view.y) / this.view.k, sx, sy, button, shift: e.shiftKey, mod: e.ctrlKey || e.metaKey, space: this.space };
  }

  /** What was last reported to the host, and what is under the pointer now. */
  private hovered?: string;
  private under?: string;
  private setHover(id: string | undefined): void {
    this.under = id;
    if (id === this.hovered) return;
    this.hovered = id;
    this.cb.onHover(id);
  }

  /** The host cleared its hover: the next report goes out even when unchanged. */
  resetHover(): void {
    this.hovered = undefined;
  }

  /** Report what is under the pointer again (after the window or tab became active or visible). */
  resendHover(): void {
    this.hovered = undefined;
    if (this.under !== undefined) this.setHover(this.under);
  }

  /** The line or node under the point (lines first, as a press picks them). */
  private hoverAt(p: Pt): string | undefined {
    return this.edgeHit(p) ?? hit(this.scene, p);
  }

  private wire(): void {
    const svg = this.svg;
    svg.addEventListener("pointerdown", (e) => {
      closeMenu();
      svg.focus({ preventScroll: true });
      // Gestures on the canvas must never select the SVG text labels.
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      if (this.tool && e.button === 0) {
        e.preventDefault();
        this.toolClick(this.toInput(e));
        return;
      }
      if (e.button === 0 && !e.shiftKey && this.beginLineGesture(this.toInput(e))) {
        if (this.rg) { try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ } }
        return;
      }
      try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
      this.ia.pointerDown(this.toInput(e));
    });
    svg.addEventListener("dblclick", (e) => {
      const at = this.toInput(e, 0);
      const line = this.edgeHit(at);
      const id = hit(this.scene, at);
      // A node under the point is renamed; a line adds a bend where no node is, or inside a container only when the line is selected.
      if (line !== undefined && (id === undefined || line === this.selectedEdge)) { this.bendAt(line, at); return; }
      if (id !== undefined) this.openEditor(id);
    });
    svg.addEventListener("pointermove", (e) => {
      if (this.rg) this.moveLineGesture(this.toInput(e));
      else this.ia.pointerMove(this.toInput(e));
      this.setHover(e.buttons === 0 ? this.hoverAt(this.toInput(e)) : undefined);
    });
    svg.addEventListener("pointerleave", () => this.setHover(undefined));
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.setHover(undefined); else this.resendHover(); });
    document.addEventListener("pointerleave", () => this.setHover(undefined));
    document.addEventListener("mouseout", (e) => { if (e.relatedTarget === null) this.setHover(undefined); });
    window.addEventListener("blur", () => this.setHover(undefined));
    window.addEventListener("focus", () => this.resendHover());
    const end = (e: PointerEvent) => { if (this.rg) this.endLineGesture(); else this.ia.pointerUp(this.toInput(e)); };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => { if (!this.cancelLineGesture()) this.ia.cancel(); });
    svg.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const p = this.toInput(e, 2);
      const lab = this.labelAtPoint(p);
      if (lab !== undefined) {
        this.selectEdge(lab);
        this.openLabelMenu(lab, e.clientX, e.clientY);
        return;
      }
      const edge = this.edgeHit(p);
      if (edge !== undefined) {
        this.selectEdge(edge);
        this.openEdgeMenu(edge, e.clientX, e.clientY);
        return;
      }
      const id = hit(this.scene, p);
      if (id === undefined) return;
      if (!this.ia.selection.includes(id)) this.ia.setSelection([id]);
      this.openMenu(id, e.clientX, e.clientY);
    });
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = svg.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      } else {
        this.view = { ...this.view, x: this.view.x - e.deltaX, y: this.view.y - e.deltaY };
        this.applyView();
        this.cb.onView(this.getView());
      }
    }, { passive: false });
    svg.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.cancelLineGesture()) { e.preventDefault(); return; }
      if (e.key === "Escape" && this.tool) { this.setTool(undefined); e.preventDefault(); return; }
      if (this.selectedEdge !== undefined && (e.key === "Delete" || e.key === "Backspace")) {
        const id = this.selectedEdge;
        this.selectedEdge = undefined;
        this.cb.onEdit({ kind: "remove", ids: [id] });
        e.preventDefault();
        return;
      }
      if (e.key === "F2" && this.ia.selection.length === 1) { this.openEditor(this.ia.selection[0]!); e.preventDefault(); return; }
      if (e.key === " ") { this.space = true; e.preventDefault(); return; }
      if (this.ia.keyDown({ key: e.key, shift: e.shiftKey, mod: e.ctrlKey || e.metaKey })) e.preventDefault();
    });
    svg.addEventListener("keyup", (e) => { if (e.key === " ") this.space = false; });
    svg.addEventListener("blur", () => { this.space = false; this.ia.flushNudge(); });
    svg.addEventListener("dragover", (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].some((t) => t === ELEMENT_MIME || t === "text/plain")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });
    svg.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const raw = dt.getData(ELEMENT_MIME) || dt.getData("text/plain");
      if (!raw) return;
      e.preventDefault();
      this.handleDrop(raw);
    });
  }

  /** The payload of a drop: a JSON array of qualified names, or a single qualified name as text. */
  private handleDrop(raw: string): void {
    let names: string[] = [];
    try {
      const v: unknown = JSON.parse(raw);
      if (Array.isArray(v)) names = v.filter((x): x is string => typeof x === "string");
    } catch {
      names = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
    if (names.length) this.cb.onDrop(names);
  }

  // ---- context menu ----------------------------------------------------------------------

  private openMenu(id: string, cx?: number, cy?: number): void {
    const n = this.vm?.nodes.find((x) => x.id === id);
    if (!n) return;
    const abs = absoluteBoxes(this.vm!, this.rel).get(id);
    const r = this.svg.getBoundingClientRect();
    const x = cx ?? (abs ? r.left + this.view.x + (abs.x + abs.w / 2) * this.view.k : r.left + 20);
    const y = cy ?? (abs ? r.top + this.view.y + (abs.y + abs.h / 2) * this.view.k : r.top + 20);
    const editable = n.resolved && n.props !== undefined && n.props.locked === undefined;
    const items: { label: string; action: MenuAction }[] = [
      ...(editable ? [{ label: "Rename", action: "rename" as const }] : []),
      ...(n.resolved ? [{ label: "Go to Definition", action: "goto" as const }] : []),
      { label: "Remove from Diagram", action: "remove" as const },
      ...(n.resolved ? [{ label: "Delete from Model…", action: "deleteModel" as const }] : []),
      ...(n.shape === "unresolved" ? [{ label: "Re-link…", action: "relink" as const }] : []),
    ];
    showMenu(document.body, x, y, items, (a) => this.invoke(a, id), () => this.svg.focus({ preventScroll: true }));
  }

  private openEdgeMenu(id: string, cx: number, cy: number): void {
    const e = this.vm?.edges.find((x) => x.id === id);
    if (!e) return;
    const modelEditable = e.resolved && !e.derived && !e.implied && e.locked === undefined;
    const items: { label: string; action: MenuAction }[] = [
      ...(e.derived ? [] : [{ label: "Remove from Diagram", action: "remove" as const }]),
      ...(modelEditable ? [{ label: "Delete from Model\u2026", action: "deleteModel" as const }] : []),
    ];
    if (items.length) showMenu(document.body, cx, cy, items, (a) => this.invoke(a, id), () => this.svg.focus({ preventScroll: true }));
  }

  /** The action a menu item performs (also what the test gesture "menu" calls). */
  invoke(action: MenuAction, id: string): void {
    if (this.vm?.edges.some((e) => e.id === id)) {
      if (action === "deleteModel") this.cb.onModel({ kind: "deleteFromModel", ids: [id] });
      else if (action === "remove") { this.selectedEdge = undefined; this.cb.onEdit({ kind: "remove", ids: [id] }); }
      return;
    }
    if (action === "rename") this.openEditor(id);
    else if (action === "goto") this.cb.onModel({ kind: "goToDefinition", id });
    else if (action === "deleteModel") this.cb.onModel({ kind: "deleteFromModel", ids: this.ia.selection.includes(id) ? [...this.ia.selection] : [id] });
    else if (action === "remove") {
      const ids = this.ia.selection.includes(id) ? this.ia.selection : [id];
      this.ia.setSelection([]);
      this.cb.onEdit({ kind: "remove", ids });
    } else this.cb.onRelink(id);
  }

  // ---- tools: palette, connection, inline rename -------------------------------------------

  setTool(t: Tool | undefined): void {
    this.tool = t;
    this.connectFrom = undefined;
    this.tools.setTool(t);
    this.svg.classList.toggle("tool-active", t !== undefined);
    this.svg.focus({ preventScroll: true });
  }

  /** A click with a palette item or the connection tool chosen: where it landed decides the intent. */
  private toolClick(p: PointerInput): void {
    const tool = this.tool;
    if (!tool) return;
    const id = hit(this.scene, p);
    if (tool.kind === "add") {
      const box = id !== undefined ? this.scene.get(id)?.abs : undefined;
      const owner = id !== undefined && this.scene.get(id)?.owner === undefined ? id : undefined;
      if (id !== undefined && owner === undefined) return; // a port cannot contain anything
      const target = owner !== undefined ? this.vm?.nodes.find((x) => x.id === owner) : undefined;
      const locked = target?.props?.locked;
      if (locked !== undefined) {
        // Up front, not after a round trip: inherited, library and read-only elements cannot receive new members.
        this.tools.notice(locked === "inherited" ? `'${target!.props?.name ?? "This element"}' is inherited from ${target!.inherited?.from ?? "its definition"}; add to the usage itself or change the definition.` : locked === "readonly" ? (target!.props?.lockedReason ?? "This element's file cannot be edited.") : "Standard library content is read-only.");
        return;
      }
      this.setTool(undefined);
      this.cb.onModel({ kind: "add", paletteKind: tool.item.kind, ...(owner !== undefined ? { ownerId: owner } : {}), x: Math.round(p.x - (box?.x ?? 0)), y: Math.round(p.y - (box?.y ?? 0)) });
      return;
    }
    if (id === undefined) return;
    if (this.connectFrom === undefined) {
      this.connectFrom = id;
      this.ia.setSelection([id], false);
      this.repaintOverlay();
      return;
    }
    const source = this.connectFrom;
    const relation = this.tool?.kind === "connect" ? this.tool.relation : undefined;
    this.setTool(undefined);
    // A message may go from a lifeline to itself; every other relationship needs two different ends.
    if (source !== id || relation === "message") this.cb.onModel({ kind: "connect", sourceId: source, targetId: id, ...(relation ? { relation } : {}) });
  }

  private closeEditor(): void {
    const e = this.editor;
    this.editor = undefined;
    e?.remove();
  }

  /** The inline name editor: an input over the label. Enter commits through the host, Escape and leaving cancel. */
  openEditor(id: string): void {
    const n = this.vm?.nodes.find((x) => x.id === id);
    const box = this.scene.get(id)?.abs;
    if (!n || !box) return;
    this.closeEditor();
    if (!n.resolved || !n.props || n.props.locked !== undefined || n.props.name === undefined) {
      this.tools.notice(!n.resolved ? "An unresolved item cannot be renamed." : n.props?.locked === "inherited" ? `'${n.props.name}' is inherited from ${n.inherited?.from ?? "its definition"} and cannot be renamed here.` : n.props?.locked === "library" ? "Standard library content is read-only." : n.props?.locked === "readonly" ? (n.props.lockedReason ?? "This element's file cannot be edited.") : "This element has no name to edit.");
      return;
    }
    const original = n.props.name;
    const r = this.svg.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "inline-editor";
    input.value = original;
    input.setAttribute("aria-label", `Rename ${original}`);
    const top = box.y + (n.keyword ? 18 : 3);
    input.style.left = `${r.left + this.view.x + (box.x + 4) * this.view.k}px`;
    input.style.top = `${r.top + this.view.y + top * this.view.k}px`;
    input.style.width = `${Math.max(90, (box.w - 8) * this.view.k)}px`;
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const v = input.value;
      this.closeEditor();
      this.svg.focus({ preventScroll: true });
      if (commit && v.trim() !== "" && v !== original) this.cb.onModel({ kind: "rename", id, name: v });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      e.stopPropagation();
    });
    input.addEventListener("blur", () => finish(false));
    document.body.append(input);
    this.editor = input;
    input.focus();
    input.select();
  }

  // ---- test gestures ---------------------------------------------------------------------

  private toClient(p: Pt): { clientX: number; clientY: number } {
    const r = this.svg.getBoundingClientRect();
    return { clientX: r.left + this.view.x + p.x * this.view.k, clientY: r.top + this.view.y + p.y * this.view.k };
  }

  /** A point of the node that hits the node itself (not a nested node or port on top of it). */
  private pointOn(id: string): Pt {
    const b = this.scene.get(id)?.abs;
    if (!b) throw new Error(`no node ${id}`);
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    if (hit(this.scene, c) === id) return c;
    for (let y = b.y + 4; y < b.y + b.h; y += 6) for (let x = b.x + 4; x < b.x + b.w; x += 6) if (hit(this.scene, { x, y }) === id) return { x, y };
    return c;
  }

  /** A point of the edge's route that hits the edge itself. */
  private pointOnEdge(id: string): Pt {
    const pts = this.drawn.routes.get(id);
    if (!pts || pts.length < 2) throw new Error(`no edge ${id}`);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y) > Math.hypot(pts[best + 1]!.x - pts[best]!.x, pts[best + 1]!.y - pts[best]!.y)) best = i - 1;
    const a = pts[best]!, b = pts[best + 1]!;
    // The middle of the longest segment, moved along it when a node or another edge sits there.
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (this.edgeHit(p) === id) return p;
    }
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private fire(type: "pointerdown" | "pointermove" | "pointerup", p: Pt, o: { shift?: boolean } = {}): void {
    this.svg.dispatchEvent(new PointerEvent(type, { ...this.toClient(p), button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 7, bubbles: true, cancelable: true, shiftKey: !!o.shift }));
  }

  private click(p: Pt, shift = false): void {
    this.fire("pointerdown", p, { shift });
    this.fire("pointerup", p, { shift });
  }

  private dragFrom(p: Pt, dx: number, dy: number, steps = 6, shift = false): void {
    this.fire("pointerdown", p, { shift });
    for (let i = 1; i <= steps; i++) this.fire("pointermove", { x: p.x + (dx * i) / steps, y: p.y + (dy * i) / steps }, { shift });
    this.fire("pointerup", { x: p.x + dx, y: p.y + dy }, { shift });
  }

  /** Replay a gesture as DOM events on the diagram, so it takes the paths real input takes. */
  testGesture(g: TestGesture): void {
    switch (g.kind) {
      case "select": this.click(this.pointOn(g.id), g.shift); break;
      case "drag": this.dragFrom(this.pointOn(g.id), g.dx, g.dy, g.steps); break;
      case "resize": {
        if (!(this.ia.selection.length === 1 && this.ia.selection[0] === g.id)) this.click(this.pointOn(g.id));
        const b = this.scene.get(g.id)?.abs;
        const hb = b && (handleBoxes(b) as Record<string, Box | undefined>)[g.handle];
        if (!hb) throw new Error(`no handle ${g.handle} on ${g.id}`);
        this.dragFrom({ x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 }, g.dx, g.dy);
        break;
      }
      case "rubber": this.dragFrom({ x: g.x0, y: g.y0 }, g.x1 - g.x0, g.y1 - g.y0, 4, true); break;
      case "key":
        this.svg.dispatchEvent(new KeyboardEvent("keydown", { key: g.key, shiftKey: !!g.shift, ctrlKey: !!g.ctrl, metaKey: !!g.meta, bubbles: true, cancelable: true }));
        break;
      case "menu": this.invoke(g.action, g.id); break;
      case "contextmenu": {
        const c = this.toClient(this.pointOn(g.id));
        this.svg.dispatchEvent(new MouseEvent("contextmenu", { ...c, button: 2, bubbles: true, cancelable: true }));
        break;
      }
      case "drop": {
        const dt = new DataTransfer();
        dt.setData(ELEMENT_MIME, JSON.stringify(g.names));
        this.svg.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
        break;
      }
      case "palette": {
        const item = this.tools.palette.querySelector<HTMLButtonElement>(`button[data-kind="${CSS.escape(g.item)}"]`);
        if (!item) throw new Error(`no palette item ${g.item}`);
        item.click();
        if (g.item === "connection") break;
        const target = g.id !== undefined ? this.scene.get(g.id)?.abs : undefined;
        if (g.id !== undefined && !target) throw new Error(`no node ${g.id}`);
        const p = { x: (target?.x ?? 0) + (g.x ?? 40), y: (target?.y ?? 0) + (g.y ?? 40) };
        this.fire("pointerdown", p);
        this.fire("pointerup", p);
        break;
      }
      case "connect": {
        const btn = this.tools.palette.querySelector<HTMLButtonElement>(`button[data-kind="${g.relation ?? "connection"}"]`);
        if (!btn) throw new Error(`the palette has no ${g.relation ?? "connection"} tool`);
        btn.click();
        this.click(this.pointOn(g.source));
        this.click(this.pointOn(g.target));
        break;
      }
      case "selectEdge": {
        const p = this.pointOnEdge(g.id);
        this.click(p);
        break;
      }
      case "dragEdge": {
        const p = this.pointOnEdge(g.id);
        this.dragFrom(p, 0, g.dy, 6);
        break;
      }
      case "dragSegment":
      case "dragBend": {
        if (this.selectedEdge !== g.id) this.click(this.pointOnEdge(g.id));
        const pts = this.routeOf(g.id)?.pts;
        if (!pts) throw new Error(`no adjustable route for ${g.id}`);
        if (g.kind === "dragBend") {
          const b = pts[g.index];
          if (!b) throw new Error(`no bend ${g.index} on ${g.id}`);
          this.dragFrom(b, g.dx, g.dy, 6);
          break;
        }
        const a = pts[g.index], b = pts[g.index + 1];
        if (!a || !b) throw new Error(`no segment ${g.index} on ${g.id}`);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (isHorizontal(a, b)) this.dragFrom(mid, 0, g.d, 6);
        else this.dragFrom(mid, g.d, 0, 6);
        break;
      }
      case "dblclickEdge": {
        const p = this.pointOnEdge(g.id);
        this.click(p);
        this.click(p);
        this.svg.dispatchEvent(new MouseEvent("dblclick", { ...this.toClient(p), button: 0, detail: 2, bubbles: true, cancelable: true }));
        break;
      }
      case "labelDrag":
      case "labelResize": {
        if (this.selectedEdge !== g.id) this.click(this.pointOnEdge(g.id));
        const l = this.labelOf(g.id);
        if (!l) throw new Error(`no adjustable label on ${g.id}`);
        if (g.kind === "labelDrag") this.dragFrom({ x: l.box.x, y: l.box.y }, g.dx, g.dy, 6);
        else this.dragFrom({ x: l.box.x + l.box.w, y: l.box.y + l.box.h }, g.dw, g.dh, 6);
        break;
      }
      case "labelMenu": {
        if (this.selectedEdge !== g.id) this.click(this.pointOnEdge(g.id));
        const l = this.labelOf(g.id);
        if (!l) throw new Error(`no adjustable label on ${g.id}`);
        this.svg.dispatchEvent(new MouseEvent("contextmenu", { ...this.toClient({ x: l.box.x, y: l.box.y }), button: 2, bubbles: true, cancelable: true }));
        const text = g.action === "reset" ? "Reset Position and Size" : "Wrap Text";
        const item = [...document.querySelectorAll<HTMLButtonElement>(".ctx-menu button")].find((b) => b.textContent === text);
        if (!item) throw new Error(`the label menu has no "${text}"`);
        item.click();
        break;
      }
      case "inlineRename": {
        const p = this.pointOn(g.id);
        this.svg.dispatchEvent(new MouseEvent("dblclick", { ...this.toClient(p), button: 0, detail: 2, bubbles: true, cancelable: true }));
        const input = this.editor;
        if (!input) throw new Error(`the inline editor did not open for ${g.id}`);
        input.value = g.text;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: g.commit ? "Enter" : "Escape", bubbles: true, cancelable: true }));
        break;
      }
      case "property": this.tools.setField(g.field, g.value); break;
      case "hover": {
        if (g.id === undefined) { this.svg.dispatchEvent(new PointerEvent("pointerleave", { pointerId: 7 })); break; }
        const p = this.drawn.routes.has(g.id) && !this.scene.get(g.id) ? this.pointOnEdge(g.id) : this.pointOn(g.id);
        this.svg.dispatchEvent(new PointerEvent("pointermove", { ...this.toClient(p), buttons: 0, pointerId: 7, bubbles: true }));
        break;
      }
      case "flush": this.ia.flushNudge(); break;
    }
  }

  // ---- metrics and export ----------------------------------------------------------------

  getMetrics(): Metrics {
    const vm = this.vm;
    const empty: Metrics = {
      nodes: [], edges: [], overlaps: 0, overflows: 0, outsideParent: 0, nodesOverCompartments: 0, diagonalSegments: 0, edgesThroughEndNodes: 0, labelsOverEndNodes: 0, labelsOnOwnEdge: 0, labelsOverNodes: 0, labelsOverLabels: 0, edgeOverlaps: 0, userLabelsOverNodes: 0, userLabelsOffCanvas: 0,
      portsOffBorder: 0, selected: [], menu: [], selectedNamed: 0, handles: 0, routeHandles: 0, labelHandles: 0, inheritedNodes: 0, palette: [], properties: { visible: false, fields: {} }, inlineEditor: false, theme: themeOf(), focusable: this.svg.tabIndex >= 0, zoom: this.view.k,
    };
    if (!vm) return empty;
    const abs = absoluteBoxes(vm, this.currentRel());
    const nodes = vm.nodes.flatMap((n) => {
      const b = abs.get(n.id);
      if (!b) return [];
      const g = this.world.querySelector(`g[data-node="${CSS.escape(n.id)}"]`);
      const text = g ? [...g.querySelectorAll("text")].map((t) => t.textContent ?? "").join(" | ") : "";
      return [{ id: n.id, x: b.x, y: b.y, w: b.w, h: b.h, shape: n.shape, text, ...(n.inherited ? { inherited: true } : {}), ...(n.parent !== undefined ? { parent: n.parent } : {}), ...(n.attachedTo !== undefined ? { attachedTo: n.attachedTo } : {}) }];
    });
    // Text wider than its node: measured on the real rendering.
    let overflows = 0;
    for (const g of this.world.querySelectorAll<SVGGElement>("g[data-node]")) {
      const box = abs.get(g.getAttribute("data-node") ?? "");
      if (!box || g.getAttribute("data-shape") === "port") continue;
      for (const t of g.querySelectorAll<SVGTextElement>("text")) if (t.getBBox().width > box.w + 0.5) overflows++;
    }
    const selected = [...this.ia.selection, ...(this.selectedEdge !== undefined ? [this.selectedEdge] : [])];
    const named = selected.filter((id) => (this.world.querySelector(`g[data-node="${CSS.escape(id)}"]`)?.getAttribute("aria-label") ?? "").length > 0).length;
    const edges = vm.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, style: e.style, ...(e.label !== undefined ? { label: e.label } : {}), ...(e.order !== undefined ? { order: e.order } : {}), ...(e.unordered ? { unordered: true } : {}), ...(this.drawn.labels.has(e.id) && e.label !== undefined ? { labelBox: { ...this.drawn.labels.get(e.id)! }, labelLines: this.drawn.labelLines.get(e.id) ?? [e.label], ...(this.drawn.laidOut.has(e.id) ? { labelLaidOut: true } : {}) } : {}), points: (this.drawn.routes.get(e.id) ?? []).map((p) => ({ x: p.x, y: p.y })) }));
    return {
      nodes, edges, overlaps: countOverlaps(vm, abs), overflows, outsideParent: countOutsideParent(vm, abs), nodesOverCompartments: countOverCompartments(vm, abs, this.measure),
      ...checkEdges(vm, abs, this.drawn.routes, this.drawn.labels, this.drawn.laidOut),
      selected, menu: [...document.querySelectorAll(".ctx-menu button")].map((b) => b.textContent ?? ""), selectedNamed: named, handles: this.overlay.querySelectorAll("[data-handle]").length, routeHandles: this.overlay.querySelectorAll("[data-route-handle]").length, labelHandles: this.overlay.querySelectorAll("[data-label-handle]").length, inheritedNodes: this.world.querySelectorAll('g[data-inherited="true"]').length,
      focusable: this.svg.tabIndex >= 0, zoom: this.view.k, ...this.tools.state(), inlineEditor: this.editor !== undefined, theme: themeOf(),
    };
  }

  toSvgString(theme: PngTheme): string {
    if (!this.vm) return "";
    const palette = theme === "editor-dark" ? DARK_PALETTE : LIGHT_PALETTE;
    const rel = this.currentRel();
    const r = buildSvg(this.vm, rel, this.measure, { palette }, { routes: this.layoutRoutes, selected: theme === "light" ? new Set<string>() : this.selectedSet() });
    if (theme !== "light") {
      const { boxes, handles } = this.selectionBoxes();
      r.content += overlaySvg(boxes, handles, undefined, { palette }) + this.edgeHandles({ palette });
    }
    return wrapStandalone(r, { palette }).svg;
  }

  /** Round a world coordinate onto the grid (for tests and tooling). */
  static snap(v: number): number { return snap(v); }
}

type LineGesture =
  | { kind: "seg"; id: string; i: number; start: Pt; base: Pt[]; src: Box; tgt: Box; moved: boolean; out?: Pt[] }
  | { kind: "bend"; id: string; k: number; start: Pt; base: Pt[]; src: Box; tgt: Box; moved: boolean; out?: Pt[] }
  | { kind: "lmove" | "lresize"; id: string; start: Pt; box: Box; pts: Pt[]; sized: boolean; cur?: LabelLayout; moved: boolean; out?: LabelLayout };

type MenuAction = "remove" | "relink" | "deleteModel" | "rename" | "goto";

/** `light`, `dark` or `hc`, from the classes VS Code puts on the webview body. */
function themeOf(): string {
  const c = document.body.classList;
  return c.contains("vscode-high-contrast") || c.contains("vscode-high-contrast-light") ? "hc" : c.contains("vscode-light") ? "light" : "dark";
}

const closeMenu = (): void => document.querySelector(".ctx-menu")?.remove();

function hit(scene: Scene, p: Pt): string | undefined {
  for (let i = scene.items.length - 1; i >= 0; i--) {
    const it = scene.items[i]!;
    const s = it.owner !== undefined ? 3 : 0;
    if (p.x >= it.abs.x - s && p.x <= it.abs.x + it.abs.w + s && p.y >= it.abs.y - s && p.y <= it.abs.y + it.abs.h + s) return it.id;
  }
  return undefined;
}
