## 1. Gate and setting

- [x] 1.1 Add setting `sysml.agent.tutor` (application scope, default off) and the tutor tool class in `ui-support.ts`; unit tests for tutor-on/control-off, workspace override, untrusted, audit line (D62, D69)

## 2. Highlight

- [x] 2.1 Add `UiDriver.highlight` and `sysml_ui_highlight` handler with target resolution, text truncation and chrome descriptions; unit tests with a fake driver (D63, D64, D66)
- [x] 2.2 Webview overlay (spotlight, callout, close button, Esc, clear on target loss) in the diagram and requirements webviews; unit tests for plain-text rendering and clearing (D63, D65)

## 3. Wait for user

- [x] 3.1 User-event queue in the driver excluding agent actions; `sysml_ui_wait_for_user` with timeout; unit tests (D67)
- [x] 3.2 Register both tools in the MCP manifest and as LM tools in `package.json`; manifest tests; allow `sysml_ui_state` and `sysml_ui_screenshot` under the tutor gate

## 4. Walkthroughs

- [x] 4.1 Add the "First steps" and "Diagram basics" walkthroughs with command completion events and media text (D68); test that each completion command exists

## 5. Integration tests

- [x] 5.1 Through MCP and LM: tutor-only refusals of control tools, untrusted refusal, audit log
- [x] 5.2 Highlight in diagram and requirements webviews, Esc and close button dismissal, target-loss clearing, chrome target description
- [x] 5.3 `wait_for_user` returns a simulated user gesture, a command and a timeout, and ignores agent actions

## 6. Docs and acceptance

- [x] 6.1 Document the tools, setting and walkthroughs in `docs/agents.md`
- [x] 6.2 Final agent-run tutoring check: an agent tutors one scenario (create a diagram and place an element), verifying each highlight by `sysml_ui_screenshot`; record the result beside the earlier acceptance results
