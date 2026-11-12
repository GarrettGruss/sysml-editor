/**
 * Selection, move, resize, rubber band, keyboard: the logic of the diagram's gestures, without a
 * DOM. The renderer feeds it pointer and key input in canvas coordinates and draws what it reports;
 * a gesture ends in one `onEdit` call (design D7: one undoable edit per gesture).
 */
import type { BoxPatch, DiagramEdit } from "../../diagram/protocol.js";
import { PAD, type Box, type Pt } from "./geometry.js";

export const GRID = 8;
export const DRAG_THRESHOLD = 3;
export const NUDGE_COALESCE_MS = 500;
export const HANDLE_SIZE = 8;

export const snap = (v: number, grid = GRID): number => Math.round(v / grid) * grid;

export interface SceneItem {
  id: string;
  /** Relative to the parent node (a port: to its owner). */
  rel: Box;
  /** Absolute canvas coordinates. */
  abs: Box;
  parent?: string;
  /** For a port: the node whose border it sits on. */
  owner?: string;
  /** Smallest size the node may be given. */
  min: { w: number; h: number };
  /** Height of the node's own header; nested nodes and ports start below it. */
  headerH: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Items in paint order, back to front. */
export class Scene {
  readonly byId = new Map<string, SceneItem>();
  constructor(readonly items: SceneItem[]) {
    for (const i of items) this.byId.set(i.id, i);
  }
  get(id: string): SceneItem | undefined {
    return this.byId.get(id);
  }
  /** `id` or one of its ancestors (parent or port owner) is in `set`. */
  hasAncestorIn(id: string, set: ReadonlySet<string>): boolean {
    for (let cur = this.byId.get(id), i = 0; cur && i < 100; i++) {
      const up = cur.owner ?? cur.parent;
      if (up === undefined) return false;
      if (set.has(up)) return true;
      cur = this.byId.get(up);
    }
    return false;
  }
  children(id: string): SceneItem[] {
    return this.items.filter((i) => i.parent === id && i.owner === undefined);
  }
  ports(id: string): SceneItem[] {
    return this.items.filter((i) => i.owner === id);
  }
}

const inside = (b: Box, p: Pt, slop = 0) => p.x >= b.x - slop && p.x <= b.x + b.w + slop && p.y >= b.y - slop && p.y <= b.y + b.h + slop;

/** The topmost item under a point (ports are small, so they get a little slop). */
export function hitTest(scene: Scene, p: Pt): string | undefined {
  for (let i = scene.items.length - 1; i >= 0; i--) {
    const it = scene.items[i]!;
    if (inside(it.abs, p, it.owner !== undefined ? 3 : 0)) return it.id;
  }
  return undefined;
}

/** Hit areas of the eight resize handles, centred on the box outline. */
export function handleBoxes(b: Box, size = HANDLE_SIZE): Record<Handle, Box> {
  const s = size;
  const at = (cx: number, cy: number): Box => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s });
  const r = b.x + b.w, bt = b.y + b.h, mx = b.x + b.w / 2, my = b.y + b.h / 2;
  return { nw: at(b.x, b.y), n: at(mx, b.y), ne: at(r, b.y), e: at(r, my), se: at(r, bt), s: at(mx, bt), sw: at(b.x, bt), w: at(b.x, my) };
}

export function handleAt(b: Box, p: Pt, zoom = 1): Handle | undefined {
  const boxes = handleBoxes(b, HANDLE_SIZE / Math.max(zoom, 0.1) + 4);
  return HANDLES.find((h) => inside(boxes[h], p));
}

/** What a gesture changes: new boxes relative to the parent; a size is present only when the gesture changes it. */
export type Plan = Map<string, { x: number; y: number; w?: number; h?: number }>;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The y range a port may take on its owner's border. */
function portRange(owner: SceneItem, h: number): [number, number] {
  const lo = owner.headerH;
  return [lo, Math.max(lo, owner.rel.h - h)];
}

/** Move the items by (dx, dy). Nested nodes move with their container; a port slides along its owner's border; a child stays inside its parent. */
export function planMove(scene: Scene, ids: Iterable<string>, dx: number, dy: number, snapToGrid = true): Plan {
  const sn = (v: number) => (snapToGrid ? snap(v) : v);
  const set = new Set(ids);
  const plan: Plan = new Map();
  for (const id of set) {
    const it = scene.get(id);
    if (!it || scene.hasAncestorIn(id, set)) continue;
    if (it.owner !== undefined) {
      const owner = scene.get(it.owner);
      if (!owner) continue;
      const [lo, hi] = portRange(owner, it.rel.h);
      const left = it.rel.x + it.rel.w / 2 + dx < owner.rel.w / 2;
      plan.set(id, { x: left ? -it.rel.w / 2 : owner.rel.w - it.rel.w / 2, y: clamp(sn(it.rel.y + dy), lo, hi) });
      continue;
    }
    let x = sn(it.rel.x + dx);
    let y = sn(it.rel.y + dy);
    const parent = it.parent !== undefined ? scene.get(it.parent) : undefined;
    if (parent) {
      x = Math.max(clamp(x, PAD, parent.rel.w - it.rel.w - PAD), PAD);
      y = Math.max(clamp(y, parent.headerH + PAD, parent.rel.h - it.rel.h - PAD), parent.headerH + PAD);
    }
    plan.set(id, { x, y });
  }
  return plan;
}

/** Resize a (non-port) node by dragging one handle by (dx, dy); its nested nodes keep their places, its ports stay on the border. */
export function planResize(scene: Scene, id: string, handle: Handle, dx: number, dy: number): Plan {
  const it = scene.get(id);
  const plan: Plan = new Map();
  if (!it || it.owner !== undefined) return plan;
  const parent = it.parent !== undefined ? scene.get(it.parent) : undefined;
  const kids = scene.children(id);
  const r = it.rel;
  const BIG = 1e9;
  const top = it.headerH + PAD;
  const axis = (lo: number, hi: number, moveLo: boolean, moveHi: boolean, d: number, min: number, kidLo: number, kidHi: number, boundLo: number, boundHi: number): [number, number] => {
    let l = lo, h = hi;
    if (moveLo) l = snap(lo + d);
    if (moveHi) h = snap(hi + d);
    // Own parent first (lowest priority), then the minimum size and the nested nodes.
    if (moveLo) l = Math.max(l, boundLo);
    if (moveHi) h = Math.min(h, boundHi);
    if (moveLo) l = Math.min(l, h - min, kidLo);
    if (moveHi) h = Math.max(h, l + min, kidHi);
    return [l, h];
  };
  const kx0 = kids.length ? r.x + Math.min(...kids.map((k) => k.rel.x)) - PAD : BIG;
  const kx1 = kids.length ? r.x + Math.max(...kids.map((k) => k.rel.x + k.rel.w)) + PAD : -BIG;
  const ky0 = kids.length ? r.y + Math.min(...kids.map((k) => k.rel.y)) - top : BIG;
  const ky1 = kids.length ? r.y + Math.max(...kids.map((k) => k.rel.y + k.rel.h)) + PAD : -BIG;
  const [x0, x1] = axis(r.x, r.x + r.w, handle.includes("w"), handle.includes("e"), dx, it.min.w, kx0, kx1, parent ? PAD : -BIG, parent ? parent.rel.w - PAD : BIG);
  const [y0, y1] = axis(r.y, r.y + r.h, handle.includes("n"), handle.includes("s"), dy, it.min.h, ky0, ky1, parent ? parent.headerH + PAD : -BIG, parent ? parent.rel.h - PAD : BIG);
  const w = x1 - x0, h = y1 - y0;
  if (x0 === r.x && y0 === r.y && w === r.w && h === r.h) return plan;
  plan.set(id, { x: x0, y: y0, w, h });
  const shiftX = x0 - r.x, shiftY = y0 - r.y;
  if (shiftX || shiftY) for (const k of kids) plan.set(k.id, { x: k.rel.x - shiftX, y: k.rel.y - shiftY });
  for (const p of scene.ports(id)) {
    const left = p.rel.x + p.rel.w / 2 < r.w / 2;
    const lo = it.headerH;
    plan.set(p.id, { x: left ? -p.rel.w / 2 : w - p.rel.w / 2, y: clamp(p.rel.y - shiftY, lo, Math.max(lo, h - p.rel.h)) });
  }
  return plan;
}

/** Ids of the items lying completely inside `rect`. */
export function rubberBand(scene: Scene, rect: Box): string[] {
  return scene.items
    .filter((i) => i.abs.x >= rect.x && i.abs.y >= rect.y && i.abs.x + i.abs.w <= rect.x + rect.w && i.abs.y + i.abs.h <= rect.y + rect.h)
    .map((i) => i.id);
}

/** Reading order (top to bottom, then left to right) for Tab navigation. */
export function tabOrder(scene: Scene): string[] {
  return [...scene.items].sort((a, b) => a.abs.y - b.abs.y || a.abs.x - b.abs.x || a.id.localeCompare(b.id)).map((i) => i.id);
}

export function normalizeRect(a: Pt, b: Pt): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Boxes of a plan applied over the current ones. */
export function applyPlan(scene: Scene, plan: Plan): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const [id, p] of plan) {
    const it = scene.get(id);
    if (it) out.set(id, { x: p.x, y: p.y, w: p.w ?? it.rel.w, h: p.h ?? it.rel.h });
  }
  return out;
}

export interface PointerInput {
  /** Canvas coordinates. */
  x: number;
  y: number;
  /** Screen coordinates, for panning. */
  sx: number;
  sy: number;
  button: number;
  shift: boolean;
  /** Ctrl or Cmd. */
  mod: boolean;
  /** Space is held: drag pans. */
  space: boolean;
}

export interface KeyInput { key: string; shift: boolean; mod: boolean }

export interface InteractionHost {
  onSelection(ids: string[]): void;
  /** A gesture is in progress (or ended): the boxes to draw instead of the stored ones, and the rubber band. */
  onPreview(boxes: Map<string, Box> | undefined, band: Box | undefined): void;
  onEdit(edit: DiagramEdit): void;
  /** Pan by a screen delta. */
  onPan(dx: number, dy: number): void;
  /** Panning ended. */
  onPanEnd(): void;
  /** The context menu was requested on an item with the keyboard. */
  onMenu(id: string): void;
  /** Current zoom, for handle hit areas. */
  zoom(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
}

type Gesture =
  | { kind: "move"; start: Pt; ids: string[]; moved: boolean; plan?: Plan }
  | { kind: "resize"; start: Pt; id: string; handle: Handle; plan?: Plan }
  | { kind: "band"; start: Pt; cur: Pt; add: boolean; base: string[] }
  | { kind: "pan"; sx: number; sy: number; moved: boolean; clear: boolean };

export class Interaction {
  scene = new Scene([]);
  private sel = new Set<string>();
  private g?: Gesture;
  private nudge?: { dx: number; dy: number; ids: string[]; timer: unknown };

  constructor(private readonly host: InteractionHost) {}

  get selection(): string[] {
    return [...this.sel];
  }

  get busy(): boolean {
    return this.g !== undefined;
  }

  /** A new scene replaces the old (after a render); selection of items that are gone is dropped. */
  setScene(scene: Scene): void {
    this.g = undefined;
    this.scene = scene;
    const keep = [...this.sel].filter((id) => scene.get(id));
    if (keep.length !== this.sel.size) this.setSelection(keep);
    this.host.onPreview(undefined, undefined);
  }

  setSelection(ids: Iterable<string>, notify = true): void {
    const next = new Set([...ids].filter((id) => this.scene.get(id)));
    const same = next.size === this.sel.size && [...next].every((i) => this.sel.has(i));
    this.sel = next;
    if (!same && notify) this.host.onSelection([...next]);
  }

  /** The resize handle under the point, for a single selected node. */
  handleAt(p: Pt): Handle | undefined {
    if (this.sel.size !== 1) return undefined;
    const it = this.scene.get([...this.sel][0]!);
    return it && it.owner === undefined ? handleAt(it.abs, p, this.host.zoom()) : undefined;
  }

  pointerDown(e: PointerInput): void {
    this.flushNudge();
    if (this.g) return;
    if (e.button === 1 || e.space) {
      this.g = { kind: "pan", sx: e.sx, sy: e.sy, moved: false, clear: false };
      return;
    }
    if (e.button !== 0) return;
    const top = hitTest(this.scene, e);
    const onPort = top !== undefined && this.scene.get(top)?.owner !== undefined;
    const h = onPort ? undefined : this.handleAt(e); // a port on the border wins over a handle
    if (h) {
      this.g = { kind: "resize", start: e, id: [...this.sel][0]!, handle: h };
      return;
    }
    const hit = hitTest(this.scene, e);
    if (hit === undefined) {
      if (e.shift) this.g = { kind: "band", start: e, cur: e, add: true, base: [...this.sel] };
      else this.g = { kind: "pan", sx: e.sx, sy: e.sy, moved: false, clear: true };
      return;
    }
    if (e.shift || e.mod) {
      const next = new Set(this.sel);
      if (next.has(hit)) next.delete(hit);
      else next.add(hit);
      this.setSelection(next);
      if (!next.has(hit)) return;
    } else if (!this.sel.has(hit)) this.setSelection([hit]);
    this.g = { kind: "move", start: e, ids: [...this.sel], moved: false };
  }

  pointerMove(e: PointerInput): void {
    const g = this.g;
    if (!g) return;
    if (g.kind === "pan") {
      if (Math.hypot(e.sx - g.sx, e.sy - g.sy) > 0) g.moved = g.moved || Math.hypot(e.sx - g.sx, e.sy - g.sy) >= DRAG_THRESHOLD;
      if (g.moved) {
        this.host.onPan(e.sx - g.sx, e.sy - g.sy);
        g.sx = e.sx;
        g.sy = e.sy;
      }
      return;
    }
    if (g.kind === "band") {
      g.cur = e;
      this.host.onPreview(undefined, normalizeRect(g.start, g.cur));
      return;
    }
    const dx = e.x - g.start.x, dy = e.y - g.start.y;
    if (g.kind === "move") {
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.moved = true;
      g.plan = planMove(this.scene, g.ids, dx, dy);
    } else g.plan = planResize(this.scene, g.id, g.handle, dx, dy);
    this.host.onPreview(applyPlan(this.scene, g.plan), undefined);
  }

  pointerUp(e: PointerInput): void {
    const g = this.g;
    this.g = undefined;
    if (!g) return;
    if (g.kind === "pan") {
      if (!g.moved && g.clear) this.setSelection([]);
      this.host.onPanEnd();
      return;
    }
    this.host.onPreview(undefined, undefined);
    if (g.kind === "band") {
      const r = normalizeRect(g.start, e);
      this.setSelection([...g.base, ...rubberBand(this.scene, r)]);
      return;
    }
    if (g.plan?.size) this.commit(g.plan, g.kind === "move" ? "Move" : "Resize");
  }

  cancel(): boolean {
    if (!this.g) return false;
    const was = this.g;
    this.g = undefined;
    if (was.kind === "pan") this.host.onPanEnd();
    this.host.onPreview(undefined, undefined);
    return true;
  }

  private commit(plan: Plan, label: "Move" | "Resize" | "Nudge"): void {
    const boxes: BoxPatch[] = [];
    for (const [id, p] of plan) {
      const it = this.scene.get(id);
      if (!it) continue;
      const same = p.x === it.rel.x && p.y === it.rel.y && (p.w === undefined || p.w === it.rel.w) && (p.h === undefined || p.h === it.rel.h);
      if (!same) boxes.push({ id, x: p.x, y: p.y, ...(p.w !== undefined ? { w: p.w } : {}), ...(p.h !== undefined ? { h: p.h } : {}) });
    }
    if (boxes.length) this.host.onEdit({ kind: "layout", label, boxes });
  }

  /** Post a pending nudge now (a later action, focus loss or the end of the coalescing window). */
  flushNudge(): void {
    const n = this.nudge;
    if (!n) return;
    this.nudge = undefined;
    this.host.clearTimer(n.timer);
    this.host.onPreview(undefined, undefined);
    const plan = planMove(this.scene, n.ids, n.dx, n.dy, false);
    this.commit(plan, "Nudge");
  }

  /** Returns whether the key was used (the caller then stops the browser's own handling). */
  keyDown(k: KeyInput): boolean {
    const key = k.key;
    if (key === "Escape") {
      if (this.cancel()) return true;
      this.flushNudge();
      if (this.sel.size) { this.setSelection([]); return true; }
      return false;
    }
    if (k.mod && (key === "a" || key === "A")) {
      this.flushNudge();
      this.setSelection(this.scene.items.map((i) => i.id));
      return true;
    }
    if (key === "Delete") {
      if (!this.sel.size) return false;
      this.flushNudge();
      const ids = [...this.sel];
      this.setSelection([]);
      this.host.onEdit({ kind: "remove", ids });
      return true;
    }
    if (key.startsWith("Arrow") && !k.mod) {
      if (!this.sel.size) return false;
      const step = GRID * (k.shift ? 4 : 1);
      const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
      const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
      const prev = this.nudge;
      if (prev) this.host.clearTimer(prev.timer);
      const next = { dx: (prev?.dx ?? 0) + dx, dy: (prev?.dy ?? 0) + dy, ids: prev?.ids ?? [...this.sel], timer: undefined as unknown };
      next.timer = this.host.setTimer(() => this.flushNudge(), NUDGE_COALESCE_MS);
      this.nudge = next;
      this.host.onPreview(applyPlan(this.scene, planMove(this.scene, next.ids, next.dx, next.dy, false)), undefined);
      return true;
    }
    if (key === "Tab") {
      const order = tabOrder(this.scene);
      if (!order.length) return false;
      this.flushNudge();
      const cur = this.sel.size === 1 ? order.indexOf([...this.sel][0]!) : -1;
      const next = k.shift ? (cur < 0 ? order.length - 1 : cur - 1) : cur + 1;
      if (next < 0 || next >= order.length) return false; // let focus leave the diagram
      this.setSelection([order[next]!]);
      return true;
    }
    if (key === "ContextMenu" || (key === "F10" && k.shift)) {
      if (this.sel.size !== 1) return false;
      this.host.onMenu([...this.sel][0]!);
      return true;
    }
    return false;
  }
}
