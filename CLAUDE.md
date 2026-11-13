This project is a VS Code extension. It hosts an MCP server for agents, and everything runs inside VS Code's Node runtime, so use the Node toolchain, not Bun. There is no standalone mode: do not add features that work without VS Code running.

- Runtime: Node 22 LTS. Do not use Bun or any `Bun.*` API anywhere (extension, tests, or scripts).
- Package manager: `npm install`, `npm run <script>`, `npx <package>`.
- Build: esbuild via `npm run build` (bundles the extension host as CJS with `vscode` external, the MCP bridge script, and the webviews).
- Unit tests: Vitest via `npm test`. Integration tests: `@vscode/test-electron` via `npm run test:integration`.
- Type check: `npm run typecheck` (`tsc --noEmit`).
- Use Node built-ins (`node:fs/promises`, `node:path`, `node:child_process`) and the global `fetch`. Do not use dotenv unless a task requires it.

Until the toolchain migration (task 1.1 in `openspec/changes/add-model-foundation/tasks.md`) is done, the repo may still contain Bun artifacts (`bun.lock`, `@types/bun`, the `index.ts` stub). Those are leftovers, not conventions to follow.

## Architecture constraints

- Parser, model index, edit planner, diagram serialization, and agent tool handlers must not import `vscode`, so they can be unit tested without it.
- Diagrams are laid out and drawn only in the webview; do not add a second renderer in the extension host.
- Webviews run in a browser sandbox and communicate with the extension host only through `postMessage`.
- `fixtures/` holds the official SysML v2 release and example models. Treat them as read-only test data.
- Planning lives in `openspec/changes/`, as nine changes. Four are implemented in this order: `add-model-foundation`, `add-diagram-viewing`, `add-model-editing`, `add-requirements-editor`. The fifth, `add-behavior-diagrams`, depends on `add-diagram-viewing` and `add-model-editing`. The v0.2.0 changes follow in this order: `fix-diagram-editing`, `add-diagram-authoring`, `add-requirements-authoring`, `add-tree-file-actions`; the two authoring changes depend on `fix-diagram-editing`. Each has its own `design.md`; decision numbers (D1 to D45) are shared across them. Do not start a later change before the earlier one is done.
- The parser is the vendored third-party ANTLR4 grammar (design D2 in `add-model-foundation`). Do not write a subset grammar; the fallback, only if the acceptance gate fails, is our own full-grammar parser in TypeScript.
- Every edit that changes the model is saved at once, so the graphical editors and the SysML text never disagree. Diagram layout and style stay in memory until the user saves the diagram; a model edit must not save them. Features a usage inherits from its definition must not be changed from the usage.
- `docs/trade-study.md` records the feasibility analysis and known gaps; `docs/mockups/` holds UI mockups.

## Agents and models

Minimize token cost. Use the cheapest model and effort level that can do the job, and delegate to subagents whenever the work can be handed off.

| Role | Model | Effort |
|---|---|---|
| Lead orchestrator (plans, delegates, integrates) | Opus or Fable | medium |
| Implementation | Sonnet | low |
| Implementation, only after Sonnet has failed the task | Opus | low |
| Code review | Opus | low |
| Reading files, searching, looking things up | Haiku | medium |

- The lead orchestrator does not implement or read large files itself; it delegates and keeps only the conclusions.
- Give each subagent a narrow brief: the task, the files to touch, and how to verify. Do not paste context it can read from the repo.
- Escalate implementation from Sonnet to Opus only after a real failure (tests still failing or the task not completed), not in advance.
- Do not raise the effort level or model above this table unless the user asks.

## Branches and pull requests

Follow `CONTRIBUTING.md`. In short: work is merged into the version's deploy branch through pull requests that agents may open, close, and merge. Only a human merges the deploy PR into `main`. A version is scoped by its user-facing feature or fix list, not by OpenSpec changes; one version may span several changes. Never push to `main` or merge into it.
