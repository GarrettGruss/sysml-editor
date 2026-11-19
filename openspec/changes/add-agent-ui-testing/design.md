## Context

See proposal.md - Why. The MCP server (`src/mcp/`) and the language-model tools share handlers in `src/agent-tools/`, which must not import `vscode`. Integration tests already drive real webviews through `TestApi` (`diagram.gesture`, `diagram.setUi`, `requirements.gesture`, `requirements.setUi`, `requirements.metrics`, `png`) in `test/integration/index.ts`. Decisions continue after D52.

## Goals / Non-Goals

**Goals:**
- An agent drives and observes the UI the way a tester does, through one path shared with the integration tests.
- The 90% target is a counted table, not a claim.

**Non-Goals:**
- Arbitrary command execution, arbitrary webview script injection, or file access outside the workspace.
- A second renderer; judging looks beyond what a screenshot lets an agent read.
- A standalone mode without VS Code.

## Decisions

### D53: UI control is off by default and gated three ways
Tools work only when `sysml.agent.uiControl` is on and the workspace is trusted. The setting is user-level only (scope `application`), so a cloned repo cannot enable it through its own `.vscode/settings.json`; default off. Otherwise the tools otherwise they refuse with the reason. Agent inputs are hostile, and these tools can change files. Alternative: always on in trusted workspaces; rejected, because turning it on should be a deliberate act.

### D54: Command allowlist, not command ids
`sysml_ui_command` accepts only the command ids this extension contributes (`contributes.commands`, so another extension's `sysml.*` ids are refused) plus undo, redo, save, save all, back and forward. The allowlist is a constant in `src/agent-tools/`, checked before any call. Delete commands are allowlisted; their confirmations are answered through `sysml_ui_answer` and recorded in the audit log. Alternative: a denylist; rejected, since new core commands would be allowed by default.

### D55: A `UiDriver` interface keeps handlers free of `vscode`
Handlers call `UiDriver` (run command, gesture, menus, prompts, state, screenshot). The extension supplies the implementation; unit tests use a fake. File arguments are resolved against workspace roots in the handler, so the check is unit tested.

### D56: One gesture path, shared with the integration tests
The gesture types (`Gesture`, `ReqGesture`) and webview hooks the tests use move to a shared module that both the test API and the driver import. Alternative: a new agent-only message channel; rejected, because two paths would drift and the tests would stop proving the agent path.

### D57: Prompts are observed and answered, not auto-answered
The driver installs the same `setUi` seam the tests use, but in a mode that records an open prompt (pick, multi-pick, input, confirm, choice, save dialog) and waits for `sysml_ui_answer`. A prompt left open times out as cancelled. Commands return as soon as a prompt opens, so the agent never deadlocks. A prompt goes to the agent only while an agent command or gesture is in flight (a counter, not a time window), so a prompt the person triggers is shown as the normal VS Code dialog. A save-dialog answer must lie in the workspace by its real path, contain no segment starting with ".", and keep the extension the prompt suggested. Any string command argument that looks like a path or a file name (`out.png`) is resolved inside the workspace.

### D58: Observation is pull-based with a message log
`sysml_ui_state` reads selection, menus, dirty flags, undo labels, nav history and clipboard kind. User messages go into a bounded queue drained on read. Clipboard reports kind only (text, image, elements), not content, to avoid leaking data.

### D59: Screenshots come from the webview
The webview captures its own visible DOM and canvas to PNG on request and posts it back; the host returns it. This shows selection, menus and legend as the user sees them. The export renderer stays for `sysml_read_diagram`. Alternative: OS screenshot of the window; rejected as not portable and it would capture unrelated content.

### D60: Audit log
Every UI call writes one line to the "SysML Agent UI" output channel before it runs, with tool, target and arguments (text values truncated).

### D61: The 90% metric
Items are the 10 diagramming scenarios of the v0.3.0 results plus the manual test-plan items below. An item counts as agent-testable if the verdict can be read from tool output without a human. Target: at least 90%.

| # | Item | Tools | Agent-testable |
|---|---|---|---|
| 1 | DGM-003 open, Back, Forward | ui_command, ui_state | yes |
| 2 | DGM-007 ports on shape | existing show/hide tool, ui_screenshot | yes |
| 3 | DGM-009 display related | ui_diagram (menu), ui_answer | yes |
| 4 | DGM-011 copy to another diagram | ui_diagram (keys), ui_state | yes |
| 5 | DGM-019 legend | ui_diagram (toggle), ui_screenshot | yes |
| 6 | DGM-025 draw relationship | existing relationship tool | yes |
| 7 | DGM-034 hide compartment | ui_diagram (menu), ui_screenshot | yes |
| 8 | DGM-041 align left | ui_diagram (multi-select, menu) | yes |
| 9 | DGM-045 save as image | existing read tool, ui_command, ui_answer | yes |
| 10 | DGM-047 apply aspect | ui_command, ui_answer | yes |
| 11 | Tree: New File / New Folder | ui_tree, ui_answer | yes |
| 12 | Tree: Refresh, Collapse All | ui_tree | yes |
| 13 | Tree: rename, delete element | ui_tree, ui_answer | yes |
| 14 | Tree: select and reveal | ui_tree, ui_state | yes |
| 15 | Create diagram, naming, invalid name | ui_command, ui_answer | yes |
| 16 | Create diagram from the tree | ui_tree, ui_answer | yes |
| 17 | Line select, move, reroute | ui_diagram | yes |
| 18 | Line label edit | ui_diagram (inline) | yes |
| 19 | Delete line vs delete from model | ui_diagram (keys, menu), ui_state | yes |
| 20 | Undo and redo | ui_command, ui_state | yes |
| 21 | Dirty flag and diagram save | ui_command, ui_state | yes |
| 22 | Text and diagram sync | ui_command, existing read tools | yes |
| 23 | Palette place and name | ui_diagram, ui_answer | yes |
| 24 | Drag element from tree to diagram | ui_diagram (drop) | yes |
| 25 | Requirements: Document view | ui_requirements | yes |
| 26 | Requirements: Matrix view and export | ui_requirements | yes |
| 27 | Requirements: add inline, edit text | ui_requirements | yes |
| 28 | Requirements: reorder and nest | ui_requirements | yes |
| 29 | Notifications and errors shown to the user | ui_state | yes |
| 30 | Untrusted workspace refusals | ui_state, edit tools | yes |
| 31 | Pixel-level look (spacing, taste) | ui_screenshot, agent judgment only | no |
| 32 | Native OS dialogs (real Save As, OS clipboard image contents) | state shows presence only | no |
| 33 | Drag from the OS file explorer, real pointer hover timing | none | no |

30 of 33 is 91%. The three exceptions are named in rows 31 to 33.

**Check against the tools as built (task 3.4).** Every row marked yes is driven by a passing integration test in `test/integration/ui-agent.ts` that calls only the tools, alternating MCP and LM, and reads the verdict from tool output:

| Rows | Test |
|---|---|
| 1 | Back and Forward through sysml_ui_command |
| 4, 5, 8 | Diagrams through the tools (multi-select, Align Left from the menu, copy and paste across diagrams, legend, screenshot) |
| 2, 3, 7, 9, 10, 29 | Diagram content through the tools (Show/Hide Parts and Ports with the port on the border, Display Related and its "already drawn" message in sysml_ui_state, Show Attributes, Save as Image through the save prompt, apply an aspect) |
| 6, 13, 19, 22, 23, 24 | Model edits through the tools (palette place and name, drop, sysml_create_relationship onto the diagram, Delete versus Delete from Model on a line, a rename seen in the open diagram, tree rename and delete with confirmation) |
| 17, 18 | Lines through the tools (select, add a bend, drag a segment, move and reset the label; sysml_read_diagram now reports an edge's `label` layout) |
| 11, 15 | Tree New File and New Folder (a name in use is refused with the reason and the box stays open) |
| 12, 14, 15, 16, 20, 21 | Tree through the tools (refresh, collapse all, select one node, New Diagram from the tree with a unique default name, undo, redo, dirty and save) |
| 25 to 28 | Requirements through the tools (document outline, add inline and edit text, reorder by dragging a section, matrix and CSV export) |
| 30 | UI control off / on refusals, and turning it off after it was on |

Corrections: row 14 can select and reveal one node only, because the tree API reveals nodes one at a time; `sysml_ui_tree select` with several nodes is refused explicitly (the diagram multi-select of row 8 is unaffected). Row 15: New Diagram asks for the kind only and names the file after the element, never reusing a name; the invalid-name check is on the tree's New File box. The untrusted-workspace refusal of row 30 is covered by unit tests only, since the test window is trusted. Measured: 30 of 33 rows (91%) proven by passing tests; rows 31 to 33 are not agent-testable.

## Risks / Trade-offs

- [Prompt injection drives a destructive command] → Gate, allowlist, workspace-only paths, audit log, and delete commands still ask their normal confirmation, which the agent must answer explicitly.
- [Tests prove the test API, not the agent path] → Integration tests call the tools through MCP and LM, as `diagram-agent.ts` does.
- [Screenshot leaks content] → Only the webview is captured, only on request.
- [Row 31 is weak] → Counted as not testable, so the 90% claim does not depend on it.

## Migration Plan

Add behind the setting, default off. Rollback is removing the tools; no file formats change.
