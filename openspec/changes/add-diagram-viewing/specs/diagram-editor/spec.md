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

### Requirement: Auto-layout of the selection
When nodes are selected, Auto-layout SHALL arrange only the selected nodes and the lines between them; unselected nodes SHALL keep their positions, and lines joining a selected and an unselected node SHALL be re-routed. With nothing selected, Auto-layout SHALL arrange the whole diagram.

#### Scenario: Selected nodes only
- **WHEN** three of eight nodes are selected and the user runs Auto-layout
- **THEN** only those three nodes move, keeping their group near its previous position without overlapping unselected nodes, and the other five nodes stay where they were

### Requirement: Dragging lines
Every drawn line with a stored route (for example transitions, successions, flows, connections, satisfy and verify), but not derived lines (composition, typing) or sequence messages, SHALL be adjustable as an orthogonal route, following draw.io conventions. Route changes are layout: they SHALL change only the diagram file and are saved when the user saves the diagram.

#### Scenario: Drag a segment
- **WHEN** the user drags a segment of a line
- **THEN** the segment moves perpendicular to its direction, the adjacent segments stretch to stay orthogonal, and the line stays attached to the borders of its two nodes

#### Scenario: Drag beyond a node
- **WHEN** the user drags an end segment past the edge of the node it connects to
- **THEN** bend points are added so the route goes around the node and still meets its border orthogonally

#### Scenario: Add a bend point
- **WHEN** the user double-clicks on a line, or drags the handle shown at the middle of a segment
- **THEN** a bend point is added there and the route stays orthogonal

#### Scenario: Node moved: the user's route keeps its bends and stays attached
- **WHEN** an end node of a line with a user-shaped route is moved or resized
- **THEN** the route keeps its bends and stays attached: only its end segments are adjusted to meet the node's border orthogonally, and a computed route replaces it only when no valid adjusted route exists

#### Scenario: Remove bend points
- **WHEN** the user drags a segment back into line with its neighbours so that two consecutive segments are collinear
- **THEN** the redundant bend points are removed

### Requirement: Adjustable labels
Labels drawn on lines (names, guards, triggers, effects, keywords such as `«include»`) SHALL be movable and resizable by dragging a handle, and SHALL wrap their text within their width by default. Right-clicking a label handle SHALL offer "Reset Position and Size" and a "Wrap Text" check toggle.

#### Scenario: Label layout is stored as layout
- **WHEN** the user moves, resizes or changes wrapping of a label
- **THEN** only the diagram file changes, the change is saved when the user saves the diagram, and the label's text still comes from the model

#### Scenario: Move and resize a label
- **WHEN** the user drags a transition's label away from the line and widens it
- **THEN** the label stays at the new place and size relative to its line when the line or its nodes move, and after save and reopen

#### Scenario: Reset a label
- **WHEN** the user right-clicks the label's handle and chooses "Reset Position and Size"
- **THEN** the label returns to its computed place and size

#### Scenario: Turn wrapping off
- **WHEN** the user right-clicks the label's handle and unchecks "Wrap Text"
- **THEN** the label shows its text on one line, ignoring its width

