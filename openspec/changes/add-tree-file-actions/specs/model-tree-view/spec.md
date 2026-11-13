## ADDED Requirements

### Requirement: Title bar actions
The tree title bar SHALL show New File, New Folder, Refresh, and Collapse All in that order. Change View SHALL stay, and Clear Search SHALL show while a search is active. Collapse All SHALL use the built-in collapse. Refresh SHALL do a full rescan.

#### Scenario: Collapse All
- **WHEN** the user clicks Collapse All
- **THEN** all nodes collapse

#### Scenario: Refresh
- **WHEN** a file is added outside VS Code and the user clicks Refresh
- **THEN** the file appears in the tree

### Requirement: New File and New Folder target
New File and New Folder SHALL create in the selected folder, the folder of the selected file or element, or else the workspace root.

#### Scenario: Selected element
- **WHEN** a part is selected in `a/b.sysml` and the user clicks New File
- **THEN** the file is created in folder `a`

### Requirement: Placeholder row with live name
New File and New Folder SHALL add a placeholder row in the target folder, revealed and selected, with the default name `untitled.sysml` or `New Folder` and a distinct icon, and open an input box at the top. The placeholder label SHALL follow the typed text. The row SHALL stay first among its kind while typing. Nothing SHALL be on disk until Enter.

#### Scenario: Live label
- **WHEN** the user types `engine` in the input box
- **THEN** the placeholder row shows `engine.sysml`

#### Scenario: Create
- **WHEN** the user presses Enter
- **THEN** the file is created, the placeholder becomes the real node, and the file opens in the text editor

#### Scenario: Cancel
- **WHEN** the user presses Escape or the input box hides without accept
- **THEN** the placeholder is removed and nothing is written

### Requirement: Name validation
The input box SHALL show an error for a duplicate name or invalid characters and SHALL append `.sysml` to a file name when missing.

#### Scenario: Duplicate
- **WHEN** the typed name already exists in the folder
- **THEN** the input box shows an error and Enter does not create it
