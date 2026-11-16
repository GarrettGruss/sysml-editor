## Why

The review asked for a requirements editor that reads like a document, follows SysML ownership, adds and moves items with a ghost, and replaces the table with a verification matrix.

## What Changes

- Document layout as the default view, reusing the existing document view if it can show plain packages.
- Hierarchy by ownership with computed numbering, collapse, and TOC entries.
- Right-click palette with ghost and live gaps; drag to reorder and nest; Move up and Move down.
- A verification matrix replaces the table: satisfied by, verification method, verified by, status, coverage summary, filters, CSV and Markdown export, and an agent read tool.
- Inheritance-aware status, a trace line, and layout fixes for the old table (defect 7).

## Capabilities

### Modified Capabilities
- `requirements-editor`: document default, hierarchy, ghost, reorder, matrix.
- `agent-integration`: `sysml_read_verification_matrix`.

## Impact

- Seventh change in order; depends on `fix-diagram-editing` and on `add-requirements-editor`.
- All model gestures are model edits saved at once (D21); the requirements editor has no layout.
