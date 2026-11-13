## ADDED Requirements

### Requirement: GUI edits produce minimal text edits
Every model-changing GUI operation (add, delete, rename, retype, connect, edit documentation, add relationship), whether started by a person or an agent, SHALL be applied as a VS Code workspace edit that changes only the text spans needed, preserving the formatting, comments, and ordering of unrelated text.

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

### Requirement: Edits blocked on syntax errors
GUI and agent model edits that target a file with syntax errors SHALL be refused with a message directing the user to fix the errors. A file SHALL be treated as having errors only when it is not valid SysML v2.

#### Scenario: Edit blocked
- **WHEN** a file has a syntax error and the user tries to add an element to it from a diagram
- **THEN** the operation is refused with a message linking to the error location, and no text is changed

#### Scenario: Valid file with undisplayed constructs
- **WHEN** a valid file contains state machines and calculations and the user adds a part to it from a diagram
- **THEN** the edit is applied

### Requirement: Rename refactoring
Renaming an element through the GUI SHALL update its declaration, all textual references to it resolvable within the workspace, and all diagram file references.

#### Scenario: Rename definition
- **WHEN** the user renames `part def Engine` to `Motor` via the diagram
- **THEN** `part engine : Engine;` elsewhere becomes `part engine : Motor;`, and diagrams referencing `Engine` are updated

### Requirement: Editors and text stay in sync
The graphical editors and the SysML text SHALL always describe the same model. Every model-changing edit from a graphical editor, the tree, or an agent SHALL be written to the `.sysml` text and saved to disk immediately, so that no view shows a model element that is absent from the saved text or omits one that is present. Diagram layout and style SHALL NOT be saved by a model edit.

#### Scenario: Diagram edit is on disk at once
- **WHEN** the user adds a part from the palette
- **THEN** the `.sysml` file on disk contains the new part without the user saving, and the `.sysmld` file on disk lists the new node

#### Scenario: Pending layout is not saved by a model edit
- **WHEN** the user moves a node, does not save the diagram, and then adds a part from the palette
- **THEN** the `.sysmld` file on disk lists the new node but still has the moved node's previous position, and the diagram is still marked as having unsaved changes

#### Scenario: Undo in the text editor
- **WHEN** the user adds a part from a diagram and then undoes the change in the text editor
- **THEN** the node disappears from the diagram and no unresolved placeholder is left for it

#### Scenario: Closing without saving
- **WHEN** the user edits the model from a diagram and closes VS Code without saving anything
- **THEN** on reopening, the text and the diagram both show the edited element, and unsaved layout changes are gone

### Requirement: References in generated text
When an edit refers to another element, such as a type or a connection end, the generated text SHALL resolve to that element. The short name SHALL be used when the element is already visible from the edited location; otherwise an import of the element SHALL be added to the enclosing package and the short name used. If that import would make another name in scope ambiguous, the fully qualified name SHALL be written instead and no import added.

#### Scenario: Already visible
- **WHEN** the user types `engine` as `Engine` and `Engine` is in the same package
- **THEN** the declaration becomes `part engine : Engine;` and no import is added

#### Scenario: Import added
- **WHEN** `Engine` is defined in package `Powertrain`, which the edited package does not import
- **THEN** `private import Powertrain::Engine;` is added to the edited package and the declaration becomes `part engine : Engine;`

#### Scenario: Import would clash
- **WHEN** the edited package already has a different element named `Engine` in scope
- **THEN** the declaration becomes `part engine : Powertrain::Engine;` and no import is added

### Requirement: Names are quoted when needed
Names in generated text that are not valid basic names, including reserved words and names with spaces, SHALL be written as quoted names.

#### Scenario: Name needs quoting
- **WHEN** the user names a new part `fuel pump`
- **THEN** the declaration is `part 'fuel pump';`
