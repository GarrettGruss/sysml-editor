## ADDED Requirements

### Requirement: Ghost line for connection tools
Every connection tool SHALL show a dashed orthogonal preview with an arrowhead from the source to the pointer, highlight a valid target and snap to its border, show the not-allowed cursor over an invalid target, and cancel on Escape or right-click. The preview is on screen only.

#### Scenario: Valid target
- **WHEN** the user starts a succession and moves over a valid action
- **THEN** that action is highlighted and the preview snaps to its border

#### Scenario: Cancel
- **WHEN** the user presses Escape while connecting
- **THEN** the preview is removed and nothing is written

### Requirement: Quick-connect handles
Hovering a state or an Action Flow node SHALL show a small box at the middle of each side. Dragging from one SHALL start a connection leaving from that side with the ghost line. Dropping on a node SHALL write the transition or succession like the palette tool. This is a model edit, saved at once.

#### Scenario: Handle to another state
- **WHEN** the user drags from the right handle of `idle` onto `running`
- **THEN** `transition first idle then running;` is written and the route leaves from the right side

### Requirement: Lines to empty space
Releasing a connection over empty canvas SHALL keep the ghost line and show a quick bar at its end with the node kinds valid for the diagram and line. Choosing one SHALL create the node and the line as one model edit and one undo step. Escape or a click elsewhere SHALL cancel. A line without a target SHALL never be written.

#### Scenario: Action Flow succession
- **WHEN** the user releases a succession over empty canvas and chooses Fork
- **THEN** the fork and the succession to it are written together

#### Scenario: Cancel
- **WHEN** the user presses Escape with the quick bar open
- **THEN** nothing is written

### Requirement: Reconnect line ends
A selected line SHALL show a handle at each end. Dragging one SHALL show the ghost line and highlight valid targets. Dropping on a valid node SHALL rewrite that end in the text and keep the rest of the statement. Dropping on empty canvas or an invalid node SHALL snap back. This is a model edit, saved at once.

#### Scenario: Retarget a succession
- **WHEN** the user drags the target end of `detectThreat` to `engageDefenses` onto a fork
- **THEN** the `then` target is rewritten and the rest of the statement is unchanged

#### Scenario: Flow to a fork
- **WHEN** the user drags an item flow end onto a fork
- **THEN** the not-allowed cursor shows a tooltip saying flows connect features

### Requirement: Palette ghost and inline naming
Choosing a palette tool SHALL show a ghost with a default name following the pointer. Clicking the canvas SHALL place it and open an inline input with the name selected. Enter or a click elsewhere SHALL write the element with the typed name as one model edit saved at once. Escape SHALL cancel and write nothing. The quick input box SHALL NOT be used. Unnamed elements (Fork, Join, Decide, Merge) SHALL be placed without the input. Name errors SHALL show under the input.

#### Scenario: Place a state
- **WHEN** the user picks State, clicks the canvas, types `idle`, and presses Enter
- **THEN** `state idle;` is written in the owner

#### Scenario: Duplicate name
- **WHEN** the typed name already exists in the owner
- **THEN** an error shows under the input and nothing is written

#### Scenario: Escape
- **WHEN** the user presses Escape in the input
- **THEN** nothing is written and the ghost is removed

### Requirement: Inline rename
Double-clicking an element's name SHALL open an inline input with the name selected. Enter or a click outside SHALL save a model rename with references updated; Escape SHALL cancel. Inherited elements SHALL NOT offer the input and SHALL have a tooltip saying why.

#### Scenario: Click outside saves
- **WHEN** the user edits the name and clicks outside
- **THEN** the rename is saved

### Requirement: Show documentation on nodes
A node SHALL show the first `doc` of its element in a description area below the name, wrapped and clipped with an ellipsis, with the full text in the tooltip. Inherited elements are read-only.

#### Scenario: Long doc
- **WHEN** a doc is longer than the node
- **THEN** it is clipped with an ellipsis and the tooltip shows the full text

### Requirement: Edit documentation inline
Double-clicking the description SHALL open a multi-line inline input: Enter or a click outside saves, Shift+Enter adds a line, Escape cancels. Saving SHALL rewrite or add the `doc` comment (model edit, saved at once); an empty result removes it; `*/` is stored as `*\/`. Elements without a doc SHALL have "Add Description" in the context menu. A per-diagram toggle SHALL show or hide descriptions, stored as diagram style (layout edit).

#### Scenario: Edit a doc
- **WHEN** the user double-clicks the description, types text, and presses Enter
- **THEN** the element's `doc /* … */` has the new text

#### Scenario: Empty removes
- **WHEN** the user clears the text and presses Enter
- **THEN** the `doc` is removed

#### Scenario: Hide descriptions
- **WHEN** the user turns the toggle off
- **THEN** descriptions are hidden, the `.sysml` file is unchanged, and the diagram is marked changed

### Requirement: Nest by dropping
Dropping a state, action, or part onto another node of a kind that can own it SHALL move its declaration into that node (model edit, saved at once, undoable), with the target highlighted while dragging. Dragging it onto another owner or the root SHALL move it out. References SHALL be rewritten to still resolve or the move SHALL be refused with a reason. Inherited elements SHALL NOT be movable from a usage.

#### Scenario: Nest a state
- **WHEN** the user drops `test` onto the state `big`
- **THEN** the declaration of `test` is inside `big` and moving `big` moves `test`

#### Scenario: Refused move
- **WHEN** a reference cannot be rewritten
- **THEN** the move is refused and the message gives the reason

### Requirement: Parameter pins
In Action Flow, an action's directed features (own and inherited) SHALL be drawn as pins on its border, inputs left or top and outputs right or bottom, labelled with the name and with the type in the tooltip. Item flows SHALL connect pin to pin with the item type as label. New and reconnected flows SHALL be able to target a pin and write the dotted feature path. Pins SHALL be placed by ELK as ports and be slidable along the border (layout edit). Inherited pins SHALL be read-only.

#### Scenario: Pin to pin flow
- **WHEN** the user drags a flow from pin `scanReport` of `detectThreat` to pin `report` of `engageDefenses`
- **THEN** `flow from detectThreat.scanReport to engageDefenses.report;` is written

#### Scenario: Slide a pin
- **WHEN** the user slides a pin along the border
- **THEN** only the diagram changes
