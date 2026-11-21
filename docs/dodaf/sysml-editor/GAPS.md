# Gap log: DoDAF pilot (issue #108)

Tooling gaps found while building the DoDAF description by hand. Not yet filed as GitHub issues.

| # | Gap | Found | Evidence | Status |
|---|---|---|---|---|
| 1 | The MCP server does not start in a workspace with no `.sysml`/`.kerml` file: activation is `workspaceContains:**/*.sysml` / `**/*.kerml` (plus `onCustomEditor`, `onWebviewPanel`). An agent cannot begin in an empty folder. | pre-pilot | `package.json` `activationEvents` | open, not filed |
| 2 | The MCP server reports version 0.4.0 in the 0.5.0 build (`serverVersion` is passed from the extension version; `package.json` on this branch still says 0.4.0). | pre-pilot | `src/agent-integration.ts:39`, `package.json` | open, not filed |
