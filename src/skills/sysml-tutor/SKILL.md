---
name: sysml-tutor
description: Teach a user to use the SysML Editor by highlighting things in the editor and waiting for them to act (sysml_ui_highlight, sysml_ui_wait_for_user). Use when the user wants to be guided or taught step by step, or asks how to do something in the diagram or requirements editor or the Model view.
---

# Tutoring in the SysML Editor

## Alpha software: report what you find

The SysML Editor is in alpha. Expect gaps: SysML constructs it does not parse or draw, layouts that read badly, tools that refuse or return less than you need. Do not silently work around a deficiency. When you notice one, raise it as a GitHub issue on https://github.com/GarrettGruss/sysml-editor:

1. Search first (`gh issue list --repo GarrettGruss/sysml-editor --search "<words>"`); add a comment to a matching issue instead of opening a duplicate.
2. Tell the user what you plan to file and get their go-ahead, since an issue is public.
3. Title it `fix(<area>): …` or `feat(<area>): …`. In the body give the editor version, the current behavior, the expected behavior, and a minimal example: a small `.sysml` file and, for diagrams, the `.sysmld` file, plus the steps to see it.
4. File with `gh issue create --repo GarrettGruss/sysml-editor`, then give the user the issue link and carry on with the task.

## Enable

The tutor tools only display and observe; they never change the model. They need the user setting `sysml.agent.tutor` (user settings only; `.vscode/settings.json` is ignored) or `sysml.agent.uiControl`, and a trusted workspace. With only the tutor setting, `sysml_ui_state` and `sysml_ui_screenshot` also work. Ask the user to enable it.

## Loop

1. **Highlight**: `sysml_ui_highlight` with a callout (plain text, at most 280 characters, one instruction). Targets: in a diagram `path` plus `node` or `selector`; in a requirements editor `package` or `file` plus `selector`. A new highlight replaces the last.
2. **Wait**: `sysml_ui_wait_for_user` (default 60 s, at most 300). It reports `{ event: { kind, id? } }` with kind `command`, `selection`, `editor` or `gesture`, or `{ event: null, timedOut: true }`. It never reports text the user typed.
3. **Verify**: do not trust the event alone. Palette placements may not be reported, so confirm by reading the model (`sysml_get_element`, `sysml_read_diagram`) or `sysml_ui_state`. Then praise or correct, and go to the next step.

On a timeout, ask if they need help or re-highlight with a simpler hint.

## Rules

- VS Code's own screen cannot be drawn on. For the Model view, its New File and New Folder buttons and the Command Palette use `chrome` (`modelTree`, `treeNewFile`, `treeNewFolder`, `commandPalette` with an optional `command`). The result has `highlighted: false` and a `description` of where the target is; pass it on to the user in words.
- To check a highlight landed where you meant, take `sysml_ui_screenshot` of the diagram: the frame and callout are drawn in it around the target.
- Your own actions are never reported as user events. User events in the 1.5 s after one of your actions are also dropped, so a very quick user action can be missed; on a timeout, verify the model before re-prompting.
- The user dismisses a highlight with Esc or the close button; it also clears when its target disappears. If it vanished, do not assume the step was done; verify.
- Do the step yourself only when asked. Teaching means the user acts.
- Keep callouts short and concrete; put longer explanations in your chat message.

## Walkthroughs

Two walkthroughs on the Welcome page (Get Started) cover the basics without an agent: **SysML: First Steps** (Model view, creating a file, requirements editor) and **SysML: Diagram Basics** (creating a diagram, placing an element, connecting, saving). Suggest them for absolute beginners and build on them.
