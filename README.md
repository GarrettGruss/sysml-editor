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
- Setting `sysml.tree.followCursor` (default `true`) reveals and selects the tree node for the declaration under the text cursor while the view is visible.

Test fixtures in `fixtures/` are git submodules: run `git submodule update --init` after cloning (tests that need them are skipped otherwise).

To try the extension, open this folder in VS Code and press F5 (Extension Development Host).
