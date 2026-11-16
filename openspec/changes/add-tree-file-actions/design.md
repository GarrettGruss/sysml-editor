# Design

## Context

The tree is a native VS Code TreeView. The API cannot put an editable row in it, so inline naming as in the Explorer is not possible. Decisions continue after D42.

## Goals / Non-Goals

**Goals:**
- Explorer-like title bar actions.
- Naming with a live placeholder row.

**Non-Goals:**
- A webview tree (option c) and a hand-off to the Explorer (option b).

## Decisions

### D43: Input box with a live placeholder
New File and New Folder add a placeholder tree item in the target folder, revealed and selected. It is a tree item only; nothing is on disk. An input box (`window.createInputBox`) opens at the top. On every change (`onDidChangeValue`) the placeholder label updates through a targeted refresh. Validation shows in the input box: duplicate name, invalid characters, and `.sysml` appended if missing. Enter creates the file or folder, replaces the placeholder with the real node, and opens a new file in the text editor. Escape or hiding without accept removes the placeholder.

### D44: Target and order
The target is the selected folder, the folder of the selected file or element, or else the workspace root. The placeholder stays first among the folder's files or subfolders while typing, then is sorted into place when created.

### D45: Built-in buttons
Collapse All uses the TreeView's `showCollapseAll`. Refresh does a full rescan.

## Risks / Trade-offs

- The label update on each keystroke may flicker; a targeted refresh of one row limits it.

## Open Questions

- Option (a) was chosen by the user.
- Whether Change View and Clear Search go before or in the overflow menu is undecided; default: before the overflow menu.
