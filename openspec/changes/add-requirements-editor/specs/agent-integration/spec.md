## ADDED Requirements

### Requirement: Read requirements document
Agent tools SHALL include a tool that returns the document view of a package as Markdown (headings with generated numbers, table of contents, paragraphs, requirement items, appendices), with each heading and requirement annotated by its qualified name.

#### Scenario: Agent reads specification
- **WHEN** an agent requests the document for `VehicleSpec`
- **THEN** it receives Markdown matching the document view's structure and numbering, with qualified names it can pass to edit tools

### Requirement: Edit requirements
Agent tools SHALL include tools to create a requirement and to add satisfy, verify, and derivation relationships, producing the same text as the requirements editor.

#### Scenario: Agent adds derivation
- **WHEN** an agent adds a derivation from `massLimit` to `chassisMass`
- **THEN** the model receives the same `#derivation connection` text the requirements editor would produce
