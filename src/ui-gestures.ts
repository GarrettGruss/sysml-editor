/**
 * The test gestures of the diagram and requirements webviews, shared by the integration tests' API and the agent UI driver
 * (design D56). Types only, no imports, so the test compile and `vscode`-free handlers can use it.
 */

export type ConnectRelation = "specialization" | "dependency" | "satisfy" | "verify" | "derivation" | "succession" | "transition" | "message" | "flow";

/** Commands on the selected nodes that need the host (pickers, the shared clipboard). */
export type NodeCommand = "showHideMembers" | "displayRelated" | "copy" | "paste";

/** Test-only gestures, replayed as DOM events so they take the code paths real input takes. */
export type DiagramGesture =
  | { kind: "select"; id: string; shift?: boolean }
  | { kind: "drag"; id: string; dx: number; dy: number; steps?: number; /** Keep the pointer down this many ms before releasing (a nest needs the target highlighted for a while). */ hold?: number }
  | { kind: "resize"; id: string; handle: string; dx: number; dy: number }
  | { kind: "key"; key: string; shift?: boolean; ctrl?: boolean; meta?: boolean }
  | { kind: "rubber"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "menu"; id: string; action: "remove" | "relink" | "deleteModel" | "rename" | "goto" | "description" | NodeCommand | `compartment:${string}` }
  /** Open the context menu on a node, as a right click does. */
  | { kind: "contextmenu"; id: string }
  | { kind: "drop"; names: string[]; x?: number; y?: number }
  /** Choose a palette item, then click a node (or the canvas, with `id` absent) at a point relative to that node. */
  | { kind: "palette"; item: string; id?: string; x?: number; y?: number; /** Type this name into the inline input and press Enter. Absent: Enter with the default name. */ name?: string; /** Leave the inline input open with the default name (or `name`) typed. */ hold?: boolean }
  /** The pointer moves over the canvas with a palette tool chosen (the ghost follows it). */
  | { kind: "ghostMove"; x: number; y: number }
  /** Operate the open inline input: type `text` (replacing its value), then end it with `end` (default: leave it open). */
  | { kind: "inline"; text?: string; end?: "enter" | "shiftEnter" | "escape" | "blur" }
  /** Double-click a node on its name or, with `area: "doc"`, on its description (opens the inline input). */
  | { kind: "dblclick"; id: string; area?: "name" | "doc" }
  /** Turn the per-diagram description toggle on or off. */
  | { kind: "descriptions"; show: boolean }
  /** Connection tool: click the source, then the target. */
  | { kind: "connect"; source: string; target: string; relation?: ConnectRelation }
  /**
   * Drag a connection from a node (`side`: from its quick-connect handle; `relation`: with that connection tool, else the handle's) to a node
   * (`target`) or to a canvas point (`x`, `y`, absolute). `hold`: stop with the button down (the ghost line stays); `release` after a hold lets go.
   */
  | { kind: "connectDrag"; source: string; side?: "L" | "R" | "U" | "D"; relation?: ConnectRelation; target?: string; x?: number; y?: number; hold?: boolean }
  | { kind: "connectRelease" }
  /** Choose a node kind on the open quick bar, or cancel it (no `kind`). */
  | { kind: "quickBar"; item?: string }
  /** Select the line `id`, then drag its `end` onto a node (`target`) or a canvas point (`x`, `y`). */
  | { kind: "reconnectDrag"; id: string; end: "source" | "target"; target?: string; x?: number; y?: number; hold?: boolean }
  /** Hover a node (no button) so its quick-connect handles show. */
  | { kind: "hoverNode"; id: string }
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
  /** Click the drawn text box of a line's label (the line need not be selected). */
  | { kind: "labelClick"; id: string }
  /** A wheel event on the canvas (a zoom step with `ctrl`, a pan without). */
  | { kind: "wheel"; deltaY: number; ctrl?: boolean }
  /** Focus the canvas with a mouse press (`true`) or from the keyboard (`false`). */
  | { kind: "focusCanvas"; mouse: boolean }
  | { kind: "flush" };

/** Gestures in the requirements editor, replayed as DOM events. */
export type RequirementsGesture =
  | { kind: "click"; selector: string }
  | { kind: "input"; selector: string; value: string; event?: "change" | "input" }
  | { kind: "dragToc"; fromQn: string; ontoQn: string; position: "before" | "after" }
  | { kind: "key"; selector: string; key: string; alt?: boolean }
  /** A mouse or pointer event at a point of an element (`at`: where in its box), for the palette, the ghost and dragging. */
  | { kind: "mouse"; type: "contextmenu" | "pointermove" | "pointerdown" | "pointerup" | "click"; selector: string; at?: "center" | "top" | "bottom" | "left"; dy?: number };
