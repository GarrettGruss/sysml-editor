# Tasks

## 1. Diagram files

- [x] 1.1 Define the `.sysmld` schema (design D5) with a versioned, deterministic serializer and parser, and publish it as a JSON Schema; verify a unit test that open and save is byte-identical and all test diagrams validate
- [x] 1.2 Implement the `CustomEditorProvider` and `CustomDocument` for `.sysmld` with dirty state, save, revert, backup, and an edit stack; verify an integration test for save and revert
- [x] 1.3 Implement reference resolution (design D3): qualified names for named elements and structural locators for unnamed ones; verify the "Reference by qualified name" and "Unnamed connection" scenarios
- [x] 1.4 Implement unresolved placeholders with "Remove from diagram" and "Re-link…", and rename detection for renames typed in the text editor; verify the "External deletion" and "Rename typed in the text editor" scenarios
- [x] 1.5 Implement "New Diagram…" pre-populated from a root element; verify it produces a valid file showing the element's direct members
- [x] 1.6 Document the format, the locator rules, and the JSON Schema in `docs/diagram-format.md`

## 2. Diagram canvas

- [x] 2.1 Spike the canvas library (design D7): build one interconnection diagram with nested parts and border ports in maxGraph, check its maintenance status and how its undo fits the custom editor's edit stack; record the choice (maxGraph, Sprotty, or hand-built) in design.md
- [x] 2.2 Build the diagram webview shell (theme variables, message protocol types shared with the host, content security policy, state restore); verify it renders in light, dark, and high-contrast themes
- [x] 2.3 Implement the SysML notation shapes on the chosen library (compartments, guillemet keywords, nested nodes, border ports, edge styles) for General, Interconnection, and Requirements views; verify image snapshot tests on fixture models
- [x] 2.4 Implement auto-layout (elkjs) in the webview that places only unpositioned nodes; verify a coordinate-free diagram gets positions and positioned nodes do not move
- [x] 2.5 Implement select, move, resize, pan, zoom, and "Auto-layout", writing only to the diagram document; verify layout persists after save and reopen and no `.sysml` file changes
- [x] 2.6 Implement drag from the tree and the "Show element" picker; verify only the diagram file changes
- [x] 2.7 Implement "Remove from Diagram" on the Delete key and keyboard selection; verify the "Remove from diagram" and "Keyboard delete" scenarios
- [x] 2.8 Refresh open diagrams when the model changes (labels, types, added and removed members of shown elements); verify a text edit updates an open diagram within 1 s

## 3. Tree integration

- [x] 3.1 Add "Show in Diagram", "Add to Active Diagram", and "New Diagram…" to the tree; verify integration tests for each scenario and document them in README.md
- [x] 3.2 Implement diagram-to-tree selection sync behind the existing setting; verify the "Diagram selection" scenario

## 4. Agent diagram tools

- [x] 4.1 Implement `list_diagrams` and `read_diagram` (JSON description); verify the description of a fixture diagram, including an unresolved reference
- [x] 4.2 Implement the PNG image for `read_diagram`, rendered by the diagram webview in a fixed light theme, including for a diagram that is not open (confirm whether VS Code allows a hidden webview; otherwise use a background panel without focus); verify the "Read with image", "Diagram not open", and "Image through Language Model Tools" scenarios
- [x] 4.3 Implement `create_diagram`, `add_to_diagram`, `remove_from_diagram`, and `layout_diagram`; verify the "Generate general view" and agent "Remove from diagram" scenarios
- [x] 4.4 Apply agent diagram writes as one edit per tool call, left unsaved when the diagram is open and written to disk when it is not, and disable write tools in untrusted workspaces; verify the "User undoes agent change", "Open diagram stays unsaved", "Diagram not open", and "Diagram open during agent edit" scenarios
- [x] 4.5 Add the new tools to the channel contract test and to `docs/agents.md`; verify identical results on both channels

## 5. Integration

- [x] 5.1 End-to-end test: create a diagram from the tree, arrange it, save, reopen, then have an agent read it as JSON and PNG; verify positions and content match
- [x] 5.2 Package with `vsce package` and verify `.sysmld` files open in the diagram editor from an installed `.vsix` (`npm run package` and `check:vsix` pass locally; the existing CI step that runs the integration tests, diagram tests included, against the installed `.vsix` is CI only: installing a `.vsix` fails in this WSL environment)

## 6. Layout editing additions

- [x] 6.1 Auto-layout of the selection only (unselected nodes fixed, crossing lines re-routed); whole diagram when nothing is selected; verify with metrics and an integration test
- [x] 6.2 Draggable orthogonal line routes (draw.io conventions): segment drag, end segments routed around their node when dragged past it, bend points added by double-click or segment-midpoint handles, collinear bends removed; derived lines and sequence messages fixed; stored as `points`, saved with the layout; verify with unit tests of the route geometry and integration tests
- [x] 6.3 Adjustable line labels: move and resize by handle, wrapping by default, right-click menu "Reset Position and Size" and "Wrap Text"; stored in the diagram file as layout; document the format in `docs/diagram-format.md`; verify with unit and integration tests
- [x] 6.4 Agent tool `sysml_get_editor_context`: active diagram, element under the pointer (nodes and lines; cleared when the pointer leaves), selection, and other open diagrams; the webview reports hover and selection changes to the host (throttled); read-only, both channels, manifest and `docs/agents.md` updated; verify with unit tests and an integration test that hovers a node and a line through the webview test hooks

