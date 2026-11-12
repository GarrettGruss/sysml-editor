# Design

## Context

This is change 2 of 4 for the VS Code SysML v2 editor: `add-model-foundation`, `add-diagram-viewing`, `add-model-editing`, `add-requirements-editor`, implemented in that order. The feasibility analysis behind the split is in the [trade study](../../../docs/trade-study.md) and UI mockups are in [docs/mockups](../../../docs/mockups/index.html).

This change builds on the parser, model index, model tree, and agent channels from `add-model-foundation`. It adds diagram files and a diagram editor that changes layout only; nothing here edits SysML text.

## Goals / Non-Goals

**Goals:**
- Diagram files that hold view state only, survive model edits, and diff cleanly.
- One renderer for the editor and for agent images.
- Agents can read diagrams as JSON and PNG and can generate and arrange diagrams.

**Non-Goals:**
- Changing the model from a diagram: palette, delete from model, rename, and property editing are in `add-model-editing`.
- Action flow, state transition, and sequence views.
- A renderer outside the webview, or images without VS Code running.
- Deferred: opening the language's own `view` usages as diagrams, diagram diff and merge support, migration of old diagram file versions, copy and paste, alignment, search, a minimap, image export for people, and screen-reader access to diagram content (the model tree is the accessible alternative).

## Decisions

Decision numbers are shared across the four changes that make up the editor, so they are not consecutive here.

### D3: Element identity — qualified name, structural locator, rename detection
The SysML v2 textual notation has no element ID, so diagram references cannot rely on one.
- **Named elements** are referenced by fully qualified name (readable, diff-friendly).
- **Unnamed elements** (`connect`, `bind`, `satisfy`, unnamed flows; roughly 6 in 10 connections in the fixtures) are referenced by a structural locator: owner qualified name, element kind, and endpoint qualified names, with a position among identical siblings only as a tie-breaker.
- **Renames typed in the text editor** are detected: when a reference stops resolving and exactly one new element of the same kind and type appears under the same owner, the reference is updated. Anything less certain becomes an unresolved placeholder with "Re-link…".
- **Renames made through the extension** update all `.sysmld` references in the same edit (add-model-editing).

Alternative: write IDs into the text as short names or metadata — rejected as the default because it changes the user's source for every element shown on a diagram; possible later as an opt-in.

### D5: Diagram file format
`.sysmld` JSON:
```json
{ "version": 1, "kind": "general", "root": "VehicleModel::Vehicle",
  "sources": ["model/vehicle.sysml"],
  "nodes": [{ "id": "n1", "ref": "VehicleModel::Vehicle::engine",
              "x": 40, "y": 80, "w": 160, "h": 60, "collapsed": false, "parent": "n0" }],
  "edges": [{ "id": "e1", "locator": { "owner": "VehicleModel::Vehicle", "kind": "connection", "ends": ["engine.drive", "transmission.input"] }, "source": "n1", "target": "n2", "points": [] }],
  "style": {} }
```
Serialized with sorted keys and nodes sorted by `id`, 2-space indentation, trailing newline. Edited via `CustomEditorProvider` with `CustomDocument` (we implement our own edit stack so a combined "model + diagram" operation is one undo entry).

### D7: Rendering — one renderer, in the webview
Diagrams are laid out and drawn only in the diagram webview, which is a real browser. The same renderer serves the editor and agent images (D12), so there is one implementation of the SysML notation (compartmented boxes, guillemet keywords, border ports, edge styles) and text is measured by the browser. Layout uses elkjs in the webview and places only nodes that lack positions.

Canvas library (decided in task 2.1): a hand-built SVG renderer, with elkjs for layout. The SysML notation sits behind our own interface (`src/webview/diagram/renderer.ts`: `render`, `getMetrics`, `toSvgString`), so a library can still replace it. The notation is drawn by pure functions that return an SVG string (`svg.ts`), used for the live view (colours from CSS classes bound to VS Code theme variables) and for exports (fixed light palette as attributes); pan and zoom use pointer and wheel events. Requirements editor is a React table (no extra lib). Bundled by esbuild into `dist/webview/diagram.js` (1.5 MB, almost all of it elkjs).

Spike findings. maxGraph was evaluated first: `@maxgraph/core` 0.25.1 (released 2026-10-21; Apache-2.0; 7.2 MB unpacked; still 0.x, so pre-1.0). The spike was limited to what could be checked on the development machine (no VS Code and no rendering of maxGraph output was possible): tree-shaken to `Graph` it bundles to about 400 KB for the browser, contains one `eval(` call and uses `setAttribute("style", ...)` and the CSSOM extensively. It would therefore need an audit against the strict CSP (no `unsafe-eval`; inline `style` attributes are blocked by a `style-src` without `unsafe-inline`), and its own undo manager duplicates the custom editor's edit stack (D6). Nested cells with ports on a container's border, compartmented shapes and the SysML edge ends would all be custom code on top of it, and none of that could be viewed in a CI-only feedback loop. The hand-built renderer needs about 300 lines for the notation, has no CSP exposure (plain SVG elements and presentation attributes; verified in headless Chromium under `default-src 'none'; script-src 'nonce-...'; style-src` for the bundle: no errors, layout, metrics and PNG export work), keeps selection and undo entirely in our own code, and has no pre-1.0 dependency. What it gives up is maxGraph's ready-made selection handles, drag, resize and connection drawing; tasks 2.5 to 2.7 implement those on top of pointer events. Revisit if that work proves larger than adopting a library.

Layout: elkjs 0.12.1 (released 2026-10-28; EPL-2.0 OR GPL-3.0-or-later; the bundled non-worker build, which uses neither `eval` nor `new Function`). Layout runs one container level at a time, bottom-up: nodes with stored positions stay put, the others at that level are laid out by ELK (layered when they have edges, rectangle packing otherwise) and placed beside the stored ones; containers size to fit their children; ports are placed by our own code on the border side that faces what they connect to. Stored coordinates are relative to the parent node (ports: to their owner).

### D12: Image output
`read_diagram` with `includeImage` asks the diagram webview to render and return a PNG (SVG drawn to a canvas, exported as PNG). If the diagram is open, its webview is used; otherwise the extension renders it in a webview kept out of the user's way (a background panel that does not take focus), then disposes it. Whether VS Code allows a fully hidden webview is confirmed in task 4.2. Image width is capped (default 1600 px) to bound token cost. Agent images use a fixed light theme without editor chrome (no grid, palette, or selection), so output does not depend on the user's theme (see docs/mockups/agent-diagram-image.html).

## Risks / Trade-offs

- [Hand-built canvas must grow selection, drag and resize] → Kept behind our own renderer interface; the spike (task 2.1) found maxGraph no cheaper under the CSP and CI-only feedback; revisit at task 2.5.
- [Rendering an unopened diagram needs a webview, which may be briefly visible] → Background panel without focus; confirm in task 4.2; fall back to returning the JSON description with a note that the image needs the diagram open.
- [Rename detection guesses wrong] → Applied only when exactly one candidate matches kind, type, and owner; otherwise the reference becomes an unresolved placeholder.
- [`LanguageModelDataPart` image support depends on the consuming model] → The JSON description is always returned, so agents without vision still work.
- [An agent's change to an open diagram is lost if the user closes it without saving] → Same as a person's layout change; VS Code prompts to save on close.
