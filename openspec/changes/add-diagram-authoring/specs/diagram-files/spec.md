## ADDED Requirements

### Requirement: New diagram stays unsaved
"New Diagram…" SHALL open the diagram unsaved, with the intended path shown in the tab, and SHALL NOT write the `.sysmld` file. With no edits beyond the generated layout, closing SHALL give no prompt and leave no file. After the user moves, adds, or styles anything, the usual save prompt SHALL appear. Model edits from the diagram SHALL still be written to the `.sysml` text at once. Saving SHALL write the file at the intended path, or ask for a path if one exists there.

#### Scenario: Close without edits
- **WHEN** the user creates a diagram and closes it without edits
- **THEN** there is no prompt and no `.sysmld` file

#### Scenario: Model edit in unsaved diagram
- **WHEN** the user adds a state from the palette of an unsaved diagram
- **THEN** the state is written to the `.sysml` file at once and the diagram stays unsaved

#### Scenario: Save
- **WHEN** the user presses Ctrl+S
- **THEN** the file is written at the intended path

### Requirement: Agent diagrams are written at once
The agent tool `sysml_create_diagram` SHALL write the `.sysmld` file at once.

#### Scenario: Agent creates a diagram
- **WHEN** an agent calls `sysml_create_diagram`
- **THEN** the file exists on disk when the call returns
