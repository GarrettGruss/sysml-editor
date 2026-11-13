/**
 * The pure parts of connecting: the ghost line from a source to the pointer or a target, which nodes may be connected
 * by which tool, and where the quick-connect handles sit. No DOM.
 */
import type { ConnectRelation } from "../../diagram/protocol.js";
import type { ViewModel, VmNode } from "../../diagram/view-model.js";
import type { Box, Pt } from "./geometry.js";
import { routeOrthogonal, type Side } from "./routing.js";

export const SIDES: readonly Side[] = ["R", "L", "U", "D"];

/** The middle of a side of a box. */
export function sidePoint(b: Box, s: Side): Pt {
  return s === "R" ? { x: b.x + b.w, y: b.y + b.h / 2 } : s === "L" ? { x: b.x, y: b.y + b.h / 2 } : s === "U" ? { x: b.x + b.w / 2, y: b.y } : { x: b.x + b.w / 2, y: b.y + b.h };
}

/** The side of `b` that faces the point. */
export function facingSide(b: Box, p: Pt): Side {
  const dx = p.x - (b.x + b.w / 2), dy = p.y - (b.y + b.h / 2);
  return Math.abs(dx) * b.h >= Math.abs(dy) * b.w ? (dx >= 0 ? "R" : "L") : dy >= 0 ? "D" : "U";
}

/**
 * The preview route (orthogonal): to the target box when there is one (it snaps to its border), otherwise to the pointer.
 * `side` is where it leaves the source; when absent, the side facing the target or pointer.
 */
export function ghostRoute(src: Box, side: Side | undefined, to: Pt, target?: Box): Pt[] {
  if (target) return routeOrthogonal(src, target, side);
  const s = side ?? facingSide(src, to);
  return routeOrthogonal(src, { x: to.x, y: to.y, w: 0, h: 0 }, s);
}

const isState = (n: VmNode) => n.shape === "state";
const isAction = (n: VmNode) => n.shape === "action";
const isControl = (n: VmNode) => n.shape === "fork" || n.shape === "decision";

/** Whether a node is a feature (an end an item flow or connection may use): anything that is not a control, start, done or lifeline node. */
const isFeature = (n: VmNode) => !isControl(n) && n.shape !== "start" && n.shape !== "done" && n.shape !== "lifeline";

/**
 * Why `target` cannot be the end of a line drawn with `relation`, or undefined when it can. Where the end is a model
 * rule that needs the whole model (owners, names) the host decides; this covers what the kind of node already tells.
 */
export function endProblem(vm: ViewModel | undefined, relation: ConnectRelation | "flow" | undefined, source: string | undefined, target: string, role: "source" | "target" = "target"): string | undefined {
  const n = vm?.nodes.find((x) => x.id === target);
  if (!n) return "Nothing to connect to there.";
  if (!n.resolved) return "This item is unresolved, so it cannot be connected.";
  if (n.attachedTo !== undefined && relation !== undefined && relation !== "message") return undefined;
  if (relation === "flow") return isFeature(n) ? undefined : "Flows connect features, not control nodes.";
  if (relation === "succession") {
    if (!(isAction(n) || isControl(n) || n.shape === "start" || n.shape === "done")) return "A succession connects actions and control nodes.";
    if (role === "target" && n.shape === "start") return "Nothing can lead to the start node.";
    if (role === "source" && n.shape === "done") return "Nothing can follow the done node.";
    if (source !== undefined && source === target) return "A succession needs two different nodes.";
  } else if (relation === "transition") {
    if (!(isState(n) || (role === "target" && n.shape === "done") || (role === "source" && n.shape === "start"))) return "A transition connects states.";
  } else if (relation === "message") {
    if (n.shape !== "lifeline") return "A message connects lifelines.";
  } else if (source !== undefined && source === target && relation !== undefined) return "A line needs two different elements.";
  return undefined;
}

/** The relation a quick-connect handle draws on a diagram of this kind, or undefined when its nodes have no handles. */
export function handleRelation(kind: string): "transition" | "succession" | undefined {
  return kind === "stateTransition" ? "transition" : kind === "actionFlow" ? "succession" : undefined;
}

/** Whether a quick-connect handle may leave this node: a state, or an Action Flow action, control or start node. */
export function hasHandles(vm: ViewModel, n: VmNode): boolean {
  if (!n.resolved || n.attachedTo !== undefined || n.props?.locked === "inherited" || n.props?.locked === "library") return false;
  if (vm.kind === "stateTransition") return isState(n) || n.shape === "start";
  if (vm.kind === "actionFlow") return isAction(n) || isControl(n) || n.shape === "start";
  return false;
}

/** The four handle boxes (size `s`), at the middle of each side, just outside it so they never sit on a resize handle. */
export function handleBoxesOf(b: Box, s: number): Record<Side, Box> {
  const at = (p: Pt, dx: number, dy: number): Box => ({ x: p.x + dx * s - s / 2, y: p.y + dy * s - s / 2, w: s, h: s });
  return { R: at(sidePoint(b, "R"), 1, 0), L: at(sidePoint(b, "L"), -1, 0), U: at(sidePoint(b, "U"), 0, -1), D: at(sidePoint(b, "D"), 0, 1) };
}

export function sideAt(b: Box, p: Pt, s: number): Side | undefined {
  const boxes = handleBoxesOf(b, s);
  return SIDES.find((k) => p.x >= boxes[k].x && p.x <= boxes[k].x + boxes[k].w && p.y >= boxes[k].y && p.y <= boxes[k].y + boxes[k].h);
}

/** Dashed polyline with an arrowhead at its end, as SVG (the colour is the selection colour). */
export function ghostSvg(pts: readonly Pt[], opt: { zoom: number; valid: boolean; colour?: string }): string {
  if (pts.length < 2) return "";
  const f = (n: number) => String(Math.round(n * 100) / 100);
  const k = opt.zoom;
  const stroke = opt.colour ? ` stroke="${opt.colour}"` : ' class="sel-line"';
  const fill = opt.colour ? ` fill="${opt.colour}"` : ' class="sel-fill"';
  const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const h = 10 / k, w = 4 / k;
  const base = { x: b.x - ux * h, y: b.y - uy * h };
  const d = pts.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ");
  return `<path data-ghost="${opt.valid ? "valid" : "open"}" d="${d}" fill="none" stroke-width="${f(1.5 / k)}" stroke-dasharray="${f(6 / k)} ${f(4 / k)}"${stroke}/>` +
    `<polygon data-ghost-head="true" points="${f(b.x)},${f(b.y)} ${f(base.x - uy * w)},${f(base.y + ux * w)} ${f(base.x + uy * w)},${f(base.y - ux * w)}"${fill}/>`;
}
