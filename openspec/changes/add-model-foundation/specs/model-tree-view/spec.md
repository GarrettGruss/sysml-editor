## ADDED Requirements

### Requirement: Native tree view of model hierarchy
The extension SHALL contribute a VS Code native tree view (not a webview) that displays the ownership hierarchy of all SysML v2 elements parsed from `.sysml` files in the workspace, rooted at top-level packages and namespaces.

#### Scenario: Workspace with SysML files
- **WHEN** the workspace contains `.sysml` files and the user opens the SysML Model view
- **THEN** the tree lists each top-level package, and expanding a node shows its owned members in source order

#### Scenario: Empty workspace
- **WHEN** the workspace contains no `.sysml` files
- **THEN** the view shows a welcome message with an action to create a new SysML file

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
