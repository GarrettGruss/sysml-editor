## Why

The v0.1.0 review found defects in line routing, labels, directed features, diagram roots, and transitions to nested states, and a few small usability gaps. They block the authoring features that follow, so they are fixed first.

## What Changes

- Line editing: dragging a segment or bend keeps a simple orthogonal route (defects 1, 3); no flicker on release (2); clicking a label selects its line (6); a selected line is highlighted (feature 4).
- Auto-layout gives every line label its own space and every self-transition its own loop (defect 5).
- Transitions and successions may connect nested states, with a specific error message (defect 4).
- The model records the direction of features and the views show it (defect 8).
- Interconnection and other diagram kinds check their root (defect 9); a new diagram is fitted to the window (defect 10).
- Canvas: no blue focus border (3), wheel zoom 1.5 times faster (7), arrow keys pan (8).
- "Show Element…" is removed; adding elements is done from the tree, and the tree drag is verified (6).

## Capabilities

### Modified Capabilities
- `diagram-editor`: line editing, labels, layout, roots, view, keyboard, zoom, Show Element removal.
- `model-tree-view`: "Add to Diagram" and tree drag.
- `agent-integration`: read tools report feature direction.

## Impact

- Fifth change in order; depends on `add-behavior-diagrams`. Sources: `docs/reviews/v0.1.0-user-review.md`.
- Touches `route-edit.ts`, `renderer.ts`, the layout code, `service.ts`, and the model layer.
- Gestures here are layout edits (saved with the diagram) except the transition fix, which is a model edit (saved at once), per D21.
