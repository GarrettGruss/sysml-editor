# Design

## Context

The repo is a fresh TypeScript project (scaffolded with Bun; this change moves it to Node, see D9) (`index.ts` stub) with the official SysML v2 release (`fixtures/sysml-v2-release`: grammar BNF, `sysml.library`, examples) and community models (`fixtures/sysml-v2-models`) checked in as fixtures. Nothing else exists yet. See proposal.md for motivation and specs/ for the behavior contract.

Constraints: every shipped artifact runs on Node: the extension host (VS Code's Electron Node), the MCP server (launched by harnesses with `node`/`npx`), and the core library inside both. Bundled output must be Node-compatible CommonJS. Webviews run in a sandboxed browser context and talk to the host only via `postMessage`.

UI mockups for every visual element (tree view, the three diagram kinds, requirements table, agent image output) are in [mockups/index.html](mockups/index.html). They are indicative layouts; the specs remain authoritative.

## Goals / Non-Goals

**Goals:**
- One in-memory model service in the extension host, shared by tree, diagram, and requirements views.
- Text-edit generation that is minimal and format-preserving (CST-based).
- Agent access through MCP or VS Code Language Model Tools, with identical tool contracts and behavior identical to the GUI.
- Diagram files that survive model edits and diff cleanly.

**Non-Goals:**
- Full semantic validation, name resolution through every library import edge case, or expression evaluation.
- Rendering every SysML v2 diagram kind (state, sequence, action-flow views are later changes).
- A language server for third-party editors; the parser is in-process.
- A `@sysml` chat participant.
- Hosting an LLM or agent loop inside the extension; agents are brought by the user's harness.

## Decisions

### D1: Architecture — VS Code-free core, two front ends
```
                 ┌──────────── packages/core (no vscode import) ────────────┐
 .sysml ───────► │ Parser → ModelIndex → ModelService (ops) → EditPlanner   │
 .sysmld ──────► │ DiagramModel/serializer → Layout (ELK) → SVG renderer    │
                 └───────▲────────────────────────────────▲────────────────┘
                         │                                │
   VS Code extension host│              packages/core/agent-tools (shared tool defs)
   TreeDataProvider, custom editors,      ▲                │
   commands → ModelService → WorkspaceEdit│                │ MCP server (stdio)
   LM tools (vscode.lm.registerTool) ─────┘                │ edits → file writes + journal
   webviews ◄─ view models / intents ─►                   │ SVG → PNG for read_diagram
```
All semantics (parse, query, edit planning, diagram serialization, layout, rendering) live in a core library with no `vscode` dependency. The extension host (including its Language Model Tools) and the MCP server are thin adapters that call one `ModelService` operation set (`addElement`, `deleteElement`, `rename`, `setProperty`, `createRelationship`, `createDiagram`, `addToDiagram`, …), which returns `TextEdit`s plus diagram changes. The extension applies them as a `WorkspaceEdit` and diagram edit; the MCP server writes files. Webviews receive serialized view models and send intent messages. Alternatives: model logic in the webview (rejected: tree and multiple editors need one model); MCP server hosted inside the extension (rejected: requires VS Code running, contradicting the harness-agnostic goal of the MCP channel).

### D2: Parser — Langium grammar derived from the official release
Use Langium (TypeScript) to implement a SysML v2 textual grammar covering the subset required by the specs (packages, imports, part/port/item/attribute/action/requirement/connection defs and usages, specialization, typing, multiplicities, doc comments, satisfy/verify/derive, short names/`elementId`). Langium provides CSTs with exact offsets for minimal edits and runs in Node. Alternatives: (a) reuse the OMG Pilot Implementation (Java/Xtext) as a language server — accurate but heavy JVM dependency and no clean CST access from TS; (b) adopt an existing open-source TS SysML 2 language server (e.g. Sensmetry `sysml-2ls`) — viable, evaluate in task 2.1 and adopt if its license and AST/CST access fit; (c) hand-written parser — too costly. Grammar coverage is validated by parsing the fixtures (unsupported constructs must produce recoverable errors, not crashes).

### D3: Element identity — qualified names, with elementId when present
Diagram references use qualified names (readable, diff-friendly), plus `elementId` if declared. Renames made through the extension go through a single `RenameService` that updates text and all `.sysmld` files in one `WorkspaceEdit`. Alternative: generate UUIDs into the text — rejected because it pollutes user source.

### D4: Text edits via EditPlanner on the CST
Each GUI operation maps to an `EditPlan` computing `TextEdit`s against CST node ranges: insert into a body (creating `{}` when the declaration ends in `;`), delete a node's full range plus leading doc comment and trailing whitespace line, replace a name token, etc. Indentation is copied from sibling members. Every plan is verified by re-parsing in tests (round-trip). Alternative: pretty-print the whole AST — rejected; destroys formatting/comments.

### D5: Diagram file format
`.sysmld` JSON:
```json
{ "version": 1, "kind": "general", "root": "VehicleModel::Vehicle",
  "sources": ["model/vehicle.sysml"],
  "nodes": [{ "id": "n1", "ref": "VehicleModel::Vehicle::engine", "elementId": null,
              "x": 40, "y": 80, "w": 160, "h": 60, "collapsed": false, "parent": "n0" }],
  "edges": [{ "id": "e1", "ref": "...", "source": "n1", "target": "n2", "points": [] }],
  "style": {} }
```
Serialized with sorted keys and nodes sorted by `id`, 2-space indentation, trailing newline. Edited via `CustomEditorProvider` with `CustomDocument` (we implement our own edit stack so a combined "model + diagram" operation is one undo entry).

### D6: Combined undo
A palette add produces (a) a `WorkspaceEdit` on `.sysml` and (b) a diagram edit. The diagram's custom-document edit entry's `undo` callback removes the node and applies the inverse text edit; VS Code's text undo stack is not relied on for cross-file atomicity. Risk acknowledged below.

### D7: Rendering — one SVG notation renderer, interactive webview on top
Layout (elkjs, runs in Node and browser) and SysML notation drawing (compartmented boxes, guillemet keywords, border ports, edge styles) live in core and produce SVG. The webview uses the same shape renderer for nodes, so the agent's image and the user's view match, and adds interaction (selection, drag, resize, palette) in React. Eclipse Sprotty was the earlier preference, but it renders only in a browser DOM and could not produce agent images headlessly; it remains a fallback for the interaction layer if hand-built interaction proves too costly. Requirements editor is a React table (no extra lib). Bundled by esbuild into `dist/webview/*.js`.

### D8: Tree view
`TreeDataProvider<ModelNode>` driven by ModelIndex change events with per-node `onDidChangeTreeData` firing to preserve expansion. Uses `TreeDragAndDropController` to support drag into diagram webviews (`application/vnd.code.tree.sysmlModel` mime).

### D9: Build & test
Toolchain is Node-only: Node 22 LTS, npm, esbuild, Vitest, `tsc --noEmit`.
- esbuild bundles `src/extension.ts` (platform node, format cjs, external `vscode`), the MCP server (`dist/mcp-server.js`, platform node, with a `bin` entry so `npx` can launch it), and webviews (platform browser).
- Vitest unit tests cover all of core and the MCP tools (via an in-process MCP client against a temp copy of fixtures).
- `@vscode/test-electron` runs integration tests for tree/editor wiring.
- `tsc --noEmit` type checks; `engines.node` is `>=22`.
- Code must use Node APIs only (no `Bun.*`), so tests exercise the production runtime.

Alternative: Bun for building, testing, and package management (the original scaffold). Rejected because tests would run on a different runtime than production, hiding Node incompatibilities (Bun-only APIs, ESM/CJS interop, Node-API native modules such as resvg); `@vscode/test-electron` needs Node/Electron anyway; and VS Code extension tooling (`vsce` dependency checks via `npm list`, the esbuild extension template, debug configurations) assumes npm and Node. Bun's speed advantage is small at this project's size.

### D10: MCP server
Built on the official MCP TypeScript SDK, stdio transport, launched as `sysml-mcp --workspace <dir>`. Tools (snake_case, JSON-schema inputs): `list_files`, `list_diagrams`, `get_element_tree`, `get_element`, `read_diagram` (`includeImage`), `read_requirements_document`, `create_diagram`, `add_to_diagram`, `remove_from_diagram`, `layout_diagram`, `create_element` (optional `diagram` placement), `delete_element`, `rename_element`, `set_element_properties`, `create_relationship`, `create_requirement`, `undo`. Tool descriptions are written for agents, and errors are returned as tool errors with actionable text (e.g. parse-error location). The extension contributes an MCP server definition provider so VS Code agents discover it, passing the workspace folder. MCP is the channel for harness-agnostic use; D13 adds Language Model Tools as an equal in-editor channel.

### D11: Agent edit journal and undo
Each write tool call records `{id, files: [{path, beforeHash, afterHash, inverse edits}]}` in `.sysml-agent/journal.jsonl` (gitignored by default). `undo` reverts the latest entry only if every file's current hash equals `afterHash`; otherwise it refuses. In VS Code, agent writes arrive as external file changes; open documents reload and views refresh via D8 / model-synchronization propagation.

### D12: Image output
`read_diagram` renders SVG via core, rasterizes to PNG with `@resvg/resvg-js` (native, no browser), and returns it as MCP `image` content alongside a `text` item with the JSON description. Image width is capped (default 1600 px) to bound token cost. Agent images are always rendered in a fixed light theme without editor chrome (no grid, palette, or selection), so output does not depend on the user's theme (see mockups/agent-diagram-image.html).

### D13: One tool definition, two channels
Tool definitions (name, agent-facing description, JSON input schema, handler returning `{ text: json, image?: png }`) live once in `core/agent-tools`. Each channel is a small adapter:
- **MCP adapter** (D10): registers each definition with the MCP SDK; reads files from disk; writes files and journals them (D11).
- **LM tools adapter**: each tool is declared in `contributes.languageModelTools` (generated from the definitions at build time so schemas cannot drift) and registered with `vscode.lm.registerTool`. It reads open documents (including unsaved buffers) and applies writes as a `WorkspaceEdit` plus diagram edits, so editor Undo works, and also records a journal entry so `undo` behaves the same as over MCP. Images are returned as `LanguageModelDataPart.image(png, "image/png")`.
A contract test runs every tool through both adapters against the same saved fixture workspace and asserts identical results. Users choose the channel through their agent; both are on by default, and a setting can disable either to avoid agents seeing duplicate tools. Alternatives: MCP only (rejected by requirement: in-editor agents should not need an external process, and LM tools can see unsaved buffers); LM tools only (rejected: not harness-agnostic).

### D14: Requirements document view
The document view is a projection computed in core (`DocumentModel` built from the package tree) and rendered as HTML in the requirements editor webview, which has a Table / Document toggle. Mapping (see requirements-editor spec): root package → document; nested package → section (heading = name, quoted when needed); `doc`/`comment` → paragraphs; requirements → items; other elements → model-elements listing.

Document-only information uses SysML v2 metadata from a library shipped with the extension, `DocumentAnnotations.sysml`:
```
library package DocumentAnnotations {
    private import ScalarValues::String;
    metadata def DocumentRoot { attribute title : String; attribute version : String; }
    metadata def Appendix;
}
```
Files using it add `private import DocumentAnnotations::*;` (inserted automatically by the editor). The library is indexed read-only like `sysml.library`.

Numbering and TOC are computed, never stored, so reordering never needs text renumbering and the source stays free of derived data. Paragraph bodies are plain comment text, rendered with a CommonMark subset (emphasis, inline code, lists, links; no raw HTML). Because SysML comments have no escape mechanism, `*/` is stored as `*\/` and unescaped on display; leading ` * ` margin characters in comment bodies are stripped on read and regenerated on write using the existing comment's style.

Document edits reuse EditPlanner operations (rename, insert member, move member, set comment body); moving a section is a new `moveMember` plan that cuts the declaration (with its leading comments) and reinserts it at the target position with re-indentation. The agent tool `read_requirements_document` renders the same `DocumentModel` to Markdown with `<!-- qn: ... -->` markers.

Alternatives: (a) a separate document file (e.g. Markdown with embedded references), rejected because the user requires the document to adhere to SysML v2 syntax and a second source of truth would drift; (b) storing section numbers as short names (`package <'3.1'> ...`), rejected because reordering would rewrite many declarations and short names are better left for user-assigned ids.

## Risks / Trade-offs

- [Prose in SysML comments is awkward to edit as raw text] → The document view is the primary prose editor; comment formatting is normalized on write only for the edited comment.
- [Moving sections changes qualified names only if the parent changes] → Cross-parent moves use the RenameService path to update references and diagram files.

- [Duplicate tools when an in-editor agent sees both the registered MCP server and LM tools] → Setting `sysml.agent.channels` (`both` | `mcp` | `lmTools`); with `both`, the extension skips registering the MCP server definition with VS Code, so in-editor agents see the LM tools only, and the standalone server remains available to external harnesses.
- [`LanguageModelDataPart` image support depends on VS Code version and the consuming model] → Confirm the minimum VS Code version that supports it and set `engines.vscode`; JSON description is always returned so agents without vision still work.

- [Concurrent agent and user edits on the same file] → Server re-reads files before every operation and plans edits against current text; the VS Code side treats agent writes as external changes. A dirty unsaved editor buffer is not visible to the server — documented; future: extension exposes buffers to the server.
- [Native rasterizer dependency (resvg) across platforms] → Prebuilt binaries per platform; fall back to returning SVG text if loading fails.
- [Two renderers drifting (core SVG vs webview)] → Webview reuses core node-shape rendering; snapshot tests compare both.

- [Grammar coverage gaps vs. full SysML v2] → Scope grammar to listed constructs; parse all fixtures in CI and track error rate; recover gracefully.
- [Cross-file undo can desync if user edits text between operations] → Inverse edits are validated against current text; if stale, show a warning and skip text revert.
- [Manual text renames break diagram references] → Unresolved placeholders + "Re-link…" (spec); later heuristic auto-relink.
- [Large models/performance] → Incremental re-parse per document, debounce 200 ms, lazy tree children.
- [Standard library resolution (`sysml.library`)] → Index library files read-only from the fixture/bundled copy for type resolution; never editable.

## Migration Plan

Greenfield; no migration. `package.json` becomes an extension manifest; the `index.ts` stub is replaced by `src/extension.ts`.

## Open Questions

- Exact default palette contents per diagram kind beyond the minimum listed in the spec.
- Whether to ship a bundled copy of `sysml.library` or require the user to configure its path (does not change architecture).
