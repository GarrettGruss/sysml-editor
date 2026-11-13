## Why

The review asked for draw.io-style authoring: connect by dragging, name things where they are placed, nest by dropping, and keep new diagrams unsaved until the user saves them.

## What Changes

- Quick-connect handles on states and Action Flow nodes, a ghost line for every connection tool, lines to empty space with a quick bar, and reconnecting line ends.
- Palette ghost with inline naming, written on confirm; double-click rename; doc comments shown and edited inline.
- Drop a node into another node to nest it (ownership) for states, actions, and parts.
- Parameter pins on Action Flow nodes.
- "New Diagram…" on `.sysml` files; a new diagram stays unsaved until saved.

## Capabilities

### Modified Capabilities
- `diagram-editor`: connecting, naming, nesting, doc comments, pins.
- `diagram-files`: unsaved new diagrams.
- `model-tree-view`: "New Diagram…" on files.

## Impact

- Sixth change in order; depends on `fix-diagram-editing` (defect 4 before reconnect and quick bar, defect 8 before pins).
- Each requirement says whether it is a model edit (saved at once) or a layout edit (saved with the diagram), per D21.
