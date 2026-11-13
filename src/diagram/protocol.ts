/** Messages between the extension host and the diagram webview. No `vscode` import, no DOM. */
import type { LabelLayout } from "./format.js";
import type { ViewModel } from "./view-model.js";

/** `light`: the fixed export theme. `editor-dark`: the editor appearance (selection handles included) in a fixed dark palette, for test artifacts. */
export type PngTheme = "light" | "editor-dark" | "editor-light";

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
  /** `data-shape` of the drawn node: definition, usage, package, requirement, port, unresolved, action, state, start, done, fork, decision, usecase or lifeline. */
  shape?: string;
  /** All text drawn in the node, joined with " | ". */
  text?: string;
  /** Drawn as an inherited feature (dashed border, muted fill). */
  inherited?: boolean;
}

/** What the user changed on a line: its whole route, and/or its label layout (`null`: back to the default placement). */
export interface EdgePatch {
  id: string;
  points?: { x: number; y: number }[];
  label?: LabelLayout | null;
}

export interface EdgePoints {
  id: string;
  points: { x: number; y: number }[];
}

/** User edits from the webview. Each one is a single undoable edit of the diagram file only. */
export type DiagramEdit =
  /** `routes` and `drop`: the stored routes of lines at the moved or resized nodes, adjusted by the webview (or to be removed), in the same edit. */
  | { kind: "layout"; label: "Move" | "Resize" | "Nudge"; boxes: BoxPatch[]; routes?: EdgePoints[]; drop?: string[] }
  | { kind: "autoLayout"; boxes: NodeBox[]; edges: EdgePoints[] }
  /** A hand-edited route or label layout of lines. */
  | { kind: "edgeLayout"; label: "Route" | "Label"; edges: EdgePatch[] }
  | { kind: "remove"; ids: string[] };

/** What the properties panel edits; `null` removes a value. */
export interface PropertyChanges {
  name?: string;
  shortName?: string | null;
  type?: string | null;
  multiplicity?: string | null;
  documentation?: string | null;
}

/** Model edits requested from the webview. The host asks for names, runs the operation and answers with a new render. */
export type ModelIntent =
  /** Create an element of `kind` in the element of node `ownerId` (the diagram's root when absent), placed at (x, y) relative to that node. */
  | { kind: "add"; paletteKind: string; ownerId?: string; x: number; y: number }
  /** `relation`: a relationship tool of the palette (satisfy, verify, derivation, succession, transition, message); absent: a connection. */
  | { kind: "connect"; sourceId: string; targetId: string; relation?: ConnectRelation }
  /** Trigger, guard and effect of the transition edge `id`, as text (a missing field is left as it is). */
  | { kind: "setTransition"; id: string; changes: { trigger?: string; guard?: string; effect?: string } }
  | { kind: "deleteFromModel"; ids: string[] }
  | { kind: "rename"; id: string; name: string }
  | { kind: "setProperties"; id: string; changes: PropertyChanges }
  | { kind: "goToDefinition"; id: string };

export type ConnectRelation = "satisfy" | "verify" | "derivation" | "succession" | "transition" | "message";

export type DiagramCommand = "autoLayout" | "fit" | "zoomIn" | "zoomOut" | "selectAll";

/** Test-only gestures, replayed as DOM events so they take the code paths real input takes. */
export type TestGesture =
  | { kind: "select"; id: string; shift?: boolean }
  | { kind: "drag"; id: string; dx: number; dy: number; steps?: number }
  | { kind: "resize"; id: string; handle: string; dx: number; dy: number }
  | { kind: "key"; key: string; shift?: boolean; ctrl?: boolean; meta?: boolean }
  | { kind: "rubber"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "menu"; id: string; action: "remove" | "relink" | "deleteModel" | "rename" | "goto" }
  /** Open the context menu on a node, as a right click does. */
  | { kind: "contextmenu"; id: string }
  | { kind: "drop"; names: string[]; x?: number; y?: number }
  /** Choose a palette item, then click a node (or the canvas, with `id` absent) at a point relative to that node. */
  | { kind: "palette"; item: string; id?: string; x?: number; y?: number }
  /** Connection tool: click the source, then the target. */
  | { kind: "connect"; source: string; target: string; relation?: ConnectRelation }
  /** Click an edge (a succession, transition or message) to select it. */
  | { kind: "selectEdge"; id: string }
  /** Press on a message and drag it vertically: nothing may change (messages are placed by time order). */
  | { kind: "dragEdge"; id: string; dy: number }
  /** Select a line, then drag the middle handle of segment `index` of its route by `d` perpendicular to the segment. */
  | { kind: "dragSegment"; id: string; index: number; d: number }
  /** Select a line, then drag the bend handle `index` (an inner route point) by (dx, dy). */
  | { kind: "dragBend"; id: string; index: number; dx: number; dy: number }
  /** Double-click a line (at the middle of its longest segment): adds a bend point. */
  | { kind: "dblclickEdge"; id: string }
  /** Select a line, then drag its label's move handle, or its resize handle (bottom-right corner). */
  | { kind: "labelDrag"; id: string; dx: number; dy: number }
  | { kind: "labelResize"; id: string; dw: number; dh: number }
  /** Right-click the label handle and choose the item: Reset Position and Size, or Wrap Text. */
  | { kind: "labelMenu"; id: string; action: "reset" | "wrap" }
  /** Double-click a node label: opens the inline editor; `text` types into it and Enter commits (or Escape cancels). */
  | { kind: "inlineRename"; id: string; text: string; commit: boolean }
  /** Edit a field of the properties panel as the user would: sets the value and fires `change`. */
  | { kind: "property"; field: "name" | "shortName" | "type" | "multiplicity" | "documentation" | "trigger" | "guard" | "effect"; value: string }
  /** Move the pointer over a node or line (no button pressed), or off the diagram when `id` is absent. */
  | { kind: "hover"; id?: string }
  | { kind: "flush" };

export type HostToWebview =
  /** `generation` is the document generation (bumped by every load); the webview echoes it in its edits so stale ones can be dropped. */
  | { type: "render"; viewModel: ViewModel; generation: number }
  | { type: "exportPng"; requestId: number; theme: PngTheme; /** Cap on the image width in px (default 1600). */ maxWidth?: number; /** Test artifact: the editor window with the palette and properties panel drawn from the live DOM, in the editor's own theme. */ panels?: boolean }
  | { type: "getMetrics"; requestId: number }
  /** `whole`: Auto-layout lays out the whole diagram even when nodes are selected (the agent tool). */
  | { type: "command"; name: DiagramCommand; whole?: boolean }
  /** The host cleared its hover state: the webview reports its next hover even when it is unchanged. */
  | { type: "resetHover" }
  | { type: "select"; ids: string[] }
  | { type: "testGesture"; requestId: number; gesture: TestGesture }
  | { type: "typeSuggestionsResult"; requestId: number; items: { name: string; qualifiedName: string; library: boolean }[] }
  /** A model edit was refused or failed; shown in the properties panel as well as in a notification. */
  | { type: "notice"; message: string };

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
  /** Messages: position in time order, and the marker for an order the model leaves open. */
  order?: number;
  unordered?: boolean;
  /** The drawn label box, its lines of text, and whether it has a stored layout. */
  labelBox?: { x: number; y: number; w: number; h: number };
  labelLines?: string[];
  labelLaidOut?: boolean;
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
  /** Child nodes that intersect their parent's header or compartment area (they belong below it). */
  nodesOverCompartments: number;
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
  /** Labels the user placed: touching a node, or outside the canvas. */
  userLabelsOverNodes: number;
  userLabelsOffCanvas: number;
  selected: string[];
  /** Labels of the open context menu's items (empty when none is open). */
  menu: string[];
  /** Selected nodes that carry an accessible name (aria-label). */
  selectedNamed: number;
  /** Resize handles drawn. */
  handles: number;
  /** Bend and segment handles of the selected line, and its label's handles. */
  routeHandles: number;
  labelHandles: number;
  /** Nodes drawn as inherited features. */
  inheritedNodes: number;
  /** Labels of the palette items, the active tool, and what the properties panel shows. */
  palette: string[];
  tool?: string;
  properties: { visible: boolean; id?: string; kind?: string; qualifiedName?: string; fields: Record<string, { value: string; disabled: boolean }>; note?: string };
  /** An inline name editor is open. */
  inlineEditor: boolean;
  /** `light`, `dark` or `hc`, from the editor theme. */
  theme: string;
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
  /** The node or edge id under the pointer; `id` absent when the pointer left the diagram. Throttled by the webview. */
  | { type: "hover"; id?: string }
  | { type: "relink"; id: string }
  | { type: "model"; intent: ModelIntent; generation?: number }
  /** Completion for the type field of the properties panel. */
  | { type: "typeSuggestions"; requestId: number; id: string; query: string }
  /** Qualified names dropped from the tree onto the diagram. */
  | { type: "dropElements"; names: string[]; x?: number; y?: number }
  | { type: "pngResult"; requestId: number; base64: string; error?: string }
  | ({ type: "metricsResult"; requestId: number } & DiagramMetrics)
  | { type: "gestureResult"; requestId: number; error?: string }
  | { type: "openAsText" }
  | { type: "error"; message: string };

/** MIME type the tree puts its dragged element references under. The payload is a JSON array of qualified names. */
export const ELEMENT_MIME = "application/vnd.sysml-editor.elements";
