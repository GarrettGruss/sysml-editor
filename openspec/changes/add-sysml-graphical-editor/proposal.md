## Why

SysML v2 is text-first (`.sysml`), but systems engineers work largely through diagrams, hierarchy browsers, and requirement tables. No VS Code–native tool lets them browse a SysML v2 model, edit it graphically, and keep the textual source as the single source of truth. This change defines the requirements for that editor.

## What Changes

- New VS Code extension that loads SysML v2 textual models (`.sysml`) from the workspace.
- A native VS Code TreeView (`TreeDataProvider`) showing the model's ownership hierarchy (packages, part/port/action/requirement definitions and usages, etc.), with reveal-in-source and context-menu actions.
- A graphical editor (webview custom editor) for visually editing diagrams: placing, moving, resizing, connecting, adding, and deleting elements.
- A requirements editing GUI with two views: a table view (id, name, documentation text, satisfy/verify relationships) and a document view that renders a package as a specification document (title, generated TOC, numbered sections, prose, requirement items, appendices). Document structure is expressed in SysML v2 itself (packages, comments, and metadata from a shipped library), so no separate document file exists.
- A separate diagram file format (`*.sysmld`) that stores layout and view state only (positions, sizes, routing, visibility, styling) and references SysML elements by qualified name, never duplicating model semantics.
- Bidirectional synchronization: adding/deleting/renaming/connecting elements on a diagram produces the matching textual edit in the linked `.sysml` file (as an undoable workspace edit), and external text edits are reflected in open diagrams and the tree.
- AI-native: one agent tool set, exposed through two equally supported channels (a harness-agnostic MCP server and VS Code Language Model Tools), lets any agent read the model, read diagrams (structured JSON plus a rendered PNG), generate diagrams, and edit diagrams and the model under the same rules as the GUI. Agent edits apply directly and are undoable.
- The official SysML v2 release models in `fixtures/` are used as parse/round-trip test fixtures.

## Capabilities

### New Capabilities
- `model-tree-view`: Native VS Code tree showing the SysML v2 element hierarchy of workspace models, with navigation and element actions.
- `diagram-files`: Format, lifecycle, and element-reference rules for diagram files that hold view state separately from SysML elements.
- `diagram-editor`: Visual editing GUI for diagrams: rendering elements and relationships, layout manipulation, adding and deleting elements.
- `requirements-editor`: GUI for viewing and editing SysML v2 requirements and their relationships, as a table or as a structured document.
- `model-synchronization`: Rules by which GUI edits translate to SysML v2 text changes and text changes propagate back to views.
- `agent-integration`: Agent tool set, exposed over MCP and VS Code Language Model Tools, through which AI agents read, generate, and edit models and diagrams, including image rendering and undo.

### Modified Capabilities
None (no existing specs).

## Impact

- New code: VS Code-independent core library (SysML v2 parser/model layer, text-edit generator, diagram layout and SVG/PNG rendering), VS Code extension host (TypeScript, Node toolchain: npm, esbuild, Vitest), webview UI bundle, a shared agent tool layer, a standalone MCP server, and Language Model Tools registration in the extension.
- Toolchain moves from Bun to Node (npm, esbuild, Vitest, `tsc`); `bun.lock` is replaced by `package-lock.json`.
- New dependencies: `@types/vscode`, `esbuild`, `vitest`, `typescript`, `@vscode/vsce` packaging, a SysML v2 parser, a layout engine and rasterizer, and the MCP TypeScript SDK (see design.md).
- `package.json` becomes an extension manifest (contributes views, commands, custom editors, languages).
- Out of scope for this change: full SysML v2 semantic validation, simulation/analysis execution, SysML v2 API (server) repository integration, collaborative editing.
