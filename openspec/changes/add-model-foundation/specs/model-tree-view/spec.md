## ADDED Requirements

### Requirement: Native tree view of model hierarchy
The extension SHALL contribute a VS Code native tree view (not a webview) rooted at the workspace folders, showing folders, then files, then their contents. A filter in the view's title bar, remembered per workspace, SHALL switch between two views that both keep the folder structure: Elements (the default), which shows `.sysml` files and the ownership hierarchy of their elements; and Diagrams, which shows `.sysmld` diagram files.

#### Scenario: Workspace with SysML files in folders
- **WHEN** the workspace contains `fixtures/sysml-v2-models/SE_Models/Vehicle.sysml` and the user opens the SysML Model view in the Elements view
- **THEN** the tree shows `fixtures`, then `sysml-v2-models`, then `SE_Models`, then `Vehicle.sysml`, and expanding the file shows its top-level elements, whose owned members appear in source order

#### Scenario: Diagrams view
- **WHEN** the workspace contains `models/vehicle/vehicle-general.sysmld` and the user switches the filter to Diagrams
- **THEN** the tree shows `models`, then `vehicle`, then `vehicle-general.sysmld` with its diagram kind (for example "General") as description; the diagram file has no children and selecting it opens it in the diagram editor; `.sysml` files are not shown

#### Scenario: Workspace without diagrams
- **WHEN** the workspace contains no `.sysmld` files and the Diagrams view is selected
- **THEN** the tree shows the workspace folders and their subfolders, all marked "no diagrams"

#### Scenario: Multi-root workspace
- **WHEN** the workspace has more than one workspace folder
- **THEN** each view has one root node per workspace folder

#### Scenario: Workspace without SysML files
- **WHEN** the workspace contains no `.sysml` files and the Elements view is selected
- **THEN** the tree still shows the workspace folders and their folders, all marked "no SysML files", and "New SysML File" is available from the view's title bar and from each folder's context menu, creating the file in that folder

#### Scenario: No workspace folder
- **WHEN** no folder is open
- **THEN** the view shows a welcome message with an action to open a folder

### Requirement: Folders without SysML files
In both views the tree SHALL show every workspace folder that is not excluded by `files.exclude` or `sysml.exclude`, including folders that contain no file of the kind the view shows at any depth. Such a folder SHALL be marked as empty (description "no SysML files" in the Elements view, "no diagrams" in the Diagrams view, and a dimmed icon); expanding it SHALL show only its subfolders, which are marked the same way. Folders appear before files, each sorted by name.

#### Scenario: Folder with no SysML files
- **WHEN** the workspace contains a folder `docs/` with no `.sysml` file below it
- **THEN** `docs` appears in the tree, marked "no SysML files", and expanding it shows only its subfolders, each marked "no SysML files"

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

### Requirement: Diagram list kept current without polling the workspace
The Diagrams view SHALL keep its list of `.sysmld` files current from file-system events, and SHALL NOT periodically search the whole workspace. Because file watchers can miss changes inside a folder created moments earlier, the extension SHALL re-read only a newly created folder a small number of times over the following seconds, then stop.

#### Scenario: Diagram deleted from a just-created folder
- **WHEN** a folder is created, a diagram is added to it, and the diagram is deleted within a few seconds
- **THEN** within ten seconds the folder is marked "no diagrams", and no full-workspace search ran

#### Scenario: Idle workspace
- **WHEN** no files or folders change
- **THEN** the extension performs no directory reads or workspace searches for the Diagrams view

### Requirement: Search above the tree
The view container SHALL show a single-line search box above the tree. Typing SHALL filter the active view (Elements or Diagrams) to the nodes whose name matches the text, case-insensitively, plus the path leading to each match, expanded, including folders never expanded before. Clearing the box SHALL restore the unfiltered tree.

#### Scenario: Search box is not part of the tree
- **WHEN** the view container is shown
- **THEN** the search box is a webview containing only the input, which talks to the extension only through `postMessage`, and the tree below it is the native tree view

#### Scenario: Search for an element
- **WHEN** the Elements view is selected and the user types `engine`
- **THEN** the tree shows only the folders, files and owning elements leading to every element named like `engine`, with those elements visible, and selecting one behaves as in the unfiltered tree

#### Scenario: Search in the Diagrams view
- **WHEN** the Diagrams view is selected and the user types `state`
- **THEN** the tree shows only the diagram files whose names match and the folders leading to them

#### Scenario: No match
- **WHEN** the text matches nothing
- **THEN** the tree shows a single "No matches" item and the box keeps the text

#### Scenario: Clear search
- **WHEN** the user clears the box or presses Escape in it
- **THEN** the unfiltered tree returns, with previously expanded nodes still expanded

