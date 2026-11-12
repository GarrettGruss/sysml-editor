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
"MCP: List Servers"). In `mcp` mode the `sysml_*` tools are hidden from VS Code's built-in tool list.

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
