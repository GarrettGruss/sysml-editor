# Design

## Context

This is change 1 of 4 for the VS Code SysML v2 editor: `add-model-foundation`, `add-diagram-viewing`, `add-model-editing`, `add-requirements-editor`, implemented in that order. The feasibility analysis behind the split is in the [trade study](../../../docs/trade-study.md) and UI mockups are in [docs/mockups](../../../docs/mockups/index.html).

The repo is a fresh TypeScript project scaffolded with Bun (an `index.ts` stub), which this change moves to Node (D9). The official SysML v2 release 2026-09.1 (grammars, standard library, examples) and the GfSE community models are checked in under `fixtures/`. The product runs only inside VS Code: the extension host holds all logic, including the MCP server it hosts. Webviews, added in later changes, run in a browser sandbox and talk to the host only via `postMessage`.

## Goals / Non-Goals

**Goals:**
- A parser that accepts the whole SysML v2 and KerML textual notation and keeps exact source positions.
- One in-memory model service in the extension host, shared by every view and by agent tools.
- A read-only model tree and read-only agent tools, usable on real models from day one.

**Non-Goals:**
- Changing the model: no text edits in this change.
- Diagrams and the requirements editor (later changes).
- Full semantic validation, implied relationships, or expression evaluation.
- Text-editing features such as highlighting, completion, and diagnostics beyond syntax-error markers.
- Operation without VS Code: a standalone MCP server, cloud agents, and CI pipelines. Deferred until the core use case (a person and an agent working on one architecture in VS Code) is verified.
- A `@sysml` chat participant, or hosting an LLM or agent loop inside the extension.
- Deferred: project boundaries beyond "all files in the workspace" (multi-root rules, KPAR projects, several library versions), support for the browser version of VS Code, and a process for moving to a new SysML release.
- Deferred: start-up time, memory, and file-count targets. They are measured in this change and set later.

## Decisions

Decision numbers are shared across the four changes that make up the editor, so they are not consecutive here.

### D1: Architecture — one model service in the extension host
```
 .sysml ──► Parser → ModelIndex → ModelService (ops) → EditPlanner ──► WorkspaceEdit
 .sysmld ─► DiagramDocument (CustomEditorProvider)                         ▲
                     │                                                     │
   TreeDataProvider ◄┤   commands, webview intents, agent tools ───────────┘
   Webviews (diagram canvas, requirements) ◄─ view models / intents ─►
   Agent tools ─► LM tools (vscode.lm.registerTool)  and  MCP server hosted by the extension
```
All logic runs in the extension host. One `ModelService` operation set (`addElement`, `deleteElement`, `rename`, `setProperty`, `createRelationship`, `createDiagram`, `addToDiagram`, …) serves commands, webview intents, and agent tools, and every change is applied as a `WorkspaceEdit` plus a diagram edit. Parser, model index, edit planner, and diagram serialization stay in modules that do not import `vscode`, so they can be unit tested without VS Code; this is for testability, not a second runtime. Webviews receive serialized view models and send intent messages, and they own layout and drawing (D7).

Alternatives: a VS Code-free core shared with a standalone MCP server (the previous design) — dropped because it required a second renderer, a rasterizer, a change journal, and conflict handling for unsaved buffers, all for use cases outside the core one; model logic in the webview — rejected because the tree and multiple editors need one model.

### D2: Parser — third-party ANTLR4 grammar, with our own TypeScript parser as fallback
Use the open-source ANTLR4 grammar for the SysML v2 textual notation (`daltskin/sysml-v2-grammar`, MIT, pinned to OMG release 2026-09.1) with the `antlr4ng` TypeScript runtime. The grammar files are vendored into the repo with their licence notice and the upstream commit, and the parser is generated at build time. We build our own model layer on the parse tree (elements, ownership, qualified names, exact source ranges); the upstream language server is not used, because its npm package exposes only a bundled server, not a parser API.

The parser must cover the whole language, not a subset: only 13% of the fixture files stay inside the subset planned earlier, and editing is blocked on files with syntax errors (see [trade study](../../../docs/trade-study.md), sections 3 and 5.1). KerML is out of scope for this parser: the 36 `.kerml` files of the standard library are read by a small outline indexer (task 2.6), and user-written `.kerml` files are not supported in this change.

Acceptance gate (task 2.2), run before anything is built on the parser:
- at least 99% of the gated fixture `.sysml` files (release examples, standard library, community models) parse without syntax errors; community files that use pre-release syntax are expected-invalid and are not counted (`scripts/expected-invalid.json`); `.kerml` files are not parsed by this parser;
- re-joining the tokens of each file, including whitespace and comments, reproduces it byte for byte, which the edit planner needs;
- the standard library loads in a measured, acceptable time.

Fallback: if the gate fails and the gaps cannot be fixed by patching the vendored grammar, write our own full-grammar parser in TypeScript from the official grammar files in `fixtures/sysml-v2-release/bnf`, and hold it to the same gate. The model layer sits behind an interface that hides which parser produced the tree, so the fallback does not change later work.

Alternatives considered: a hand-written Langium grammar for a subset (the earlier decision; rejected on coverage, and the Langium-based `sysml-2ls` was archived in favour of a faster rewrite); the OMG Pilot Implementation as a Java server (needs a JVM, no syntax tree access from TypeScript); `tree-sitter-sysml` and Rust parsers compiled to WebAssembly (early releases, unverified coverage).

#### Gate results (2026-11-11)

Grammar: `daltskin/sysml-v2-grammar` tag v2026.09.1 (commit 27a1344), MIT, vendored in `vendor/sysml-v2-grammar/` with one local lexer patch (see its README). Run with `npm run gate:parser` (details in `scripts/parser-gate-result.json`). Result: **PASS**.

| Group | Ext | Files | Expected invalid | With errors | Clean |
|---|---|---|---|---|---|
| Release examples | .sysml | 252 | 0 | 0 | 100% |
| Standard library | .sysml | 58 | 0 | 0 | 100% |
| Community models | .sysml | 36 | 9 | 0 | 100% |

- Gated: 337 of 337 gated `.sysml` files clean (346 minus 9 expected-invalid), 100%, against the 99% criterion.
- 94 `.kerml` files are not parsed by this parser (handled by the KerML outline indexer) and are not counted.
- Expected invalid (pre-release syntax): 9 community files, a hand-maintained list in `scripts/expected-invalid.json` that the gate only reads. Each fails because it uses syntax the official 2026-09.1 grammar rejects: 8 bare `import`, 1 package-level `actor` (`EIT_System_Use_Cases.sysml`), and three of them (`EIT_System_Use_Cases.sysml`, `HVACSystemRequirements.sysml`, `VehicleModel.sysml`) also have further outdated constructs. The gate fails if a listed file does not exist, now parses clean (stale entry), or if an unlisted file has errors beyond the 99% threshold.
- Token re-join: 0 failures in 346 `.sysml` files after the lexer patch.
- Standard library parse time (58 `.sysml` files, one Node process, including the re-join check): about 19.7 s with single-stage full-LL parsing; about 17.7 s with two-stage parsing (SLL with bail, then full LL on failure). Both exceed the 5 s target; a few large files (`ShapeItems.sysml`, `MeasurementReferences.sysml`) dominate. A cached index (task 2.6) is required, and the parse time needs more work.

#### Parser performance

Measured with `npm run bench:parser` (one process, Node 24, ms). Root cause: the cost was ANTLR's lazily built prediction DFA, not grammar ambiguity. `parse.ts` was not defeating the cache (the DFA array is a static on the generated parser class and is shared across instances); warm parses were already fast. Cold cost was dominated by decision 278 (`usageDeclaration`, about 6.8 s of 10.6 s), then 133 (`featureSpecializationPart`, 1.5 s), 20 (`identification`, 0.8 s), 139 (`multiplicityPart`, 0.6 s) and 135 (`featureSpecializationPart`, 0.6 s), measured on the cold Annex A parse.

| Measurement | Before | After |
|---|---|---|
| Annex A, 1st parse in process (cold) | 10916 | 62 |
| Annex A, parses 2-4 (warm) | 39 / 18 / 15 | 28 / 26 / 21 |
| ShapeItems, 1st (after Annex A) / 2nd / 3rd | 5159 / 11 / 9 | 16 / 13 / 22 |
| Library, 58 files, pass 1 (cold) / pass 2 (warm) | 19961 / 279 | 296 / 218 |
| Annex A lex only (warm) / full parse (warm) | 3 / 28 | 3 / 15 |

Upstream `daltskin/sysml-v2-lsp` (MIT) reaches its speedup with a build-time DFA snapshot of the parser's static DFAs loaded at startup, SLL with bail then LL fallback, shared parser/lexer singletons, and a parse worker. This change adopts the snapshot and keeps the existing two-stage parse.

Changes: `src/parser/dfa-snapshot.ts` (extract/load/purge), `src/parser/dfa-snapshot.json` (about 370 KB, 20k states, trained on all `.sysml` fixtures by `npm run generate:dfa`, about 1 min, regenerate whenever the grammar changes; a snapshot whose ATN hash does not match is ignored), and `parse()` loads it at import. Restored states have empty ATN config sets, so they cannot grow new edges: if a parse has errors while the snapshot is active, `parse()` purges all DFAs once and reparses from the ATN, so results are identical to an unseeded parse. Set `SYSML_DFA_SNAPSHOT=off` to disable. Gate unchanged (337 of 337 gated files clean, 0 re-join failures).

Remaining: the first file with a syntax error (or a construct not in the training set) in a session pays a one-off purge and partial cold rebuild (seconds; for example a held-out run trained on the release files only, parsing the community models, cost 0.3 to 3.9 s on the few files that triggered it). Not tried: serializing full ATN configs (exact states, no purge), a parse worker, and grammar rewrites of `usageDeclaration` / `featureSpecializationPart`, which would also shrink the cold cost.

Library load (task 2.6), measured in a fresh Node 24 process with the DFA snapshot active (`loadLibrary` over all 94 library files: 58 `.sysml` through ANTLR, 36 `.kerml` through the outline indexer): 530 to 610 ms for the load itself, plus 150 to 290 ms to import the modules and the snapshot. That is well under the 1.5 s budget, so the cached library index mentioned earlier is not needed and is not built; the library is parsed at activation. With `SYSML_DFA_SNAPSHOT=off` the same load takes about 29 s, so the snapshot is a hard requirement for this decision.

Decisions taken from the gate: (1) the gate counts `.sysml` files that are valid under the official grammar; community files using pre-release syntax (bare `import`, package-level `actor`) are expected-invalid test cases. (2) The vendored lexer is patched to keep whitespace and line notes on a hidden channel. (3) KerML is not parsed by this parser: the standard library's `.kerml` files are read by a small outline indexer (task 2.6), and user-written `.kerml` files are not supported in this change. Task 2.3 (own full parser) is not needed.

### D8: Tree view
`TreeDataProvider<ModelNode>` driven by ModelIndex change events with per-node `onDidChangeTreeData` firing to preserve expansion. Uses `TreeDragAndDropController` to support drag into diagram webviews (`application/vnd.code.tree.sysmlModel` mime).

### D9: Build & test
Toolchain is Node-only: Node 22 LTS, npm, esbuild, Vitest, `tsc --noEmit`.
- esbuild bundles `src/extension.ts` (platform node, format cjs, external `vscode`), the MCP bridge script (`dist/mcp-bridge.js`, platform node), and webviews (platform browser).
- Vitest unit tests cover the `vscode`-free modules (parser, model index, edit planner, diagram serialization, agent tool handlers).
- `@vscode/test-electron` runs integration tests for tree/editor wiring, rendering, and both agent channels (an MCP client connects to the running extension).
- The ANTLR parser is generated from the vendored grammar as a build step (D2).
- `tsc --noEmit` type checks; `engines.node` is `>=22`.
- Code must use Node APIs only (no `Bun.*`), so tests exercise the production runtime.

Alternative: Bun for building, testing, and package management (the original scaffold). Rejected because tests would run on a different runtime than production, hiding Node incompatibilities (Bun-only APIs, ESM/CJS interop, Node-API native modules such as resvg); `@vscode/test-electron` needs Node/Electron anyway; and VS Code extension tooling (`vsce` dependency checks via `npm list`, the esbuild extension template, debug configurations) assumes npm and Node. Bun's speed advantage is small at this project's size.

### D10: MCP server hosted by the extension
On activation the extension starts an MCP server (official MCP TypeScript SDK, streamable HTTP) bound to `127.0.0.1` on a free port and protected by a per-session token. It registers the server with VS Code through an MCP server definition provider, so in-editor agents find it. For harnesses outside VS Code, the extension ships a small stdio bridge (`dist/mcp-bridge.js`, run with `node`) that takes the workspace path, reads the port and token the extension wrote to its storage for that workspace, and forwards to the running server; if none is running it exits with "VS Code must be open on this workspace". A harness therefore needs one static config entry.

Tools (snake_case with a `sysml_` prefix, because VS Code tool names are global across extensions, JSON-schema inputs): `sysml_validate`, `sysml_list_files`, `sysml_list_diagrams`, `sysml_get_element_tree`, `sysml_get_element`, `sysml_read_diagram` (`includeImage`), `sysml_read_requirements_document`, `sysml_create_diagram`, `sysml_add_to_diagram`, `sysml_remove_from_diagram`, `sysml_layout_diagram`, `sysml_create_element` (optional `diagram` placement), `sysml_delete_element`, `sysml_rename_element`, `sysml_set_element_properties`, `sysml_create_relationship`, `sysml_create_requirement`. The read tools for the model arrive in this change; diagram tools, write tools, and requirement tools arrive in the later changes. Tool descriptions are written for agents, and errors are returned as tool errors with actionable text (e.g. parse-error location).

Alternative: a standalone stdio server working on files without VS Code — deferred (see Non-Goals).

### D13: One tool definition, two channels
Tool definitions (name, agent-facing description, JSON input schema, handler returning `{ text: json, image?: png }`) live once in an `agent-tools` module that knows nothing about transports. Each channel is a small adapter:
- **MCP adapter** (D10): registers each definition with the MCP SDK server hosted by the extension.
- **LM tools adapter**: each tool is declared in `contributes.languageModelTools` (generated from the definitions at build time so schemas cannot drift) and registered with `vscode.lm.registerTool`. Images are returned as `LanguageModelDataPart.image(png, "image/png")`.
Both adapters call the same handlers against the same `ModelService`, so reads see unsaved buffers and writes follow D11 on either channel. A contract test runs every tool through both adapters and asserts identical results. Users choose the channel through their agent; both are on by default, and a setting can disable either to avoid agents seeing duplicate tools. Alternatives: MCP only (rejected: in-editor agents should not need MCP configuration); LM tools only (rejected: agents that are not built into VS Code's chat, such as terminal-based harnesses, cannot call them).

## Risks / Trade-offs

- [Third-party grammar is maintained by one person and may accept or reject text differently from the reference] → Vendored and pinned, so we can patch it; acceptance gate on all fixtures before building on it; own TypeScript parser as fallback (D2).
- [Standard library start-up cost: 94 files, 28,603 lines] → Measure in task 2.2; parse once and cache the index keyed by library version.
- [Large models/performance] → Incremental re-parse per document, debounce 200 ms, lazy tree children.
- [Duplicate tools when an in-editor agent sees both the registered MCP server and LM tools] → Setting `sysml.agent.channels` (`both` | `mcp` | `lmTools`); with `both`, the extension skips registering the MCP server definition with VS Code, so in-editor agents see the LM tools only, and the hosted server remains available to external harnesses through the bridge.
- [Local MCP port reachable by other local processes] → Bind to loopback only and require the per-session token.
- [Agents cannot be used without VS Code open] → Accepted; a standalone server can be added later on the same tool definitions.

## Migration Plan

Greenfield. `package.json` becomes an extension manifest, the `index.ts` stub is replaced by `src/extension.ts`, and `bun.lock` is replaced by `package-lock.json`.

## Open Questions

- Minimum VS Code version (resolved in task 4.5): `lm.registerMcpServerDefinitionProvider` and `lm.registerTool` are in the stable typings of `@types/vscode` 1.105, but `LanguageModelDataPart` (needed for image results from the later diagram tools) first appears in 1.106.0 (checked by diffing the published `@types/vscode` 1.105.0 and 1.106.0 typings). `engines.vscode` is therefore `^1.106.0` and `@types/vscode` is `~1.106.0`.
- Whether to bundle a copy of the standard library or require a configured path (does not change the architecture).
