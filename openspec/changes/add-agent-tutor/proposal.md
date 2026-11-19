## Why

New users learn the editor slowly because nothing shows them what to press. The agent UI-control work lets an agent act in the editor; a tutor needs the opposite: point at an element, then wait while the user acts. It must be safe to turn on without handing the agent control.

## What Changes

- Add `sysml_ui_highlight`: a spotlight and callout drawn in the diagram and requirements webviews; for VS Code chrome it reveals and focuses the target and returns a textual location.
- Add `sysml_ui_wait_for_user`: waits (with timeout) for a user gesture, command or state change and reports it; the agent cannot act through it.
- Highlights clear on Esc, a close button, or when the target disappears.
- Add the application-scope setting `sysml.agent.tutor` (default off): allows only display and observe tools (highlight, wait, `sysml_ui_state`, `sysml_ui_screenshot`) without `sysml.agent.uiControl`; refused in untrusted workspaces; audit-logged.
- Add two VS Code walkthroughs, completed by commands: first steps, and diagram basics.
- Tests through MCP and LM, plus an agent-run tutoring scenario checked by screenshot.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-integration`: tutor tools, tutor gate, audit and plain-text callouts.
- `diagram-editor`: highlight overlay, dismissal and walkthroughs.

## Impact

- `src/agent-tools/` (new `ui-tutor.ts`, gate in `ui-support.ts`, manifest), `src/agent-ui-driver.ts`, `src/ui-gestures.ts`, diagram and requirements webviews (overlay), `package.json` (setting, LM tools, walkthroughs), `docs/agents.md`, `test/integration/`.
- Builds on `add-agent-ui-testing` (D53 to D61).
