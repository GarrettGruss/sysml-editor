## ADDED Requirements

### Requirement: Diagram actions from tree
The tree SHALL offer, for an element, showing it in a diagram where it appears, adding it to the active diagram, and creating a new diagram from it. When enabled, selecting a node in a diagram SHALL reveal and select the corresponding tree item.

#### Scenario: Show in diagrams
- **WHEN** the user invokes "Show in Diagram" on an element that appears in one or more diagram files
- **THEN** the user may pick a diagram and it opens with that element selected

#### Scenario: Add to active diagram
- **WHEN** the user invokes "Add to Active Diagram" on part def `Wheel`
- **THEN** a `Wheel` node appears on the active diagram and only the diagram file changes

#### Scenario: Diagram selection
- **WHEN** the user selects a node in an open diagram
- **THEN** the corresponding tree item is revealed and selected
