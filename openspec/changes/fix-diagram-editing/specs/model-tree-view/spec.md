## ADDED Requirements

### Requirement: Add to Diagram
The tree's context menu SHALL offer "Add to Diagram" (replacing "Add to Active Diagram") for elements, adding them to the active diagram without changing the model. "Show in Diagram" SHALL stay.

#### Scenario: Add from the context menu
- **WHEN** the user right-clicks part def `Wheel` and chooses "Add to Diagram"
- **THEN** a `Wheel` node appears in the active diagram

### Requirement: Tree drag is tested end to end
Dragging a tree element onto a diagram SHALL work for every diagram kind and SHALL drop at the pointer position. An integration test SHALL cover it.

#### Scenario: Drop position
- **WHEN** the user drags an element onto a point of a State Transition diagram
- **THEN** the node is placed at that point
