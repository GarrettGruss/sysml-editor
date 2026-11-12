## ADDED Requirements

### Requirement: Separate diagram file
Diagram state SHALL be stored in dedicated diagram files with the `.sysmld` extension, separate from `.sysml` files. A diagram file SHALL contain only presentation state: diagram kind, the set of shown elements and relationships, positions, sizes, edge routing, collapsed/expanded state, and style overrides. It SHALL NOT contain SysML semantic content (names, types, multiplicities, documentation, relationships) except as references.

#### Scenario: Moving a node
- **WHEN** the user moves a node on a diagram and saves
- **THEN** only the `.sysmld` file changes; no `.sysml` file changes

#### Scenario: Deleting the diagram
- **WHEN** the user deletes a `.sysmld` file
- **THEN** no SysML model content is lost

### Requirement: Human-readable, diff-friendly format
Diagram files SHALL be UTF-8 JSON with a declared format `version`, deterministic key ordering, and stable element ordering, so that unchanged diagrams produce no diff on save.

#### Scenario: Save without changes
- **WHEN** a diagram is opened and saved without modification
- **THEN** the file bytes are unchanged

### Requirement: Linking to model elements
Each diagram file SHALL declare its linked context (a root element, by qualified name, and the `.sysml` file(s) it belongs to). Each diagram node and edge SHALL reference its SysML element by fully qualified name when the element has a name. Elements without a name, such as `connect`, `bind`, and `satisfy` statements, SHALL be referenced by a structural locator: the owner's qualified name, the element kind, and its endpoints.

#### Scenario: Reference by qualified name
- **WHEN** a diagram shows `part engine` owned by `Vehicle` in package `VehicleModel`
- **THEN** the node references `VehicleModel::Vehicle::engine`

#### Scenario: Unnamed connection
- **WHEN** a diagram shows `connect engine.drive to transmission.input;` owned by `Vehicle`
- **THEN** the edge references owner `VehicleModel::Vehicle`, kind connection, and the two endpoints, and still resolves after unrelated statements are added to `Vehicle`

### Requirement: Unresolved references
When a diagram reference cannot be resolved to a model element (e.g. the element was deleted or renamed by an external text edit), the diagram SHALL keep the stored view state, render the item as an "unresolved" placeholder, and offer to remove it or re-link it to an existing element. Unresolved items SHALL NOT be silently dropped from the file.

#### Scenario: External deletion
- **WHEN** a part referenced by a diagram is deleted by hand in the text editor
- **THEN** the diagram shows that node as unresolved, with actions "Remove from diagram" and "Re-link…"

#### Scenario: Rename typed in the text editor
- **WHEN** the user hand-edits `part engine : Engine` to `part motor : Engine` and no other element under that owner changes
- **THEN** the diagram treats it as a rename, keeps the node at its position, and updates its stored reference

### Requirement: Agent-authorable diagram files
The diagram file format SHALL be published as a JSON Schema. Node position and size fields SHALL be optional; when a diagram is opened or read and any node lacks a position, those nodes SHALL be placed by automatic layout without moving positioned nodes.

#### Scenario: Diagram without coordinates
- **WHEN** a `.sysmld` file listing nodes with references but no positions is opened
- **THEN** the editor displays the nodes laid out automatically, and saving writes their computed positions

### Requirement: Diagram creation
The user SHALL be able to create a new diagram file from a selected model element (via tree or command palette), choosing a diagram kind; the new diagram is pre-populated with the element and its direct owned members.

#### Scenario: New diagram from tree
- **WHEN** the user picks "New Diagram…" on part def `Vehicle` and chooses "General View"
- **THEN** a new `.sysmld` file is created and opened showing `Vehicle` and its direct members
