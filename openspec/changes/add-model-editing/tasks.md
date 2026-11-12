# Tasks

## 1. Edit planner

- [x] 1.1 Implement the insert-member plan (creating a body from `;`, indentation copied from siblings); verify round-trip tests: the result re-parses and unrelated text is byte-identical
- [x] 1.2 Implement the delete-element plan (full range, leading documentation, trailing line); verify round-trip tests including nested bodies
- [x] 1.3 Implement rename (declaration plus references resolvable in the workspace, with quoted names where needed) and retype, multiplicity, and documentation edits; verify the "Rename definition" and "Change type" scenarios in unit tests
- [x] 1.4 Implement the connection plan (`connect a to b;` in the common owner) and the satisfy plan; verify generated text parses and endpoints resolve
- [x] 1.5 Implement `RenameService`, which also rewrites `.sysmld` references in the same workspace edit; verify a test with two diagrams referencing a renamed definition
- [x] 1.5a Implement reference writing (design D19): short name when visible, otherwise add an import, fully qualified name when the import would clash, and quoting of names; verify the four "References in generated text" scenarios
- [x] 1.6 Refuse edits on files with genuine syntax errors, with a message linking to the error, and allow them on valid files that contain constructs the diagrams do not show; verify both "Edits blocked on syntax errors" scenarios
- [x] 1.7 Run the edit plans against the 1,581-line Annex A fixture model; verify every plan leaves text outside the edit byte-identical

## 2. Tree editing

- [x] 2.1 Add "Add Child", "Rename", and "Delete" (with confirmation) to the tree; verify integration tests including the "Delete from tree" scenario and document the commands in README.md

## 3. Diagram editing

- [x] 3.1 Spike combined undo (design D6): one diagram edit that also changes a text document; verify undo from either editor leaves both consistent and record the approach in design.md
- [x] 3.1a Save the affected `.sysml` files as part of every model edit and of its undo, write the forced diagram changes (new node, renamed or deleted references) onto each `.sysmld` file's last saved state without saving pending layout, and drop diagram entries whose element disappears during the session; verify the four "Editors and text stay in sync" scenarios
- [x] 3.2 Implement the palette per diagram kind, creating the model element and its node as one undo step; verify the "Add part to a part def" scenario including undo
- [x] 3.3 Implement connection drawing between ports; verify the "Add connection" scenario
- [x] 3.4 Implement "Delete from Model" as an explicit command with confirmation; verify the "Delete from model" and "Delete key does not delete from model" scenarios
- [x] 3.4a Mark inherited features in the view model, draw them as inherited, and refuse delete, rename, and retype on them in the model service with "Go to Definition"; verify the "Delete refused", "Add goes to the usage", and "Agent edit refused" scenarios
- [x] 3.5 Implement inline rename and the properties panel (name, short name, type, multiplicity, documentation); verify the "Change type" scenario from the panel

## 4. Agent write tools

- [x] 4.1 Implement `create_element` (with optional diagram placement), `delete_element`, `rename_element`, `set_element_properties`, and `create_relationship` for connections and satisfy, through the same model service operations as the GUI; verify the "Create and place" and "Delete versus remove" scenarios
- [x] 4.2 Apply each agent write as one workspace edit, save the affected files, and disable the tools in untrusted workspaces; verify the user can undo an agent edit in one step
- [x] 4.3 Add a parity test that runs each operation once from the GUI path and once from the agent path; verify the resulting text is identical
- [x] 4.4 Add the new tools to the channel contract test and to `docs/agents.md`; verify identical results on both channels

## 5. Integration

- [ ] 5.1 End-to-end test: add, rename, connect, and delete elements from a diagram, from the tree, and from an agent; verify text, tree, and diagrams stay consistent after reload
- [ ] 5.2 Package with `vsce package` and verify an edit made from a diagram in an installed `.vsix` is written to the `.sysml` file
