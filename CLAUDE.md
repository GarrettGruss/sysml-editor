This project is a VS Code extension plus a standalone MCP server. Everything it ships runs on Node, so use the Node toolchain, not Bun.

- Runtime: Node 22 LTS. Do not use Bun or any `Bun.*` API anywhere (extension, core, MCP server, tests, or scripts).
- Package manager: `npm install`, `npm run <script>`, `npx <package>`.
- Build: esbuild via `npm run build` (bundles the extension host as CJS with `vscode` external, the MCP server, and the webviews).
- Unit tests: Vitest via `npm test`. Integration tests: `@vscode/test-electron` via `npm run test:integration`.
- Type check: `npm run typecheck` (`tsc --noEmit`).
- Use Node built-ins (`node:fs/promises`, `node:path`, `node:child_process`) and the global `fetch`. Do not use dotenv unless a task requires it.

Until the toolchain migration (task 1.0 in `openspec/changes/add-sysml-graphical-editor/tasks.md`) is done, the repo may still contain Bun artifacts (`bun.lock`, `@types/bun`, the `index.ts` stub). Those are leftovers, not conventions to follow.

## Architecture constraints

- Code in the core library must not import `vscode`; it is shared by the extension and the MCP server.
- Webviews run in a browser sandbox and communicate with the extension host only through `postMessage`.
- `fixtures/` holds the official SysML v2 release and example models. Treat them as read-only test data.
- Planning lives in `openspec/`; see `openspec/changes/add-sysml-graphical-editor/design.md` for the decisions behind this setup.
