## ADDED Requirements

### Requirement: UI-control gate
The UI-control tools SHALL be available only when the setting `sysml.agent.uiControl` is on (user-level only, default off) and the workspace is trusted. Otherwise each call SHALL be refused with a reason naming the missing condition. Every UI action SHALL be written to the "SysML Agent UI" output channel with tool, target and arguments, whether or not it succeeded.

#### Scenario: Setting off
- **WHEN** `sysml.agent.uiControl` is off and an agent calls `sysml_ui_command`
- **THEN** the call is refused and the reason names the setting

#### Scenario: Workspace setting ignored
- **WHEN** a workspace's `.vscode/settings.json` sets `sysml.agent.uiControl` on and the user setting is off
- **THEN** the tools are refused

#### Scenario: Untrusted workspace
- **WHEN** the setting is on and the workspace is untrusted
- **THEN** every UI-control tool refuses, and the observation tool still answers `enabled: false`

#### Scenario: Action logged
- **WHEN** an enabled call runs
- **THEN** one line for it appears in the output channel

### Requirement: Allowlisted editor commands
`sysml_ui_command` SHALL run only commands on a fixed allowlist: `sysml.*` (delete commands included) and core undo, redo, save, save all, back and forward. Other ids SHALL be refused; file-path arguments SHALL resolve inside the workspace. Prompts, including delete confirmations, SHALL be answered with `sysml_ui_answer` and logged.

#### Scenario: Allowed command
- **WHEN** an agent runs `sysml.createDiagram` with a package argument
- **THEN** the command runs and the result lists any prompt now open

#### Scenario: Delete confirmation
- **WHEN** an agent runs a delete command
- **THEN** a confirmation is open until answered, and the answer is logged

#### Scenario: Unlisted command
- **WHEN** an agent runs `workbench.action.terminal.new`
- **THEN** the call is refused and nothing runs

#### Scenario: Path outside the workspace
- **WHEN** a command argument is a path outside the workspace
- **THEN** the call is refused

### Requirement: Diagram webview actions
`sysml_ui_diagram` SHALL perform on an open diagram the gestures the integration tests use (select, multi-select, drag, resize, rubber-band, keys, context menu and its items, palette, drop, inline edit, toggles) and SHALL return the observed state after the gesture settles.

#### Scenario: Context menu listed and clicked
- **WHEN** an agent opens the context menu of a node
- **THEN** the result lists the item labels, and a following call can click one by label

#### Scenario: Multi-select and align
- **WHEN** an agent selects three nodes with shift and clicks Align Left
- **THEN** the result shows the three left edges equal

#### Scenario: Copy and paste across diagrams
- **WHEN** an agent presses Ctrl+C in diagram A and Ctrl+V in diagram B
- **THEN** B gains the nodes and the observation shows the clipboard held elements

### Requirement: Requirements editor actions
`sysml_ui_requirements` SHALL, for a package or file scope, switch between Document and Matrix, add a requirement inline, edit its text, drag a requirement in the table of contents to reorder or nest it, expand or collapse, and export the matrix. It SHALL return the metrics the integration tests read: outline, items, matrix rows, pending edits, and notice.

#### Scenario: Switch view
- **WHEN** an agent switches a scope from Document to Matrix
- **THEN** the result view is `matrix` and its rows are listed

#### Scenario: Reorder
- **WHEN** an agent drags a section before another in the table of contents
- **THEN** the outline order changes and the model file text matches

### Requirement: Tree actions
`sysml_ui_tree` SHALL list the visible tree nodes with labels and context values, select nodes, and invoke a view title command or a node context command offered for that node. It SHALL refuse a command not offered for the node.

#### Scenario: Context command
- **WHEN** an agent invokes Rename on a selected element node
- **THEN** an input box opens and is reported in the result

#### Scenario: Command not offered
- **WHEN** an agent invokes a diagram-only command on a package node
- **THEN** the call is refused

### Requirement: Answering prompts
`sysml_ui_answer` SHALL answer the open quick pick, multi-pick, input box, confirmation, choice dialog, or save dialog: pick by label, enter text (validation messages SHALL be returned), confirm, or cancel. A save or open dialog answer SHALL resolve inside the workspace.

#### Scenario: Input validation
- **WHEN** an input box is open and the agent enters an invalid name
- **THEN** the result carries the validation message and the box stays open

#### Scenario: Pick by label
- **WHEN** a quick pick is open and the agent answers with an item label
- **THEN** the pick resolves and the command completes

### Requirement: UI state observation
`sysml_ui_state` SHALL report: enabled flag, active editor and its dirty flag, selection per open editor, visible menus and items, the undo and redo labels, user-visible messages (information, warning, error) since the last read, open quick picks and input boxes, navigation history, and whether the clipboard holds text, an image, or elements. A message SHALL be kept until read.

#### Scenario: Message observed
- **WHEN** a command shows a warning to the user
- **THEN** the next state read lists it once

#### Scenario: Undo label
- **WHEN** a model edit has been made
- **THEN** the state shows the undo label for it

### Requirement: Webview screenshots
`sysml_ui_screenshot` SHALL return a PNG of what a webview currently displays (a diagram or the requirements editor, in the active theme, including selection, menus, legend and compartments), not the export renderer's output. Rendering SHALL stay in the webview.

#### Scenario: Legend visible
- **WHEN** the legend is toggled on and an agent takes a screenshot
- **THEN** the image shows the legend

### Requirement: Agent-testability coverage
The change SHALL keep a coverage table mapping each diagramming acceptance scenario and each manual test-plan item to the tools that make it agent-testable. At least 90% of the items SHALL be agent-testable, and the remaining items SHALL be named with the reason. After the tools ship, an agent SHALL rerun the 10 diagramming scenarios of the v0.3.0 results and at least 9 SHALL be agent-verified.

#### Scenario: Coverage met
- **WHEN** the table is counted
- **THEN** agent-testable items are at least 90% of all items and each exception is named

#### Scenario: Rerun
- **WHEN** an agent reruns the 10 scenarios
- **THEN** at least 9 are recorded as agent-verified
