/**
 * Layout (design D7): bottom-up, one level at a time. Nodes with stored positions stay put; the
 * others at that level are laid out by ELK and placed beside the stored ones. Containers size to
 * fit their children; ports are put on the owner's border. No DOM: ELK and text measuring are injected.
 */
import type { VmNode, ViewModel } from "../../diagram/view-model.js";
import { layoutSequence } from "./sequence-layout.js";
import { labelSize, loopExtent, loopSidesFor, type LoopExtent } from "./loops.js";
import { PAD, PORT_SIZE, absoluteBoxes, describeBox, type Box, type Measure, type Pt } from "./geometry.js";

/** The part of ELK's API used here (the `elkjs` default export satisfies it). */
export interface ElkLike {
  layout(graph: ElkGraph): Promise<ElkGraph>;
}
export interface ElkGraph {
  id: string;
  layoutOptions?: Record<string, string>;
  children?: { id: string; width: number; height: number; x?: number; y?: number }[];
  edges?: {
    id: string;
    sources: string[];
    targets: string[];
    /** Edge labels, given only so that the layered layout leaves room for them. */
    labels?: { id: string; text?: string; width: number; height: number }[];
    sections?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[] }[];
  }[];
}

export interface LayoutResult {
  /** Boxes relative to the parent node (ports: to the owner), for every node. */
  boxes: Map<string, Box>;
  /** Nodes whose position was computed now (they had none stored). */
  placed: Set<string>;
  /** The smallest size each node may be given: its content, its nested nodes and its ports (stored sizes do not count). */
  mins: Map<string, { w: number; h: number }>;
  /** Routes ELK computed for edges, in absolute canvas coordinates (only for nodes placed in this run). */
  routes: Map<string, Pt[]>;
}

const GAP = 40;
/** Horizontal padding inside a container; wide enough that its own border ports clear nested ones. */
const INNER = 30;
const SIDE_LABEL_MARGIN = 8;

const rank = (n: VmNode): number => (n.variant === "start" ? 0 : n.variant === "done" ? 2 : 1);
const hasPos = (n: VmNode) => n.geometry?.x !== undefined || n.geometry?.y !== undefined;

/** Action Flow and State Transition views flow from top to bottom (design D17); the others from left to right. */
const flowsDown = (vm: ViewModel): boolean => vm.kind === "actionFlow" || vm.kind === "stateTransition";

/** Move an end of an orthogonal route from the border of the padded box onto the node's own border; undefined when it cannot stay orthogonal. */
function clipEnd(pts: Pt[], atStart: boolean, padded: Box, real: Box): Pt[] | undefined {
  const i = atStart ? 0 : pts.length - 1;
  const j = atStart ? 1 : pts.length - 2;
  const p = pts[i]!, q = pts[j]!;
  const out = pts.map((x) => ({ ...x }));
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo + 4), Math.max(lo + 4, hi - 4));
  if (near(p.x, padded.x) || near(p.x, padded.x + padded.w)) {
    const y = clamp(p.y, real.y, real.y + real.h);
    if (!near(y, p.y) && !near(q.y, p.y)) return undefined;
    if (!near(y, p.y) && pts.length === 2) return undefined;
    out[i] = { x: near(p.x, padded.x) ? real.x : real.x + real.w, y };
    if (!near(y, p.y)) out[j] = { x: q.x, y };
  } else if (near(p.y, padded.y) || near(p.y, padded.y + padded.h)) {
    const x = clamp(p.x, real.x, real.x + real.w);
    if (!near(x, p.x) && !near(q.x, p.x)) return undefined;
    if (!near(x, p.x) && pts.length === 2) return undefined;
    out[i] = { x, y: near(p.y, padded.y) ? real.y : real.y + real.h };
    if (!near(x, p.x)) out[j] = { x, y: q.y };
  } else return undefined;
  return out;
}

export async function layoutDiagram(vm: ViewModel, elk: ElkLike, measure: Measure): Promise<LayoutResult> {
  if (vm.kind === "sequence") return layoutSequence(vm, measure);
  const byId = new Map(vm.nodes.map((n) => [n.id, n] as const));
  const children = new Map<string | undefined, VmNode[]>();
  const ports = new Map<string, VmNode[]>();
  for (const n of vm.nodes) {
    if (n.attachedTo !== undefined && byId.has(n.attachedTo)) ports.set(n.attachedTo, [...(ports.get(n.attachedTo) ?? []), n]);
    else {
      const p = n.parent !== undefined && byId.has(n.parent) ? n.parent : undefined;
      children.set(p, [...(children.get(p) ?? []), n]);
    }
  }
  // Self-transitions: the space their loops and labels need around a node (design D24).
  const selfLabels = new Map<string, (string | undefined)[]>();
  for (const e of vm.edges) if (e.source === e.target && !e.fixed) selfLabels.set(e.source, [...(selfLabels.get(e.source) ?? []), e.label]);
  const NO_EXTENT: LoopExtent = { l: 0, r: 0, t: 0, b: 0 };
  const extentOf = (id: string, s: { w: number; h: number }): LoopExtent => {
    const labels = selfLabels.get(id);
    return labels ? loopExtent(s.w, s.h, labels, measure, loopSidesFor(vm.kind)) : NO_EXTENT;
  };
  const boxes = new Map<string, Box>();
  const placed = new Set<string>();
  const mins = new Map<string, { w: number; h: number }>();
  const pending: { pid: string | undefined; id: string; pts: Pt[] }[] = [];
  const content = new Map<string, ReturnType<typeof describeBox>>();
  const contentOf = (n: VmNode) => {
    let c = content.get(n.id);
    if (!c) content.set(n.id, (c = describeBox(n, measure)));
    return c;
  };

  /** Port labels decide the minimum size of the owner; sides are not known yet, so assume the worst case. */
  const portNeeds = (owner: VmNode) => {
    const ps = ports.get(owner.id) ?? [];
    const lw = Math.max(0, ...ps.map((p) => measure(p.label, "small") + PORT_SIZE / 2 + SIDE_LABEL_MARGIN));
    return { w: 2 * lw + SIDE_LABEL_MARGIN, rows: ps.length };
  };

  /** Lift an item to the ancestor (or itself) whose container is `pid`. */
  const liftTo = (id: string, pid: string | undefined): string | undefined => {
    for (let cur: string | undefined = id, i = 0; cur !== undefined && i < 100; i++) {
      const n = byId.get(cur);
      if (!n) return undefined;
      const up = n.attachedTo ?? n.parent;
      if (up === pid) return cur;
      cur = up;
    }
    return undefined;
  };

  const sizeOf = (n: VmNode, needW: number, needH: number, stored = true): { w: number; h: number } => {
    const c = contentOf(n);
    const pn = portNeeds(n);
    const w = Math.max(c.w, needW, pn.w, stored ? (n.geometry?.w ?? 0) : 0);
    const h = Math.max(c.h, needH, pn.rows > 0 ? c.headerH + pn.rows * 22 + 8 : 0, stored ? (n.geometry?.h ?? 0) : 0);
    return { w: Math.ceil(w), h: Math.ceil(h) };
  };

  /** Lay out the children of `pid`; returns the extent (relative to the container) the children need. */
  const level = async (pid: string | undefined): Promise<{ w: number; h: number }> => {
    const kids = children.get(pid) ?? [];
    const side = pid === undefined ? 0 : INNER + Math.max(0, ...(ports.get(pid) ?? []).map((p) => measure(p.label, "small") + PORT_SIZE));
    const originX = side;
    // Nested nodes go BELOW the header and every compartment of their container (a General View definition lists features there).
    const originY = pid === undefined ? 0 : contentOf(byId.get(pid)!).bodyTop + PAD;
    const sizes = new Map<string, { w: number; h: number }>();
    for (const k of kids) {
      const inner = children.has(k.id) ? await level(k.id) : { w: 0, h: 0 };
      sizes.set(k.id, sizeOf(k, inner.w, inner.h));
      mins.set(k.id, sizeOf(k, inner.w, inner.h, false));
    }
    const fixed = kids.filter(hasPos);
    const loose = kids.filter((k) => !hasPos(k));
    for (const k of fixed) {
      const s = sizes.get(k.id)!;
      // A stored position left of or above the container's content area is drawn at its edge: a child never leaves its parent.
      const x = k.geometry?.x ?? 0;
      const y = k.geometry?.y ?? 0;
      boxes.set(k.id, { x: pid === undefined ? x : Math.max(x, PAD), y: pid === undefined ? y : Math.max(y, originY), ...s });
    }
    if (loose.length) {
      const { pos, routes } = await place(pid, loose, sizes);
      let x0 = originX, y0 = originY;
      if (fixed.length) {
        x0 = Math.max(...fixed.map((k) => boxes.get(k.id)!.x + boxes.get(k.id)!.w)) + GAP;
        y0 = Math.min(...fixed.map((k) => boxes.get(k.id)!.y));
      }
      for (const r of routes) pending.push({ pid, id: r.id, pts: r.pts.map((q) => ({ x: Math.round(x0 + q.x), y: Math.round(y0 + q.y) })) });
      for (const k of loose) {
        const p = pos.get(k.id)!;
        boxes.set(k.id, { x: Math.round(x0 + p.x), y: Math.round(y0 + p.y), ...sizes.get(k.id)! });
        placed.add(k.id);
      }
    }
    let w = 0, h = 0;
    for (const k of kids) {
      const b = boxes.get(k.id)!;
      const ext = extentOf(k.id, b);
      w = Math.max(w, b.x + b.w + ext.r);
      h = Math.max(h, b.y + b.h + ext.b);
    }
    // Edge labels of a top-to-bottom view sit beside the edges: the container is wide enough that they stay inside it.
    if (flowsDown(vm) && pid !== undefined) {
      const labelW = Math.max(0, ...vm.edges.filter((e) => e.label !== undefined && e.source !== e.target && liftTo(e.source, pid) !== undefined && liftTo(e.target, pid) !== undefined).map((e) => labelSize(e.label!, measure).w + 8));
      if (labelW > 0) w = Math.max(w, ...kids.map((k) => boxes.get(k.id)!.x + boxes.get(k.id)!.w / 2 + labelW + 8));
    }
    // The extent is measured from the container's top-left; the caller adds the right and bottom padding.
    return kids.length ? { w: w + side, h: h + PAD } : { w: 0, h: 0 };
  };

  const place = async (pid: string | undefined, loose: VmNode[], sizes: Map<string, { w: number; h: number }>): Promise<{ pos: Map<string, { x: number; y: number }>; routes: { id: string; pts: Pt[] }[] }> => {
    const ids = new Set(loose.map((k) => k.id));
    const seen = new Set<string>();
    const edges: NonNullable<ElkGraph["edges"]> = [];
    for (const e of vm.edges) {
      const s = liftTo(e.source, pid);
      const t = liftTo(e.target, pid);
      if (s === undefined || t === undefined || s === t || !ids.has(s) || !ids.has(t)) continue;
      const key = `${s}\u0000${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: e.id, sources: [s], targets: [t], ...(flowsDown(vm) && e.label ? { labels: [{ id: `${e.id}:label`, text: e.label, width: labelSize(e.label, measure).w + 4, height: labelSize(e.label, measure).h + 2 }] } : {}) });
    }
    // A node with self-loops is given room for them (and their labels) around it.
    const extents = new Map(loose.map((k) => [k.id, extentOf(k.id, sizes.get(k.id)!)] as const));
    const graph: ElkGraph = {
      id: "root",
      layoutOptions: edges.length
        ? { "elk.algorithm": "layered", "elk.direction": flowsDown(vm) ? "DOWN" : "RIGHT", "elk.edgeRouting": "ORTHOGONAL", ...(flowsDown(vm) ? { "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES", "elk.layered.cycleBreaking.strategy": "MODEL_ORDER" } : {}), "elk.spacing.nodeNode": "40", "elk.layered.spacing.nodeNodeBetweenLayers": "70", "elk.padding": "[top=0,left=0,bottom=0,right=0]" }
        : { "elk.algorithm": "rectpacking", "elk.spacing.nodeNode": "40", "elk.aspectRatio": "1.6", "elk.padding": "[top=0,left=0,bottom=0,right=0]" },
      // The start node leads and the done node ends, then the model's own order; ELK keeps it where the edges allow.
      children: (flowsDown(vm) ? [...loose].sort((a, b) => rank(a) - rank(b)) : loose).map((k) => { const x = extents.get(k.id)!; return { id: k.id, width: sizes.get(k.id)!.w + x.l + x.r, height: sizes.get(k.id)!.h + x.t + x.b }; }),
      edges,
    };
    const out = new Map<string, { x: number; y: number }>();
    const routes: { id: string; pts: Pt[] }[] = [];
    try {
      const res = await elk.layout(graph);
      for (const c of res.children ?? []) out.set(c.id, { x: (c.x ?? 0) + (extents.get(c.id)?.l ?? 0), y: (c.y ?? 0) + (extents.get(c.id)?.t ?? 0) });
      for (const e of res.edges ?? []) {
        const sec = e.sections?.[0];
        const ge = edges.find((x) => x.id === e.id);
        if (!sec || !ge) continue;
        // A route ELK computed against a padded node ends on the padded border: pull it onto the node's own border.
        let pts: Pt[] | undefined = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((q) => ({ x: q.x, y: q.y }));
        for (const [end, id] of [[0, ge.sources[0]!], [1, ge.targets[0]!]] as const) {
          const x = extents.get(id);
          const c = res.children?.find((k) => k.id === id);
          if (!pts || !x || !c || x.l + x.r + x.t + x.b === 0) continue;
          const size = sizes.get(id)!;
          pts = clipEnd(pts, end === 0, { x: c.x ?? 0, y: c.y ?? 0, w: size.w + x.l + x.r, h: size.h + x.t + x.b }, { x: (c.x ?? 0) + x.l, y: (c.y ?? 0) + x.t, w: size.w, h: size.h });
        }
        if (pts) routes.push({ id: e.id, pts });
      }
    } catch {
      /* fall through to the grid */
    }
    if (out.size !== loose.length) {
      // Fallback: a simple grid, so a layout failure never leaves nodes stacked on each other.
      out.clear();
      routes.length = 0;
      let x = 0, y = 0, rowH = 0;
      const cols = Math.ceil(Math.sqrt(loose.length));
      loose.forEach((k, i) => {
        const s = sizes.get(k.id)!;
        if (i > 0 && i % cols === 0) { x = 0; y += rowH + GAP; rowH = 0; }
        out.set(k.id, { x, y });
        x += s.w + GAP;
        rowH = Math.max(rowH, s.h);
      });
    }
    return { pos: out, routes };
  };

  await level(undefined);
  // Top-level nodes start at a margin.
  const tops = children.get(undefined) ?? [];
  let topShift = 0;
  if (tops.length && tops.every((n) => placed.has(n.id))) {
    topShift = 20;
    for (const n of tops) {
      const b = boxes.get(n.id)!;
      boxes.set(n.id, { ...b, x: b.x + 20, y: b.y + 20 });
    }
  }

  // Ports sit on the owner's border, on the side facing what they connect to; stored positions are kept.
  const abs = absoluteBoxes(vm, boxes);
  const ownerOfEnd = (id: string): string => byId.get(id)?.attachedTo ?? id;
  for (const [ownerId, list] of ports) {
    const ob = boxes.get(ownerId);
    const owner = byId.get(ownerId);
    const oa = abs.get(ownerId);
    if (!ob || !owner || !oa) continue;
    const top = contentOf(owner).headerH;
    const sides: VmNode[][] = [[], []];
    for (const p of list) {
      if (hasPos(p)) continue;
      // Pins: inputs on the left, outputs on the right (D36).
      if (p.pin?.direction === "in") { sides[0]!.push(p); continue; }
      if (p.pin?.direction === "out") { sides[1]!.push(p); continue; }
      let dx = 0;
      for (const e of vm.edges) {
        const other = e.source === p.id ? e.target : e.target === p.id ? e.source : undefined;
        const ba = other !== undefined ? abs.get(ownerOfEnd(other)) : undefined;
        if (ba && ownerOfEnd(other!) !== ownerId) dx += ba.x + ba.w / 2 - (oa.x + oa.w / 2);
      }
      sides[dx === 0 ? (sides[0]!.length <= sides[1]!.length ? 0 : 1) : dx < 0 ? 0 : 1]!.push(p);
    }
    for (const p of list) {
      if (!hasPos(p)) continue;
      // A stored port always lies on the owner's left or right border, whatever happened to the owner's size.
      const w = p.geometry?.w ?? PORT_SIZE;
      const h = p.geometry?.h ?? PORT_SIZE;
      const cx = (p.geometry?.x ?? 0) + w / 2;
      const x = cx < ob.w / 2 ? -w / 2 : ob.w - w / 2;
      const y = Math.min(Math.max(p.geometry?.y ?? 0, top), Math.max(top, ob.h - h));
      boxes.set(p.id, { x, y, w, h });
    }
    sides.forEach((ps, side) => {
      const span = Math.max(ob.h - top, 1);
      ps.forEach((p, k) => {
        const w = p.geometry?.w ?? PORT_SIZE;
        const h = p.geometry?.h ?? PORT_SIZE;
        const cy = top + ((k + 1) * span) / (ps.length + 1);
        boxes.set(p.id, { x: Math.round(side === 0 ? -w / 2 : ob.w - w / 2), y: Math.round(cy - h / 2), w, h });
        placed.add(p.id);
      });
    });
  }
  const routes = new Map<string, Pt[]>();
  const finalAbs = absoluteBoxes(vm, boxes);
  for (const r of pending) {
    // A line that ends at a pin is routed from the pin (ELK routed it between the actions).
    const ve = vm.edges.find((x) => x.id === r.id);
    if (ve && (byId.get(ve.source)?.pin || byId.get(ve.target)?.pin)) continue;
    const o = r.pid === undefined ? { x: 0, y: 0 } : finalAbs.get(r.pid);
    if (!o) continue;
    const shift = r.pid === undefined ? topShift : 0;
    routes.set(r.id, r.pts.map((q) => ({ x: q.x + o.x + shift, y: q.y + o.y + shift })));
  }
  return { boxes, placed, mins, routes };
}
