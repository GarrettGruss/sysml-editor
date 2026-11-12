## ADDED Requirements

### Requirement: Native tree view of model hierarchy
The extension SHALL contribute a VS Code native tree view (not a webview) rooted at the workspace folders, showing folders, then files, then their contents. A filter in the view's title bar, remembered per workspace, SHALL switch between two views that both keep the folder structure: Elements (the default), which shows `.sysml` files and the ownership hierarchy of their elements; and Diagrams, which shows `.sysmld` diagram files.

#### Scenario: Workspace with SysML files in folders
- **WHEN** the workspace contains `fixtures/sysml-v2-models/SE_Models/Vehicle.sysml` and the user opens the SysML Model view in the Elements view
- **THEN** the tree shows `fixtures`, then `sysml-v2-models`, then `SE_Models`, then `Vehicle.sysml`, and expanding the file shows its top-level elements, whose owned members appear in source order

#### Scenario: Diagrams view
- **WHEN** the workspace contains `models/vehicle/vehicle-general.sysmld` and the user switches the filter to Diagrams
- **THEN** the tree shows `models`, then `vehicle`, then `vehicle-general.sysmld` with its diagram kind (for example "General") as description; the diagram file has no children and selecting it opens it in the diagram editor; `.sysml` files are not shown

#### Scenario: Multi-root workspace
- **WHEN** the workspace has more than one workspace folder
- **THEN** each view has one root node per workspace folder

#### Scenario: Empty workspace
- **WHEN** the workspace contains no `.sysml` files
- **THEN** the view shows a welcome message with an action to create a new SysML file

### Requirement: Folders without SysML files
In both views the tree SHALL show every workspace folder that is not excluded by `files.exclude` or `sysml.exclude`, including folders that contain no file of the kind the view shows at any depth. Such a folder SHALL be marked as empty (description "no SysML files" in the Elements view, "no diagrams" in the Diagrams view, and a dimmed icon) and SHALL have no children. Folders appear before files, each sorted by name.

#### Scenario: Folder with no SysML files
- **WHEN** the workspace contains a folder `docs/` with no `.sysml` file below it
- **THEN** `docs` appears in the tree, marked "no SysML files", and cannot be expanded

#### Scenario: Excluded folder
- **WHEN** a folder matches `files.exclude` or `sysml.exclude` (for example `node_modules`)
- **THEN** it does not appear in the tree

#### Scenario: Folder created or deleted
- **WHEN** a folder is created, deleted or gains its first `.sysml` file
- **THEN** the tree updates without collapsing unaffected expanded nodes

### Requirement: Element presentation
Each tree item SHALL show the element's declared name (or short name / `<unnamed>` when absent), an icon distinguishing its kind (e.g. package, part def, part, port, action, requirement, connection), and a description showing its type (e.g. `: Engine`) when it is a typed usage.

#### Scenario: Typed usage
- **WHEN** the model contains `part engine : Engine;`
- **THEN** the tree item label is `engine`, its icon is the part-usage icon, and its description includes `Engine`

### Requirement: Navigation from tree
Selecting a tree item SHALL offer navigation to the element's declaration in the text editor.

#### Scenario: Reveal in source
- **WHEN** the user invokes "Go to Definition" on a tree item
- **THEN** the defining `.sysml` file opens with the element's declaration selected

### Requirement: Tree reflects model changes
The tree SHALL refresh affected nodes when any `.sysml` file changes (from text edits, diagram edits, or file system changes) without collapsing unaffected expanded nodes.

#### Scenario: Text edit adds element
- **WHEN** the user types a new `part def Wheel;` into a package and the document changes
- **THEN** `Wheel` appears under that package within one second, and other expanded nodes remain expanded

### Requirement: Tree and text selection sync
When enabled, moving the cursor onto a declaration in the text editor SHALL reveal and select the corresponding tree node.

#### Scenario: Cursor on declaration
- **WHEN** the user places the cursor on `part engine : Engine;` in the text editor
- **THEN** the `engine` tree item is revealed and selected
