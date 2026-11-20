---
name: sysml-ui-testing
description: Drive and test the SysML Editor's real UI (commands, diagram gestures, requirements editor, model tree, prompts, screenshots) through the sysml_ui_* tools and record acceptance results. Use when the user asks to test, exercise or acceptance-check the editor as a user would.
---

# Testing the SysML Editor UI

## Alpha software: report what you find

The SysML Editor is in alpha. Expect gaps: SysML constructs it does not parse or draw, layouts that read badly, tools that refuse or return less than you need. Do not silently work around a deficiency. When you notice one, raise it as a GitHub issue on https://github.com/GarrettGruss/sysml-editor:

1. Search first (`gh issue list --repo GarrettGruss/sysml-editor --search "<words>"`); add a comment to a matching issue instead of opening a duplicate.
2. Tell the user what you plan to file and get their go-ahead, since an issue is public.
3. Title it `fix(<area>): …` or `feat(<area>): …`. In the body give the editor version, the current behavior, the expected behavior, and a minimal example: a small `.sysml` file and, for diagrams, the `.sysmld` file, plus the steps to see it.
4. File with `gh issue create --repo GarrettGruss/sysml-editor`, then give the user the issue link and carry on with the task.

## Enable

The seven UI tools are off by default. The user must set `sysml.agent.uiControl` to true in their **user** settings (a value in `.vscode/settings.json` is ignored). The workspace must be trusted; an untrusted workspace is refused. When off, every UI tool refuses and names the setting, and `sysml_ui_state` answers `enabled: false`. Ask the user to turn it on; do not try to edit settings yourself.

## Tools

- `sysml_ui_command`: an allowlisted command (any `sysml.*`, undo, redo, save, save all, back, forward). Returns when it finishes or opens a prompt.
- `sysml_ui_answer`: answer an open prompt (`pick`, `picks`, `text`, `confirm`, `path`, `cancel`). Delete commands still ask for confirmation; answer it explicitly. Unanswered prompts time out as cancelled.
- `sysml_ui_diagram`: replay a gesture in a diagram (`path` plus `gesture`: select, drag, key, contextmenu, menuItem, palette, connect, inline, ...). The result lists selection, menu labels, node boxes, legend and clipboard.
- `sysml_ui_requirements`: open a view (table, matrix, document), click, input, drag, export, observe, by `package` or `file`.
- `sysml_ui_tree`: list, select one node, collapse all, run the commands a node offers.
- `sysml_ui_state`: active editor, dirty flag, selections, open menus, undo/redo labels, user messages (drained on read), open prompts, navigation history.
- `sysml_ui_screenshot`: PNG of one diagram or requirements webview only.

## Workflow per scenario

1. Prepare the model with the write tools (`sysml_create_element`, `sysml_create_relationship`, ...).
2. Act through the UI tools. If a result lists a prompt, answer it with `sysml_ui_answer`.
3. Verify twice: UI side with `sysml_ui_state` and `sysml_ui_screenshot` (view each image), model side with `sysml_get_element` or `sysml_read_diagram`.
4. Check the text of the SysML, not only the picture.

## Record results

Write a results file like `docs/reference/cameo-acceptance/diagramming-results-v0.3.0-agent.md`: method (VS Code version, settings, tools used), model used, a table of scenario, verdict (Pass, Fail, Not agent-testable) and evidence (the exact gesture or command and what was observed, screenshot name), counts, then numbered defects (D1, D2) with severity, repro steps and expected behaviour. Save screenshots in a `shots-...` folder beside it.
