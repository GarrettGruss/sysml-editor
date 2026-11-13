# Design

## Context

This change adds authoring gestures to the diagram editor. It depends on `fix-diagram-editing`: nested ends (D25) are needed for nesting, reconnecting, and the quick bar; feature direction (D26) is needed for pins. Decisions continue after D28.

## Goals / Non-Goals

**Goals:**
- One shared ghost, one shared inline input, and one shared quick bar across all diagram kinds.
- Every gesture states whether it is a model edit or a layout edit.

**Non-Goals:**
- Quick-connect handles on other diagram kinds.
- Specialization by dropping (`:>`).

## Decisions

### D29: One ghost line for every connection tool
Every connection tool and every drag from a handle or line end shows a dashed orthogonal preview with an arrowhead, highlights valid targets, snaps to their border, and shows not-allowed for invalid ones. Escape or right-click cancels. The preview is on screen only.

### D30: Quick-connect handles
Hovering a state or an Action Flow node shows a small box at the middle of each side. Dragging from one starts a connection leaving from that side. Dropping on a node writes the same text as the palette tool (model edit, saved at once).

### D31: A line without a target is never written
Releasing over empty canvas keeps the ghost line and shows a quick bar with the node kinds valid for that diagram and line. Choosing one creates the node and the line as one model edit and one undo step. Escape or clicking elsewhere cancels. Unnamed control nodes need the statement form that allows them.

### D32: Inline input and write on confirm
The palette ghost carries a default name (next free in the owner). Clicking places it and opens the inline input. The element is written once, when the name is confirmed (one model edit, saved at once). Escape writes nothing. Rename and doc editing use the same input; validation shows under the input. Inherited elements are read-only.

### D33: Nesting is ownership
Dropping a node into another moves its declaration into the target body (model edit, saved at once, undoable). References are rewritten with dotted paths or the move is refused with a reason. Moving out reverses it. Inherited elements cannot be moved from a usage (D18). Applies to states, actions, and parts.

### D34: Reconnect rewrites one end
Dragging a selected line's end rewrites that end in the text and keeps guard, trigger, effect, name, and item type. Validity follows the language: successions and transitions accept nodes including control nodes; item flows accept features only.

### D35: Doc comments on nodes
The first `doc` of an element is shown in a description area on the node, clipped with an ellipsis, full text in the tooltip. Editing is a model edit; `*/` is stored as `*\/` as in the requirements editor. The show or hide toggle is diagram style, a layout edit.

### D36: Pins are ports in layout
Directed features of an action (own and inherited) are drawn as pins, placed by ELK as ports; sliding a pin is a layout edit. Flows connect pin to pin and write the dotted feature path. Inherited pins are read-only.

### D37: Unsaved new diagrams
A new diagram opens as a custom-editor document with a pending path and no file. It is dirty only after the user changes something beyond the generated layout. Closing without saving leaves no file. The tree's Diagrams view lists it once saved. The agent tool `sysml_create_diagram` still writes at once.

## Risks / Trade-offs

- A custom editor with no backing file needs careful handling of save and "save as".
- Rewriting references on nesting can fail for complex paths; refusal with a reason is the fallback.

## Open Questions

- Nesting means ownership, not specialization (accepted).
- The element is written on confirm, not at placement (accepted).
- Agent-created diagrams are written at once (accepted).
- Ghost line applies to all connection tools (accepted).
- Quick-connect handles only on states and Action Flow nodes.
