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

Canvas library: maxGraph (the maintained TypeScript successor of mxGraph, the library behind draw.io; Apache 2.0) is preferred because it provides selection, drag, resize, connection drawing, nested cells, and connection points on borders. It is confirmed by a spike (task 2.1) covering nested parts with border ports, its maintenance status, and how its undo interacts with D6; Eclipse Sprotty and a hand-built SVG canvas are the fallbacks. Requirements editor is a React table (no extra lib). Bundled by esbuild into `dist/webview/*.js`.

### D12: Image output
`read_diagram` with `includeImage` asks the diagram webview to render and return a PNG (SVG drawn to a canvas, exported as PNG). If the diagram is open, its webview is used; otherwise the extension renders it in a webview kept out of the user's way (a background panel that does not take focus), then disposes it. Whether VS Code allows a fully hidden webview is confirmed in task 4.2. Image width is capped (default 1600 px) to bound token cost. Agent images use a fixed light theme without editor chrome (no grid, palette, or selection), so output does not depend on the user's theme (see docs/mockups/agent-diagram-image.html).

## Risks / Trade-offs

- [maxGraph is pre-1.0 and community-maintained] → Spike before committing (task 2.1); notation shapes are kept behind our own interface so the canvas library can be replaced.
- [Rendering an unopened diagram needs a webview, which may be briefly visible] → Background panel without focus; confirm in task 4.2; fall back to returning the JSON description with a note that the image needs the diagram open.
- [Rename detection guesses wrong] → Applied only when exactly one candidate matches kind, type, and owner; otherwise the reference becomes an unresolved placeholder.
- [`LanguageModelDataPart` image support depends on the consuming model] → The JSON description is always returned, so agents without vision still work.
- [An agent's change to an open diagram is lost if the user closes it without saving] → Same as a person's layout change; VS Code prompts to save on close.
