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
| `sysml_get_editor_context` | What the user is looking at: the active diagram (path, kind, root), the node or line under the pointer, the selected elements (each identified by qualified name or locator plus the diagram node or edge id) and the other open diagrams. Read-only; `activeDiagram` is null when no diagram editor is active. |
| `sysml_create_element` | Create an element (part, port, definition, ...) in an owner's `.sysml` source; optionally also place it on a diagram. |
| `sysml_delete_element` | Delete an element from the model (its declaration and body, and its entries on every diagram). Not the same as removing it from a diagram. |
| `sysml_rename_element` | Rename an element, every reference to it, and the diagram files that refer to it. |
| `sysml_set_element_properties` | Change name, short name, type, multiplicity or documentation of an element. |
| `sysml_create_relationship` | Add a `connect` (connection), `satisfy`, `verify` or `derivation` (a `#derivation connection`) statement, a `succession` (`first a then b;`, optional guard), a `transition` (`transition first a accept T if g do e then b;`) or a `message` (`message [name] [of T] from a to b;`, ordered after the last message). |
| `sysml_set_transition` | Change the trigger, guard and effect of an existing transition; the text is parsed before anything changes. |
| `sysml_create_requirement` | Create a requirement (or `requirement def`) with an optional id (`<'R1'>`) and documentation. |
| `sysml_read_requirements_document` | Read a package as a specification document in Markdown: generated section numbers, table of contents, paragraphs, requirement items and appendices, each heading and requirement followed by a `<!-- qn: ... -->` marker with its qualified name. Read-only; output is cut at 60000 characters with a note. |

| `sysml_read_verification_matrix` | Read the requirements verification matrix of a package, the same rows, columns and status as the editor's Matrix view: one row per requirement, numbered by ownership, with satisfied by, verification method (from `VerificationMethod` metadata), verified by and status (`not satisfied`, `no verification`, `covered`). `format`: `json` (default), `markdown` or `csv`. Read-only; at most 1000 rows. |

Results are JSON text. The read-only tools (`sysml_list_files`, `sysml_get_element_tree`, `sysml_get_element`, `sysml_validate`, `sysml_get_editor_context`, `sysml_read_verification_matrix`) never write
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

### Paths, symlinks and excluded files

Tool inputs are treated as untrusted. Every diagram path is checked before any read or write:

- It must lie inside a workspace folder by its **real path**: the real path of the target (or of its deepest existing parent
  folder, for a new file) must be inside the real path of a workspace folder. A symbolic link that points outside the workspace
  is refused, whether it is a folder on the way or the file itself. Links that stay inside the workspace work.
- A **dangling symbolic link** is never written through: for `sysml_create_diagram` any existing entry at the target name,
  a dangling link included, counts as taken.
- Paths matched by `sysml.exclude` or `files.exclude` (the same rule the diagram file index uses) are refused with an error
  for read, edit, create and layout, and do not appear in `sysml_list_diagrams`.
- A closed diagram is re-checked just before it is written. If the file changed on disk since it was read, the call fails with
  "the diagram changed on disk; read it again" and nothing is written. If an editor opened the diagram in the meantime,
  the edit is applied to the open document instead.

### Untrusted workspaces

In an untrusted workspace (`vscode.workspace.isTrusted` is false) all write tools (the four diagram tools and the six model
edit tools below) return an error and change nothing. The read tools (`sysml_list_diagrams`, `sysml_read_diagram`, including images,
and the model read tools) keep working.

## Model edits

`sysml_create_element`, `sysml_delete_element`, `sysml_rename_element`, `sysml_set_element_properties`,
`sysml_create_relationship` and `sysml_set_transition` change the SysML text, the source of truth. They go through the same operations as the tree
(Add Child, Rename, Delete) and the diagram editor (palette, connection tool, Delete from Model, inline rename, properties panel), so an agent and a
person making the same edit produce byte-identical text (a parity test runs each operation both ways).

- **One edit, saved at once.** Each call is applied as one VS Code workspace edit, with no approval prompt, and the changed
  `.sysml` files are saved, because agents outside VS Code read from disk. The user can undo it with one Ctrl+Z in the text editor. If a
  file already had unsaved edits by the user, saving writes those too.
- **Minimal text edits.** Only the needed spans change; formatting, comments and order are kept. Types and connection ends are
  written so they resolve from where they are written: the short name when visible, otherwise an import is added, otherwise the
  qualified name. Names that need it are quoted.
- **Refusals are errors with a reason, and nothing changes**: a file with a syntax error (the message gives the location), library
  content, files outside the workspace or excluded by `sysml.exclude`, a kind that is not allowed for the owner (`kind` must be one that fits under it: packages take everything, definitions and usages take usages), a name that already exists in the owner, an untrusted workspace, and inherited features. A feature that a usage only
  inherits from its definition (`Model::vehicle1::engine`, declared in `Vehicle`) cannot be deleted, renamed, retyped or extended from the
  usage, and neither can anything inside it (`Model::vehicle1::engine::piston`); the error names the declaring definition. Use the definition's own qualified name to change it for every usage.
  Creating an element inside a usage adds it to that usage only.
- **Diagrams.** With `diagram` (create tools), a node (or edge) is placed on that diagram in the same operation. Deleting an element
  removes its entries from every diagram file; renaming updates the references in the diagram files. These changes are written to the `.sysmld` files at once on top of each file's last saved state. Pending layout in a diagram that is open is **not** saved by a model edit.
  If the diagram is open, the model edit and the node are one undo step from that diagram.
- **A save that fails after the edit was applied is not a failure.** The edit stays applied (as unsaved changes in VS Code), diagram updates and the undo step still happen, and the result lists `filesChanged`, `filesSaved` and `filesNotSaved` exactly; the user gets a warning with a "Save All" action. Do not repeat the edit. "No files were changed" only appears on refusals, where it is true.
- **Diagram problems are reported**: `diagramFilesNotUpdated` lists diagram files that could not be updated (unreadable, with parse errors, or changed on disk meanwhile).
- **Results** are JSON with `filesChanged` (workspace-relative paths), the resulting `qualifiedName`, and for renames `referencesUpdated` and
  `couldNotJudge` (mentions of the old name the tool could not decide about, with a few locations). A delete reports `remainingReferences` (with locations) and, separately, `remainingMentionsNotChecked`.
- The six tools are marked not read-only (`readOnlyHint: false` over MCP, the `edits-model` tag in the manifest).

### Behaviour: actions, states, successions, transitions and messages

`sysml_create_diagram` and `sysml_read_diagram` handle the kinds `actionFlow`, `stateTransition` and `sequence` (the root must fit the kind; otherwise the error says why). The JSON description of an edge has a `behavior` object: a succession has its `guard` (`else` for an else branch) and `implied` when it is written as part of a node declaration (`then action b;`); a flow its `item` and the parameter ends; a transition its `trigger`, `guard` and `effect` as source text; a message its `itemType`, its `order` in time (from 0) and `unordered: true` when the model gives no order between it and another message. A sequence diagram also lists `messages` in time order. Unnamed statements have a `locator` in `element` (the same `{ owner, kind, ends, index? }` the diagram file uses) and a `fingerprint` (a hash of the statement's text and its ordinal). Pass the fingerprint inside `statement` to `sysml_delete_element` or `sysml_set_transition`; the call is refused, and nothing changes, when the statement the locator now addresses is not the one that was read.

`sysml_create_element` also creates `state`, `state def` and, inside an action, the control nodes `fork`, `join`, `decide` and `merge` (give them a name: successions refer to nodes by name). `sysml_create_relationship` with `kind` `succession`, `transition` or `message` writes the same text as the Action Flow, State Transition and Sequence palettes (`first a then b;`, `transition first a accept T then b;`, `then message m of T from a to b;` right after the last message). A succession that already exists is refused. Trigger, guard and effect are parsed with the edit and refused with the syntax error when invalid. `sysml_delete_element` deletes an action, state, control node or message together with the successions, transitions and flows that connect it, in one edit; an unnamed succession, transition or message is given as `statement` (its locator). A succession written as `then ...` inside a node declaration cannot be deleted on its own.

### Images

`sysml_read_diagram` with `includeImage: true` returns the JSON text plus a PNG (`image/png`, light theme, at most 1600 px wide),
rendered by the diagram view: an `image` content item next to the text over MCP, a `LanguageModelDataPart.image` next to the
text part over Language Model Tools. If the diagram is open in an editor, that editor's view is used. Otherwise VS Code has no
way to render a webview invisibly (a webview in a tab that is not visible is not loaded), so the extension opens a short-lived
panel titled "SysML diagram (rendering)" beside the active editor **without taking focus**, exports the image and closes the
panel. The active editor, its tab and the focus stay as they were, and no tab is left open, but the panel is briefly visible
(and when there is no editor group beside the current one, a group appears and disappears again). If rendering fails or takes
longer than 20 seconds, the call still succeeds: the JSON is returned with `image: { available: false, reason }`.

Limits: temporary render panels are used one at a time, and at most 8 requests may wait; further requests get
`image: { available: false, reason: "too many pending image requests" }`. An image larger than 1 MB is exported again at
half the width (repeatedly, down to 400 px); if it still exceeds 1 MB the reason is `"image too large"`.

## UI control: driving the editor like a tester

Seven tools let an agent use the editor's own UI: `sysml_ui_command`, `sysml_ui_answer`, `sysml_ui_state`,
`sysml_ui_diagram`, `sysml_ui_requirements`, `sysml_ui_tree` and `sysml_ui_screenshot`. They are meant for testing and
for tasks that need the real UI (menus, prompts, undo, the tree).

**They are off by default.** Turn them on with the user setting `sysml.agent.uiControl` (user level only; a value in
`.vscode/settings.json` is ignored, so a cloned repository cannot enable it). They also need a trusted workspace. When
off, every UI tool refuses and says which setting to change, and `sysml_ui_state` answers `enabled: false`.

| Tool | Purpose |
| --- | --- |
| `sysml_ui_command` | Run an allowlisted command: any `sysml.*` command, undo, redo, save, save all, back, forward. Returns when it finishes or opens a prompt. |
| `sysml_ui_answer` | Answer an open prompt (pick, picks, text, confirm, save path, cancel). Unanswered prompts time out as cancelled. |
| `sysml_ui_state` | Active editor and dirty flag, diagram selections, open menus, undo and redo labels, user messages (drained on read), open prompts, navigation history, clipboard kind. |
| `sysml_ui_diagram` | Replay a gesture in a diagram (select, drag, keys, context menu and click by label, palette, legend, connect, inline edit, ...) and observe nodes, menu, legend, clipboard. |
| `sysml_ui_requirements` | Open a view (table, matrix, document), click, type, drag a section in the contents, export the matrix, observe. |
| `sysml_ui_tree` | List, select one node, collapse all, and run the tree commands a node offers. Selecting several nodes is refused (the tree API cannot). |
| `sysml_ui_screenshot` | A PNG of a diagram or requirements webview (only that webview, never the screen). |

Safety: commands outside the allowlist are refused; file arguments must lie inside the workspace; delete commands still
ask their confirmation, which the agent must answer; the clipboard is reported by kind, never content. Every call writes
one line (tool, target, arguments) to the "SysML Agent UI" output channel before it runs.

## Tutor: teaching the user in the editor

Two more tools let an agent teach: `sysml_ui_highlight` and `sysml_ui_wait_for_user`. They only display and observe; they
never change the model. They are off by default and have their own user setting, `sysml.agent.tutor` (user level only; a
value in `.vscode/settings.json` is ignored). Either `sysml.agent.tutor` or `sysml.agent.uiControl` turns them on, and they
need a trusted workspace. With only the tutor setting on, `sysml_ui_state` and `sysml_ui_screenshot` also work (so the agent
can check what it showed), but the control tools above stay refused. When both settings are off, the tutor tools refuse and
name `sysml.agent.tutor`. Every call is written to the "SysML Agent UI" output channel.

| Tool | Purpose |
| --- | --- |
| `sysml_ui_highlight` | Spotlight a target with a callout. In a diagram: `path` with `node` (a node id) or `selector` (a CSS selector such as `[data-testid=...]`). In a requirements editor: `package` or `file` with `selector`. The editor is brought to the front first. The callout is plain text, cut to 280 characters. A new highlight replaces the last. |
| `sysml_ui_wait_for_user` | Wait up to `timeoutSeconds` (default 60, at most 300) for the user to do something, and report `{ event: { kind, id? } }` (`kind`: `command`, `selection`, `editor` or `gesture`; kinds and ids only, never text the user typed), or `{ event: null, timedOut: true }`. The agent's own actions are never reported. |

The user dismisses a highlight with Esc or the close button of the callout; it also clears when its target disappears.

VS Code's own screen (the Model view, its New File and New Folder buttons, the Command Palette) cannot be drawn on. For these,
`sysml_ui_highlight` takes `chrome` instead of a target (`modelTree`, `treeNewFile`, `treeNewFolder`, `commandPalette`; the
last takes an optional `command` to type in). The view is revealed, or the Command Palette opened, and the result carries a
fixed description of where the target is (`highlighted: false`, `description`), which the agent passes on in words.

Two walkthroughs, opened from the Welcome page (Get Started), cover the same ground without an agent: **SysML: First Steps**
(the Model view, creating a file, the requirements editor) and **SysML: Diagram Basics** (creating a diagram, placing an
element, connecting, saving). Their steps complete when the user runs the matching command.

## Skills

Three Claude agent skills ship with the extension in `src/skills/` (and in the VSIX): `sysml-modeling` (read and edit the model and
diagrams), `sysml-ui-testing` (drive and test the UI, record acceptance results) and `sysml-tutor` (teach with highlights). In this
repository they are linked from `.claude/skills/`. To use them in another Claude setup, copy the folders
(`<extension path>/src/skills/<name>`) into your own skills folder, for example `~/.claude/skills/` or a project's `.claude/skills/`.

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

## Requirements

`sysml_read_requirements_document` returns the same projection as the Document view of the requirements editor (see
[requirements-document.md](requirements-document.md)): the title (from `@DocumentRoot`, else the package name), a table of
contents, numbered sections (`1`, `1.1`, ...; numbers are computed, never in the model), paragraphs, requirement items with
their relationships, and appendices (`@Appendix`, lettered A, B, ...). Headings and requirements end with a marker such as
`<!-- qn: VehicleSpec::'Performance Requirements'::massLimit -->`; pass that qualified name to the edit tools. Text from the model
cannot forge a marker (`<!--` and `-->` in model text are escaped).

`sysml_read_verification_matrix` returns the matrix of the requirements editor's Matrix view for a package: rows nested and numbered
by ownership (packages are section rows), each requirement with `satisfiedBy`, `methods`, `verifiedBy` and `status`. The method is
read from the standard `@VerificationMethod { kind = VerificationMethodKind::test; }` metadata on the verification case
(`inspect`, `analyze`, `demo`, `test`). A child requirement counts the `satisfy` of its parent (and of a usage of its owning
definition); such links carry `via`. Pass/fail results are not part of the model and not shown. `format: "markdown"` or `"csv"` returns
the editor's export text.

`sysml_create_requirement` and the `verify` and `derivation` kinds of `sysml_create_relationship` go through the same
`ModelService` operations as the requirements editor and the Requirements View palette, so the text is byte-identical:

- `kind: "verify"` with `requirement` and either `verificationCase` (an existing case, whose objective gets `verify <requirement>;`;
  an objective is created when missing) or `newVerificationCase` (a name; `verification <name> { objective { verify <requirement>; } }`
  is created in `owner`, default the requirement's package). SysML v2 allows `verify` only inside a verification case.
  A requirement definition is verified as `verify requirement : R;`.
- `kind: "derivation"` with `original` and `derived` (a list; usages only, a definition is refused; a second derivation from the same original in the same owner extends the existing connection): `#derivation connection { end #original ::> a; end #derive ::> b; }`
  in `owner` (default the package of the first derived requirement), plus `private import RequirementDerivation::*;` when
  those names are not visible there.

String inputs are bounded (names and ids 1000 characters, qualified names 4096, documentation 100000); ids and names are quoted as needed (`<'R 1'>`).
Comment text containing `*/` is stored as `*\/`; Markdown read through `sysml_read_requirements_document` shows it unescaped (one backslash is removed from each run of backslashes between `*` and `/`).

Both channels (language model tools and MCP) return identical results; write tools are refused in an untrusted workspace and on
files with syntax errors.
