## ADDED Requirements

### Requirement: Tutor gate
The tutor tools (`sysml_ui_highlight`, `sysml_ui_wait_for_user`) and the read-only tools `sysml_ui_state` and `sysml_ui_screenshot` SHALL be available when `sysml.agent.tutor` is on (application scope, default off) or `sysml.agent.uiControl` is on, and the workspace is trusted. With only the tutor setting on, every other UI tool SHALL be refused naming `sysml.agent.uiControl`. Every tutor call SHALL be written to the "SysML Agent UI" output channel before it runs.

#### Scenario: Tutor on, control off
- **WHEN** only `sysml.agent.tutor` is on and an agent calls `sysml_ui_highlight`, then `sysml_ui_command`
- **THEN** the highlight runs and the command is refused naming `sysml.agent.uiControl`

#### Scenario: Workspace setting ignored
- **WHEN** a workspace's `.vscode/settings.json` sets `sysml.agent.tutor` on and the user setting is off
- **THEN** the tutor tools are refused

#### Scenario: Untrusted workspace
- **WHEN** the tutor setting is on and the workspace is untrusted
- **THEN** the tutor tools refuse

#### Scenario: Call logged
- **WHEN** a tutor call runs
- **THEN** one line for it appears in the output channel

### Requirement: Highlight a target
`sysml_ui_highlight` SHALL show a spotlight and a callout on a target in the diagram or requirements webview. Targets SHALL be addressed as `sysml_ui_diagram` and `sysml_ui_requirements` address them. An unknown target SHALL return an error listing valid ones.

#### Scenario: Webview target
- **WHEN** an agent highlights palette item "Part" with text "Drag this onto the canvas"
- **THEN** the palette item is spotlit with the callout, and the result names the target as found

#### Scenario: VS Code chrome target
- **WHEN** an agent highlights the tree title button `sysml.tree.newFile`
- **THEN** the tree view is revealed and focused, and the result gives its location and states that no overlay was drawn

#### Scenario: Unknown target
- **WHEN** the target does not exist
- **THEN** the call fails and lists valid targets

### Requirement: VS Code chrome targets
For VS Code chrome (tree view title buttons, editor title actions, the Command Palette) no overlay is possible. `sysml_ui_highlight` SHALL reveal and focus the view, return a textual location, and state that no overlay was drawn.

#### Scenario: Chrome target
- **WHEN** an agent highlights the tree title button `sysml.tree.newFile`
- **THEN** the tree is revealed and focused and the result gives its location

### Requirement: Callout text is untrusted
Callout text is agent-controlled. It SHALL be rendered as plain text, never as HTML, limited to 280 characters (longer text truncated), with no links or images.

#### Scenario: Markup in callout
- **WHEN** the text is `<img src=x onerror=...>`
- **THEN** the callout shows the characters literally and nothing executes

### Requirement: Wait for the user
`sysml_ui_wait_for_user` SHALL wait up to `timeoutMs` (default 60000, maximum 300000) for the next user action and return what happened: gestures in a webview, executed `sysml.*` commands, and state changes (selection, dirty flag, open editors). It SHALL return `timedOut: true` when nothing happened. It SHALL NOT run commands, gestures or answer prompts, and actions made by agent tools SHALL not be reported as user actions.

#### Scenario: User acts
- **WHEN** the agent waits and the user places a palette element
- **THEN** the call returns the gesture and the resulting selection

#### Scenario: Timeout
- **WHEN** nothing happens within the timeout
- **THEN** the call returns `timedOut: true`

#### Scenario: Agent action not reported
- **WHEN** an agent tool changes the selection during a wait
- **THEN** that change is not returned as a user action
