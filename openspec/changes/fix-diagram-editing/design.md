# Design

## Context

This change fixes the defects and small gaps in the v0.1.0 review. It follows the five earlier changes and comes before `add-diagram-authoring`, which needs defect 4 (nested ends) and defect 8 (directions). Decision numbers continue the shared numbering after D21.

## Goals / Non-Goals

**Goals:**
- Every line gesture produces a simple orthogonal route and never flickers.
- Labels never overlap after Auto-layout.
- The model keeps feature direction.

**Non-Goals:**
- New authoring gestures (see `add-diagram-authoring`).
- Quick-connect handles and ghost lines.

## Decisions

### D22: Optimistic line and node edits
On pointer release the webview keeps the previewed route, position, or label drawn and treats it as the pending layout until the host confirms or rejects the edit. On rejection it restores the last committed state. This is a layout edit (D21): saved with the diagram, not at once.

### D23: Bend and segment drags are rebuilt from the pointer
Dragging a bend moves the corner to the pointer; the two adjacent segments follow, and the corner flips when the pointer crosses to the other side. The route is then simplified to a minimal orthogonal path and re-attached to the nearer side of the end node. Dragging a segment past a node routes around the side of that node instead of falling back to the computed route. A route that cannot be made simple falls back to the computed route and shows a short message.

### D24: Labels are layout inputs
Auto-layout wraps each label to a default width (200 px) and gives its size to ELK as an edge label. Each self-transition gets its own loop (stacked, growing, on different sides when there are many), and its label sits beside its own loop. The metric is: labels overlapping labels is 0 after Auto-layout; a fixture with many long self-transition labels checks it.

### D25: Transition ends may be nested
`addTransition` and `addSuccession` accept ends nested below the owner, written as dotted paths (`operating.high`). The owner is the nearest common ancestor of the two ends. Messages say what is wrong ("state X is not reachable from Y"); "refresh and try again" is used only when the model really changed. This is a model edit, saved at once.

### D26: Feature direction is part of the model
The model layer records `direction` (`in`, `out`, `inout`) on features. A compartment of directed features is titled "parameters" and shows `in name : Type`. Agent read tools report the direction.

### D27: Root rules per diagram kind
"New Diagram…" offers a kind only when its root fits (Interconnection: part, item, interface, connection definition or usage). Opening a `.sysmld` with a bad root shows a message with "Change root" and "Convert to General". The rules for the other kinds are listed in the spec.

### D28: Adding elements from the tree only
"Show Element…" and its picker are removed. Elements are added by dragging from the tree or by "Add to Diagram" in the tree's context menu. "Show in Diagram" stays. Agent tools are unchanged.

## Risks / Trade-offs

- Wrapping labels makes nodes spread further apart; the width is a style setting.
- Optimistic updates need a clear rejection path, tested.

## Open Questions

- Arrow keys pan only when nothing is selected; with a selection they nudge (accepted by the user).
- Arrow pan step is 40 px (Shift 160 px); confirm.
- Focus indicator for keyboard focus is a thin inset line on `:focus-visible` only.
