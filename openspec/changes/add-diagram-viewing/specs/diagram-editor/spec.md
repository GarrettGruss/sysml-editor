## ADDED Requirements

### Requirement: Diagram editor opens diagram files
Opening a `.sysmld` file SHALL open it in a graphical custom editor inside VS Code, which renders its referenced elements using live data from the SysML model. The editor SHALL participate in VS Code's dirty state, save, revert, undo, and redo.

#### Scenario: Open diagram
- **WHEN** the user opens `vehicle.sysmld`
- **THEN** a graphical editor tab shows the stored nodes and edges, labeled with current names and types from the model

### Requirement: Supported diagram kinds
The editor SHALL support at minimum: a General View (definitions, usages, and specialization/composition/typing relationships), an Interconnection View (parts, ports, and connections nested within a part), and a Requirements View (requirements with satisfy, verify, and derivation relationships). Notation SHALL follow the SysML v2 graphical notation for the supported element kinds (compartmented boxes, kind keyword in guillemets, port squares on borders).

#### Scenario: Interconnection View
- **WHEN** an Interconnection View of part `vehicle` is open
- **THEN** nested parts render inside `vehicle`, ports render on their owner's border, and connections render as edges between ports

### Requirement: Layout editing
The user SHALL be able to select (single and multi), move, resize, and auto-lay-out nodes, route edges, and pan and zoom. Layout edits SHALL modify only the diagram file.

#### Scenario: Resize node
- **WHEN** the user resizes a node
- **THEN** the new size persists after save and reopen, and no `.sysml` file changes

### Requirement: Add existing elements
The user SHALL be able to add existing model elements to a diagram by dragging from the tree view or via a "Show element" picker, without changing the model.

#### Scenario: Drag from tree
- **WHEN** the user drags part def `Wheel` from the tree onto a diagram
- **THEN** a `Wheel` node appears and only the diagram file changes

### Requirement: Remove from diagram
The user SHALL be able to remove an element from a diagram without changing the model. The Delete key SHALL perform this action.

#### Scenario: Remove from diagram
- **WHEN** the user chooses "Remove from Diagram" on `engine`
- **THEN** the node is removed from the diagram and the `.sysml` file is unchanged

### Requirement: Theme and accessibility
The editor SHALL use VS Code theme colors, support light, dark, and high-contrast themes, and support keyboard operation for selection and removal.

#### Scenario: Keyboard delete
- **WHEN** a node is selected and the user presses Delete
- **THEN** "Remove from Diagram" is performed
