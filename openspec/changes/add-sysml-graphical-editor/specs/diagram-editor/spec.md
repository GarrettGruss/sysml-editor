## ADDED Requirements

### Requirement: Diagram editor opens diagram files
Opening a `.sysmld` file SHALL open it in a graphical custom editor inside VS Code, which renders its referenced elements using live data from the SysML model. The editor SHALL participate in VS Code's dirty state, save, revert, undo, and redo.

#### Scenario: Open diagram
- **WHEN** the user opens `vehicle.sysmld`
- **THEN** a graphical editor tab shows the stored nodes and edges, labeled with current names and types from the model

### Requirement: Supported diagram kinds
The editor SHALL support at minimum: a General View (definitions, usages, and specialization/composition/typing relationships), an Interconnection View (parts, ports, and connections nested within a part), and a Requirements View (requirements with satisfy, verify, and derive relationships). Notation SHALL follow the SysML v2 graphical notation for the supported element kinds (compartmented boxes, kind keyword in guillemets, port squares on borders).

#### Scenario: Interconnection View
- **WHEN** an Interconnection View of part `vehicle` is open
- **THEN** nested parts render inside `vehicle`, ports render on their owner's border, and connections render as edges between ports

### Requirement: Layout editing
The user SHALL be able to select (single and multi), move, resize, and auto-lay-out nodes, route edges, and pan and zoom. Layout edits SHALL modify only the diagram file.

#### Scenario: Resize node
- **WHEN** the user resizes a node
- **THEN** the new size persists after save and reopen, and no `.sysml` file changes

### Requirement: Add elements from palette
The editor SHALL provide a palette of element and relationship kinds valid for the diagram kind. Creating an element from the palette SHALL create the corresponding SysML element in the model (owned by the element the user dropped it into, or the diagram's root element) and place it on the diagram.

#### Scenario: Add part to a part def
- **WHEN** the user drags "Part" from the palette into part def `Vehicle` and names it `engine`
- **THEN** `part engine;` is inserted inside `Vehicle`'s body in the `.sysml` file, and a node for `engine` appears inside `Vehicle` on the diagram

#### Scenario: Add connection
- **WHEN** the user draws a connection between ports `engine.drive` and `transmission.input`
- **THEN** a `connect engine.drive to transmission.input;` declaration is added to the common owner, and an edge appears

### Requirement: Add existing elements
The user SHALL be able to add existing model elements to a diagram by dragging from the tree view or via a "Show element" picker, without changing the model.

#### Scenario: Drag from tree
- **WHEN** the user drags part def `Wheel` from the tree onto a diagram
- **THEN** a `Wheel` node appears and only the diagram file changes

### Requirement: Remove from diagram vs delete from model
The editor SHALL distinguish two removal actions: "Remove from Diagram", which only removes the view item, and "Delete from Model", which deletes the SysML element (and its owned members) from the source and removes it from all open diagrams. "Delete from Model" SHALL require confirmation when the element has owned members or is referenced elsewhere.

#### Scenario: Remove from diagram
- **WHEN** the user chooses "Remove from Diagram" on `engine`
- **THEN** the node is removed from the diagram and the `.sysml` file is unchanged

#### Scenario: Delete from model
- **WHEN** the user chooses "Delete from Model" on `engine` and confirms
- **THEN** `part engine ...;` (including its body) is removed from the `.sysml` file and the node disappears from every open diagram

### Requirement: Inline and property editing
The user SHALL be able to rename elements inline on the diagram and edit common properties (name, short name, type, multiplicity, documentation) in a properties panel; these edits SHALL modify the SysML text.

#### Scenario: Change type
- **WHEN** the user sets the type of `engine` to `Engine` in the properties panel
- **THEN** the declaration becomes `part engine : Engine;`

### Requirement: Theme and accessibility
The editor SHALL use VS Code theme colors, support light, dark, and high-contrast themes, and support keyboard operation for selection, deletion, and renaming.

#### Scenario: Keyboard delete
- **WHEN** a node is selected and the user presses Delete
- **THEN** "Remove from Diagram" is performed (Delete from Model requires an explicit command)
