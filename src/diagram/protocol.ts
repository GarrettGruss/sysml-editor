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
  /** The hover tooltip of the node (an inherited element's reason, the full description). */
  tooltip?: string;
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
  | { kind: "layout"; label: "Move" | "Resize" | "Nudge" | "Align"; boxes: BoxPatch[]; routes?: EdgePoints[]; drop?: string[] }
  | { kind: "autoLayout"; boxes: NodeBox[]; edges: EdgePoints[] }
  /** The per-diagram style (D35): show or hide the descriptions (first `doc`) on the nodes. Layout only; the `.sysml` text is untouched. */
  | { kind: "style"; descriptions?: boolean; /** The legend of the kinds drawn (D49). */ legend?: boolean; containment?: boolean }
  /** Show or hide compartments of one node (D49); `hidden` lists the titles that are hidden. Diagram style only. */
  | { kind: "compartments"; id: string; hidden: string[] }
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
  | { kind: "add"; paletteKind: string; ownerId?: string; x: number; y: number; /** The name confirmed in the inline input (the next free one when absent). */ name?: string }
  /** `relation`: a relationship tool of the palette (satisfy, verify, derivation, succession, transition, message); absent: a connection. */
  | { kind: "connect"; sourceId: string; targetId: string; relation?: ConnectRelation }
  /** A node of `paletteKind` and the `relation` line from `sourceId` to it, as one edit; the node at (x, y) relative to the source's container. */
  | { kind: "connectNew"; sourceId: string; relation: "succession" | "transition"; paletteKind: string; x: number; y: number; /** The name confirmed in the inline input (the next free one when absent). */ name?: string }
  /** Rewrite one end of the line `id` to end at `nodeId`. */
  | { kind: "reconnect"; id: string; end: "source" | "target"; nodeId: string }
  /** Trigger, guard and effect of the transition edge `id`, as text (a missing field is left as it is). */
  | { kind: "setTransition"; id: string; changes: { trigger?: string; guard?: string; effect?: string } }
  | { kind: "deleteFromModel"; ids: string[] }
  | { kind: "rename"; id: string; name: string }
  | { kind: "setProperties"; id: string; changes: PropertyChanges }
  | { kind: "goToDefinition"; id: string }
  /** Nest by dropping (D33): move the declaration of node `id` into the element of node `targetId` (the diagram's root when absent). */
  | { kind: "nest"; id: string; targetId?: string };

import type { ConnectRelation, NodeCommand, DiagramGesture } from "../ui-gestures.js";
export type { ConnectRelation, NodeCommand };


export type AlignCommand = "alignLeft" | "alignRight" | "alignTop" | "alignBottom" | "alignCenter" | "alignMiddle" | "distributeHorizontal" | "distributeVertical";
export type DiagramCommand = "autoLayout" | "fit" | "zoomIn" | "zoomOut" | "selectAll" | AlignCommand;

export type TestGesture = DiagramGesture;

export type HostToWebview =
  /** `generation` is the document generation (bumped by every load); the webview echoes it in its edits so stale ones can be dropped. */
  | { type: "render"; viewModel: ViewModel; generation: number }
  /** Copy the whole diagram to the clipboard as a PNG; the webview answers with `copyResult`. */
  | { type: "copyImage"; requestId: number; theme: PngTheme }
  | { type: "exportPng"; requestId: number; theme: PngTheme; /** The SVG text of the whole diagram instead of a PNG (`pngResult.svg`). */ svg?: boolean; /** Cap on the image width in px (default 1600). */ maxWidth?: number; /** Test artifact: the editor window with the palette and properties panel drawn from the live DOM, in the editor's own theme. */ panels?: boolean }
  | { type: "getMetrics"; requestId: number }
  /** `whole`: Auto-layout lays out the whole diagram even when nodes are selected (the agent tool). */
  | { type: "command"; name: DiagramCommand; whole?: boolean }
  /** The host cleared its hover state: the webview reports its next hover even when it is unchanged. */
  | { type: "resetHover" }
  | { type: "select"; ids: string[] }
  | { type: "testGesture"; requestId: number; gesture: TestGesture }
  /** The tutor: spotlight a node (id) or a selector with a callout; answered with a `gestureResult` (error when the target is missing). `text` is plain text. */
  | { type: "highlight"; requestId: number; node?: string; selector?: string; text: string }
  | { type: "clearHighlights" }
  | { type: "typeSuggestionsResult"; requestId: number; items: { name: string; qualifiedName: string; library: boolean }[] }
  /** The answer to `nameCheck`: why the name cannot be used (absent: fine), and the default name of the kind. */
  | { type: "nameCheckResult"; requestId: number; problem?: string; suggested?: string }
  /** A model edit was refused or failed; shown in the properties panel as well as in a notification. */
  | { type: "notice"; message: string }
  /** The host did not apply the last diagram edit (stale or refused): the webview draws the committed state again. */
  | { type: "editRejected" }
  /** The host applied the last diagram edit; sent after any render it caused, so a preview is dropped even when the drawing did not change. */
  | { type: "editApplied" };

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
  /** The tutor callout text while a highlight is shown. */
  highlight?: string;
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
  /** With an inline input open: its text, the error shown under it, and what it edits (`rename`, `add`, `quick` or `doc`). */
  inline?: { value: string; error?: string; purpose: string };
  /** The palette ghost: the kind, the name it shows, and whether it is placed (waiting for the name). */
  paletteGhost?: { kind: string; name: string; placed: boolean };
  /** The per-diagram description toggle. */
  descriptions: boolean;
  /** The legend is on: its entries (node and line kinds drawn). */
  legend?: string[];
  /** `light`, `dark` or `hc`, from the editor theme. */
  theme: string;
  focusable: boolean;
  /** Zoom factor. */
  zoom: number;
  /** The pan and zoom, and the size of the canvas in px. */
  view: { x: number; y: number; k: number };
  canvas: { w: number; h: number };
  /** Selected-line highlight strokes drawn. */
  highlights: number;
  /** Times a line was drawn with its old route between the release of a drag and the host's answer (D22): 0. */
  staleDraws: number;
  /** A ghost line is on screen (its target when it snaps to one, and why it cannot connect to the node under it), the quick bar's items, the quick-connect and reconnect handles drawn. */
  ghost?: { target?: string; invalid?: string; points: number };
  quickBar: string[];
  /** With the quick bar open: where it sits and where the ghost line ends (canvas coordinates). */
  quickAnchor?: { bar: { x: number; y: number }; ghostEnd: { x: number; y: number } };
  connectHandles: number;
  reconnectHandles: number;
  /** Whether the canvas shows a focus outline now (the computed outline style is not "none"). */
  focusOutline: boolean;
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
  /** `id`: the node the command was chosen on (absent: the selection). */
  | { type: "nodeCommand"; command: NodeCommand; id?: string; /** The ids selected, for copy. */ ids?: string[] }
  | { type: "model"; intent: ModelIntent; generation?: number }
  /**
   * Is `name` free? For a new element of `kind` in the element of node `ownerId` (the diagram's root when absent), or, with `siblingOf`,
   * in the owner of that node's element (`rename`: that element itself is renamed). The answer also carries the default name of `kind`.
   */
  | { type: "nameCheck"; requestId: number; name: string; kind?: string; ownerId?: string; siblingOf?: string; rename?: boolean }
  /** Completion for the type field of the properties panel. */
  | { type: "typeSuggestions"; requestId: number; id: string; query: string }
  /** Qualified names dropped from the tree onto the diagram. */
  | { type: "dropElements"; names: string[]; x?: number; y?: number }
  | { type: "pngResult"; requestId: number; base64: string; svg?: string; error?: string }
  /** `base64` is the PNG that was produced; `copied` says whether the clipboard took it (`error` when not). */
  | { type: "copyResult"; requestId: number; base64: string; copied: boolean; error?: string }
  | ({ type: "metricsResult"; requestId: number } & DiagramMetrics)
  | { type: "gestureResult"; requestId: number; error?: string }
  | { type: "openAsText" }
  | { type: "error"; message: string };

/** MIME type the tree puts its dragged element references under. The payload is a JSON array of qualified names. */
export const ELEMENT_MIME = "application/vnd.sysml-editor.elements";
