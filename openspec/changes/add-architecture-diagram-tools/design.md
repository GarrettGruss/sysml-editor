## Context

Adds architecture-oriented diagram tools to the editor. It depends on `fix-diagram-editing` and `add-diagram-authoring`. Decisions continue after D45. Discovery results are in the proposal.

## Goals / Non-Goals

**Goals:**
- Every feature states whether it is a model edit (saved at once) or a layout edit (held until diagram save).
- Reuse the existing renderer and export path; no second renderer.

**Non-Goals:**
- Legend filtering, layout templates, print, grid, route styling.
- Copying model elements.

## Decisions

### D46: Member and related display are layout edits
Show/Hide Parts and Ports and Display Related Elements add or remove nodes and lines only. The related query is a pure function over the model index, with no `vscode` import. Inherited members are listed but never edited from a usage (D18).

### D47: Clipboard holds references
Copy stores element references and line references in a host-side clipboard shared by open diagrams, not model text.

### D48: Align acts on layout only
Align and distribute run in the webview on node boxes, one undo step, and are layout edits.

### D49: Compartments, legend and aspects are diagram style
Stored as optional `style` keys in the `.sysmld` file, kept in memory until diagram save. Hidden compartments feed node sizing in layout. The legend is drawn by the webview renderer from the kinds drawn, and is part of `toSvgString`.

### D50: Image export reuses the renderer
User commands ask the webview for SVG or PNG through the existing `exportPng` path, extended with an SVG request; the host writes the file or clipboard. The agent tool gains `format`.

### D51: Specialization and dependency are edit-planner operations
Added beside the existing relationship operations in `src/edit/`, with kind, cycle and inherited-source checks; lines come from `relations.ts`.

### D52: Navigation history is per tab, in memory
The host keeps a stack per editor group tab; Back and Forward reopen in the same tab. It is not persisted.

## Risks / Trade-offs

- Clipboard images need webview clipboard permission; fall back to save-to-file.
- Aspect nodes that later vanish from the model are ignored, not errors.

## Open Questions

- "Aspects": smallest meaning chosen is a named visible subset of nodes; no property-based rules.
- "Legends": an automatic key of kinds drawn; user-defined legends and filtering by legend item are out.
- 025 adds only specialization and dependency; allocation and binding are left for later.
- 007 and 009 may share one dialog; kept as two commands.
