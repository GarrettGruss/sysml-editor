# Tasks

## 1. Extension scaffolding

- [ ] 1.0 Migrate the toolchain from Bun to Node: remove `bun.lock` and `@types/bun`, add `@types/node`, `typescript`, `esbuild`, `vitest`, set `engines.node` to `>=22`, replace `index.ts` stub, and update README.md to Node instructions (CLAUDE.md is already updated); verify `npm install` produces `package-lock.json` and no `bun`/`Bun.` references remain outside `fixtures/` and `openspec/changes/archive/`
- [ ] 1.1 Convert `package.json` into a VS Code extension manifest (engines, activationEvents, `contributes.languages` for `sysml`, `contributes.views` for SysML Model view, `contributes.customEditors` for `*.sysmld`) and add `@types/vscode`, `@vscode/vsce`, `@vscode/test-electron`; verify `npm install` succeeds and `npm run typecheck` (`tsc --noEmit`) passes
- [ ] 1.2 Add `src/extension.ts` activate/deactivate stub and esbuild scripts for the host (node/cjs, external vscode), MCP server, and webviews (browser); verify `npm run build` emits `dist/extension.js` and the extension activates in an Extension Development Host
- [ ] 1.3 Set up Vitest (`npm test`) for pure modules and an integration test harness with `@vscode/test-electron`; verify a smoke test of each passes

## 2. SysML parser and model index

- [ ] 2.1 Evaluate reusing an existing TypeScript SysML v2 parser (e.g. `sysml-2ls`) vs. a new Langium grammar against D2 criteria (license, CST offsets, coverage); record the decision in design.md
- [ ] 2.2 Implement the grammar/parser for the construct subset in D2 with CST ranges; verify unit tests parse each construct and fixtures in `fixtures/sysml-v2-release/sysml/src/examples` parse without crashes, reporting the error rate
- [ ] 2.3 Implement `ModelIndex` (per-document parse, qualified-name index, ownership tree, elementId lookup, change events, debounced incremental re-parse); verify unit tests for QN resolution and change events
- [ ] 2.4 Load `sysml.library` read-only for type resolution; verify typed usages resolve to library definitions in tests
- [ ] 2.5 Keep last-good model on parse errors and expose per-file error state; verify unit test per model-synchronization "Behavior with parse errors"

## 3. Edit planner (model-synchronization)

- [ ] 3.1 Implement insert-member plan (body creation from `;`, indentation from siblings); verify round-trip tests: re-parse succeeds and unrelated text is byte-identical
- [ ] 3.2 Implement delete-element plan (full range, leading doc, trailing line); verify round-trip tests including nested bodies
- [ ] 3.3 Implement rename (declaration + workspace references) and retype/multiplicity/doc edits; verify unit tests per "Rename refactoring" scenario
- [ ] 3.4 Implement relationship plans (connect, satisfy, verify, derive); verify generated text parses and resolves endpoints
- [ ] 3.5 Implement `RenameService` that also rewrites `.sysmld` references in one WorkspaceEdit; verify test with two diagrams referencing a renamed definition
- [ ] 3.6 Refuse edits on files with parse errors with a message linking to the error; verify unit test

## 4. Model tree view

- [ ] 4.1 Implement `TreeDataProvider` with labels, kind icons, type descriptions, lazy children, and welcome view; verify integration test against a fixture workspace
- [ ] 4.2 Wire ModelIndex change events to targeted refresh preserving expansion; verify test that editing text updates the tree within 1 s
- [ ] 4.3 Add commands: Go to Definition, Show in Diagram, Add Child, Rename, Delete (with confirm), Add to Active Diagram, New Diagram…; verify integration tests for each and document commands in README
- [ ] 4.4 Implement selection sync (diagram/text → tree) behind a setting; verify integration test

## 5. Diagram files

- [ ] 5.1 Define `.sysmld` schema (D5) with versioned deterministic serializer/parser; verify unit test that open+save is byte-identical
- [ ] 5.2 Implement `CustomEditorProvider` + `CustomDocument` with dirty/save/revert/backup and custom edit stack; verify integration test for save/revert
- [ ] 5.3 Implement reference resolution with unresolved placeholders and "Remove"/"Re-link…" actions; verify test with externally deleted element
- [ ] 5.4 Implement New Diagram creation pre-populated from a root element; verify test produces a valid file showing direct members
- [ ] 5.5 Publish the `.sysmld` JSON Schema and document the format in `docs/diagram-format.md`; verify all test diagrams validate against the schema
- [ ] 5.6 Implement core auto-layout (elkjs) that places only unpositioned nodes; verify unit test that a coordinate-free diagram gets positions and positioned nodes don't move
- [ ] 5.7 Implement core SVG notation renderer (compartments, guillemet keywords, border ports, edge styles) for General, Interconnection, and Requirements views; verify snapshot tests on fixture diagrams

## 6. Diagram editor GUI

- [ ] 6.1 Build webview shell (React, theme variables, message protocol types shared with host); verify it renders in light/dark/high-contrast
- [ ] 6.2 Build the interactive diagram canvas on the core shape renderer (D7) with nested nodes, compartments, border ports, edges; verify General and Interconnection views of a fixture model render and match core SVG snapshots
- [ ] 6.3 Implement select/move/resize/pan/zoom/auto-layout writing only to the diagram document; verify test that `.sysml` is untouched
- [ ] 6.4 Implement palette per diagram kind creating model elements + nodes as one undo step (D6); verify integration tests for "Add part" and "Add connection" scenarios, including undo
- [ ] 6.5 Implement drag from tree and "Show element" picker; verify only the diagram changes
- [ ] 6.6 Implement "Remove from Diagram" (Delete key) vs "Delete from Model" (confirm) ; verify integration tests for both scenarios
- [ ] 6.7 Implement inline rename and properties panel (name, short name, type, multiplicity, doc); verify the "Change type" scenario
- [ ] 6.8 Implement Requirements View diagram kind (satisfy/verify/derive edges); verify rendering test

## 7. Requirements editor

- [ ] 7.1 Implement requirements table webview scoped to a package/file; verify it lists requirements of a fixture package
- [ ] 7.2 Implement edit of id/name/doc, add and delete requirement; verify text results match spec scenarios
- [ ] 7.3 Implement relationship view/add/remove (satisfy/verify/derive); verify "Add satisfy" scenario
- [ ] 7.4 Implement navigation (tree/text/diagram) and live refresh from external edits; verify integration test
- [ ] 7.5 Add the `DocumentAnnotations.sysml` metadata library and index it read-only; verify it parses and `@DocumentRoot`/`@Appendix` resolve in a fixture
- [ ] 7.6 Implement core `DocumentModel` (sections, paragraphs, items, model-elements listing, appendices, computed numbering and TOC); verify unit tests for the "Section content", "Annotated source", "Unannotated package", and "Reorder renumbers" scenarios
- [ ] 7.7 Implement comment-body handling: margin stripping/regeneration, `*/` escaping, and the CommonMark subset renderer (no raw HTML); verify unit tests including "Paragraph with comment terminator" and "List in paragraph"
- [ ] 7.8 Implement the `moveMember` edit plan (with leading comments and re-indentation, RenameService for cross-parent moves); verify round-trip tests
- [ ] 7.9 Build the document view in the requirements editor webview (Table/Document toggle, title block, clickable TOC, inline editing of headings, paragraphs, and items, add section/appendix/paragraph/requirement, drag reorder in TOC, delete with confirmation); verify integration tests for "Add section", "Heading with spaces", "Add appendix", "Move section", and "Delete section"
- [ ] 7.10 Document the document-view mapping and metadata library in `docs/requirements-document.md`

## 8. Agent integration (MCP and Language Model Tools)

- [ ] 8.0 Implement shared tool definitions in `core/agent-tools` (names, descriptions, input schemas, handlers on `ModelService`); verify handler unit tests independent of any channel
- [ ] 8.1 Scaffold the stdio MCP server adapter over the shared definitions with the MCP TypeScript SDK and `--workspace` argument, bundled to `dist/mcp-server.js` with a `bin` entry; verify an in-process MCP client lists the tools and `node dist/mcp-server.js --workspace fixtures/...` starts
- [ ] 8.2 Implement read tools (`list_files`, `list_diagrams`, `get_element_tree`, `get_element`); verify tests against a temp copy of fixtures
- [ ] 8.3 Implement `read_diagram` with JSON description and optional PNG via resvg (SVG fallback); verify the result contains `image/png` content and correct node descriptions
- [ ] 8.4 Implement diagram tools (`create_diagram`, `add_to_diagram`, `remove_from_diagram`, `layout_diagram`); verify "Generate general view" and "Remove vs delete" scenarios
- [ ] 8.4a Implement `read_requirements_document` (Markdown from `DocumentModel` with qualified-name markers); verify the "Agent reads specification" scenario
- [ ] 8.5 Implement model tools (`create_element`, `delete_element`, `rename_element`, `set_element_properties`, `create_relationship`, `create_requirement`) through `ModelService`; verify their text output is identical to the GUI's for the same operation
- [ ] 8.6 Implement the change journal and `undo` with stale-file refusal; verify "Undo agent change" and "Stale undo" scenarios
- [ ] 8.7 Register the server via the extension's MCP server definition provider; verify it appears in VS Code's MCP server list for the workspace
- [ ] 8.8 Implement the Language Model Tools adapter: generate `contributes.languageModelTools` from the shared definitions at build time, register handlers with `vscode.lm.registerTool`, read unsaved buffers, apply writes as WorkspaceEdits plus journal entries, return images as `LanguageModelDataPart`; verify integration tests for "In-editor agent reads a diagram" and "Unsaved buffers visible"
- [ ] 8.9 Confirm the minimum VS Code version with stable `LanguageModelDataPart` image support and set `engines.vscode`; verify the extension loads on that version
- [ ] 8.10 Implement the `sysml.agent.channels` setting (both/mcp/lmTools) controlling LM tools registration and MCP server definition registration; verify each value exposes the expected tools
- [ ] 8.11 Add a channel contract test running every tool over MCP and LM tools against the same saved fixture workspace; verify identical results and file changes
- [ ] 8.12 Document both channels (generic MCP client config, VS Code setup, `sysml.agent.channels`) in `docs/agents.md`; verify the documented MCP config launches the server

## 9. Integration

- [ ] 9.1 End-to-end test: open fixture workspace, create diagram, add/delete/rename elements via diagram and tree, confirm text, tree, diagrams, and requirements table stay consistent after reload
- [ ] 9.2 End-to-end agent test, once per channel: with a diagram open in VS Code, an agent generates a diagram, adds an element, and undoes; verify the open views update each time
- [ ] 9.3 Performance check: 5,000-line model propagates edits to views within 1 s
- [ ] 9.4 Package with `vsce package` and verify the `.vsix` installs, activates, and its bundled MCP server starts

## Workflow follow-up

- Archive the change after review with `/opsx:archive`.
