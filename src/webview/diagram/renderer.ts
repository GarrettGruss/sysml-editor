/**
 * The seam between the diagram and whatever draws it (design D7): the SysML notation sits behind
 * this class so the drawing technology can be replaced. This implementation is hand-built SVG,
 * with the interaction logic in `interaction.ts` and the drawing in `svg.ts`.
 */
import { ELEMENT_MIME, type ConnectRelation, type DiagramEdit, type EdgePatch, type DiagramMetrics, type ModelIntent, type PngTheme, type TestGesture } from "../../diagram/protocol.js";
import type { ViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, boundsOf, countOutsideParent, countOverCompartments, countOverlaps, describeBox, type Box, type Measure, type Pt } from "./geometry.js";
import { InlineInput } from "./inline-input.js";
import { DOC_SHAPES, UNNAMED_KINDS, defaultStem, nextFreeName } from "../../diagram/authoring.js";
import { DRAG_THRESHOLD, handleBoxes, Interaction, snap, type InteractionHost, type PointerInput, type Scene } from "./interaction.js";
import type { LayoutResult } from "./layout.js";
import { checkEdges } from "./metrics.js";
import { showMenu, type MenuItem } from "./menu.js";
import { labelHit, layoutAt, moveBox, resizeBox, toggleWrap, type LabelLayout } from "./labels.js";
import { addBend, adjustRoute, dragBend, dragSegment, isHorizontal, routeHandleAt, segmentAt } from "./route-edit.js";
import { clean, routeFits, type Side } from "./routing.js";
import { endProblem, ghostRoute, ghostSvg, handleBoxesOf, handleRelation, hasHandles, sideAt } from "./connect.js";
import { quickBarItems } from "../../diagram/palette.js";
import { buildScene } from "./scene.js";
import { arrowPan, wheelFactor } from "./view-input.js";
import { Tools, type Suggestion, type Tool } from "./tools.js";
import { DARK_PALETTE, LIGHT_PALETTE, buildSvg, edgeHandlesSvg, esc, overlaySvg, wrapStandalone } from "./svg.js";

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
  onDrop(names: string[], at?: { x: number; y: number }): void;
  onModel(intent: ModelIntent): void;
  suggest(id: string, query: string): Promise<Suggestion[]>;
  /** Whether a name is free for a new or renamed element, and the default name of the kind. */
  checkName(req: { name: string; kind?: string; ownerId?: string; siblingOf?: string; rename?: boolean }): Promise<{ problem?: string; suggested?: string }>;
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
  private editor?: InlineInput;
  /** The node a rename or description input is on. */
  private editing?: string;
  /** The palette ghost (a dashed node with the default name that follows the pointer, then stays where it was placed), or the node a quick-bar choice will add. */
  private pg?: { kind: string; name: string; at?: Pt; placed: boolean; quick?: boolean };
  /** A connection being drawn: from a node (palette tool or quick-connect handle) or from a line's end being moved. */
  private cg?: ConnGesture;
  /** The quick bar over the end of a line released on empty canvas, and the line it belongs to. */
  private quick?: { el: HTMLElement; at: Pt; items: string[]; source: string; relation: "succession" | "transition"; side?: Side };
  /** The node whose quick-connect handles show (the pointer is over it or over a handle). */
  private handleNode?: string;
  /** A line drawn from a handle: its route leaves from this side once the host has written it. */
  private pendingSide?: { source: string; target: string; side: Side };
  private readonly tip: HTMLElement;
  private lastPoint: Pt = { x: 0, y: 0 };
  /** An edge (succession, transition, message) selected by a click on it; edges are not part of the node selection. */
  private selectedEdge?: string;
  /** The view is still the automatic fit of the first open: a resize fits again, the first pan or zoom by the user ends it. */
  private autoFit = false;
  /** Routes released by the user and drawn until the host confirms; a drawing that differs from them counts as a stale draw (a test measure). */
  private readonly pendingRoutes = new Map<string, Pt[]>();
  private staleDraws = 0;
  /** The node a dragged node would nest into (or leave, without an id) when released. */
  private dropTarget?: { id?: string };
  private dropFrom?: string;

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
    this.tip = document.createElement("div");
    this.tip.className = "ghost-tip";
    this.tip.hidden = true;
    this.tip.setAttribute("role", "tooltip");
    host.append(this.tip);
    const ihost: InteractionHost = {
      onSelection: (ids) => { this.selectedEdge = undefined; this.repaint(); this.tools.setSelection(this.vm, ids); cb.onSelection(ids); },
      onPreview: (boxes, band) => { this.preview = boxes; this.band = band; this.repaint(); },
      onEdit: (edit) => cb.onEdit(this.withRoutes(edit)),
      onPan: (dx, dy) => {
        this.closeQuick();
        this.panStart ??= { ...this.view };
        this.view = { ...this.view, x: this.view.x + dx, y: this.view.y + dy };
        this.applyView();
      },
      onPanEnd: () => { this.panStart = undefined; this.autoFit = false; cb.onView(this.getView()); },
      onMenu: (id) => this.openMenu(id),
      onDropTarget: (t, dragged) => { this.dropTarget = t; this.dropFrom = dragged; this.repaintOverlay(); },
      onNest: (id, targetId) => { this.preview = undefined; this.repaint(); cb.onModel({ kind: "nest", id, ...(targetId !== undefined ? { targetId } : {}) }); },
      zoom: () => this.view.k,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    };
    this.ia = new Interaction(ihost);
    this.scene = this.ia.scene;
    this.tools = new Tools(host, { onModel: (i) => cb.onModel(i), suggest: (id, q) => cb.suggest(id, q), chooseTool: (t) => this.setTool(t), toggleDescriptions: (show) => cb.onEdit({ kind: "style", descriptions: show }) });
    this.wire();
  }

  // ---- drawing ---------------------------------------------------------------------------

  render(viewModel: ViewModel, layout: LayoutResult): void {
    const known = new Set(this.vm?.edges.map((e) => e.id));
    this.vm = viewModel;
    this.rel = new Map(layout.boxes);
    this.mins = new Map(layout.mins);
    this.layoutRoutes = new Map(layout.routes);
    this.overrides.clear();
    this.pendingRoutes.clear();
    this.preview = undefined;
    this.band = undefined;
    this.scene = buildScene(viewModel, this.rel, this.mins, this.measure);
    this.ia.setScene(this.scene);
    // An open connection survives a re-render while its source (and, for a moved line end, the line) still exists.
    const g = this.cg;
    if (!(g && this.scene.get(g.source) && (g.kind !== "reconnect" || viewModel.edges.some((e) => e.id === g.edge)))) this.dropConnect();
    else this.handleNode = undefined;
    this.tools.setDiagram(viewModel);
    // An input for a new element belongs to the ghost, not to a node: a redraw (the host's layout answer, a file change) leaves it open.
    // One on a node stays while that node does.
    const ed = this.editor;
    if (ed && (ed.purpose === "add" || ed.purpose === "quick" ? false : !(this.editing !== undefined && viewModel.nodes.some((n) => n.id === this.editing)))) this.closeEditor();
    const edge = this.selectedEdge !== undefined ? viewModel.edges.find((e) => e.id === this.selectedEdge) : undefined;
    if (!edge) this.selectedEdge = undefined;
    this.repaint();
    if (edge) this.tools.setEdgeSelection(edge);
    else this.tools.setSelection(viewModel, this.ia.selection);
    this.routeFromHandle(known);
  }

  /** Boxes as drawn now: the stored layout with the gesture's preview on top. */
  private currentRel(): Map<string, Box> {
    if (!this.preview) return this.rel;
    const m = new Map(this.rel);
    for (const [id, b] of this.preview) m.set(id, b);
    return m;
  }

  private viewMetrics(): Pick<Metrics, "view" | "canvas" | "highlights" | "staleDraws" | "focusOutline"> {
    return {
      view: { ...this.view }, canvas: this.canvasSize(), highlights: this.world.querySelectorAll("[data-highlight]").length, staleDraws: this.staleDraws,
      focusOutline: document.activeElement === this.svg && getComputedStyle(this.svg).outlineStyle !== "none",
    };
  }

  private repaint(): void {
    if (!this.vm) return;
    const rel = this.currentRel();
    const r = buildSvg(this.vm, rel, this.measure, {}, { routes: this.layoutRoutes, selected: this.selectedSet(), overrides: this.overrides });
    this.drawn = { routes: r.routes, labels: r.labels, labelLines: r.labelLines, laidOut: r.laidOut };
    for (const [id, pts] of this.pendingRoutes) {
      const now = r.routes.get(id);
      if (!now || now.length !== pts.length || now.some((q, i) => Math.abs(q.x - pts[i]!.x) > 0.5 || Math.abs(q.y - pts[i]!.y) > 0.5)) this.staleDraws++;
    }
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
    // Labels are drawn above nodes, so the label under the press wins; only the enlarged handle area needs its line selected.
    // Where a port or a node's resize handle is under the point, an unselected line's label does not take the press.
    const top = hit(this.scene, p);
    const portOrHandle = (top !== undefined && this.scene.get(top)?.owner !== undefined) || this.ia.handleAt(p) !== undefined;
    return ids.find((id) => { const l = this.labelOf(id); return l !== undefined && (id === this.selectedEdge || !portOrHandle) && labelHit(l.box, p, this.view.k, id === this.selectedEdge) !== undefined; });
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
      const end = this.reconnectEndAt(p);
      if (end) {
        this.startReconnect(sel, end, p);
        return true;
      }
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
      const wasSelected = lab === sel;
      this.selectEdge(lab);
      return begin(lab, labelHit(this.labelOf(lab)!.box, p, zoom, wasSelected));
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
    if (!(g.moved && g.out)) this.overrides.clear();
    if (g.moved && !g.out && (g.kind === "seg" || g.kind === "bend")) this.tools.notice("That line cannot be drawn as a simple orthogonal route there; it keeps its computed route.");
    // With a result, the previewed route or label stays in `overrides` until the host confirms (render) or refuses (editRejected): D22.
    if (g.moved && g.out) {
      if (g.kind === "seg" || g.kind === "bend") {
        const points = g.out.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }));
        this.pendingRoutes.set(g.id, points);
        this.emitEdge("Route", { id: g.id, points });
      }
      else this.emitEdge("Label", { id: g.id, label: g.out });
    }
    this.repaint();
  }

  /** The host refused the last edit: draw the committed state again. */
  editRejected(): void {
    this.overrides.clear();
    this.pendingRoutes.clear();
    this.ia.rejected();
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
    this.overlay.innerHTML = overlaySvg(boxes, handles, this.band, {}, this.view.k) + this.edgeHandles({}) + this.connectOverlay({}) + this.dropHighlight();
    // The drawing's `selected` flags follow the selection.
    for (const g of this.world.querySelectorAll<SVGGElement>("g[data-node]")) {
      const on = this.ia.selection.includes(g.getAttribute("data-node") ?? "");
      if (on) { g.setAttribute("data-selected", "true"); g.setAttribute("aria-current", "true"); }
      else { g.removeAttribute("data-selected"); g.removeAttribute("aria-current"); }
    }
  }

  /** The highlight of the nesting target: a filled outline round the node it would go into, or a dashed one round the parent it would leave. */
  private dropHighlight(): string {
    const t = this.dropTarget;
    if (!t) return "";
    const id = t.id ?? (this.dropFrom !== undefined ? this.scene.get(this.dropFrom)?.parent : undefined);
    const b = id !== undefined ? this.scene.get(id)?.abs : undefined;
    if (!b) return "";
    return `<rect class="drop-target${t.id === undefined ? " drop-out" : ""}" data-drop-target="${id}" data-drop-kind="${t.id === undefined ? "out" : "into"}" x="${b.x - 2}" y="${b.y - 2}" width="${b.w + 4}" height="${b.h + 4}" rx="6" fill="none" class="drop-target-stroke" stroke-width="3" stroke-dasharray="${t.id === undefined ? "6 4" : "none"}" pointer-events="none"/>`;
  }

  getView(): View { return { ...this.view }; }

  /** The view moved under an open quick bar: it would no longer sit at the end of the line. */
  private closeQuick(): void {
    if (this.quick) this.cancelConnect();
  }

  setView(v: View): void {
    this.closeQuick();
    this.view = { ...v };
    this.applyView();
  }

  /** Size of the canvas in px, from its box (the attribute-free outer svg can report 0 for `clientWidth`). */
  private canvasSize(): { w: number; h: number } {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width || this.svg.clientWidth || 800, h: r.height || this.svg.clientHeight || 600 };
  }

  fit(): void {
    if (!this.vm) return;
    const abs = [...absoluteBoxes(this.vm, this.rel).values(), ...this.drawn.labels.values()];
    const { w, h } = this.canvasSize();
    if (!abs.length) return;
    const b = boundsOf(abs);
    const k = Math.min(1, (w - 40) / b.w, (h - 40) / b.h);
    this.setView({ k, x: (w - b.w * k) / 2 - b.x * k, y: (h - b.h * k) / 2 - b.y * k });
    this.cb.onView(this.getView());
  }

  /** Fit the first time the diagram is opened, and again while the canvas is still getting its size, until the user pans or zooms. */
  fitOnOpen(): void {
    this.autoFit = true;
    this.fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (this.autoFit) this.fit(); else ro.disconnect(); });
    ro.observe(this.svg);
  }

  zoomBy(factor: number): void {
    const w = this.svg.clientWidth || 800, h = this.svg.clientHeight || 600;
    this.zoomAt(w / 2, h / 2, factor);
  }

  private zoomAt(mx: number, my: number, factor: number): void {
    this.autoFit = false;
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
    this.placeEditor();
  }

  /** Put the inline input back on its anchor after a pan, a zoom or a redraw; close it when what it is on has gone. */
  private placeEditor(): void {
    const e = this.editor;
    if (!e) return;
    const a = e.currentAnchor();
    if (!a) { this.closeEditor(); return; }
    const r = this.svg.getBoundingClientRect();
    e.moveTo(r.left + this.view.x + a.x * this.view.k, r.top + this.view.y + a.y * this.view.k);
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
      svg.setAttribute("data-pointer", "true");
      closeMenu();
      svg.focus({ preventScroll: true });
      // Gestures on the canvas must never select the SVG text labels.
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      if (this.quick) { this.cancelConnect(); return; }
      if (this.cg && e.button === 0) {
        // Click-click connecting: the second press picks the target.
        try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
        this.pressConnect(this.toInput(e));
        return;
      }
      if (this.tool && e.button === 0) {
        e.preventDefault();
        this.toolClick(this.toInput(e));
        return;
      }
      if (e.button === 0 && !e.shiftKey && this.beginHandle(this.toInput(e))) {
        try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
        return;
      }
      if (e.button === 0 && !e.shiftKey && this.beginLineGesture(this.toInput(e))) {
        if (this.rg || this.cg) { try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ } }
        return;
      }
      try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
      this.ia.pointerDown(this.toInput(e));
    });
    svg.addEventListener("dblclick", (e) => {
      const at = this.toInput(e, 0);
      const line = this.edgeHit(at);
      const id = hit(this.scene, at);
      // A double-click on a line's label is not a rename of the node under it.
      const lab = this.labelAtPoint(at);
      if (lab !== undefined && lab !== this.selectedEdge) return;
      if (lab !== undefined && id !== undefined) return;
      // A node under the point is renamed; a line adds a bend where no node is, or inside a container only when the line is selected.
      if (line !== undefined && (id === undefined || line === this.selectedEdge)) { this.bendAt(line, at); return; }
      if (id !== undefined) { if (this.inDocArea(id, at)) this.openDocEditor(id); else this.openEditor(id); }
    });
    svg.addEventListener("pointermove", (e) => {
      this.lastPoint = this.toInput(e);
      if (this.cg) { this.moveConnect(this.toInput(e)); return; }
      if (this.pg && !this.pg.placed) { this.pg.at = this.toInput(e); this.repaintOverlay(); }
      if (e.buttons === 0 && !this.tool && !this.rg) this.hoverHandles(this.toInput(e));
      if (this.rg) this.moveLineGesture(this.toInput(e));
      else this.ia.pointerMove(this.toInput(e));
      this.setHover(e.buttons === 0 ? this.hoverAt(this.toInput(e)) : undefined);
    });
    svg.addEventListener("pointerleave", () => { this.setHover(undefined); if (this.pg && !this.pg.placed) { delete this.pg.at; this.repaintOverlay(); } });
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.setHover(undefined); else this.resendHover(); });
    document.addEventListener("pointerleave", () => this.setHover(undefined));
    document.addEventListener("mouseout", (e) => { if (e.relatedTarget === null) this.setHover(undefined); });
    window.addEventListener("blur", () => { this.setHover(undefined); if (this.cg && !this.quick) this.cancelConnect(); });
    window.addEventListener("resize", () => this.closeQuick());
    svg.addEventListener("lostpointercapture", () => { if (this.cg?.down && !this.quick) this.cancelConnect(); });
    window.addEventListener("focus", () => this.resendHover());
    const end = (e: PointerEvent) => {
      if (this.cg) { this.releaseConnect(this.toInput(e)); return; }
      if (this.rg) this.endLineGesture(); else this.ia.pointerUp(this.toInput(e));
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => { if (this.cg) this.cancelConnect(); else if (!this.cancelLineGesture()) this.ia.cancel(); });
    svg.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.cg || this.quick) { this.cancelConnect(); return; }
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
      this.closeQuick();
      if (e.ctrlKey || e.metaKey) {
        const r = svg.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, wheelFactor(e.deltaY));
      } else {
        this.autoFit = false;
        this.view = { ...this.view, x: this.view.x - e.deltaX, y: this.view.y - e.deltaY };
        this.applyView();
        this.cb.onView(this.getView());
      }
    }, { passive: false });
    svg.addEventListener("keydown", (e) => {
      svg.removeAttribute("data-pointer");
      // An inline input that lost focus after an error is still open: Escape cancels it (and so the ghost and the tool behind it).
      if (e.key === "Escape" && this.editor) { this.editor.cancel(); e.preventDefault(); return; }
      if (e.key === "Escape" && (this.cg || this.quick)) { this.cancelConnect(); e.preventDefault(); return; }
      if (e.key === "Escape" && this.cancelLineGesture()) { e.preventDefault(); return; }
      if (e.key === "Escape" && !this.tool && this.selectedEdge !== undefined) { this.selectedEdge = undefined; this.repaint(); this.tools.setSelection(this.vm, this.ia.selection); }
      if (e.key === "Escape" && this.tool) { this.setTool(undefined); e.preventDefault(); return; }
      if (this.selectedEdge !== undefined && (e.key === "Delete" || e.key === "Backspace")) {
        const id = this.selectedEdge;
        this.selectedEdge = undefined;
        this.cb.onEdit({ kind: "remove", ids: [id] });
        e.preventDefault();
        return;
      }
      // With nothing selected the arrow keys pan the view; with a selection they nudge it (below). Not while a text field has focus.
      const pan = this.ia.selection.length === 0 && this.editor === undefined ? arrowPan(e.key, e.shiftKey) : undefined;
      if (pan && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        this.autoFit = false;
        this.view = { ...this.view, x: this.view.x + pan.dx, y: this.view.y + pan.dy };
        this.applyView();
        this.cb.onView(this.getView());
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
      const p = this.toInput(e);
      this.handleDrop(raw, { x: p.x, y: p.y });
    });
  }

  /** The payload of a drop: a JSON array of qualified names, or a single qualified name as text. */
  private handleDrop(raw: string, at?: { x: number; y: number }): void {
    let names: string[] = [];
    try {
      const v: unknown = JSON.parse(raw);
      if (Array.isArray(v)) names = v.filter((x): x is string => typeof x === "string");
    } catch {
      names = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
    if (names.length) this.cb.onDrop(names, at);
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
      ...(editable && DOC_SHAPES.has(n.shape) ? [{ label: n.props?.documentation ? "Edit Description" : "Add Description", action: "description" as const }] : []),
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
    else if (action === "description") this.openDocEditor(id);
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
    this.cancelConnect();
    this.closeEditor();
    this.pg = t?.kind === "add" ? { kind: t.item.kind, name: this.guessName(t.item.kind), placed: false } : undefined;
    this.repaintOverlay();
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
      if (this.pg?.placed) return; // the name is being typed: a click elsewhere saves it (the input's blur), it does not place another
      const rel = { x: Math.round(p.x - (box?.x ?? 0)), y: Math.round(p.y - (box?.y ?? 0)) };
      if (UNNAMED_KINDS.has(tool.item.kind)) {
        this.setTool(undefined);
        this.cb.onModel({ kind: "add", paletteKind: tool.item.kind, ...(owner !== undefined ? { ownerId: owner } : {}), ...rel });
        return;
      }
      this.placeGhost(tool.item.kind, p, owner, rel);
      return;
    }
    if (id === undefined) return;
    const relation = this.tool?.kind === "connect" ? this.tool.relation : undefined;
    this.ia.setSelection([id], false);
    this.cg = { kind: "connect", source: id, relation, at: p, start: p, down: true, moved: false, sticky: true };
    this.moveConnect(p, false);
  }


  // ---- connecting: ghost line, quick-connect handles, quick bar, reconnect -----------------

  /** Size of a quick-connect or reconnect handle, in canvas units. */
  private handleSize(): number { return 10 / this.view.k; }

  /** Why the node cannot take part in an edit, or undefined: inherited ends stay read-only (D18). */
  private lockedProblem(id: string): string | undefined {
    const n = this.vm?.nodes.find((x) => x.id === id);
    const l = n?.props?.locked;
    if (l === "inherited") return `'${n!.props?.name ?? "This element"}' is inherited from ${n!.inherited?.from ?? "its definition"}; connect it in the definition.`;
    if (l === "library") return "Standard library content is read-only.";
    if (l === "readonly") return n!.props?.lockedReason ?? "This element's file cannot be edited.";
    return undefined;
  }

  private connectProblem(g: ConnGesture, id: string): string | undefined {
    const rel = g.relation;
    const role = g.kind === "reconnect" ? g.end! : "target";
    // Inherited ends of successions, transitions and messages stay read-only (D18). A plain connection may end at an inherited port: it is written in the owner.
    return endProblem(this.vm, rel, g.source, id, role) ?? (g.side !== undefined || g.kind === "reconnect" || g.relation === "succession" || g.relation === "transition" || g.relation === "message" ? this.lockedProblem(id) : undefined);
  }

  /** The pointer moved with a connection open: find the node under it, and say whether it may be the end. */
  private moveConnect(p: Pt, count = true): void {
    const g = this.cg;
    if (!g) return;
    g.at = p;
    if (count && Math.hypot(p.x - g.start.x, p.y - g.start.y) >= DRAG_THRESHOLD) g.moved = true;
    const id = hit(this.scene, p);
    g.target = undefined;
    g.invalid = undefined;
    if (id !== undefined && !(g.kind === "reconnect" && id === g.source && g.relation !== "transition")) {
      const problem = this.connectProblem(g, id);
      if (problem) g.invalid = problem; else g.target = id;
    }
    this.svg.style.cursor = g.invalid !== undefined ? "not-allowed" : "";
    if (g.invalid !== undefined) {
      const c = this.toClient(p);
      this.tip.textContent = g.invalid;
      this.tip.style.left = `${c.clientX + 14}px`;
      this.tip.style.top = `${c.clientY + 14}px`;
      this.tip.hidden = false;
    } else this.tip.hidden = true;
    this.repaintOverlay();
  }

  /** The release of the button. A click with a tool keeps the line waiting for a second click; a drag ends the line here. */
  private releaseConnect(p: Pt): void {
    const g = this.cg;
    if (!g || this.quick || !g.down) return;
    if (!g.moved) {
      if (g.sticky) { g.down = false; this.repaintOverlay(); } else this.cancelConnect();
      return;
    }
    this.finishConnect(p);
  }

  /** The press of a second click while a line waits for its target. */
  private pressConnect(p: Pt): void {
    this.moveConnect(p);
    this.finishConnect(p);
  }

  private finishConnect(p: Pt): void {
    const g = this.cg;
    if (!g) return;
    this.moveConnect(p);
    if (g.target !== undefined) {
      const target = g.target;
      if (g.kind === "reconnect") {
        const e = this.vm?.edges.find((x) => x.id === g.edge);
        const same = e !== undefined && (g.end === "source" ? e.source : e.target) === target;
        this.cancelConnect();
        if (!same) this.cb.onModel({ kind: "reconnect", id: g.edge!, end: g.end!, nodeId: target });
        return;
      }
      const relation = g.relation;
      const source = g.source;
      if (g.side !== undefined) this.pendingSide = { source, target, side: g.side };
      this.cg = undefined;
      this.setTool(undefined);
      this.cancelConnect();
      this.cb.onModel({ kind: "connect", sourceId: source, targetId: target, ...(relation ? { relation } : {}) });
      return;
    }
    if (g.invalid !== undefined) {
      this.tools.notice(g.invalid);
      this.cancelConnect();
      return;
    }
    // Empty canvas: a reconnect snaps back; a new line offers the node kinds that can end it.
    const relation = g.relation;
    const items = g.kind === "connect" && this.vm && (relation === "succession" || relation === "transition") ? quickBarItems(this.vm.kind, relation) : [];
    if (g.kind === "connect" && items.length && (relation === "succession" || relation === "transition")) {
      this.openQuickBar(g, p, items.map((i) => i.kind), relation);
      return;
    }
    if (g.sticky && !g.moved) return;
    this.tools.notice(g.kind === "reconnect" ? "The line snapped back: drop its end on an element." : "A line needs an element at both ends; nothing was written.");
    this.cancelConnect();
  }

  private openQuickBar(g: ConnGesture, p: Pt, kinds: string[], relation: "succession" | "transition"): void {
    this.quick?.el.remove();
    const el = document.createElement("div");
    el.className = "quick-bar";
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", "Add a node at the end of the line");
    const c = this.toClient(p);
    el.style.left = `${c.clientX + QUICK_GAP}px`;
    el.style.top = `${c.clientY}px`;
    for (const k of kinds) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.kind = k;
      b.textContent = k.charAt(0).toUpperCase() + k.slice(1);
      b.addEventListener("click", () => this.chooseQuick(k));
      el.append(b);
    }
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { this.cancelConnect(); this.svg.focus({ preventScroll: true }); e.preventDefault(); } e.stopPropagation(); });
    g.down = false;
    this.svg.parentElement?.append(el);
    // Keep the bar on screen near the end of the line.
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
    if (r.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, c.clientY - r.height)}px`;
    this.quick = { el, at: p, items: kinds, source: g.source, relation, ...(g.side ? { side: g.side } : {}) };
    this.svg.style.cursor = "";
    this.tip.hidden = true;
    this.repaintOverlay();
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

  private chooseQuick(kind: string): void {
    const q = this.quick;
    if (!q) return;
    const parent = this.scene.get(q.source)?.parent;
    const base = parent !== undefined ? this.scene.get(parent)?.abs : undefined;
    const rel = { x: Math.round(q.at.x - (base?.x ?? 0)), y: Math.round(q.at.y - (base?.y ?? 0)) };
    const send = (name?: string) => {
      this.setTool(undefined);
      this.cancelConnect();
      this.cb.onModel({ kind: "connectNew", sourceId: q.source, relation: q.relation, paletteKind: kind, ...rel, ...(name !== undefined ? { name } : {}) });
      this.svg.focus({ preventScroll: true });
    };
    if (UNNAMED_KINDS.has(kind)) return send();
    // A named node is written once its name is confirmed, like a palette element; the ghost line stays meanwhile.
    q.el.remove();
    this.pg = { kind, name: this.guessName(kind), at: q.at, placed: true, quick: true };
    this.repaintOverlay();
    this.openNameInput("quick", kind, q.at, { siblingOf: q.source }, send, () => { this.cancelConnect(); this.svg.focus({ preventScroll: true }); });
  }

  /** Remove the ghost line, the quick bar and the tip; nothing was written. */
  private cancelConnect(): void {
    const had = this.cg !== undefined || this.quick !== undefined;
    if (this.editor?.purpose === "quick") this.closeEditor();
    if (this.pg?.quick) this.pg = undefined;
    this.cg = undefined;
    this.quick?.el.remove();
    this.quick = undefined;
    this.tip.hidden = true;
    this.svg.style.cursor = "";
    if (had) this.repaintOverlay();
  }

  /** The host answered: whatever was drawn for the edit is replaced by the committed model. */
  private dropConnect(): void {
    this.cg = undefined;
    this.quick?.el.remove();
    this.quick = undefined;
    this.tip.hidden = true;
    this.svg.style.cursor = "";
    this.handleNode = undefined;
  }

  /** A line drawn from a quick-connect handle leaves from that side: write the route once the host has added the line. */
  private routeFromHandle(known: ReadonlySet<string>): void {
    const pend = this.pendingSide;
    if (!pend || !this.vm) return;
    const e = this.vm.edges.find((x) => !known.has(x.id) && x.source === pend.source && x.target === pend.target);
    if (!e) return;
    this.pendingSide = undefined;
    const src = this.scene.get(pend.source)?.abs, tgt = this.scene.get(pend.target)?.abs;
    if (!src || !tgt) return;
    const pts = ghostRoute(src, pend.side, { x: tgt.x + tgt.w / 2, y: tgt.y + tgt.h / 2 }, tgt);
    this.emitEdge("Route", { id: e.id, points: pts.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 })) });
  }

  /** Quick-connect handles: shown on the state or Action Flow node under the pointer. */
  private hoverHandles(p: Pt): void {
    const vm = this.vm;
    if (!vm) return;
    let id = this.handleNode;
    const box = id !== undefined ? this.scene.get(id)?.abs : undefined;
    const keep = id !== undefined && box !== undefined && (hit(this.scene, p) === id || sideAt(box, p, this.handleSize()) !== undefined);
    if (!keep) {
      const h = hit(this.scene, p);
      const n = h !== undefined ? vm.nodes.find((x) => x.id === h) : undefined;
      id = n && hasHandles(vm, n) ? n.id : undefined;
    }
    if (id !== this.handleNode) {
      this.handleNode = id;
      this.repaintOverlay();
    }
  }

  /** A press on a quick-connect handle starts a line that leaves from that side. */
  private beginHandle(p: Pt): boolean {
    const vm = this.vm;
    const id = this.handleNode;
    if (!vm || id === undefined) return false;
    const box = this.scene.get(id)?.abs;
    const side = box ? sideAt(box, p, this.handleSize()) : undefined;
    const relation = handleRelation(vm.kind);
    if (!side || !relation) return false;
    this.cg = { kind: "connect", source: id, relation, side, at: p, start: p, down: true, moved: false, sticky: false };
    this.moveConnect(p, false);
    return true;
  }

  /** Whether the line has handles at its ends: successions, transitions and item flows of the model, not derived or implied ones. */
  private reconnectable(id: string): boolean {
    const e = this.vm?.edges.find((x) => x.id === id);
    return !!e && e.resolved && !e.derived && !e.fixed && !e.implied && !e.locked && (e.style === "succession" || e.style === "transition" || e.style === "flow") && (this.drawn.routes.get(id)?.length ?? 0) >= 2;
  }

  private reconnectEndAt(p: Pt): "source" | "target" | undefined {
    const id = this.selectedEdge;
    if (id === undefined || !this.reconnectable(id)) return undefined;
    const pts = this.drawn.routes.get(id)!;
    const reach = 7 / this.view.k;
    const near = (q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) <= reach;
    return near(pts[pts.length - 1]!) ? "target" : near(pts[0]!) ? "source" : undefined;
  }

  private startReconnect(id: string, end: "source" | "target", p: Pt): void {
    const e = this.vm?.edges.find((x) => x.id === id);
    if (!e) return;
    this.cg = { kind: "reconnect", source: end === "source" ? e.target : e.source, relation: e.style as ConnGesture["relation"], edge: id, end, at: p, start: p, down: true, moved: false, sticky: false };
    this.moveConnect(p, false);
  }

  /** The ghost line, the highlighted target, the quick-connect handles and the reconnect handles. */
  private connectOverlay(o: { palette?: Parameters<typeof edgeHandlesSvg>[2]["palette"] }): string {
    const vm = this.vm;
    if (!vm) return "";
    const k = this.view.k;
    const sel = o.palette ? o.palette.sel : undefined;
    const stroke = sel ? ` stroke="${sel}"` : ' class="sel-line"';
    const fill = sel ? ` fill="${sel}"` : ' class="sel-fill"';
    const bg = o.palette ? ` stroke="${o.palette.bg}"` : ' stroke="none"';
    const f = (n: number) => String(Math.round(n * 100) / 100);
    let out = "";
    const g = this.cg;
    if (!g && this.handleNode !== undefined) {
      const box = this.scene.get(this.handleNode)?.abs;
      if (box) for (const [side, b] of Object.entries(handleBoxesOf(box, this.handleSize()))) out += `<rect data-connect-handle="${side}" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill-opacity="0.85"${fill}${bg}/>`;
    }
    if (!g && this.selectedEdge !== undefined && this.reconnectable(this.selectedEdge)) {
      const pts = this.drawn.routes.get(this.selectedEdge)!;
      for (const [end, q] of [["source", pts[0]!], ["target", pts[pts.length - 1]!]] as const) out += `<circle data-reconnect-handle="${end}" cx="${f(q.x)}" cy="${f(q.y)}" r="${f(5 / k)}"${fill}${bg}/>`;
    }
    if (g) {
      const src = this.scene.get(g.source)?.abs;
      if (src && (g.moved || g.sticky || this.quick)) {
        const target = g.target !== undefined ? this.scene.get(g.target)?.abs : undefined;
        const at = this.quick ? this.quick.at : g.at;
        let pts = ghostRoute(src, g.side, at, target);
        if (g.kind === "reconnect" && g.end === "source") pts = [...pts].reverse();
        out += ghostSvg(pts, { zoom: k, valid: target !== undefined, ...(sel ? { colour: sel } : {}) });
        const hl = target ?? (g.invalid !== undefined && g.kind !== undefined ? this.scene.get(hit(this.scene, g.at) ?? "")?.abs : undefined);
        if (hl) out += `<rect data-ghost-target="${g.target !== undefined ? "valid" : "invalid"}" x="${f(hl.x - 3)}" y="${f(hl.y - 3)}" width="${f(hl.w + 6)}" height="${f(hl.h + 6)}" fill="none" stroke-width="${f(2 / k)}"${g.target !== undefined ? stroke : o.palette ? ` stroke="${o.palette.warn}"` : ' class="ghost-bad"'}/>`;
      }
    }
    return out + this.ghostNodeSvg(o);
  }

  private closeEditor(): void {
    const e = this.editor;
    this.editor = undefined;
    e?.dispose();
    if (e?.purpose === "add" && this.pg?.placed) { this.pg = undefined; this.repaintOverlay(); }
  }

  /** A name for the ghost before the host has been asked: the next free one among the names on the diagram. */
  private guessName(kind: string): string {
    const taken = new Set((this.vm?.nodes ?? []).flatMap((n) => [n.props?.name, n.label]).filter((x): x is string => x !== undefined));
    return nextFreeName(defaultStem(kind), taken);
  }

  /** Whether the point is on the description area of the node (a double-click there edits the description, not the name). */
  private inDocArea(id: string, p: Pt): boolean {
    const n = this.vm?.nodes.find((x) => x.id === id);
    const box = this.scene.get(id)?.abs;
    if (!n || !n.doc || !box) return false;
    const a = describeBox(n, this.measure).docArea;
    return !!a && p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y + a.y - 2 && p.y <= box.y + a.y + a.h + 2;
  }

  /** The palette ghost is placed: the element is only written once the name in the inline input is confirmed (D32). */
  private placeGhost(kind: string, at: Pt, owner: string | undefined, rel: Pt): void {
    this.pg = { kind, name: this.pg?.name ?? this.guessName(kind), at, placed: true };
    this.repaintOverlay();
    const done = (name?: string) => {
      this.setTool(undefined);
      if (name !== undefined) this.cb.onModel({ kind: "add", paletteKind: kind, ...(owner !== undefined ? { ownerId: owner } : {}), x: rel.x, y: rel.y, name });
      this.svg.focus({ preventScroll: true });
    };
    this.openNameInput("add", kind, at, owner !== undefined ? { ownerId: owner } : {}, (v) => done(v), () => done());
  }

  /** The inline input for the name of a new element, over the ghost at canvas point `at`. */
  private openNameInput(purpose: "add" | "quick", kind: string, at: Pt, where: { ownerId?: string; siblingOf?: string }, onName: (name: string) => void, onCancel: () => void): void {
    this.closeEditor();
    const g = ghostBox(kind, this.pg?.name ?? this.guessName(kind), this.measure);
    const c = this.toClient(at);
    const k = this.view.k;
    const input = new InlineInput({
      left: c.clientX + 4 * k, top: c.clientY + (g.keyword ? 18 : 3) * k, width: Math.max(110, (g.w - 8) * k), anchor: { x: at.x + 4, y: at.y + (g.keyword ? 18 : 3) }, anchorNow: () => ({ x: at.x + 4, y: at.y + (g.keyword ? 18 : 3) }),
      value: this.pg?.name ?? this.guessName(kind), purpose, label: `Name of the new ${kind}`,
      check: async (v) => (await this.cb.checkName({ name: v, kind, ...where })).problem,
      init: async (inp) => {
        const r = await this.cb.checkName({ name: inp.value, kind, ...where });
        // The host knows the owner's names: its default replaces the guess until the user types.
        if (r.suggested !== undefined && !inp.touched && r.suggested !== inp.value) { inp.setValue(r.suggested); if (this.pg) this.pg.name = r.suggested; this.repaintOverlay(); }
      },
      onCommit: (v) => { this.editor = undefined; onName(v); },
      onCancel: () => { this.editor = undefined; onCancel(); },
    });
    input.field.addEventListener("input", () => { if (this.pg) { this.pg.name = input.value || this.pg.name; this.repaintOverlay(); } });
    this.editor = input;
  }

  /** The palette ghost, drawn in the overlay: a dashed node with its default name. */
  private ghostNodeSvg(o: { palette?: Parameters<typeof edgeHandlesSvg>[2]["palette"] }): string {
    const pg = this.pg;
    if (!pg?.at) return "";
    const g = ghostBox(pg.kind, pg.name, this.measure);
    const f = (n: number) => String(Math.round(n * 100) / 100);
    const sel = o.palette?.sel;
    const stroke = sel ? ` stroke="${sel}"` : ' class="sel-line"';
    const text = o.palette ? ` fill="${o.palette.text}"` : ' class="f-text"';
    let out = `<g data-palette-ghost="${pg.kind}" opacity="0.8" pointer-events="none">`;
    out += `<rect x="${f(pg.at.x)}" y="${f(pg.at.y)}" width="${f(g.w)}" height="${f(g.h)}" rx="${g.rx}" fill="${o.palette ? o.palette.bg : "none"}" stroke-dasharray="5 3"${stroke}/>`;
    if (!g.control) {
      if (g.keyword) out += `<text x="${f(pg.at.x + g.w / 2)}" y="${f(pg.at.y + 14)}" font-size="12" font-style="italic" text-anchor="middle"${text}>${g.keyword}</text>`;
      // The name is the inline input's while it is open; it is drawn here only before the click.
      if (!this.editor) out += `<text x="${f(pg.at.x + g.w / 2)}" y="${f(pg.at.y + (g.keyword ? 32 : 17))}" font-size="12" font-weight="bold" text-anchor="middle"${text}>${esc(pg.name)}</text>`;
    }
    return out + "</g>";
  }

  /** The inline name editor: an input over the label. Enter or a click elsewhere saves (a rename that updates references), Escape cancels. */
  openEditor(id: string): void {
    const n = this.vm?.nodes.find((x) => x.id === id);
    const box = this.scene.get(id)?.abs;
    if (!n || !box) return;
    this.closeEditor();
    if (!n.resolved || !n.props || n.props.locked !== undefined || n.props.name === undefined) {
      this.tools.notice(this.lockedNotice(n, "renamed", "This element has no name to edit."));
      return;
    }
    const original = n.props.name;
    this.editing = id;
    const r = this.svg.getBoundingClientRect();
    const top = box.y + (n.keyword ? 18 : 3);
    this.editor = new InlineInput({
      left: r.left + this.view.x + (box.x + 4) * this.view.k, top: r.top + this.view.y + top * this.view.k, width: Math.max(90, (box.w - 8) * this.view.k), anchor: { x: box.x + 4, y: top },
      anchorNow: () => { const b = this.scene.get(id)?.abs; const nn = this.vm?.nodes.find((x) => x.id === id); return b && nn ? { x: b.x + 4, y: b.y + (nn.keyword ? 18 : 3) } : undefined; },
      value: original, purpose: "rename", label: `Rename ${original}`,
      check: async (v) => (v === original ? undefined : (await this.cb.checkName({ name: v, siblingOf: id, rename: true })).problem),
      onCommit: (v) => { this.editor = undefined; this.svg.focus({ preventScroll: true }); if (v.trim() !== "" && v !== original) this.cb.onModel({ kind: "rename", id, name: v }); },
      onCancel: () => { this.editor = undefined; this.svg.focus({ preventScroll: true }); },
    });
  }

  /** The inline description editor (multi-line): Enter or a click elsewhere saves, Shift+Enter adds a line, Escape cancels. An empty text removes the doc. */
  openDocEditor(id: string): void {
    const n = this.vm?.nodes.find((x) => x.id === id);
    const box = this.scene.get(id)?.abs;
    if (!n || !box) return;
    this.closeEditor();
    if (!n.resolved || !n.props || n.props.locked !== undefined || !DOC_SHAPES.has(n.shape)) {
      this.tools.notice(this.lockedNotice(n, "changed", "This element has no description."));
      return;
    }
    const original = n.props.documentation ?? "";
    this.editing = id;
    const c = describeBox(n, this.measure);
    const r = this.svg.getBoundingClientRect();
    const top = c.docArea ? box.y + c.docArea.y - 2 : box.y + c.headerH;
    const k = this.view.k;
    this.editor = new InlineInput({
      left: r.left + this.view.x + (box.x + 4) * k, top: r.top + this.view.y + top * k, width: Math.max(180, (box.w - 8) * k), anchor: { x: box.x + 4, y: top },
      anchorNow: () => { const b = this.scene.get(id)?.abs; const nn = this.vm?.nodes.find((x) => x.id === id); if (!b || !nn) return undefined; const cc = describeBox(nn, this.measure); return { x: b.x + 4, y: cc.docArea ? b.y + cc.docArea.y - 2 : b.y + cc.headerH }; },
      height: Math.max(56, ((c.docArea?.h ?? 0) + 14) * k),
      value: original, multiline: true, purpose: "doc", label: `Description of ${n.props.name ?? n.label}`,
      onCommit: (v) => {
        this.editor = undefined;
        this.svg.focus({ preventScroll: true });
        // Leading whitespace of the first line is kept; only blank lines at the start and trailing whitespace go.
        const clean = (t: string) => t.replace(/\r\n/g, "\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();
        const text = clean(v);
        if (text !== clean(original)) this.cb.onModel({ kind: "setProperties", id, changes: { documentation: text.trim() === "" ? null : text } });
      },
      onCancel: () => { this.editor = undefined; this.svg.focus({ preventScroll: true }); },
    });
  }

  /** Why an element cannot be edited from this diagram (shown as a notice; inherited elements also have a tooltip on the node). */
  private lockedNotice(n: ViewModel["nodes"][number] | undefined, what: string, none: string): string {
    if (!n?.resolved) return `An unresolved item cannot be ${what}.`;
    const l = n.props?.locked;
    if (l === "inherited") return `'${n.props?.name ?? n.label}' is inherited from ${n.inherited?.from ?? "its definition"} and cannot be ${what} here. Change it in the definition.`;
    if (l === "library") return "Standard library content is read-only.";
    if (l === "readonly") return n.props?.lockedReason ?? "This element's file cannot be edited.";
    return none;
  }

  // ---- test gestures ---------------------------------------------------------------------

  /** Type `text` into the open inline input (replacing its value) as input events do. */
  private typeInto(ed: InlineInput, text: string): void {
    ed.field.value = text;
    ed.field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** End the inline input the way a key or a click elsewhere does, and wait until it has been saved or cancelled. */
  private async endInline(ed: InlineInput, end: "enter" | "shiftEnter" | "escape" | "blur"): Promise<void> {
    if (end === "blur") ed.field.dispatchEvent(new FocusEvent("blur"));
    else ed.field.dispatchEvent(new KeyboardEvent("keydown", { key: end === "escape" ? "Escape" : "Enter", shiftKey: end === "shiftEnter", bubbles: true, cancelable: true }));
    await ed.settle();
  }

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

  private fire(type: "pointerdown" | "pointermove" | "pointerup", p: Pt, o: { shift?: boolean; buttons?: number } = {}): void {
    this.svg.dispatchEvent(new PointerEvent(type, { ...this.toClient(p), button: 0, buttons: o.buttons ?? (type === "pointerup" ? 0 : 1), pointerId: 7, bubbles: true, cancelable: true, shiftKey: !!o.shift }));
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

  /** Press at `from`, move to `to` in steps, and release there unless `hold`. */
  private dragConnect(from: Pt, to: Pt, hold: boolean): void {
    this.fire("pointerdown", from);
    for (let i = 1; i <= 6; i++) this.fire("pointermove", { x: from.x + ((to.x - from.x) * i) / 6, y: from.y + ((to.y - from.y) * i) / 6 });
    if (!hold) this.fire("pointerup", to);
  }

  /** Replay a gesture as DOM events on the diagram, so it takes the paths real input takes. */
  async testGesture(g: TestGesture): Promise<void> {
    switch (g.kind) {
      case "select": this.click(this.pointOn(g.id), g.shift); break;
      case "drag": {
        if (!g.hold) { this.dragFrom(this.pointOn(g.id), g.dx, g.dy, g.steps); break; }
        const p = this.pointOn(g.id), steps = g.steps ?? 6;
        this.fire("pointerdown", p, { shift: false });
        for (let i = 1; i <= steps; i++) this.fire("pointermove", { x: p.x + (g.dx * i) / steps, y: p.y + (g.dy * i) / steps }, { shift: false });
        return new Promise<void>((r) => setTimeout(() => { this.fire("pointerup", { x: p.x + g.dx, y: p.y + g.dy }, { shift: false }); r(); }, g.hold));
      }
      case "resize": {
        if (!(this.ia.selection.length === 1 && this.ia.selection[0] === g.id)) this.click(this.pointOn(g.id));
        const b = this.scene.get(g.id)?.abs;
        const hb = b && (handleBoxes(b) as Record<string, Box | undefined>)[g.handle];
        if (!hb) throw new Error(`no handle ${g.handle} on ${g.id}`);
        this.dragFrom({ x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 }, g.dx, g.dy);
        break;
      }
      case "labelClick": {
        const l = this.labelOf(g.id);
        if (!l) throw new Error(`no adjustable label on ${g.id}`);
        this.click({ x: l.box.x + l.box.w / 2, y: l.box.y + l.box.h / 2 });
        break;
      }
      case "wheel":
        this.svg.dispatchEvent(new WheelEvent("wheel", { deltaY: g.deltaY, ctrlKey: !!g.ctrl, clientX: this.svg.getBoundingClientRect().left + 100, clientY: this.svg.getBoundingClientRect().top + 100, bubbles: true, cancelable: true }));
        break;
      case "focusCanvas":
        if (g.mouse) this.svg.setAttribute("data-pointer", "true"); else this.svg.removeAttribute("data-pointer");
        this.svg.blur();
        this.svg.focus({ preventScroll: true });
        break;
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
        const c = g.x !== undefined && g.y !== undefined ? this.toClient({ x: g.x, y: g.y }) : {};
        this.svg.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, ...c, bubbles: true, cancelable: true }));
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
        // The ghost follows the pointer to the place, then the click places it.
        this.fire("pointermove", p, { buttons: 0 });
        this.fire("pointerdown", p);
        this.fire("pointerup", p);
        const ed = this.editor;
        if (ed) {
          await ed.ready;
          if (g.name !== undefined) this.typeInto(ed, g.name);
          if (g.hold !== true) await this.endInline(ed, "enter");
        }
        break;
      }
      case "ghostMove": this.fire("pointermove", { x: g.x, y: g.y }, { buttons: 0 }); break;
      case "inline": {
        const ed = this.editor;
        if (!ed) throw new Error("no inline input is open");
        await ed.ready;
        if (g.text !== undefined) this.typeInto(ed, g.text);
        if (g.end !== undefined) await this.endInline(ed, g.end);
        break;
      }
      case "dblclick": {
        const n = this.vm?.nodes.find((x) => x.id === g.id);
        const box = this.scene.get(g.id)?.abs;
        if (!n || !box) throw new Error(`no node ${g.id}`);
        const c = describeBox(n, this.measure);
        const label = c.rows.find((r) => r.kind === "label");
        const at: Pt = g.area === "doc"
          ? (c.docArea ? { x: box.x + box.w / 2, y: box.y + c.docArea.y + c.docArea.h / 2 } : (() => { throw new Error(`node ${g.id} shows no description`); })())
          : { x: box.x + box.w / 2, y: box.y + (label ? label.y - 5 : box.h / 2) };
        this.svg.dispatchEvent(new MouseEvent("dblclick", { ...this.toClient(at), button: 0, detail: 2, bubbles: true, cancelable: true }));
        await this.editor?.ready;
        break;
      }
      case "descriptions": {
        const t = this.tools.descriptionToggle;
        if (t.checked !== g.show) t.click();
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
      case "hoverNode": this.fire("pointermove", this.pointOn(g.id), { buttons: 0 }); break;
      case "connectDrag": {
        if (g.relation && !g.side) {
          const btn = this.tools.palette.querySelector<HTMLButtonElement>(`button[data-kind="${g.relation}"]`);
          if (!btn) throw new Error(`the palette has no ${g.relation} tool`);
          btn.click();
        }
        let from = this.pointOn(g.source);
        if (g.side) {
          const box = this.scene.get(g.source)?.abs;
          if (!box) throw new Error(`no node ${g.source}`);
          this.fire("pointermove", from, { buttons: 0 });
          const hb = handleBoxesOf(box, this.handleSize())[g.side];
          from = { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 };
          this.fire("pointermove", from, { buttons: 0 });
        }
        const to = g.target !== undefined ? this.pointOn(g.target) : { x: g.x ?? from.x, y: g.y ?? from.y };
        this.dragConnect(from, to, g.hold === true);
        break;
      }
      case "connectRelease": this.fire("pointerup", this.lastPoint); break;
      case "quickBar": {
        if (g.item === undefined) {
          this.svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
          break;
        }
        const btn = this.quick?.el.querySelector<HTMLButtonElement>(`button[data-kind="${CSS.escape(g.item)}"]`);
        if (!btn) throw new Error(`the quick bar has no ${g.item} item (it shows: ${this.quick?.items.join(", ") ?? "nothing"})`);
        btn.click();
        break;
      }
      case "reconnectDrag": {
        if (this.selectedEdge !== g.id) this.click(this.pointOnEdge(g.id));
        const pts = this.drawn.routes.get(g.id);
        if (!pts || pts.length < 2) throw new Error(`no route for ${g.id}`);
        const from = g.end === "source" ? pts[0]! : pts[pts.length - 1]!;
        const to = g.target !== undefined ? this.pointOn(g.target) : { x: g.x ?? from.x, y: g.y ?? from.y };
        this.dragConnect(from, to, g.hold === true);
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
        const ed = this.editor;
        if (!ed) throw new Error(`the inline editor did not open for ${g.id}`);
        this.typeInto(ed, g.text);
        await this.endInline(ed, g.commit ? "enter" : "escape");
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
      portsOffBorder: 0, descriptions: true, quickBar: [], connectHandles: 0, reconnectHandles: 0, selected: [], menu: [], selectedNamed: 0, handles: 0, routeHandles: 0, labelHandles: 0, inheritedNodes: 0, palette: [], properties: { visible: false, fields: {} }, inlineEditor: false, theme: themeOf(), focusable: this.svg.tabIndex >= 0, zoom: this.view.k, ...this.viewMetrics(),
    };
    if (!vm) return empty;
    const abs = absoluteBoxes(vm, this.currentRel());
    const nodes = vm.nodes.flatMap((n) => {
      const b = abs.get(n.id);
      if (!b) return [];
      const g = this.world.querySelector(`g[data-node="${CSS.escape(n.id)}"]`);
      const text = g ? [...g.querySelectorAll("text")].map((t) => t.textContent ?? "").join(" | ") : "";
      return [{ id: n.id, x: b.x, y: b.y, w: b.w, h: b.h, shape: n.shape, text, ...(n.inherited ? { inherited: true } : {}), ...(g?.querySelector(":scope > title") ? { tooltip: g.querySelector(":scope > title")!.textContent ?? "" } : {}), ...(n.parent !== undefined ? { parent: n.parent } : {}), ...(n.attachedTo !== undefined ? { attachedTo: n.attachedTo } : {}) }];
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
      focusable: this.svg.tabIndex >= 0, zoom: this.view.k, ...this.viewMetrics(), ...this.tools.state(), ...this.connectMetrics(), inlineEditor: this.editor !== undefined, ...this.inlineMetrics(), descriptions: this.vm?.descriptions !== false, theme: themeOf(),
    };
  }

  private inlineMetrics(): Pick<Metrics, "inline" | "paletteGhost"> {
    const e = this.editor;
    return { ...(e ? { inline: { value: e.value, ...(e.error !== undefined ? { error: e.error } : {}), purpose: e.purpose } } : {}), ...(this.pg ? { paletteGhost: { kind: this.pg.kind, name: this.pg.name, placed: this.pg.placed } } : {}) };
  }

  /** Where the quick bar sits and where the ghost line ends, in canvas coordinates (a test measure: they match). */
  private quickAnchor(): Pick<Metrics, "quickAnchor"> | Record<string, never> {
    const q = this.quick;
    if (!q) return {};
    const sr = this.svg.getBoundingClientRect(), br = q.el.getBoundingClientRect();
    const cv = (cx: number, cy: number) => ({ x: (cx - sr.left - this.view.x) / this.view.k, y: (cy - sr.top - this.view.y) / this.view.k });
    return { quickAnchor: { bar: cv(br.left - QUICK_GAP, br.top), ghostEnd: { x: q.at.x, y: q.at.y } } };
  }

  private connectMetrics(): Pick<Metrics, "ghost" | "quickBar" | "connectHandles" | "reconnectHandles"> {
    const g = this.cg;
    const ghost = g && this.overlay.querySelector("[data-ghost]") ? { points: (this.overlay.querySelector("[data-ghost]")?.getAttribute("d") ?? "").split(/[ML]/).filter(Boolean).length, ...(g.target !== undefined ? { target: g.target } : {}), ...(g.invalid !== undefined ? { invalid: g.invalid } : {}) } : undefined;
    return { ...(ghost ? { ghost } : {}), quickBar: this.quick ? this.quick.items : [], ...this.quickAnchor(), connectHandles: this.overlay.querySelectorAll("[data-connect-handle]").length, reconnectHandles: this.overlay.querySelectorAll("[data-reconnect-handle]").length };
  }

  toSvgString(theme: PngTheme): string {
    if (!this.vm) return "";
    const palette = theme === "editor-dark" ? DARK_PALETTE : LIGHT_PALETTE;
    const rel = this.currentRel();
    const r = buildSvg(this.vm, rel, this.measure, { palette }, { routes: this.layoutRoutes, selected: theme === "light" ? new Set<string>() : this.selectedSet() });
    if (theme !== "light") {
      const { boxes, handles } = this.selectionBoxes();
      r.content += overlaySvg(boxes, handles, undefined, { palette }) + this.edgeHandles({ palette }) + this.connectOverlay({ palette });
    }
    return wrapStandalone(r, { palette }).svg;
  }

  /** Round a world coordinate onto the grid (for tests and tooling). */
  static snap(v: number): number { return snap(v); }
}

interface ConnGesture {
  /** A new line from a node, or a line's end being moved. */
  kind: "connect" | "reconnect";
  /** The node the line leaves; for a reconnect, the node at the end that stays. */
  source: string;
  relation: ConnectRelation | "flow" | undefined;
  /** The side a quick-connect handle leaves from. */
  side?: Side;
  start: Pt;
  at: Pt;
  down: boolean;
  moved: boolean;
  /** Started by a click with a palette tool: a click without a drag keeps the line waiting for a second click. */
  sticky?: boolean;
  /** The node under the pointer when it may be the end, and why it may not when it cannot. */
  target?: string;
  invalid?: string;
  edge?: string;
  end?: "source" | "target";
}

type LineGesture =
  | { kind: "seg"; id: string; i: number; start: Pt; base: Pt[]; src: Box; tgt: Box; moved: boolean; out?: Pt[] }
  | { kind: "bend"; id: string; k: number; start: Pt; base: Pt[]; src: Box; tgt: Box; moved: boolean; out?: Pt[] }
  | { kind: "lmove" | "lresize"; id: string; start: Pt; box: Box; pts: Pt[]; sized: boolean; cur?: LabelLayout; moved: boolean; out?: LabelLayout };

type MenuAction = "remove" | "relink" | "deleteModel" | "rename" | "goto" | "description";

/** `light`, `dark` or `hc`, from the classes VS Code puts on the webview body. */
function themeOf(): string {
  const c = document.body.classList;
  return c.contains("vscode-high-contrast") || c.contains("vscode-high-contrast-light") ? "hc" : c.contains("vscode-light") ? "light" : "dark";
}

/** Gap between the end of the ghost line and the quick bar, in px. */
const QUICK_GAP = 6;

const closeMenu = (): void => document.querySelector(".ctx-menu")?.remove();

function hit(scene: Scene, p: Pt): string | undefined {
  for (let i = scene.items.length - 1; i >= 0; i--) {
    const it = scene.items[i]!;
    const s = it.owner !== undefined ? 3 : 0;
    if (p.x >= it.abs.x - s && p.x <= it.abs.x + it.abs.w + s && p.y >= it.abs.y - s && p.y <= it.abs.y + it.abs.h + s) return it.id;
  }
  return undefined;
}

/** The size and look of the palette ghost of a kind: a control node is its fixed small shape, others a box sized for the keyword and the name. */
function ghostBox(kind: string, name: string, measure: Measure): { w: number; h: number; rx: number; keyword?: string; control?: boolean } {
  if (UNNAMED_KINDS.has(kind)) {
    const shape = kind === "fork" || kind === "join" ? "fork" : "decision";
    const c = describeBox({ id: "ghost", shape, label: "", resolved: true }, measure);
    return { w: c.w, h: c.h, rx: 0, control: true };
  }
  const shape = kind === "action" ? "action" : kind === "state" ? "state" : kind.endsWith(" def") ? "definition" : "usage";
  const keyword = `\u00ab${kind}\u00bb`;
  const c = describeBox({ id: "ghost", shape, keyword, label: name, resolved: true }, measure);
  return { w: c.w, h: c.h, rx: shape === "definition" ? 0 : shape === "state" ? 16 : 10, keyword };
}
