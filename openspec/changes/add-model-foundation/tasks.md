# Tasks

## 1. Extension scaffolding

- [x] 1.1 Migrate the toolchain from Bun to Node: remove `bun.lock` and `@types/bun`, add `@types/node`, `typescript`, `esbuild`, `vitest`, set `engines.node` to `>=22`, replace the `index.ts` stub, and update README.md to Node instructions; verify `npm install` produces `package-lock.json` and no `bun`/`Bun.` references remain outside `fixtures/` and `openspec/`
- [x] 1.2 Convert `package.json` into a VS Code extension manifest (engines, activation events, `contributes.views` for the SysML Model view) and add `@types/vscode`, `@vscode/vsce`, `@vscode/test-electron`; verify `npm run typecheck` passes
- [x] 1.3 Add the `src/extension.ts` activate/deactivate stub and esbuild scripts for the host (node/cjs, external vscode) and the MCP bridge script; verify `npm run build` emits `dist/extension.js` and the extension activates in an Extension Development Host
- [x] 1.4 Set up Vitest (`npm test`) for `vscode`-free modules and an integration harness with `@vscode/test-electron`; verify a smoke test of each passes

## 2. Parser and model index

- [x] 2.1 Vendor the ANTLR4 SysML v2 grammar (pinned to release 2026-09.1) with its licence notice and upstream commit, add `antlr4ng`, and generate the TypeScript parser as a build step; verify `npm run build` regenerates it and a one-line model parses
- [x] 2.2 Run the parser acceptance gate (design D2) over every fixture `.sysml` and `.kerml` file: syntax-error rate, byte-for-byte token re-join, and standard library load time; record the results and the pass/fail decision in design.md
- [x] 2.3 Not needed: the gate passed for SysML after patching the lexer (see design D2, Gate results)
- [x] 2.4 Implement the model layer on the parse tree (elements, kinds, ownership, qualified names, short names, types, multiplicities, documentation, exact source ranges) behind a parser-independent interface; verify unit tests per construct category against fixture files
- [x] 2.5 Implement `ModelIndex` (per-document parse, workspace-wide qualified-name index, cross-file import resolution, change events; re-parse is synchronous per `setDocument`, debouncing is left to the VS Code adapter); verify unit tests for resolution across files and for change events
- [x] 2.6 Load the standard library read-only (no cached index needed, load is about 0.6 s): the `.sysml` files via the ANTLR parser and the `.kerml` files via a KerML outline indexer (names, kinds, nesting, specializations), not the ANTLR parser; verify `ScalarValues::String` and a `.sysml` library type both resolve from a fixture model
- [x] 2.7 Keep the last good model on syntax errors and expose per-file error state with location; verify the "Broken file" scenario in a unit test
- [x] 2.8 Add a CI test that parses all fixture files and fails if the syntax-error count rises above the gate's recorded baseline
- [ ] 2.9 Remove the one-time stall when the first syntax error of a session discards the DFA snapshot: keep the snapshot-backed parser for the fast path and send failing parses to a second parser instance with its own, normally built prediction cache, warmed in the background; verify with `npm run bench:parser` that the first parse of a file with a syntax error takes under 500 ms after start-up (implemented: fallback cache, background warm-up, tests; target not met, first failing parse is 6.4 s after warm-up and 12 s without; repeated ones about 210 ms; see design.md)

## 3. Model tree view

- [x] 3.1 Implement the `TreeDataProvider` with labels, kind icons, type descriptions, lazy children, and the empty-workspace welcome view; verify an integration test against a fixture workspace
- [x] 3.2 Wire `ModelIndex` change events to targeted refresh that preserves expansion; verify a test that editing text updates the tree within 1 s
- [x] 3.3 Add "Go to Definition" and the error indicator for files with syntax errors; verify integration tests and document the view in README.md
- [x] 3.4 Implement cursor-to-tree selection sync behind a setting; verify an integration test

## 4. Agent foundation

- [x] 4.1 Implement shared tool definitions in a transport-free `agent-tools` module (names, descriptions, input schemas, handlers on the model service) for `sysml_list_files`, `sysml_get_element_tree` (with a default depth limit and subtree requests), `sysml_get_element`, and `sysml_validate` (syntax errors and unresolved names with file and line); verify handler unit tests against fixtures, including the "Depth limit" and three "Validate model" scenarios
- [x] 4.2 Host the MCP server in the extension (MCP TypeScript SDK, loopback HTTP, per-session token) and ship the stdio bridge `dist/mcp-bridge.js`; verify an MCP client outside VS Code lists the tools through the bridge while VS Code is open, and gets the "VS Code must be open" error when it is not
- [x] 4.3 Register the server through an MCP server definition provider; verify it appears in VS Code's MCP server list for the workspace
- [x] 4.4 Implement the Language Model Tools adapter: generate `contributes.languageModelTools` from the shared definitions at build time and register handlers with `vscode.lm.registerTool`; verify the "In-editor agent reads an element" and "Unsaved buffers visible" scenarios
- [x] 4.5 Confirm the minimum VS Code version that has the MCP provider and Language Model Tools APIs as stable and set `engines.vscode`; verify the extension loads on that version
- [x] 4.6 Implement the `sysml.agent.channels` setting (both/mcp/lmTools); verify each value exposes the expected tools
- [x] 4.7 Add a channel contract test that runs every tool over MCP and Language Model Tools, including on a file with unsaved edits; verify identical results
- [x] 4.8 Document both channels (bridge config for generic MCP clients, VS Code setup, the setting, and that VS Code must be open) in `docs/agents.md`; verify the documented MCP config connects

## 5. Integration

- [ ] 5.1 End-to-end test: open the fixture workspace, browse the tree, edit text, and read the model through an agent tool; verify all three agree (test written and compiles; waiting on CI)
- [x] 5.2 Performance check: a 5,000-line generated model propagates text edits to the tree within 1 s, and activation time with the standard library is recorded
- [ ] 5.3 Package with `vsce package` and verify the `.vsix` installs, activates, and starts its MCP server (verified locally: `npm run package` builds a 1.7 MB .vsix and `npm run check:vsix` passes; install and activation step added to CI and waiting on it)
