/**
 * The SysML notation as an SVG string (design D7). No DOM: the same code draws the live view
 * (colours come from CSS classes bound to VS Code theme variables) and the export (a fixed light
 * palette as attributes). Only presentation attributes are used, so no inline `style` is needed.
 */
import type { VmEdge, VmNode, ViewModel } from "../../diagram/view-model.js";
import {
  FONT_FAMILY, FONT_SIZE, SMALL_SIZE, absoluteBoxes, boundsOf, describeBox, diamondPoints, headPoints,
  type Box, type Measure, type Pt, type TextStyle,
} from "./geometry.js";
import { HANDLES, handleBoxes } from "./interaction.js";
import { edgeRoute, placeLabel } from "./routing.js";

export type Role = "bg" | "node" | "line" | "text" | "subtext" | "warn" | "edge" | "sel" | "inherited";
export type Palette = Record<Role, string>;

/** Fixed light theme for exports (agent images, PNG): independent of the editor theme. */
export const LIGHT_PALETTE: Palette = {
  bg: "#ffffff", node: "#f6f8fa", line: "#1f2328", text: "#1f2328", subtext: "#57606a", warn: "#bf8700", edge: "#24292f", sel: "#0969da", inherited: "#e9edf1",
};

/** Fixed dark palette, only for the test export of the editor appearance. */
export const DARK_PALETTE: Palette = {
  bg: "#1e1e1e", node: "#252526", line: "#cccccc", text: "#cccccc", subtext: "#9d9d9d", warn: "#cca700", edge: "#cccccc", sel: "#3794ff", inherited: "#333336",
};

/** Background colour of an export in the given fixed theme. */
export const exportBackground = (theme: "light" | "editor-dark" | "editor-light"): string => (theme === "editor-dark" ? DARK_PALETTE : LIGHT_PALETTE).bg;

export interface SvgOptions {
  /** Absent: live mode (CSS classes). Present: export mode (colours as attributes, background and margin). */
  palette?: Palette;
}

export interface SvgResult {
  /** Drawing in canvas coordinates. */
  content: string;
  bounds: Box;
  /** The polyline drawn for each edge (absolute coordinates) and the box of its label. */
  routes: Map<string, Pt[]>;
  labels: Map<string, Box>;
}

export interface BuildExtras {
  /** Stored or ELK routes (absolute) tried before computing one. */
  routes?: ReadonlyMap<string, readonly Pt[]>;
  selected?: ReadonlySet<string>;
}

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n: number): string => String(Math.round(n * 100) / 100);

function paint(o: SvgOptions, fill: Role | "none", stroke: Role | "none"): string {
  if (o.palette) return ` fill="${fill === "none" ? "none" : o.palette[fill]}" stroke="${stroke === "none" ? "none" : o.palette[stroke]}"`;
  return ` class="${fill === "none" ? "f-none" : "f-" + fill} ${stroke === "none" ? "s-none" : "s-" + stroke}"`;
}

function text(o: SvgOptions, x: number, y: number, s: string, style: TextStyle, role: Role, anchor: "start" | "middle" | "end" = "start"): string {
  const size = style === "small" ? SMALL_SIZE : FONT_SIZE;
  const weight = style === "bold" ? ' font-weight="bold"' : "";
  const slant = style === "italic" ? ' font-style="italic"' : "";
  return `<text x="${f(x)}" y="${f(y)}" font-size="${size}"${weight}${slant} text-anchor="${anchor}"${paint(o, role, "none")}>${esc(s)}</text>`;
}

/** Accessible name of a node: its kind and label. */
export function nodeName(n: VmNode): string {
  const kind = n.keyword ? n.keyword.replace(/[«»]/g, "") : n.shape === "package" ? "package" : n.shape;
  return `${kind} ${n.label}`.trim();
}

function drawNode(n: VmNode, b: Box, o: SvgOptions, measure: Measure, selected: boolean): string {
  const c = describeBox(n, measure);
  const warn = n.shape === "unresolved";
  const inh = n.inherited !== undefined;
  const stroke: Role = warn ? "warn" : inh ? "subtext" : "line";
  const fill: Role = inh ? "inherited" : "node";
  const dash = warn || inh ? ' stroke-dasharray="5 3"' : "";
  const sw = n.shape === "requirement" ? ' stroke-width="1.5"' : "";
  let g = `<g data-node="${esc(n.id)}" data-shape="${n.shape}" role="img" aria-label="${esc(nodeName(n) + (inh ? " (inherited from " + n.inherited!.from + ")" : ""))}"${inh ? ' data-inherited="true"' : ""}${selected ? ' data-selected="true" aria-current="true"' : ""} transform="translate(${f(b.x)} ${f(b.y)})">`;
  if (n.shape === "port") {
    g += `<rect width="${f(b.w)}" height="${f(b.h)}"${dash}${paint(o, fill, stroke)}/>`;
    return g + "</g>";
  }
  const rx = n.shape === "usage" ? ' rx="10"' : n.shape === "requirement" ? ' rx="3"' : "";
  if (n.shape === "package") {
    g += `<rect y="16" width="${f(b.w)}" height="${f(b.h - 16)}"${paint(o, fill, stroke)}/>`;
    g += `<rect width="${f(Math.min(b.w * 0.4, 70))}" height="16"${paint(o, fill, stroke)}/>`;
  } else g += `<rect width="${f(b.w)}" height="${f(b.h)}"${rx}${dash}${sw}${paint(o, fill, stroke)}/>`;
  for (const y of c.dividers) g += `<line x1="0" y1="${f(y)}" x2="${f(b.w)}" y2="${f(y)}"${paint(o, "none", stroke)}/>`;
  for (const r of c.rows) {
    const role: Role = r.kind === "keyword" || r.kind === "ctitle" || r.kind === "icline" ? "subtext" : r.kind === "warn" ? "warn" : "text";
    if (r.kind === "cline" || r.kind === "icline" || r.kind === "ctitle" || r.kind === "doc") g += text(o, PAD_LEFT, r.y, r.text, r.style, role);
    else g += text(o, b.w / 2, r.y, r.text, r.style, role, "middle");
  }
  return g + "</g>";
}
const PAD_LEFT = 10;

function drawPortLabel(n: VmNode, b: Box, owner: Box, o: SvgOptions): string {
  const left = b.x + b.w / 2 < owner.x + owner.w / 2;
  const x = left ? b.x + b.w + 4 : b.x - 4;
  return text(o, x, b.y + b.h / 2 + 3, n.label, "small", "text", left ? "start" : "end");
}

const DASHED = new Set(["typing", "satisfy", "verify", "derivation"]);

function drawEdge(e: VmEdge, pts: Pt[], o: SvgOptions, label: Box | undefined): string {
  const first = pts[0]!;
  const second = pts[1] ?? first;
  const last = pts[pts.length - 1]!;
  const before = pts[pts.length - 2] ?? first;
  const dashed = DASHED.has(e.style) || !e.resolved;
  const roleLine: Role = e.resolved ? "edge" : "warn";
  let g = `<g data-edge="${esc(e.id)}" data-style="${e.style}"><polyline points="${pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"${dashed ? ' stroke-dasharray="6 4"' : ""}${paint(o, "none", roleLine)}/>`;
  const poly = (ps: Pt[], fill: Role | "none") => `<polygon points="${ps.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"${paint(o, fill, roleLine)}/>`;
  switch (e.style) {
    case "composition": g += poly(diamondPoints(first, second, 16, 5), "edge"); break;
    case "specialization": g += poly(headPoints(last, before, 14, 7), "bg"); break;
    case "typing": case "satisfy": case "verify": case "derivation": {
      const [t, a, b] = headPoints(last, before, 10, 5);
      g += `<polyline points="${f(a.x)},${f(a.y)} ${f(t.x)},${f(t.y)} ${f(b.x)},${f(b.y)}"${paint(o, "none", roleLine)}/>`;
      break;
    }
    default: break;
  }
  if (e.label && label) g += text(o, label.x + label.w / 2, label.y + 10, e.label, "small", e.resolved ? "subtext" : "warn", "middle");
  return g + "</g>";
}

function depth(vm: ViewModel): Map<string, number> {
  const byId = new Map(vm.nodes.map((n) => [n.id, n] as const));
  const d = new Map<string, number>();
  const of = (id: string, g = 0): number => {
    const known = d.get(id);
    if (known !== undefined) return known;
    const n = byId.get(id);
    const up = n ? (n.attachedTo ?? n.parent) : undefined;
    const v = up !== undefined && byId.has(up) && g < 100 ? of(up, g + 1) + 1 : 0;
    d.set(id, v);
    return v;
  };
  for (const n of vm.nodes) of(n.id);
  return d;
}

/** Draw the whole diagram from boxes relative to their parents. */
export function buildSvg(vm: ViewModel, rel: ReadonlyMap<string, Box>, measure: Measure, o: SvgOptions = {}, extras: BuildExtras = {}): SvgResult {
  const abs = absoluteBoxes(vm, rel);
  const d = depth(vm);
  const order = [...vm.nodes].filter((n) => abs.has(n.id)).sort((a, b) => (d.get(a.id)! - d.get(b.id)!));
  const byId = new Map(vm.nodes.map((n) => [n.id, n] as const));
  const selected = extras.selected ?? new Set<string>();
  let out = "";
  for (const n of order) if (n.shape !== "port") out += drawNode(n, abs.get(n.id)!, o, measure, selected.has(n.id));
  const routes = new Map<string, Pt[]>();
  const labels = new Map<string, Box>();
  const endOf = (id: string) => {
    const n = byId.get(id);
    const box = abs.get(id)!;
    const owner = n?.attachedTo !== undefined ? abs.get(n.attachedTo) : undefined;
    return { box, ...(owner ? { owner } : {}) };
  };
  // Route every edge first, in document order: a later edge keeps off the lines of the earlier ones.
  const drawn: { e: VmEdge; pts: Pt[]; ends: Box[] }[] = [];
  for (const e of vm.edges) {
    const s = abs.get(e.source);
    const t = abs.get(e.target);
    if (!s || !t || e.source === e.target) continue;
    const related = (id: string) => {
      // The end itself, what it sits in and what sits in it: a route may cross those.
      const set = new Set<string>();
      for (let cur: string | undefined = id, i = 0; cur !== undefined && i < 100; i++) { set.add(cur); const n = byId.get(cur); cur = n ? (n.attachedTo ?? n.parent) : undefined; }
      for (let grew = true; grew; ) { grew = false; for (const n of vm.nodes) { const up = n.attachedTo ?? n.parent; if (up !== undefined && set.has(up) && !set.has(n.id)) { set.add(n.id); grew = true; } } }
      return set;
    };
    const skip = new Set([...related(e.source), ...related(e.target)]);
    const obstacles = vm.nodes.filter((n) => n.shape !== "port" && !skip.has(n.id) && abs.has(n.id)).map((n) => abs.get(n.id)!);
    const pts = edgeRoute(endOf(e.source), endOf(e.target), extras.routes?.get(e.id) ?? e.points, obstacles, drawn.map((d) => d.pts));
    routes.set(e.id, pts);
    drawn.push({ e, pts, ends: [s, t] });
  }
  // Then the labels, which keep off every node, every other edge and every other label.
  const allNodes = order.map((n) => abs.get(n.id)!);
  const parents = new Set(vm.nodes.map((n) => n.parent).filter((x): x is string => x !== undefined));
  const containers = order.filter((n) => parents.has(n.id)).map((n) => abs.get(n.id)!);
  for (const d of drawn) {
    if (!d.e.label) continue;
    const others = drawn.filter((x) => x !== d).map((x) => x.pts);
    labels.set(d.e.id, placeLabel(d.pts, measure(d.e.label, "small") + 4, 13, d.ends, { nodes: allNodes, containers, routes: others, labels: [...labels.values()] }));
  }
  for (const d of drawn) out += drawEdge(d.e, d.pts, o, labels.get(d.e.id));
  for (const n of order) {
    if (n.shape !== "port") continue;
    const b = abs.get(n.id)!;
    out += drawNode(n, b, o, measure, selected.has(n.id));
    const owner = n.attachedTo !== undefined && byId.has(n.attachedTo) ? abs.get(n.attachedTo) : undefined;
    if (owner) out += drawPortLabel(n, b, owner, o);
  }
  return { content: out, bounds: boundsOf(abs.values(), 0), routes, labels };
}

/** Selection outlines and resize handles (single selected non-port node), and the rubber band. */
export function overlaySvg(selected: readonly Box[], handlesFor: Box | undefined, band: Box | undefined, o: SvgOptions, zoom = 1): string {
  const stroke = o.palette ? ` stroke="${o.palette.sel}"` : ' class="sel-line"';
  const fill = o.palette ? ` fill="${o.palette.sel}"` : ' class="sel-fill"';
  const sw = f(2 / zoom);
  let g = "";
  for (const b of selected) g += `<rect x="${f(b.x - 2)}" y="${f(b.y - 2)}" width="${f(b.w + 4)}" height="${f(b.h + 4)}" fill="none" stroke-width="${sw}" stroke-dasharray="4 2"${stroke}/>`;
  if (handlesFor) {
    const hb = handleBoxes(handlesFor, 8 / zoom);
    for (const h of HANDLES) g += `<rect data-handle="${h}" x="${f(hb[h].x)}" y="${f(hb[h].y)}" width="${f(hb[h].w)}" height="${f(hb[h].h)}"${fill}${o.palette ? ` stroke="${o.palette.bg}"` : ' stroke="none"'}/>`;
  }
  if (band) g += `<rect x="${f(band.x)}" y="${f(band.y)}" width="${f(band.w)}" height="${f(band.h)}" fill-opacity="0.12" stroke-width="${sw}"${o.palette ? ` fill="${o.palette.sel}" stroke="${o.palette.sel}"` : ' class="band"'}/>`;
  return g;
}

/** A standalone SVG document (export mode adds a background rect and a margin). */
export function wrapStandalone(r: SvgResult, o: SvgOptions & { palette: Palette }, margin = 24): { svg: string; width: number; height: number } {
  const x = r.bounds.x - margin;
  const y = r.bounds.y - margin;
  const w = Math.ceil(r.bounds.w + 2 * margin);
  const h = Math.ceil(r.bounds.h + 2 * margin);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${f(x)} ${f(y)} ${w} ${h}" font-family="${FONT_FAMILY.replace(/'/g, "&apos;")}">` +
    `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" fill="${o.palette.bg}"/>` +
    `<g stroke-width="1" fill="none">${r.content}</g></svg>`;
  return { svg, width: w, height: h };
}
