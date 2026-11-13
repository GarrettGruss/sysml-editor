## ADDED Requirements

### Requirement: Behavior parity with the GUI
Model-changing agent tools, on either channel, SHALL follow the same model-synchronization rules as GUI edits: minimal format-preserving text edits, valid generated SysML v2 text, refusal on files with parse errors, and diagram reference maintenance on rename.

#### Scenario: Agent adds a part
- **WHEN** an agent calls the add-element tool to add `part engine : Engine` to `VehicleModel::Vehicle`
- **THEN** the `.sysml` file receives the same text edit the diagram palette would produce

### Requirement: Edit the model
Agent tools SHALL include tools to create elements (optionally placing them on a diagram), delete elements from the model, rename elements, set element properties, and create connections and satisfy relationships.

#### Scenario: Create and place
- **WHEN** an agent creates `part battery : Battery` in `VehicleModel::Vehicle` with placement on `vehicle.sysmld`
- **THEN** the declaration is added to the `.sysml` file and a `battery` node appears on the diagram

#### Scenario: Delete versus remove
- **WHEN** an agent calls delete-element on `engine`
- **THEN** the declaration is removed from the `.sysml` file, unlike remove-from-diagram, which changes only the diagram
