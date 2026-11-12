## ADDED Requirements

### Requirement: SysML text is the source of truth
All semantic model state SHALL be read from and written to `.sysml` textual files. GUI views (tree, diagrams, requirements editor) SHALL be projections of the parsed model plus diagram view state, and SHALL NOT keep a separate copy of semantic data that can diverge from the text.

#### Scenario: Reload consistency
- **WHEN** VS Code is restarted
- **THEN** all views show exactly what the `.sysml` files declare, with diagram layout from `.sysmld` files

### Requirement: GUI edits produce minimal text edits
Every model-changing GUI operation (add, delete, rename, retype, connect, edit documentation, add relationship) SHALL be applied as a VS Code workspace edit that changes only the text spans needed, preserving the formatting, comments, and ordering of unrelated text.

#### Scenario: Insert preserves formatting
- **WHEN** a part is added to a part def whose body contains comments and custom indentation
- **THEN** the new declaration is inserted with the body's indentation and all existing text is byte-identical outside the inserted span

#### Scenario: Delete removes whole declaration
- **WHEN** an element with a body and preceding `doc` comment is deleted
- **THEN** its full declaration, body, and attached documentation are removed and no dangling syntax remains

### Requirement: Generated text is valid SysML v2
Text produced by GUI operations SHALL parse without errors under the SysML v2 textual grammar of the targeted release.

#### Scenario: Round trip
- **WHEN** an element is added via the diagram and the file is re-parsed
- **THEN** the parse produces no new errors and the new element appears at the expected qualified name

### Requirement: Undo and redo across views
A GUI model edit SHALL be undoable as a single step, and undoing it SHALL restore both the `.sysml` text and the diagram view state it created (e.g. the placed node).

#### Scenario: Undo add
- **WHEN** the user adds a part from the palette and then invokes Undo
- **THEN** the declaration is removed from the text and the node is removed from the diagram

### Requirement: Text edits propagate to views
Changes to `.sysml` documents (including unsaved editor buffers and external file changes) SHALL be re-parsed and propagated to the tree, open diagrams, and requirements editors within one second for files up to 5,000 lines.

#### Scenario: Live property change
- **WHEN** the user changes `part engine;` to `part engine : Engine;` in the text editor
- **THEN** open diagrams show the new type on the `engine` node without the user saving

#### Scenario: Manual text rename
- **WHEN** the user hand-edits `part engine` to `part motor` in the text editor
- **THEN** diagram nodes referencing `engine` are shown as unresolved per the diagram-files rules, unless the element carries a stable `elementId` that still matches

### Requirement: Behavior with parse errors
When a `.sysml` file has syntax errors, views SHALL show the last successfully parsed model for that file with an error indicator, and GUI model edits targeting that file SHALL be blocked with a message directing the user to fix the errors.

#### Scenario: Edit blocked
- **WHEN** a file has a syntax error and the user tries to add an element to it from a diagram
- **THEN** the operation is refused with a message linking to the error location, and no text is changed

### Requirement: Rename refactoring
Renaming an element through the GUI SHALL update its declaration, all textual references to it resolvable within the workspace, and all diagram file references.

#### Scenario: Rename definition
- **WHEN** the user renames `part def Engine` to `Motor` via the diagram
- **THEN** `part engine : Engine;` elsewhere becomes `part engine : Motor;`, and diagrams referencing `Engine` are updated
