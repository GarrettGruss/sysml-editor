## Why

The requirement is that agents conduct 90% of testing on their own. In the v0.3.0 diagramming run an agent over MCP could verify only 3 of 10 acceptance scenarios (007, 025, 045); the other 7 needed the window: commands, pickers, the clipboard, webview menus and toggles, and a trusted workspace. The same gap applies to the manual test plan (tree and file actions, diagram creation and naming, line editing, undo and sync, requirements document and matrix).

## What Changes

- Add UI-control tools to the MCP server and the language-model tools: run an allowlisted editor command, act in a diagram webview, act in the requirements editor, drive the model tree, answer open pickers and input boxes, observe UI state, and take a screenshot of what the webview shows.
- Reuse the webview gesture plumbing the integration tests already use (`TestApi` gestures in `test/integration/`), moved behind an interface so tool handlers do not import `vscode`.
- Add an observation surface: selection, visible menus and items, dirty flag, undo label, messages shown to the user, open quick picks and input boxes, navigation history, clipboard presence.
- Safety: off unless `sysml.agent.uiControl` is on, refused in untrusted workspaces, command allowlist, workspace-only file access, every action logged to an output channel.
- Add a coverage table that defines the 90% metric, and a final rerun of the 10 diagramming scenarios by an agent.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-integration`: UI-control tools, observation tools, webview screenshots, safety gate, and the agent-testability coverage requirement.

## Impact

- `src/mcp/`, `src/agent-tools/` (new `ui-tools.ts`, a `UiDriver` interface, manifest entries), `src/agent-integration.ts` (setting, output channel, vscode-side driver), webview test hooks for menu listing and screenshots, `package.json` (setting, LM tool entries), `test/integration/`.
- Docs: `docs/agents.md`, the acceptance results file.
