## ADDED Requirements

### Requirement: Add elements from palette
The editor SHALL provide a palette of element and relationship kinds valid for the diagram kind. Creating an element from the palette SHALL create the corresponding SysML element in the model (owned by the element the user dropped it into, or the diagram's root element) and place it on the diagram.

#### Scenario: Add part to a part def
- **WHEN** the user drags "Part" from the palette into part def `Vehicle` and names it `engine`
- **THEN** `part engine;` is inserted inside `Vehicle`'s body in the `.sysml` file, and a node for `engine` appears inside `Vehicle` on the diagram

#### Scenario: Add connection
- **WHEN** the user draws a connection between ports `engine.drive` and `transmission.input`
- **THEN** a `connect engine.drive to transmission.input;` declaration is added to the common owner, and an edge appears

### Requirement: Delete from model
The editor SHALL provide "Delete from Model", distinct from "Remove from Diagram", which deletes the SysML element and its owned members from the source and removes it from all open diagrams. It SHALL require an explicit command, and confirmation when the element has owned members or is referenced elsewhere.

#### Scenario: Delete from model
- **WHEN** the user chooses "Delete from Model" on `engine` and confirms
- **THEN** `part engine ...;` (including its body) is removed from the `.sysml` file and the node disappears from every open diagram

#### Scenario: Delete key does not delete from model
- **WHEN** a node is selected and the user presses Delete
- **THEN** the node is removed from the diagram only and the `.sysml` file is unchanged

### Requirement: Inline and property editing
The user SHALL be able to rename elements inline on the diagram and edit common properties (name, short name, type, multiplicity, documentation) in a properties panel; these edits SHALL modify the SysML text.

#### Scenario: Change type
- **WHEN** the user sets the type of `engine` to `Engine` in the properties panel
- **THEN** the declaration becomes `part engine : Engine;`

### Requirement: Inherited features are read-only
When a diagram shows a feature that a usage inherits from its definition, the feature SHALL be drawn as inherited and SHALL NOT be deleted, renamed, or retyped from that usage, by a person or by an agent. The refusal SHALL offer navigation to the definition. Adding a feature inside a usage SHALL add it to that usage only and SHALL NOT change the definition.

#### Scenario: Delete refused
- **WHEN** `part vehicle1 : Vehicle` shows `engine`, which is declared in `Vehicle`, and the user chooses "Delete from Model" on it
- **THEN** nothing is deleted, and a message explains that `engine` is inherited from `Vehicle` and offers "Go to Definition"

#### Scenario: Add goes to the usage
- **WHEN** the user drags "Part" from the palette into `vehicle1` and names it `battery`
- **THEN** `part battery;` is added inside the body of `vehicle1`, `Vehicle` is unchanged, and other usages of `Vehicle` do not show `battery`

#### Scenario: Agent edit refused
- **WHEN** an agent calls delete-element on the inherited `engine` of `vehicle1`
- **THEN** the tool returns an error naming the definition that declares it, and no file changes
