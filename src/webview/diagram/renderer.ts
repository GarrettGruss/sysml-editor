/**
 * The seam between the diagram and whatever draws it (design D7): the SysML notation sits behind
 * this class so the drawing technology can be replaced. This implementation is hand-built SVG,
 * with the interaction logic in `interaction.ts` and the drawing in `svg.ts`.
 */
import { ELEMENT_MIME, type DiagramEdit, type DiagramMetrics, type PngTheme, type TestGesture } from "../../diagram/protocol.js";
import type { ViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, boundsOf, countOutsideParent, countOverlaps, type Box, type Measure, type Pt } from "./geometry.js";
import { handleBoxes, Interaction, snap, type InteractionHost, type PointerInput, type Scene } from "./interaction.js";
import type { LayoutResult } from "./layout.js";
import { checkEdges } from "./metrics.js";
import { showMenu } from "./menu.js";
import { buildScene } from "./scene.js";
import { DARK_PALETTE, LIGHT_PALETTE, buildSvg, overlaySvg, wrapStandalone } from "./svg.js";

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
  onRelink(id: string): void;
  onDrop(names: string[]): void;
}

export class SvgRenderer implements DiagramRenderer {
  private vm?: ViewModel;
  private rel = new Map<string, Box>();
  private mins = new Map<string, { w: number; h: number }>();
  private layoutRoutes = new Map<string, Pt[]>();
  private scene: Scene;
  private preview?: Map<string, Box>;
  private band?: Box;
  private drawn = { routes: new Map<string, Pt[]>(), labels: new Map<string, Box>() };
  private readonly world: SVGGElement;
  private readonly overlay: SVGGElement;
  private view: View = { x: 0, y: 0, k: 1 };
  private space = false;
  private panStart?: View;
  readonly svg: SVGSVGElement;
  readonly ia: Interaction;

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
      onSelection: (ids) => { this.repaintOverlay(); cb.onSelection(ids); },
      onPreview: (boxes, band) => { this.preview = boxes; this.band = band; this.repaint(); },
      onEdit: (edit) => cb.onEdit(edit),
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
    this.repaint();
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
    const r = buildSvg(this.vm, rel, this.measure, {}, { routes: this.layoutRoutes, selected: new Set(this.ia.selection) });
    this.drawn = { routes: r.routes, labels: r.labels };
    this.world.innerHTML = r.content;
    this.applyView();
    this.repaintOverlay();
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
    this.overlay.innerHTML = overlaySvg(boxes, handles, this.band, {}, this.view.k);
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

  private wire(): void {
    const svg = this.svg;
    svg.addEventListener("pointerdown", (e) => {
      closeMenu();
      svg.focus({ preventScroll: true });
      if (e.button === 1) e.preventDefault();
      try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
      this.ia.pointerDown(this.toInput(e));
    });
    svg.addEventListener("pointermove", (e) => this.ia.pointerMove(this.toInput(e)));
    const end = (e: PointerEvent) => this.ia.pointerUp(this.toInput(e));
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => this.ia.cancel());
    svg.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const p = this.toInput(e, 2);
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
    const items = [{ label: "Remove from Diagram", action: "remove" as const }, ...(n.shape === "unresolved" ? [{ label: "Re-link…", action: "relink" as const }] : [])];
    showMenu(document.body, x, y, items, (a) => this.invoke(a, id), () => this.svg.focus({ preventScroll: true }));
  }

  /** The action a menu item performs (also what the test gesture "menu" calls). */
  invoke(action: "remove" | "relink", id: string): void {
    if (action === "remove") {
      const ids = this.ia.selection.includes(id) ? this.ia.selection : [id];
      this.ia.setSelection([]);
      this.cb.onEdit({ kind: "remove", ids });
    } else this.cb.onRelink(id);
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
      case "drop": {
        const dt = new DataTransfer();
        dt.setData(ELEMENT_MIME, JSON.stringify(g.names));
        this.svg.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
        break;
      }
      case "flush": this.ia.flushNudge(); break;
    }
  }

  // ---- metrics and export ----------------------------------------------------------------

  getMetrics(): Metrics {
    const vm = this.vm;
    const empty: Metrics = {
      nodes: [], edges: [], overlaps: 0, overflows: 0, outsideParent: 0, diagonalSegments: 0, edgesThroughEndNodes: 0, labelsOverEndNodes: 0,
      portsOffBorder: 0, selected: [], selectedNamed: 0, handles: 0, focusable: this.svg.tabIndex >= 0, zoom: this.view.k,
    };
    if (!vm) return empty;
    const abs = absoluteBoxes(vm, this.currentRel());
    const nodes = vm.nodes.flatMap((n) => {
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
    const selected = this.ia.selection;
    const named = selected.filter((id) => (this.world.querySelector(`g[data-node="${CSS.escape(id)}"]`)?.getAttribute("aria-label") ?? "").length > 0).length;
    const edges = vm.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, points: (this.drawn.routes.get(e.id) ?? []).map((p) => ({ x: p.x, y: p.y })) }));
    return {
      nodes, edges, overlaps: countOverlaps(vm, abs), overflows, outsideParent: countOutsideParent(vm, abs),
      ...checkEdges(vm, abs, this.drawn.routes, this.drawn.labels),
      selected, selectedNamed: named, handles: this.overlay.querySelectorAll("[data-handle]").length,
      focusable: this.svg.tabIndex >= 0, zoom: this.view.k,
    };
  }

  toSvgString(theme: PngTheme): string {
    if (!this.vm) return "";
    const palette = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
    const rel = this.currentRel();
    const r = buildSvg(this.vm, rel, this.measure, { palette }, { routes: this.layoutRoutes, selected: new Set(theme === "light" ? [] : this.ia.selection) });
    if (theme === "editor-dark") {
      const { boxes, handles } = this.selectionBoxes();
      r.content += overlaySvg(boxes, handles, undefined, { palette });
    }
    return wrapStandalone(r, { palette }).svg;
  }

  /** Round a world coordinate onto the grid (for tests and tooling). */
  static snap(v: number): number { return snap(v); }
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
