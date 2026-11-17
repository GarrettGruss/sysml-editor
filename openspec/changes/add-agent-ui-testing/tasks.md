## 1. Foundation
- [x] 1.1 Add `UiDriver` interface, command allowlist and workspace path check in `src/agent-tools/`, with unit tests for refusals (unlisted id, outside path, setting off, untrusted)
- [x] 1.2 Add user-level (scope `application`) setting `sysml.agent.uiControl`, the "SysML Agent UI" output channel and per-call logging; unit test for the log line
- [x] 1.3 Move `Gesture`, `ReqGesture` and webview hooks to a shared module used by the test API and the driver (D56)

## 2. Driver and tools
- [x] 2.1 Implement the vscode-side `UiDriver`; prompt recording and `sysml_ui_answer` with timeout (D57); unit tests with a fake driver
- [x] 2.2 `sysml_ui_command` and `sysml_ui_state` (selection, dirty, undo label, messages, prompts, nav history, clipboard kind)
- [ ] 2.3 `sysml_ui_diagram`: gestures, context menu listing and click by label, toggles
- [ ] 2.4 `sysml_ui_requirements` and `sysml_ui_tree`
- [ ] 2.5 Webview screenshot hook and `sysml_ui_screenshot` (D59)
- [ ] 2.6 Register all tools in the MCP manifest and `package.json` LM tools; manifest tests

## 3. Integration tests
- [ ] 3.1 Through MCP and LM, in a trusted workspace: tools refused with the setting off, allowlist refusals, audit log
- [ ] 3.2 Diagram scenarios: menu list and click, multi-select and align, copy and paste across diagrams, legend screenshot, back and forward
- [ ] 3.3 Tree, create-diagram naming, undo and dirty, requirements Document and Matrix, reorder
- [ ] 3.4 Check the coverage table in design.md D61 against the tools as built and update it

## 4. Docs and acceptance
- [ ] 4.1 Document the tools and the safety setting in `docs/agents.md`
- [ ] 4.2 Rerun the 10 diagramming acceptance scenarios via an agent using the new tools, record the results beside `diagramming-results-v0.3.0.md`, and confirm at least 9 are agent-verified
