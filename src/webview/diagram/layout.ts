/**
 * Layout (design D7): bottom-up, one level at a time. Nodes with stored positions stay put; the
 * others at that level are laid out by ELK and placed beside the stored ones. Containers size to
 * fit their children; ports are put on the owner's border. No DOM: ELK and text measuring are injected.
 */
import type { VmNode, ViewModel } from "../../diagram/view-model.js";
import { PAD, PORT_SIZE, absoluteBoxes, describeBox, type Box, type Measure } from "./geometry.js";

/** The part of ELK's API used here (the `elkjs` default export satisfies it). */
export interface ElkLike {
  layout(graph: ElkGraph): Promise<ElkGraph>;
}
export interface ElkGraph {
  id: string;
  layoutOptions?: Record<string, string>;
  children?: { id: string; width: number; height: number; x?: number; y?: number }[];
  edges?: { id: string; sources: string[]; targets: string[] }[];
}

export interface LayoutResult {
  /** Boxes relative to the parent node (ports: to the owner), for every node. */
  boxes: Map<string, Box>;
  /** Nodes whose position was computed now (they had none stored). */
  placed: Set<string>;
}

const GAP = 40;
/** Horizontal padding inside a container; wide enough that its own border ports clear nested ones. */
const INNER = 30;
const SIDE_LABEL_MARGIN = 8;

const hasPos = (n: VmNode) => n.geometry?.x !== undefined || n.geometry?.y !== undefined;

export async function layoutDiagram(vm: ViewModel, elk: ElkLike, measure: Measure): Promise<LayoutResult> {
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
  const boxes = new Map<string, Box>();
  const placed = new Set<string>();
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

  const sizeOf = (n: VmNode, needW: number, needH: number): { w: number; h: number } => {
    const c = contentOf(n);
    const pn = portNeeds(n);
    const w = Math.max(c.w, needW, pn.w, n.geometry?.w ?? 0);
    const h = Math.max(c.h, needH, c.headerH + pn.rows * 22 + 8, n.geometry?.h ?? 0);
    return { w: Math.ceil(w), h: Math.ceil(h) };
  };

  /** Lay out the children of `pid`; returns the extent (relative to the container) the children need. */
  const level = async (pid: string | undefined): Promise<{ w: number; h: number }> => {
    const kids = children.get(pid) ?? [];
    const side = pid === undefined ? 0 : INNER + Math.max(0, ...(ports.get(pid) ?? []).map((p) => measure(p.label, "small") + PORT_SIZE));
    const originX = side;
    const originY = pid === undefined ? 0 : contentOf(byId.get(pid)!).headerH + PAD;
    const sizes = new Map<string, { w: number; h: number }>();
    for (const k of kids) {
      const inner = children.has(k.id) ? await level(k.id) : { w: 0, h: 0 };
      sizes.set(k.id, sizeOf(k, inner.w, inner.h));
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
      const pos = await place(pid, loose, sizes);
      let x0 = originX, y0 = originY;
      if (fixed.length) {
        x0 = Math.max(...fixed.map((k) => boxes.get(k.id)!.x + boxes.get(k.id)!.w)) + GAP;
        y0 = Math.min(...fixed.map((k) => boxes.get(k.id)!.y));
      }
      for (const k of loose) {
        const p = pos.get(k.id)!;
        boxes.set(k.id, { x: Math.round(x0 + p.x), y: Math.round(y0 + p.y), ...sizes.get(k.id)! });
        placed.add(k.id);
      }
    }
    let w = 0, h = 0;
    for (const k of kids) {
      const b = boxes.get(k.id)!;
      w = Math.max(w, b.x + b.w);
      h = Math.max(h, b.y + b.h);
    }
    // The extent is measured from the container's top-left; the caller adds the right and bottom padding.
    return kids.length ? { w: w + side, h: h + PAD } : { w: 0, h: 0 };
  };

  const place = async (pid: string | undefined, loose: VmNode[], sizes: Map<string, { w: number; h: number }>): Promise<Map<string, { x: number; y: number }>> => {
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
      edges.push({ id: e.id, sources: [s], targets: [t] });
    }
    const graph: ElkGraph = {
      id: "root",
      layoutOptions: edges.length
        ? { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.spacing.nodeNode": "40", "elk.layered.spacing.nodeNodeBetweenLayers": "70", "elk.padding": "[top=0,left=0,bottom=0,right=0]" }
        : { "elk.algorithm": "rectpacking", "elk.spacing.nodeNode": "40", "elk.aspectRatio": "1.6", "elk.padding": "[top=0,left=0,bottom=0,right=0]" },
      children: loose.map((k) => ({ id: k.id, width: sizes.get(k.id)!.w, height: sizes.get(k.id)!.h })),
      edges,
    };
    const out = new Map<string, { x: number; y: number }>();
    try {
      const res = await elk.layout(graph);
      for (const c of res.children ?? []) out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    } catch {
      /* fall through to the grid */
    }
    if (out.size !== loose.length) {
      // Fallback: a simple grid, so a layout failure never leaves nodes stacked on each other.
      out.clear();
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
    return out;
  };

  await level(undefined);
  // Top-level nodes start at a margin.
  const tops = children.get(undefined) ?? [];
  if (tops.length && tops.every((n) => placed.has(n.id))) {
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
      boxes.set(p.id, { x: p.geometry?.x ?? 0, y: p.geometry?.y ?? 0, w: p.geometry?.w ?? PORT_SIZE, h: p.geometry?.h ?? PORT_SIZE });
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
  return { boxes, placed };
}
