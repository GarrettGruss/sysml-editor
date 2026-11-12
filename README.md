# sysml-editor

A VS Code extension for SysML v2 (Node 22+, npm).

```bash
npm install                 # install dependencies
npm run typecheck           # tsc --noEmit
npm run build               # bundle dist/extension.js and dist/mcp-bridge.js
npm test                    # Vitest unit tests (vscode-free modules)
npm run test:integration    # @vscode/test-electron (needs a display and downloads VS Code)
```

## SysML Model view

The SysML activity bar icon opens the **SysML Model** view: a native tree of the packages and elements declared in the workspace's `.sysml` files (the standard library is not listed). Items show the declared name, a kind icon and a description (`: Type [mult]` for typed usages, the kind for definitions, the file name for packages at the root). Unsaved editor text is reflected within a fraction of a second. A root package whose file has syntax errors shows an error icon and keeps its last good contents; hover for the first error.

- While the standard library and the workspace files load in the background the view shows **Loading SysML model…**; activation never waits for it.
- A file that has never parsed cleanly appears as a root named after the file with an error icon and the description `syntax error`; click it to jump to the first error.
- Setting `sysml.exclude` (array of globs relative to the workspace folder, default `["**/node_modules/**"]`) lists `.sysml` files that are not indexed. It is applied together with `files.exclude` and `search.exclude` to the initial scan, file watching and opened documents. This repository's `.vscode/settings.json` excludes `fixtures/**`.
- Command **Go to Definition** (tree item click or context menu) opens the file with the element's name selected.
- In a workspace without `.sysml` files the view offers **New SysML File** (`sysml.newFile`).
- Setting `sysml.tree.followCursor` (default `true`) reveals and selects the tree node for the declaration under the text cursor while the view is visible. It also makes the tree follow the node selected in a diagram (see below).
- Context menu on an element: **New Diagram…**, **Show in Diagram** and **Add to Active Diagram** (see below), and the editing commands in the next section.

### Editing from the tree

The context menu of an element edits the model; every edit changes the `.sysml` text with a minimal edit (formatting, comments and order of the rest are kept) and **saves the file at once**.

- **Add Child…** asks for the kind (package, part def, part, port def, port, attribute def, attribute, item def, item, action def, action, requirement def, requirement; only the kinds that fit under the element are offered), then for a name (checked against the owner's members). Names that need it are quoted. A body is created when the owner is a declaration ending in `;`.
- **Rename…** (also **F2** in the tree) prefills the name and updates the declaration, every reference that resolves in the workspace and the `.sysmld` files that refer to the element. If some mentions of the old name could not be judged, a warning says how many.
- **Delete…** always asks for confirmation and states how many elements the element owns and how many references elsewhere it has; it removes the whole declaration (body, owned members, its documentation comment) and the element's entries from every diagram. References elsewhere are left as they are and no longer resolve.
- A file with a syntax error is not edited: the message links to the error ("Go to error"). A valid file with constructs the tools do not show (state machines, calculations) can be edited.
- One **Undo** in the text editor reverses an edit made from the tree.

Test fixtures in `fixtures/` are git submodules: run `git submodule update --init` after cloning (tests that need them are skipped otherwise).

To try the extension, open this folder in VS Code and press F5 (Extension Development Host).

## Diagram editor

A `.sysmld` file opens in a graphical editor: a General View, an Interconnection View or a Requirements View of the model. A diagram stores which elements are shown and where, in the `.sysmld` file (format: [docs/diagram-format.md](docs/diagram-format.md)); names, types, compartments and relationships are read from the model and follow it within a second of a text edit. A member added to an element in the model appears in the owner's compartment (General View) but is not added as a new node; add it yourself. Layout and style actions never change SysML text; the model-editing actions described under **Editing the model from a diagram** do, and they save the `.sysml` file at once.

**Commands** (Command Palette, tree and toolbar)

| Command | What it does |
| --- | --- |
| `SysML: New Diagram…` (`sysml.newDiagram`) | Tree context menu or palette. Pick General, Interconnection or Requirements View, then a file name (default `<element>.sysmld` next to the element's source file; an existing file is never overwritten, `Name 2.sysmld` is suggested instead). The file is created from the element and its direct members and opened. |
| `Show in Diagram` (`sysml.showInDiagram`) | Tree context menu. Lists the `.sysmld` files in the workspace that show the element, opens the chosen one and selects the node. |
| `Add to Active Diagram` (`sysml.addToActiveDiagram`) | Tree context menu, enabled while a diagram editor is active. Adds the element as a node (inside the node of its owner in an Interconnection View when that is shown, otherwise at top level), with relationship edges to elements already shown. |
| `SysML: Show Element on Diagram…` (`sysml.diagram.showElement`, toolbar **Show Element…**) | Quick pick of the model's named elements; the chosen one is added like above. |
| `SysML: Auto-layout Diagram` (`sysml.diagram.autoLayout`, toolbar **Auto-layout**) | Lays out every node again, ignoring stored positions. |

**Mouse**: click selects, Shift-click toggles, Shift-drag on the background selects with a rubber band, drag moves (children move with their container and cannot leave it; ports slide along their owner's border), drag a handle of a selected node to resize (not below its content, nor under its nested nodes). Drag the background, use the middle button or hold Space and drag to pan. Ctrl/Cmd + wheel zooms, the wheel pans; the toolbar has **Fit**, zoom in and out. Right-click a node for **Remove from Diagram**; on an unresolved item also **Re-link…**.
Positions and sizes snap to an 8 px grid. A drag or resize is one edit when you release the button.

**Keyboard**: the diagram takes focus (visible focus ring). Tab and Shift+Tab move the selection between nodes, arrow keys nudge the selection by one grid step (Shift: four; presses within 500 ms are one edit), Ctrl/Cmd+A selects all, Escape clears the selection or cancels a gesture, Delete or Backspace performs **Remove from Diagram**, the Menu key (or Shift+F10) opens the context menu. Selected nodes are announced with their kind and name.

**What is saved when**: moving, resizing, nudging, Auto-layout, adding an element, Remove from Diagram and Re-link are each one undoable edit that makes the diagram dirty; nothing is written until you save. Automatic layout of nodes that have no stored position (on open) is not an edit: the diagram stays clean, and the computed positions are written the next time you save. **Remove from Diagram** only removes the node (with its child nodes and attached edges) from the file; the model is never changed. A reference whose element was deleted stays as an **unresolved** node (dashed, with the stored name) until you remove or re-link it; a rename typed in the text editor is followed automatically.

**Edges** are routed orthogonally: automatically laid-out diagrams use the routes ELK computes, manually placed nodes get a route with one or two bends from the sides that face each other; a stored route is kept while neither end moved. Labels sit beside the edge. A Requirements View draws satisfy and verify edges (dashed, labelled) from the satisfying or verifying element to the requirement, and `#derivation connection` statements as dashed `«derive»` edges from the derived to the original requirement (a connection with several derived ends draws only the first).

**Dragging from the tree**: dragging elements from the SysML Model view carries their qualified names on the data transfer (MIME type `application/vnd.sysml-editor.elements`, also as plain text), and the diagram accepts a drop of that type. Whether VS Code delivers a tree drag into a custom editor's webview depends on the VS Code version and was not confirmed in automated tests (they exercise the drop handler and the tree's side separately); **Add to Active Diagram** and **Show Element…** do the same without dragging and are always available.

**Theme**: colours come from VS Code theme variables, so light, dark and high-contrast themes work; in high contrast, borders use the contrast border colour. The PNG export used for tests and agents keeps a fixed light theme.

### Editing the model from a diagram

The SysML text is the source of truth and the diagram is always kept in step with it.

- **Palette** (left of the canvas): lists the kinds valid for the diagram (General: part def, port def, attribute def, item def, action def and the matching usages; Interconnection: part, port, attribute and Connection; Requirements: requirement def and requirement). Click an item, then click the container (or the canvas for the diagram's root) to create the element there. You are asked for a name; the declaration is inserted into the container's body and the node is placed where you clicked, as one edit. Escape cancels the tool.
- **Connection**: choose Connection in the palette, click the source (port or part), then the target. `connect a.x to b.y;` is added to the nearest element that contains both ends (refused if there is none on the diagram) and the edge appears.
- **Inline rename**: double-click a node's label or press **F2** on a selected node; Enter renames (declaration, references and diagram files), Escape cancels.
- **Properties panel** (right): for a single selected node, shows kind and qualified name (read-only) and edits name, short name, type (with completion from definitions of the matching kind), multiplicity and documentation; each field commits when you leave it or press Enter. Fields are disabled, with an explanation, for inherited features, standard library elements and unresolved nodes.
- **Delete from Model…** (node context menu or command `SysML: Delete from Model…`) deletes the SysML element and what it owns from the source and removes it from every open diagram and every diagram file that shows it; it asks first when the element owns members or is referenced elsewhere. **Delete (the key) and Remove from Diagram only remove the node from the diagram and never change the model.**
- **Undo** from the diagram reverses both the text change and the diagram change. The tab shows as modified after such an edit (VS Code ties undo to that marker) although the files are already saved.

**What is saved when.** A model edit (from the tree, a diagram or an agent) is written to the `.sysml` file and saved immediately, so the text and the graphical editors never disagree; saving also saves whatever else you had typed and not saved in that file. What the edit forces on diagram files (a node for the element just created, renamed references, entries removed on delete) is written to each `.sysmld` on top of its last *saved* state, also at once. Layout and style (moves, resizes, auto-layout) stay in memory until you save the diagram: a model edit never saves pending layout, and if you close without saving, the text and the diagram both show the edit but the unsaved layout is gone. Undo in the text editor removes the element and the diagram entry that was created for it (no unresolved placeholder).

**Inherited features.** A usage inherits the features of its definition and supertypes. In a General View a usage lists them (in italics) in a compartment; in an Interconnection View of a usage, inherited parts and ports that are on the diagram are drawn **dashed on a muted fill** (they are not added automatically). Inherited features cannot be deleted, renamed or retyped from the usage by a person or an agent: the message names the definition and offers **Go to Definition**. Adding a feature inside a usage adds it to that usage only; the definition and other usages are unchanged. Redefining an inherited feature is not offered.

## AI agents

Agents can read and validate the open SysML model, edit diagrams and edit the model (create, delete, rename, change properties, connect and satisfy) through Language Model Tools and MCP; model edits go through the same operations as the tree and the diagrams, are saved at once, are one undo step and are refused in untrusted workspaces. See [docs/agents.md](docs/agents.md).
