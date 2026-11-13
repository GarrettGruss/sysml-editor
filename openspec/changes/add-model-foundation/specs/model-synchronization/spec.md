## ADDED Requirements

### Requirement: SysML text is the source of truth
All semantic model state SHALL be read from and written to `.sysml` textual files. GUI views (tree, diagrams, requirements editor) SHALL be projections of the parsed model plus diagram view state, and SHALL NOT keep a separate copy of semantic data that can diverge from the text.

#### Scenario: Reload consistency
- **WHEN** VS Code is restarted
- **THEN** all views show exactly what the `.sysml` files declare, and nothing else

### Requirement: Full language coverage
The extension SHALL parse the complete SysML v2 textual notation of the targeted release, including expressions and behavioral constructs it does not display. A file that is valid SysML v2 SHALL NOT be reported as having syntax errors. User-written KerML files are not loaded.

#### Scenario: Official examples parse
- **WHEN** the example, training, and validation models of the targeted SysML v2 release are loaded
- **THEN** they are loaded without syntax errors

#### Scenario: Constructs that are not displayed
- **WHEN** a file contains state machines, calculations, and constraint expressions alongside parts
- **THEN** the parts appear in the tree and the file is not marked as having errors

### Requirement: Standard library resolution
References to the SysML v2 standard library SHALL resolve, including library packages written in KerML. The library SHALL be read-only.

#### Scenario: KerML-defined type
- **WHEN** a model declares `attribute name : ScalarValues::String;`
- **THEN** the type resolves to the library element and is shown as the attribute's type

### Requirement: Text edits propagate to views
Changes to `.sysml` documents (including unsaved editor buffers and external file changes) SHALL be re-parsed and propagated to every open view of the model within one second for files up to 5,000 lines.

#### Scenario: Live property change
- **WHEN** the user changes `part engine;` to `part engine : Engine;` in the text editor
- **THEN** the tree shows the new type on `engine` without the user saving

### Requirement: Display with syntax errors
When a `.sysml` file has syntax errors, views SHALL show the last successfully parsed model for that file with an error indicator that links to the error location.

#### Scenario: Broken file
- **WHEN** the user types an incomplete declaration into a file that parsed a moment ago
- **THEN** the tree keeps showing that file's previous contents, marked with an error indicator
