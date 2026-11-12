/** Messages between the extension host and the diagram webview. No `vscode` import, no DOM. */
import type { ViewModel } from "./view-model.js";

/** `light`: the fixed export theme. `editor-dark`: the editor appearance (selection handles included) in a fixed dark palette, for test artifacts. */
export type PngTheme = "light" | "editor-dark";

export interface NodeBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A change to a stored box, relative to the parent node (ports: to their owner). Size is written only when given. */
export interface BoxPatch {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface MetricsNode extends NodeBox {
  parent?: string;
  attachedTo?: string;
  /** `data-shape` of the drawn node: definition, usage, package, requirement, port or unresolved. */
  shape?: string;
  /** All text drawn in the node, joined with " | ". */
  text?: string;
}

export interface EdgePoints {
  id: string;
  points: { x: number; y: number }[];
}

/** User edits from the webview. Each one is a single undoable edit of the diagram file only. */
export type DiagramEdit =
  | { kind: "layout"; label: "Move" | "Resize" | "Nudge"; boxes: BoxPatch[] }
  | { kind: "autoLayout"; boxes: NodeBox[]; edges: EdgePoints[] }
  | { kind: "remove"; ids: string[] };

export type DiagramCommand = "autoLayout" | "fit" | "zoomIn" | "zoomOut" | "selectAll";

/** Test-only gestures, replayed as DOM events so they take the code paths real input takes. */
export type TestGesture =
  | { kind: "select"; id: string; shift?: boolean }
  | { kind: "drag"; id: string; dx: number; dy: number; steps?: number }
  | { kind: "resize"; id: string; handle: string; dx: number; dy: number }
  | { kind: "key"; key: string; shift?: boolean; ctrl?: boolean; meta?: boolean }
  | { kind: "rubber"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "menu"; id: string; action: "remove" | "relink" }
  /** Open the context menu on a node, as a right click does. */
  | { kind: "contextmenu"; id: string }
  | { kind: "drop"; names: string[] }
  | { kind: "flush" };

export type HostToWebview =
  /** `generation` is the document generation (bumped by every load); the webview echoes it in its edits so stale ones can be dropped. */
  | { type: "render"; viewModel: ViewModel; generation: number }
  | { type: "exportPng"; requestId: number; theme: PngTheme; /** Cap on the image width in px (default 1600). */ maxWidth?: number }
  | { type: "getMetrics"; requestId: number }
  | { type: "command"; name: DiagramCommand }
  | { type: "select"; ids: string[] }
  | { type: "testGesture"; requestId: number; gesture: TestGesture };

/** Edges, in the metrics: absolute canvas coordinates. */
export interface MetricsEdge {
  id: string;
  source: string;
  target: string;
  /** The polyline as drawn. */
  points: { x: number; y: number }[];
  /** Notation style (`satisfy`, `derivation`, ...) and the drawn label. */
  style?: string;
  label?: string;
}

export interface DiagramMetrics {
  /** Absolute canvas coordinates. */
  nodes: MetricsNode[];
  edges: MetricsEdge[];
  overlaps: number;
  /** Text elements wider than their box. */
  overflows: number;
  /** Child nodes whose box is not inside their parent's box. */
  outsideParent: number;
  /** Edge segments that are neither horizontal nor vertical. */
  diagonalSegments: number;
  /** Edges with a segment through the interior of one of their own end nodes (an end that contains the other is skipped). */
  edgesThroughEndNodes: number;
  /** Edge labels whose box overlaps one of the edge's end nodes. */
  labelsOverEndNodes: number;
  /** Edge labels crossed by their own edge's line. */
  labelsOnOwnEdge: number;
  /** Ports whose centre is more than 2 px from their owner's border. */
  portsOffBorder: number;
  /** Edge labels intersecting any node box grown by 2 px (containers that hold the label excepted). */
  labelsOverNodes: number;
  /** Pairs of intersecting edge labels. */
  labelsOverLabels: number;
  /** Pairs of segments of different edges that are collinear and overlap by more than 4 px. */
  edgeOverlaps: number;
  selected: string[];
  /** Labels of the open context menu's items (empty when none is open). */
  menu: string[];
  /** Selected nodes that carry an accessible name (aria-label). */
  selectedNamed: number;
  /** Resize handles drawn. */
  handles: number;
  focusable: boolean;
  /** Zoom factor. */
  zoom: number;
}

export type WebviewToHost =
  | { type: "ready" }
  /** Positions the webview computed for nodes that had none (relative to the parent node), and routes for edges. */
  | { type: "layoutChanged"; nodes: NodeBox[]; edges: EdgePoints[] }
  /** `generation` is that of the last render the edit was made on. */
  | { type: "edit"; edit: DiagramEdit; generation?: number }
  | { type: "selection"; ids: string[] }
  | { type: "relink"; id: string }
  | { type: "showElement" }
  /** Qualified names dropped from the tree onto the diagram. */
  | { type: "dropElements"; names: string[] }
  | { type: "pngResult"; requestId: number; base64: string; error?: string }
  | ({ type: "metricsResult"; requestId: number } & DiagramMetrics)
  | { type: "gestureResult"; requestId: number; error?: string }
  | { type: "openAsText" }
  | { type: "error"; message: string };

/** MIME type the tree puts its dragged element references under. The payload is a JSON array of qualified names. */
export const ELEMENT_MIME = "application/vnd.sysml-editor.elements";
