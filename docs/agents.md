# Using SysML Editor with AI agents

The extension gives AI agents read access to the SysML v2 model of the open workspace. The tools see the same
model as the editor, including unsaved edits. They only work while VS Code is open on that workspace.

## Tools

| Tool | Purpose |
| --- | --- |
| `sysml_list_files` | List the workspace `.sysml` files, their root packages and whether each has syntax errors. |
| `sysml_get_element_tree` | Browse the element hierarchy (default depth limit; request a subtree by qualified name). |
| `sysml_get_element` | Details of one element: kind, type, multiplicity, documentation, members, relationships, file and lines. |
| `sysml_validate` | Syntax errors and unresolved names, with file and line, for one file or the whole workspace. |

Results are JSON text. None of the tools writes files.

## Channels

- **Language Model Tools**: registered with VS Code, so agents built into VS Code (Copilot agent mode and others) can call the tools directly.
- **MCP**: the extension hosts an MCP server (Streamable HTTP on `127.0.0.1`, random port, per-session bearer token). Agents inside VS Code can use it through VS Code's MCP support; harnesses outside VS Code reach it through the stdio bridge below.

Both channels return identical results.

### `sysml.agent.channels`

| Value | Language Model Tools | MCP server | Registered with VS Code |
| --- | --- | --- | --- |
| `both` (default) | yes | yes (for external clients) | no, so in-editor agents see each tool once |
| `mcp` | no | yes | yes |
| `lmTools` | yes | no | no |

Changes apply immediately, without reloading the window.

## VS Code setup

Install the extension and open the workspace folder. Nothing else is needed: with `both` or `lmTools` the tools appear in the
agent's tool picker (names start with `sysml_`). With `mcp` the server appears in the MCP server list (command
"MCP: List Servers"). In `mcp` mode the `sysml_*` tools are declared hidden from VS Code's chat tool picker and calling them fails. The hiding relies on a `when` condition in the extension manifest and has not been confirmed by an automated test.

## MCP clients outside VS Code (the bridge)

The extension ships `dist/mcp-bridge.js`, a stdio MCP server that forwards to the server VS Code hosts for a workspace.
Add one entry per workspace to the client's MCP configuration:

```json
{
  "mcpServers": {
    "sysml": {
      "command": "node",
      "args": ["<extension path>/dist/mcp-bridge.js", "--workspace", "/absolute/path/to/your/workspace"]
    }
  }
}
```

Find the extension path with `ls ~/.vscode/extensions | grep sysml-editor` (Windows: `%USERPROFILE%\.vscode\extensions`);
it is a folder such as `~/.vscode/extensions/<publisher>.sysml-editor-<version>`. In an extension development host it is the
repository root after `npm run build`. The path changes with each extension version.

The workspace is the folder opened in VS Code. The bridge finds the running server through a file in
`~/.sysml-editor/servers/` (readable by your user only). If VS Code is not open on that workspace, the bridge prints
`VS Code must be open on this workspace` to stderr and exits with code 1.

### Several windows, several folders, and limits

- **Several VS Code windows on the same workspace**: each window runs its own server. The first window owns
  `<hash>.json`; later ones write `<hash>.<pid>.json`. A window removes only its own entries when it stops. The bridge
  uses the newest entry whose process is alive and deletes entries of dead processes.
- **Multi-root workspaces**: all folders are served. Paths in the first folder are plain relative paths; files in other
  folders are prefixed with the folder name (`<folderName>/<relative path>`). One discovery entry is written per folder
  path, so the bridge can be pointed at any of them. Adding or removing folders re-applies this. With no folder open the
  server is not started.
- **The path given to `--workspace` must be the same folder VS Code has open.** Symlinks are resolved on both sides, but
  a different folder (for example a parent) does not match.
- **Security**: the server listens on `127.0.0.1` only, requires the bearer token, and rejects any request that has an
  `Origin` header or a `Host` other than `127.0.0.1:<port>` / `localhost:<port>` (403). Discovery files are written
  atomically with mode 0600 in a 0700 directory. On Windows these modes do not apply; the file relies on the permissions
  of your user profile.
- **Stale entries**: if an entry exists but connecting fails, the bridge prints
  `Stale server entry for this workspace; reopen it in VS Code` and exits with code 1. If the connection to VS Code is lost
  while the bridge is idle it also exits with code 1 and a message on stderr.
- **Output limits**: `sysml_validate` returns at most 200 problems (the note gives the total; call it per file);
  `sysml_list_files` at most 500 files; `sysml_get_element` at most 200 owned members (with `ownedMembersTotal`) and 20
  declarations; `sysml_get_element_tree` at most 500 nodes.
