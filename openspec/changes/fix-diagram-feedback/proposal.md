## Why

User feedback on v0.3.0 (issues #88 to #93) found six gaps in how diagrams are laid out and drawn: decision nodes land in the last layer, the layout direction cannot be chosen, an actor cannot be shared between use cases, requirement trees have no containment edges, interface edges look generic and overlap, and the Sequence View has no alternatives.

## What Changes

- Auto-layout places each `decide` node between its incoming succession and its targets (#90).
- A `layoutDirection` diagram style (`down` or `right`) with a toolbar toggle; Auto-layout uses it for every kind (#91).
- General View draws the association from a use case to the actor definition when the actor usage is not on the diagram (#89).
- Requirements View can draw requirement containment as containment edges, shown by a style option (#92).
- Interface usages use the connection style; parallel edges between the same two ends get separate routes and stacked labels (#93).
- Sequence View shows alternatives as `alt`/`else` frames with guards and draws replies dashed (#88).

## Capabilities

### Modified Capabilities
- `diagram-editor`: layout, view model derived edges, edge styles, sequence view, toolbar.

## Impact

- Follows `fix-diagram-editing` and `add-behavior-diagrams`; no model edits, all changes are in view derivation, layout, and drawing.
- Touches `src/webview/diagram/layout.ts`, `src/diagram/view-model.ts`, `src/webview/diagram/sequence-layout.ts`, `src/webview/diagram/svg.ts`, `src/diagram/style.ts`, the toolbar in `src/webview/diagram/main.ts`, and `docs/diagram-format.md`.
- Sources: GitHub issues #88 to #93.
