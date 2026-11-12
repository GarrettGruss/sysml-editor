# Tasks

## 1. Diagram files

- [x] 1.1 Define the `.sysmld` schema (design D5) with a versioned, deterministic serializer and parser, and publish it as a JSON Schema; verify a unit test that open and save is byte-identical and all test diagrams validate
- [x] 1.2 Implement the `CustomEditorProvider` and `CustomDocument` for `.sysmld` with dirty state, save, revert, backup, and an edit stack; verify an integration test for save and revert
- [x] 1.3 Implement reference resolution (design D3): qualified names for named elements and structural locators for unnamed ones; verify the "Reference by qualified name" and "Unnamed connection" scenarios
- [ ] 1.4 Implement unresolved placeholders with "Remove from diagram" and "Re-link…", and rename detection for renames typed in the text editor; verify the "External deletion" and "Rename typed in the text editor" scenarios
- [ ] 1.5 Implement "New Diagram…" pre-populated from a root element; verify it produces a valid file showing the element's direct members
- [x] 1.6 Document the format, the locator rules, and the JSON Schema in `docs/diagram-format.md`

## 2. Diagram canvas

- [x] 2.1 Spike the canvas library (design D7): build one interconnection diagram with nested parts and border ports in maxGraph, check its maintenance status and how its undo fits the custom editor's edit stack; record the choice (maxGraph, Sprotty, or hand-built) in design.md
- [x] 2.2 Build the diagram webview shell (theme variables, message protocol types shared with the host, content security policy, state restore); verify it renders in light, dark, and high-contrast themes
- [ ] 2.3 Implement the SysML notation shapes on the chosen library (compartments, guillemet keywords, nested nodes, border ports, edge styles) for General, Interconnection, and Requirements views; verify image snapshot tests on fixture models
- [x] 2.4 Implement auto-layout (elkjs) in the webview that places only unpositioned nodes; verify a coordinate-free diagram gets positions and positioned nodes do not move
- [ ] 2.5 Implement select, move, resize, pan, zoom, and "Auto-layout", writing only to the diagram document; verify layout persists after save and reopen and no `.sysml` file changes
- [ ] 2.6 Implement drag from the tree and the "Show element" picker; verify only the diagram file changes
- [ ] 2.7 Implement "Remove from Diagram" on the Delete key and keyboard selection; verify the "Remove from diagram" and "Keyboard delete" scenarios
- [ ] 2.8 Refresh open diagrams when the model changes (labels, types, added and removed members of shown elements); verify a text edit updates an open diagram within 1 s

## 3. Tree integration

- [ ] 3.1 Add "Show in Diagram", "Add to Active Diagram", and "New Diagram…" to the tree; verify integration tests for each scenario and document them in README.md
- [ ] 3.2 Implement diagram-to-tree selection sync behind the existing setting; verify the "Diagram selection" scenario

## 4. Agent diagram tools

- [ ] 4.1 Implement `list_diagrams` and `read_diagram` (JSON description); verify the description of a fixture diagram, including an unresolved reference
- [ ] 4.2 Implement the PNG image for `read_diagram`, rendered by the diagram webview in a fixed light theme, including for a diagram that is not open (confirm whether VS Code allows a hidden webview; otherwise use a background panel without focus); verify the "Read with image", "Diagram not open", and "Image through Language Model Tools" scenarios
- [ ] 4.3 Implement `create_diagram`, `add_to_diagram`, `remove_from_diagram`, and `layout_diagram`; verify the "Generate general view" and agent "Remove from diagram" scenarios
- [ ] 4.4 Apply agent diagram writes as one edit per tool call, left unsaved when the diagram is open and written to disk when it is not, and disable write tools in untrusted workspaces; verify the "User undoes agent change", "Open diagram stays unsaved", "Diagram not open", and "Diagram open during agent edit" scenarios
- [ ] 4.5 Add the new tools to the channel contract test and to `docs/agents.md`; verify identical results on both channels

## 5. Integration

- [ ] 5.1 End-to-end test: create a diagram from the tree, arrange it, save, reopen, then have an agent read it as JSON and PNG; verify positions and content match
- [ ] 5.2 Package with `vsce package` and verify `.sysmld` files open in the diagram editor from an installed `.vsix`
