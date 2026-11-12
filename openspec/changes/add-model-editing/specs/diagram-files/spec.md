## ADDED Requirements

### Requirement: Reference maintenance on rename and move
When an element is renamed or moved through the extension (tree, diagram, or rename command), all diagram files referencing it SHALL be updated to the new qualified name.

#### Scenario: Rename from tree
- **WHEN** the user renames `Engine` to `Motor` via the tree
- **THEN** every `.sysmld` file referencing `...::Engine` (or its owned members) is updated, and the diagrams still show the element at the same position
