# Tasks

## 1. Extension scaffolding

- [ ] 1.1 Migrate the toolchain from Bun to Node: remove `bun.lock` and `@types/bun`, add `@types/node`, `typescript`, `esbuild`, `vitest`, set `engines.node` to `>=22`, replace the `index.ts` stub, and update README.md to Node instructions; verify `npm install` produces `package-lock.json` and no `bun`/`Bun.` references remain outside `fixtures/` and `openspec/`
- [ ] 1.2 Convert `package.json` into a VS Code extension manifest (engines, activation events, `contributes.views` for the SysML Model view) and add `@types/vscode`, `@vscode/vsce`, `@vscode/test-electron`; verify `npm run typecheck` passes
- [ ] 1.3 Add the `src/extension.ts` activate/deactivate stub and esbuild scripts for the host (node/cjs, external vscode) and the MCP bridge script; verify `npm run build` emits `dist/extension.js` and the extension activates in an Extension Development Host
- [ ] 1.4 Set up Vitest (`npm test`) for `vscode`-free modules and an integration harness with `@vscode/test-electron`; verify a smoke test of each passes

## 2. Parser and model index

- [ ] 2.1 Vendor the ANTLR4 SysML v2 grammar (pinned to release 2026-09.1) with its licence notice and upstream commit, add `antlr4ng`, and generate the TypeScript parser as a build step; verify `npm run build` regenerates it and a one-line model parses
- [ ] 2.2 Run the parser acceptance gate (design D2) over every fixture `.sysml` and `.kerml` file: syntax-error rate, byte-for-byte token re-join, and standard library load time; record the results and the pass/fail decision in design.md
- [ ] 2.3 Only if 2.2 fails and the vendored grammar cannot be patched: write our own full-grammar parser in TypeScript from `fixtures/sysml-v2-release/bnf`, behind the same interface; verify it passes the same gate
- [ ] 2.4 Implement the model layer on the parse tree (elements, kinds, ownership, qualified names, short names, types, multiplicities, documentation, exact source ranges) behind a parser-independent interface; verify unit tests per construct category against fixture files
- [ ] 2.5 Implement `ModelIndex` (per-document parse, workspace-wide qualified-name index, cross-file import resolution, change events, debounced incremental re-parse); verify unit tests for resolution across files and for change events
- [ ] 2.6 Load the standard library read-only, including its KerML files, with a cached index; verify `ScalarValues::String` and a `.sysml` library type both resolve from a fixture model
- [ ] 2.7 Keep the last good model on syntax errors and expose per-file error state with location; verify the "Broken file" scenario in a unit test
- [ ] 2.8 Add a CI test that parses all fixture files and fails if the syntax-error count rises above the gate's recorded baseline

## 3. Model tree view

- [ ] 3.1 Implement the `TreeDataProvider` with labels, kind icons, type descriptions, lazy children, and the empty-workspace welcome view; verify an integration test against a fixture workspace
- [ ] 3.2 Wire `ModelIndex` change events to targeted refresh that preserves expansion; verify a test that editing text updates the tree within 1 s
- [ ] 3.3 Add "Go to Definition" and the error indicator for files with syntax errors; verify integration tests and document the view in README.md
- [ ] 3.4 Implement cursor-to-tree selection sync behind a setting; verify an integration test

## 4. Agent foundation

- [ ] 4.1 Implement shared tool definitions in a transport-free `agent-tools` module (names, descriptions, input schemas, handlers on the model service) for `list_files`, `get_element_tree` (with a default depth limit and subtree requests), `get_element`, and `validate` (syntax errors and unresolved names with file and line); verify handler unit tests against fixtures, including the "Depth limit" and three "Validate model" scenarios
- [ ] 4.2 Host the MCP server in the extension (MCP TypeScript SDK, loopback HTTP, per-session token) and ship the stdio bridge `dist/mcp-bridge.js`; verify an MCP client outside VS Code lists the tools through the bridge while VS Code is open, and gets the "VS Code must be open" error when it is not
- [ ] 4.3 Register the server through an MCP server definition provider; verify it appears in VS Code's MCP server list for the workspace
- [ ] 4.4 Implement the Language Model Tools adapter: generate `contributes.languageModelTools` from the shared definitions at build time and register handlers with `vscode.lm.registerTool`; verify the "In-editor agent reads an element" and "Unsaved buffers visible" scenarios
- [ ] 4.5 Confirm the minimum VS Code version that has the MCP provider and Language Model Tools APIs as stable and set `engines.vscode`; verify the extension loads on that version
- [ ] 4.6 Implement the `sysml.agent.channels` setting (both/mcp/lmTools); verify each value exposes the expected tools
- [ ] 4.7 Add a channel contract test that runs every tool over MCP and Language Model Tools, including on a file with unsaved edits; verify identical results
- [ ] 4.8 Document both channels (bridge config for generic MCP clients, VS Code setup, the setting, and that VS Code must be open) in `docs/agents.md`; verify the documented MCP config connects

## 5. Integration

- [ ] 5.1 End-to-end test: open the fixture workspace, browse the tree, edit text, and read the model through an agent tool; verify all three agree
- [ ] 5.2 Performance check: a 5,000-line generated model propagates text edits to the tree within 1 s, and activation time with the standard library is recorded
- [ ] 5.3 Package with `vsce package` and verify the `.vsix` installs, activates, and starts its MCP server
