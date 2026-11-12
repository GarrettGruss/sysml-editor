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
Selecting a tree item SHALL offer navigation to the element's declaration in the text editor, and to diagrams in which the element appears.

#### Scenario: Reveal in source
- **WHEN** the user invokes "Go to Definition" on a tree item
- **THEN** the defining `.sysml` file opens with the element's declaration selected

#### Scenario: Show in diagrams
- **WHEN** the user invokes "Show in Diagram" on an element that appears in one or more diagram files
- **THEN** the user may pick a diagram and it opens with that element selected

### Requirement: Tree actions edit the model
The tree SHALL provide context-menu actions to add a child element of an allowed kind, rename an element, delete an element, and add the element to the active diagram; model-changing actions SHALL apply through the model-synchronization rules.

#### Scenario: Delete from tree
- **WHEN** the user deletes a part usage from the tree and confirms
- **THEN** its declaration is removed from the `.sysml` text and the node disappears from the tree

### Requirement: Tree reflects model changes
The tree SHALL refresh affected nodes when any `.sysml` file changes (from text edits, diagram edits, or file system changes) without collapsing unaffected expanded nodes.

#### Scenario: Text edit adds element
- **WHEN** the user types a new `part def Wheel;` into a package and the document changes
- **THEN** `Wheel` appears under that package within one second, and other expanded nodes remain expanded

### Requirement: Tree and editor selection sync
When enabled, selecting an element in a diagram or moving the cursor onto a declaration in the text editor SHALL reveal and select the corresponding tree node.

#### Scenario: Diagram selection
- **WHEN** the user selects a node in an open diagram
- **THEN** the corresponding tree item is revealed and selected
