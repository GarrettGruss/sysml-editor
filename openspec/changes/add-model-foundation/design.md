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

The parser must cover the whole language, not a subset: only 13% of the fixture files stay inside the subset planned earlier, and editing is blocked on files with syntax errors (see [trade study](../../../docs/trade-study.md), sections 3 and 5.1). It must also parse KerML, because 36 of the 94 standard library files are `.kerml`.

Acceptance gate (task 2.2), run before anything is built on the parser:
- at least 99% of the fixture `.sysml` and `.kerml` files (release examples, standard library, community models) parse without syntax errors;
- re-joining the tokens of each file, including whitespace and comments, reproduces it byte for byte, which the edit planner needs;
- the standard library loads in a measured, acceptable time.

Fallback: if the gate fails and the gaps cannot be fixed by patching the vendored grammar, write our own full-grammar parser in TypeScript from the official grammar files in `fixtures/sysml-v2-release/bnf`, and hold it to the same gate. The model layer sits behind an interface that hides which parser produced the tree, so the fallback does not change later work.

Alternatives considered: a hand-written Langium grammar for a subset (the earlier decision; rejected on coverage, and the Langium-based `sysml-2ls` was archived in favour of a faster rewrite); the OMG Pilot Implementation as a Java server (needs a JVM, no syntax tree access from TypeScript); `tree-sitter-sysml` and Rust parsers compiled to WebAssembly (early releases, unverified coverage).

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

Tools (snake_case, JSON-schema inputs): `validate`, `list_files`, `list_diagrams`, `get_element_tree`, `get_element`, `read_diagram` (`includeImage`), `read_requirements_document`, `create_diagram`, `add_to_diagram`, `remove_from_diagram`, `layout_diagram`, `create_element` (optional `diagram` placement), `delete_element`, `rename_element`, `set_element_properties`, `create_relationship`, `create_requirement`. The read tools for the model arrive in this change; diagram tools, write tools, and requirement tools arrive in the later changes. Tool descriptions are written for agents, and errors are returned as tool errors with actionable text (e.g. parse-error location).

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

- Whether to bundle a copy of the standard library or require a configured path (does not change the architecture).
