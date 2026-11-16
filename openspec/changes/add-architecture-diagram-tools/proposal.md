## Why

The gap analysis against a leading commercial modelling tool (`docs/reference/cameo-gaps/diagramming.md`, requirements CAM-DGM-007, 009, 011, 041, 034, 019, 047, 045, 025, 003) lists ten diagram gaps that most limit capturing a system architecture: showing and hiding parts, pulling in related elements, copy and paste, alignment, compartment control, legends, aspects, image export, more relationship kinds, and back/forward navigation. The ratings were not checked against code, so discovery came first.

## Discovery: what already exists

Searched `src/` for each item.

| Item | Found | Decision |
|---|---|---|
| 045 saveImage | `renderer.toSvgString` and `exportPng` in `src/webview/diagram/main.ts`, driven by the host message `exportPng` and used only by agent tool `sysml_read_diagram` (`includeImage`, PNG, light theme, 1600 px). No user command, no SVG file, no clipboard. | Shrunk: reuse the existing renderer path; add user commands and SVG. No new renderer. |
| 025 createRelationship | Tools exist for connection, succession, transition, flow, message, satisfy, verify, derivation (`palette.ts` `CONNECT_TOOLS`, `relations.ts`). No specialization, dependency, allocation, binding. | Shrunk: add specialization and dependency only. |
| 007, 009 | Nodes are added by Add to Diagram and Show in Diagram (`commands.ts`); no show/hide of members, no related-element query. | Kept. |
| 011, 041, 034, 019, 047, 003 | No clipboard, align, compartment, legend, aspect, or navigation-history code found. | Kept. |

Dropped: none outright. Item 011 loses its "image to clipboard" half, which moves to 045.

## What Changes

- Show/Hide Parts and Ports on a selected node (007), a layout edit.
- Display Related Elements with a relation-kind pick (009), a layout edit.
- Copy and paste of node references between diagrams (011), a layout edit; no model copy.
- Align and distribute commands for selected nodes (041).
- Per-node compartment show/hide, held in diagram style (034).
- An on-canvas legend generated from the kinds drawn (019).
- Named aspects: saved visible subsets of a diagram (047).
- Save Diagram as Image (PNG or SVG) and Copy as Image user commands (045); agent tool gains `format`.
- Specialization and dependency relationship tools, as model edits (025).
- Back and Forward through diagrams opened in the same tab (003).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `diagram-editor`: items 007, 009, 011, 041, 034, 019, 047, 025, 003 (interaction and style).
- `diagram-files`: legend, compartment and aspect data in the `.sysmld` style; image export files (045).
- `agent-integration`: `sysml_read_diagram` image format; tools for related elements and aspects.

## Impact

- `src/diagram/` (protocol, format, palette, relations, commands), `src/webview/diagram/`, `src/edit/` (relationship ops), `src/agent-tools/diagram-tools.ts`, `package.json` commands.
- `.sysmld` format gains optional style keys only; older files still load.
- Depends on `fix-diagram-editing` and `add-diagram-authoring`.
