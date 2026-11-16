## ADDED Requirements

### Requirement: New Diagram on a file
"New Diagram…" SHALL be offered on `.sysml` file nodes in the tree and on `.sysml` files in the Explorer context menu. With one top-level element it SHALL be the root; with several a quick pick SHALL ask which. Only kinds that fit the root SHALL be offered. A file with no top-level elements or with parse errors and no last good version SHALL give a message saying why. The new diagram SHALL be placed next to the file by default and stay unsaved until saved.

#### Scenario: One package
- **WHEN** the user runs "New Diagram…" on a file with one package
- **THEN** the package is the root and the kind choice follows

#### Scenario: Several packages
- **WHEN** the file has two top-level packages
- **THEN** a quick pick lists them

#### Scenario: Empty file
- **WHEN** the file has no top-level elements
- **THEN** a message says it cannot be used and why
