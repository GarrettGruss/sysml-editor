## ADDED Requirements

### Requirement: Segment drag routes around nodes
Dragging a line segment past a node SHALL route the line around the side of that node and keep it orthogonal. This is a layout edit, saved with the diagram.

#### Scenario: Drag past a state
- **WHEN** the user drags the horizontal segment of `test` to `Packaged` below `test`
- **THEN** the route goes around the side of `test` and does not reset to the computed route

### Requirement: Bend drag flips the corner
Dragging a bend SHALL move the corner to the pointer, move its two adjacent segments with it, and flip the corner when the pointer crosses to the other side. The route SHALL stay a simple orthogonal path attached to the node border. This is a layout edit.

#### Scenario: Corner beside the end node
- **WHEN** the user drags the lower-left corner down and right beside `test`
- **THEN** the route has no extra segments, does not cross itself, and leaves `test` from the nearer side

### Requirement: No flicker on release
After a drag of a line, node, or label is released, the preview SHALL stay drawn until the host confirms or rejects the edit. On rejection the last committed state SHALL be restored.

#### Scenario: Release a line drag
- **WHEN** the user releases a dragged line
- **THEN** the old route is never drawn again between release and confirmation

### Requirement: Click a label selects its line
A click on a label's drawn text box SHALL select the label's line and show the label handles at once. Only the enlarged handle area SHALL need the line to be selected. Labels SHALL be drawn above nodes.

#### Scenario: Resize in one go
- **WHEN** the user clicks the label of an unselected transition and then resizes it
- **THEN** the label is selected by the first click and resized without selecting the line first

### Requirement: Selected line highlight
A selected line SHALL be drawn with a wide translucent stroke in the selection colour behind it, in light, dark, and high-contrast themes. Handles SHALL stay above the highlight.

#### Scenario: Select a straight line
- **WHEN** the user selects a straight transition
- **THEN** a highlight runs along the whole line

### Requirement: Labels do not overlap after Auto-layout
Auto-layout SHALL wrap each label to a default width, reserve space for it, give each self-transition its own loop, and place each label beside its own loop or segment. The number of labels overlapping other labels SHALL be 0.

#### Scenario: Many self-transitions
- **WHEN** the user runs Auto-layout on a state with many self-transitions that have long labels
- **THEN** no two labels overlap and no label runs past the frame

### Requirement: Transitions between nested states
Drawing a transition or succession SHALL work when an end is a state or action nested below the owner. The text SHALL use a dotted path and the owner SHALL be the nearest common ancestor. When an end is unreachable the message SHALL say why. This is a model edit, saved at once.

#### Scenario: Nested end
- **WHEN** the user draws a transition from `idle` to `operating.high`
- **THEN** `transition first idle then operating.high;` is written and no "out of date" message is shown

#### Scenario: Unnamed control node
- **WHEN** the user draws a succession from an action to an unnamed `fork`, `join`, `decide` or `merge`
- **THEN** the node is named with the next free name of its kind in its owner (`fork;` becomes `fork fork1;`, keeping the statements and comments after it) and the succession is written with that name, as one edit and one undo step, and the node stays drawn in place; where naming is impossible the message says why

#### Scenario: Unreachable end
- **WHEN** an end cannot be reached from the owner
- **THEN** the message names the end and the reason

### Requirement: Directed features
The model SHALL record the direction of `in`, `out`, and `inout` features. Compartments SHALL show them as "parameters" with the direction.

#### Scenario: Directed feature compartment
- **WHEN** a part definition has `in scanCommand : ShipCommand;`
- **THEN** its "parameters" compartment shows `in scanCommand : ShipCommand`

### Requirement: Diagram root rules
"New Diagram…" SHALL offer only the kinds that fit the root: Interconnection needs a part, item, interface, or connection definition or usage. Opening a diagram with an invalid root SHALL show a message with the actions "Change root" and "Convert to General".

#### Scenario: Package root
- **WHEN** the user opens an Interconnection diagram rooted at a package
- **THEN** a message explains that it needs a part definition or usage, with "Change root" and "Convert to General"

#### Scenario: Kind choice
- **WHEN** the user runs "New Diagram…" on a package
- **THEN** Interconnection is not offered

### Requirement: Fit on first open
A diagram with no stored view SHALL be fitted to the window on open. A stored zoom and pan SHALL be kept.

#### Scenario: New diagram
- **WHEN** the user opens a diagram with no stored view
- **THEN** all content is visible and centered

### Requirement: Canvas focus indicator
The canvas SHALL NOT show a focus border on mouse focus. Keyboard focus SHALL show a thin inset line that does not look like a selection. The requirements editor SHALL be checked for the same border.

#### Scenario: Click the canvas
- **WHEN** the user clicks the canvas
- **THEN** no blue border is drawn

### Requirement: Wheel zoom speed
The wheel zoom per step SHALL be 1.5 times the earlier exponent, symmetric for zoom in and out. Toolbar zoom steps and panning speed SHALL not change.

#### Scenario: Zoom in and out
- **WHEN** the user scrolls one step in and one step out
- **THEN** the zoom returns to its start value

### Requirement: Arrow keys pan
When the canvas has focus and nothing is selected, the arrow keys SHALL pan the view by 40 px per press (larger with Shift), repeating while held. With a selection, arrow keys SHALL nudge as before. Escape SHALL clear the selection. Panning SHALL NOT happen while a text input has focus. Panning is a view change, not saved as a model edit.

#### Scenario: Pan with nothing selected
- **WHEN** the user presses the left arrow with nothing selected
- **THEN** the view pans 40 px

#### Scenario: Nudge with selection
- **WHEN** a node is selected and the user presses an arrow key
- **THEN** the node is nudged and the view does not pan

## MODIFIED Requirements

### Requirement: Add existing elements
The user SHALL be able to add existing model elements to a diagram by dragging from the tree view onto the diagram or by "Add to Diagram" in the tree's context menu, without changing the model. The diagram toolbar SHALL NOT have a "Show Element…" button.

#### Scenario: Drag from tree
- **WHEN** the user drags part def `Wheel` from the tree onto a diagram of any kind
- **THEN** a `Wheel` node appears at the pointer and only the diagram file changes

#### Scenario: No Show Element button
- **WHEN** the user opens a diagram
- **THEN** the toolbar has no "Show Element…" button
