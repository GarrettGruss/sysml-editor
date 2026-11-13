## Why

The model tree has no New File, New Folder, Refresh, or Collapse All buttons. The Explorer has them, and users expect them.

## What Changes

- Title bar buttons in this order: New File, New Folder, Refresh, Collapse All; Change View stays, and Clear Search appears while a search is active.
- New File and New Folder add a live placeholder row and name it through an input box at the top.

## Capabilities

### Modified Capabilities
- `model-tree-view`: title bar actions and the placeholder row.

## Impact

- Eighth change in order; depends on `add-model-foundation`.
- Files and folders are not model edits; they are workspace changes written on confirm.
