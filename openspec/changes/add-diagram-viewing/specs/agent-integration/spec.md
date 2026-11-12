## ADDED Requirements

### Requirement: List diagrams
Agent tools SHALL include a tool that lists the diagram files in the workspace with each diagram's kind and root element.

#### Scenario: List
- **WHEN** an agent lists diagrams in a workspace containing `vehicle.sysmld`
- **THEN** the result includes its path, kind, and root element

### Requirement: Read diagram as structure and image
A read-diagram tool SHALL return a structured JSON description of a diagram (kind, root, nodes and edges with resolved element names, kinds, types, containment, positions, and unresolved references) and, when requested, a PNG image of the diagram, drawn by the same renderer as the diagram editor. Reading SHALL NOT require the user to have opened the diagram first.

#### Scenario: Read with image
- **WHEN** an agent calls read-diagram on `vehicle.sysmld` with image requested
- **THEN** the result contains the JSON description and an `image/png` content item showing the diagram as the editor draws it

#### Scenario: Diagram not open
- **WHEN** an agent requests an image of a diagram that is not open in any editor
- **THEN** the image is still returned, and the user's active editor and focus are unchanged

#### Scenario: Read without image
- **WHEN** an agent calls read-diagram without requesting an image
- **THEN** only the JSON description is returned

#### Scenario: Image through Language Model Tools
- **WHEN** an in-editor agent requests the image through Language Model Tools
- **THEN** the PNG is returned as an image data part

### Requirement: Generate diagrams
Agent tools SHALL include a tool to create a diagram file from a root element and diagram kind, optionally restricted to a list of elements, returning the new diagram's path and description.

#### Scenario: Generate general view
- **WHEN** an agent requests a General View of `VehicleModel::Vehicle`
- **THEN** a new `.sysmld` file is written listing `Vehicle` and its direct members, and they are laid out automatically when the diagram is first rendered

### Requirement: Edit diagram contents
Agent tools SHALL include tools to add existing elements to a diagram, remove elements from a diagram, and re-run automatic layout. These tools SHALL change only the diagram file.

#### Scenario: Remove from diagram
- **WHEN** an agent calls remove-from-diagram on `engine`
- **THEN** only the diagram file changes

### Requirement: Agent diagram edits apply directly and are undoable
Agent diagram edits SHALL be applied immediately, without an approval prompt beyond any confirmation the agent harness itself imposes, and each tool call SHALL be one undo step for the user. Creating a diagram SHALL write the new file to disk. Changes to a diagram that is open in an editor SHALL be left unsaved, like a person's layout changes, until the user saves the diagram; changes to a diagram that is not open SHALL be written to disk.

#### Scenario: User undoes agent change
- **WHEN** an agent adds an element to an open diagram and the user then invokes Undo
- **THEN** the node is removed from the diagram

#### Scenario: Open diagram stays unsaved
- **WHEN** an agent re-runs layout on a diagram that is open in an editor
- **THEN** the editor shows the new layout and marks the diagram as having unsaved changes, and the file on disk is unchanged

#### Scenario: Diagram not open
- **WHEN** an agent adds an element to a diagram that is not open in any editor
- **THEN** the `.sysmld` file on disk contains the change

### Requirement: Live views reflect agent edits
Changes made through either channel SHALL be reflected in the tree, open diagrams, and requirements editors without reopening them.

#### Scenario: Diagram open during agent edit
- **WHEN** a diagram is open and an agent adds an element to it via either channel
- **THEN** the open editor shows the new node without reopening
