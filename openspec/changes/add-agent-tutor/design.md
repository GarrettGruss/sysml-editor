## Context

`add-agent-ui-testing` (D53 to D61) gave agents a `UiDriver`, shared gestures (`src/ui-gestures.ts`), a driver in `src/agent-ui-driver.ts`, tools in `src/agent-tools/ui-*.ts`, and an audit channel. The tutor reuses them. Decisions continue after D61.

## Goals / Non-Goals

**Goals:** point at UI and observe the user; safe to enable without control; learnable by walkthrough.
**Non-Goals:** the agent acting for the user; overlays on VS Code chrome; a second renderer; standalone mode.

## Decisions

### D62: Separate tutor setting, display and observe only
`sysml.agent.tutor` is application scope, default off, and enables only highlight, wait, `sysml_ui_state` and `sysml_ui_screenshot`. The gate in `ui-support.ts` takes a tool class (control or tutor); tutor tools pass on either setting, control tools need `sysml.agent.uiControl`. Both need a trusted workspace. Alternative: reuse `uiControl`; rejected, since a tutor must not grant control.

### D63: Overlay lives in the webview, driven by postMessage
The host sends `highlight {target, text}` and `clearHighlights`; the webview resolves the target with the same selectors and node ids as the gesture hooks, and draws a dimmed spotlight (pointer-events none) plus callout. Targets resolve in the webview, so the handler needs no `vscode`. Handlers go through a new `UiDriver.highlight`. Alternative: draw from the host; rejected, there is no host-side overlay and rendering stays in webviews.

### D64: VS Code chrome gets reveal and description
No API can draw over tree buttons, title bar or Command Palette. The driver reveals and focuses the view (or opens the palette with the command filter) and the handler returns a fixed description string per known target, stating no overlay was drawn. Alternative: screen-level overlay; rejected as not portable.

### D65: Dismissal
Esc (in the webview) and the callout close button clear highlights. A MutationObserver and the existing state refresh check targets; a missing target clears its highlight. Highlights are never persisted and do not dirty a diagram.

### D66: Plain-text callouts
Callout text is set with `textContent`, truncated to 280 characters host-side and in the webview. No HTML, links or images.

### D67: wait_for_user is a filtered event stream
The driver records user events (webview gestures posted by the user, `sysml.*` commands executed, selection and dirty changes) in a bounded queue, tagged by an agent-in-flight counter (as D57) so agent actions are excluded. `wait_for_user` resolves on the first event or timeout and takes no action arguments. Alternative: poll `sysml_ui_state`; rejected, it cannot tell the user's actions from the agent's.

### D68: Walkthroughs by command completion
`contributes.walkthroughs` with steps using `completionEvents: ["onCommand:<id>"]` for the existing commands (new file, new diagram, add requirement; diagram basics steps). No new commands unless one is missing.

### D69: Audit
Tutor calls log to the same "SysML Agent UI" channel before running (as D60), text truncated.

## Risks / Trade-offs

- Spotlight could mislead if the layout moves; mitigated by clearing on target loss and re-measuring on resize.
- User-event capture could leak content; events carry kinds and ids only, no text values.

## Open Questions

- Should highlights be allowed in a diagram that is not the active editor (it would be revealed first)?
