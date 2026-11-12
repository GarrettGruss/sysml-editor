## Why

SysML v2 is text-first, but systems engineers and the AI agents working with them need to browse a model's structure. This change is the foundation of a VS Code SysML v2 editor: it loads real models and shows them, without changing them yet, so the parser can be proven on real files before anything is built on it.

## What Changes

- New VS Code extension that loads SysML v2 and KerML text from the workspace and the standard library, using a full-grammar parser.
- A native VS Code tree view of the model's ownership hierarchy, with go-to-source and live refresh.
- AI-native from the start: read-only agent tools, exposed through an MCP server hosted by the extension and through VS Code Language Model Tools. Available while VS Code is running.
- The toolchain moves from Bun to Node (npm, esbuild, Vitest, `tsc`).

## Capabilities

### New Capabilities
- `model-tree-view`: Native VS Code tree showing the SysML v2 element hierarchy of workspace models.
- `model-synchronization`: SysML text as the source of truth, and propagation of text changes to views.
- `agent-integration`: Agent tool set, exposed over MCP and VS Code Language Model Tools.

### Modified Capabilities
None.

## Impact

- First of four changes; `add-diagram-viewing`, `add-model-editing`, and `add-requirements-editor` depend on it.
- New code: extension host with parser, model index, tree view, agent tool layer, hosted MCP server and stdio bridge.
- New dependencies: `@types/vscode`, `esbuild`, `vitest`, `typescript`, `@vscode/vsce`, `antlr4ng`, a vendored ANTLR4 grammar (MIT), and the MCP TypeScript SDK.
- `package.json` becomes an extension manifest; `bun.lock` is replaced by `package-lock.json`.
- Out of scope: editing the model, diagrams, requirements editor, use without VS Code running.
