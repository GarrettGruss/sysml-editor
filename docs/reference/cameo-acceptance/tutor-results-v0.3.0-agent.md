# Tutor acceptance results, v0.3.0 (agent run 3, tutor tools)

Method: unlike the earlier UI-tool runs (a real VS Code driven only through the MCP tools), this one is hosted in the integration
test "Tutor acceptance" (`test/integration/ui-agent.ts`, run with `SYSML_TUTOR_SHOTS=<folder>`, `SYSML_TEST_FILTER="Tutor acceptance"`).
`sysml.agent.tutor` is on and `sysml.agent.uiControl` is off. The agent side calls only `sysml_ui_highlight`, `sysml_ui_wait_for_user`,
`sysml_ui_state` and `sysml_ui_screenshot` (through MCP); the user's steps are simulated through the test API (`vscode.commands`,
`api.diagram.gesture`). Scenario: create a diagram and place an element. Screenshots (each one viewed) are in
`docs/reference/cameo-acceptance/shots-tutor-v0.3.0-agent/`.

| Step | Verdict | Evidence |
|---|---|---|
| 1 Highlight the Model view (`chrome: modelTree`) | Pass | `highlighted: false` and a fixed description of where the view is; VS Code chrome cannot be screenshotted (by design). |
| 2 Wait; the user runs New Diagram | Pass | `wait_for_user` returned `{kind: command, id: sysml.newDiagram}`; the diagram `TutorDemo.sysmld` opened (`sysml_ui_state`). |
| 3 Highlight the canvas, verify | Pass (after fix, D1) | Callout text read back through the diagram metrics, and visible in `1-canvas-highlight.png` (callout with close button). |
| 4 Wait; the user places a part by the palette, then clicks it | Pass (observation O1) | `TutorDemo::car` is in the model; clicking the new node returned `{kind: selection, id: n3}`. |
| 5 Highlight the new node, verify | Pass (limitation D2) | Callout text read back; `2-new-node-highlight.png` shows the callout and spotlight frame. |
| 6 The user presses Esc | Pass | The highlight is cleared (metrics). |

Counts: Pass 6, Fail 0.

## Defects and observations

- **D1 (fixed): the screenshot did not show the highlight.** The PNG is the export window (drawing plus toolbar, palette, properties
  re-drawn from the live DOM) and left out the tutor overlay, so an agent could not verify a highlight by screenshot. The overlay
  (`tutor-spotlight`, `tutor-callout`) is now copied into the window export (`src/webview/diagram/main.ts`, `windowSvg`).
- **D2 (fixed): the overlay was at its live-window position, not the export's.** For a node highlight the frame and callout are now
  placed from the node's diagram bounds through the export transform (`export-map.ts`); `2-new-node-highlight.png` shows the frame
  around the node and the callout beside it.
- **O1: placing an element is not itself a `wait_for_user` event.** After a palette placement the wait timed out (8 s); only the
  following click on the node was reported as a selection. In the test the placement came through the test API, so a real mouse
  placement may differ; the tutor should confirm placement by reading the model rather than waiting on an event.
- **O2: agent-action grace.** User events within 1.5 s of an agent tool call are ignored (by design); the simulated user waits longer.
