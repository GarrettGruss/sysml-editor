/**
 * The SysML notation as an SVG string (design D7). No DOM: the same code draws the live view
 * (colours come from CSS classes bound to VS Code theme variables) and the export (a fixed light
 * palette as attributes). Only presentation attributes are used, so no inline `style` is needed.
 */
import type { VmEdge, VmNode, ViewModel } from "../../diagram/view-model.js";
import {
  FONT_FAMILY, FONT_SIZE, SMALL_SIZE, absoluteBoxes, boundsOf, describeBox, diamondPoints, headPoints, routeEdge,
  type Box, type Measure, type Pt, type TextStyle,
} from "./geometry.js";

export type Role = "bg" | "node" | "line" | "text" | "subtext" | "warn" | "edge";
export type Palette = Record<Role, string>;

/** Fixed light theme for exports (agent images, PNG): independent of the editor theme. */
export const LIGHT_PALETTE: Palette = {
  bg: "#ffffff", node: "#f6f8fa", line: "#1f2328", text: "#1f2328", subtext: "#57606a", warn: "#bf8700", edge: "#24292f",
};

export interface SvgOptions {
  /** Absent: live mode (CSS classes). Present: export mode (colours as attributes, background and margin). */
  palette?: Palette;
}

export interface SvgResult {
  /** Drawing in canvas coordinates. */
  content: string;
  bounds: Box;
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

function drawNode(n: VmNode, b: Box, o: SvgOptions, measure: Measure): string {
  const c = describeBox(n, measure);
  const warn = n.shape === "unresolved";
  const stroke: Role = warn ? "warn" : "line";
  const dash = warn ? ' stroke-dasharray="5 3"' : "";
  const sw = n.shape === "requirement" ? ' stroke-width="1.5"' : "";
  let g = `<g data-node="${esc(n.id)}" data-shape="${n.shape}" transform="translate(${f(b.x)} ${f(b.y)})">`;
  if (n.shape === "port") {
    g += `<rect width="${f(b.w)}" height="${f(b.h)}"${paint(o, "node", "line")}/>`;
    return g + "</g>";
  }
  const rx = n.shape === "usage" ? ' rx="10"' : n.shape === "requirement" ? ' rx="3"' : "";
  if (n.shape === "package") {
    g += `<rect y="16" width="${f(b.w)}" height="${f(b.h - 16)}"${paint(o, "node", stroke)}/>`;
    g += `<rect width="${f(Math.min(b.w * 0.4, 70))}" height="16"${paint(o, "node", stroke)}/>`;
  } else g += `<rect width="${f(b.w)}" height="${f(b.h)}"${rx}${dash}${sw}${paint(o, "node", stroke)}/>`;
  for (const y of c.dividers) g += `<line x1="0" y1="${f(y)}" x2="${f(b.w)}" y2="${f(y)}"${paint(o, "none", stroke)}/>`;
  for (const r of c.rows) {
    const role: Role = r.kind === "keyword" || r.kind === "ctitle" ? "subtext" : r.kind === "warn" ? "warn" : "text";
    if (r.kind === "cline" || r.kind === "ctitle" || r.kind === "doc") g += text(o, PAD_LEFT, r.y, r.text, r.style, role);
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

const DASHED = new Set(["typing", "satisfy", "verify"]);

function drawEdge(e: VmEdge, pts: Pt[], o: SvgOptions, measure: Measure): string {
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
    case "typing": case "satisfy": case "verify": {
      const [t, a, b] = headPoints(last, before, 10, 5);
      g += `<polyline points="${f(a.x)},${f(a.y)} ${f(t.x)},${f(t.y)} ${f(b.x)},${f(b.y)}"${paint(o, "none", roleLine)}/>`;
      break;
    }
    default: break;
  }
  if (e.label) {
    const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
    const w = measure(e.label, "small") + 6;
    g += `<rect x="${f(mid.x - w / 2)}" y="${f(mid.y - 8)}" width="${f(w)}" height="13"${paint(o, "bg", "none")}/>`;
    g += text(o, mid.x, mid.y + 2, e.label, "small", e.resolved ? "subtext" : "warn", "middle");
  }
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
export function buildSvg(vm: ViewModel, rel: ReadonlyMap<string, Box>, measure: Measure, o: SvgOptions = {}): SvgResult {
  const abs = absoluteBoxes(vm, rel);
  const d = depth(vm);
  const order = [...vm.nodes].filter((n) => abs.has(n.id)).sort((a, b) => (d.get(a.id)! - d.get(b.id)!));
  let out = "";
  for (const n of order) if (n.shape !== "port") out += drawNode(n, abs.get(n.id)!, o, measure);
  for (const e of vm.edges) {
    const s = abs.get(e.source);
    const t = abs.get(e.target);
    if (!s || !t || e.source === e.target) continue;
    out += drawEdge(e, routeEdge(s, t, e.points ?? []), o, measure);
  }
  const byId = new Map(vm.nodes.map((n) => [n.id, n] as const));
  for (const n of order) {
    if (n.shape !== "port") continue;
    const b = abs.get(n.id)!;
    out += drawNode(n, b, o, measure);
    const owner = n.attachedTo !== undefined && byId.has(n.attachedTo) ? abs.get(n.attachedTo) : undefined;
    if (owner) out += drawPortLabel(n, b, owner, o);
  }
  return { content: out, bounds: boundsOf(abs.values(), 0) };
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
