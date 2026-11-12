# Using SysML Editor with AI agents

The extension gives AI agents read access to the SysML v2 model of the open workspace, and lets them read and edit
diagrams (`.sysmld` files). The tools see the same model as the editor, including unsaved edits. They only work while
VS Code is open on that workspace.

## Tools

| Tool | Purpose |
| --- | --- |
| `sysml_list_files` | List the workspace `.sysml` files, their root packages and whether each has syntax errors. |
| `sysml_get_element_tree` | Browse the element hierarchy (default depth limit; request a subtree by qualified name). |
| `sysml_get_element` | Details of one element: kind, type, multiplicity, documentation, members, relationships, file and lines. |
| `sysml_validate` | Syntax errors and unresolved names, with file and line, for one file or the whole workspace. |
| `sysml_list_diagrams` | List the `.sysmld` diagram files with kind, root element, node count, whether each parses and whether it is open in an editor. |
| `sysml_read_diagram` | One diagram as JSON (kind, root, nodes and edges with resolved names, kinds and types, containment, positions, unresolved references). `includeImage: true` adds a PNG. |
| `sysml_create_diagram` | Create a diagram of a given kind for a root element (optionally only some members) and return its path and description. |
| `sysml_add_to_diagram` | Add elements (qualified names) to a diagram. |
| `sysml_remove_from_diagram` | Remove nodes or edges (ids from `sysml_read_diagram`) from a diagram. |
| `sysml_layout_diagram` | Arrange a diagram again (automatic layout). |

Results are JSON text. The model tools (`sysml_list_files`, `sysml_get_element_tree`, `sysml_get_element`, `sysml_validate`) never write
files. The four diagram write tools (`sysml_create_diagram`, `sysml_add_to_diagram`, `sysml_remove_from_diagram`,
`sysml_layout_diagram`) change only `.sysmld` files, never the model or any `.sysml` file; they are marked as not read-only
(`readOnlyHint: false` over MCP, the `edits-diagram` tag in the manifest).

## Diagram edits: open or closed

Each write tool call is one edit, applied without an approval prompt:

- **The diagram is open in an editor**: the change is applied to the open document as an undoable edit and left **unsaved**.
  The tab shows as modified, the editor updates at once, and the user can undo it (Ctrl+Z) or save it. `sysml_read_diagram` of an
  open diagram describes the in-memory content, including unsaved changes (`open` and `unsaved` in the result say so).
  `sysml_layout_diagram` runs the same code path as the Auto-layout command.
- **The diagram is not open**: the change is written to the `.sysmld` file. `sysml_layout_diagram` cannot compute a layout
  without the editor, so for a closed diagram it clears the stored positions and routes in the file; the layout is
  computed the next time the diagram is opened or rendered.
- `sysml_create_diagram` always writes a new file. Without `path` it goes beside the root's source file under the root's name
  (a library element or a source outside the workspace uses the first workspace folder) and never overwrites: a taken name gets a number.
  An explicit `path` must be workspace-relative, end in `.sysmld`, stay inside the workspace, and must not exist.

The result of each write says how it was applied (`applied`: `editor`, `file` or `none`) and includes the diagram as it is now.

### Untrusted workspaces

In an untrusted workspace (`vscode.workspace.isTrusted` is false) the four write tools return an error and change nothing.
The read tools (`sysml_list_diagrams`, `sysml_read_diagram`, including images) keep working.

### Images

`sysml_read_diagram` with `includeImage: true` returns the JSON text plus a PNG (`image/png`, light theme, at most 1600 px wide),
rendered by the diagram view: an `image` content item next to the text over MCP, a `LanguageModelDataPart.image` next to the
text part over Language Model Tools. If the diagram is open in an editor, that editor's view is used. Otherwise VS Code has no
way to render a webview invisibly (a webview in a tab that is not visible is not loaded), so the extension opens a short-lived
panel titled "SysML diagram (rendering)" beside the active editor **without taking focus**, exports the image and closes the
panel. The active editor, its tab and the focus stay as they were, and no tab is left open, but the panel is briefly visible
(and when there is no editor group beside the current one, a group appears and disappears again). If rendering fails or takes
longer than 20 seconds, the call still succeeds: the JSON is returned with `image: { available: false, reason }`.

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
  declarations; `sysml_get_element_tree` at most 500 nodes; `sysml_list_diagrams` at most 500 diagrams;
  `sysml_read_diagram` at most 500 nodes, 1000 edges and 500 unresolved items (with a note); `sysml_create_diagram` and
  `sysml_add_to_diagram` at most 200 elements per call; `sysml_remove_from_diagram` at most 200 ids.
