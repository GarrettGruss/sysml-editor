# Design

## Context

This is change 3 of 4 for the VS Code SysML v2 editor: `add-model-foundation`, `add-diagram-viewing`, `add-model-editing`, `add-requirements-editor`, implemented in that order. The feasibility analysis behind the split is in the [trade study](../../../docs/trade-study.md) and UI mockups are in [docs/mockups](../../../docs/mockups/index.html).

This change adds every operation that changes SysML text: the edit planner, editing from the tree and from diagrams, rename, undo, and the agent write tools. It builds on the syntax tree with exact source positions from `add-model-foundation` and the diagram editor from `add-diagram-viewing`.

## Goals / Non-Goals

**Goals:**
- Edits change only the text they need to and keep formatting and comments.
- A person and an agent making the same edit produce identical text.
- One undo step reverses both the text and the diagram change.

**Non-Goals:**
- Editing expressions, behaviors, or constructs the diagrams do not show.
- Requirement-specific relationships (verify, derivation), which are in `add-requirements-editor`.
- Pretty-printing or reformatting files.
- Deferred: an independent parser in CI to check generated text, and a read-only mode for agent tools.

## Decisions

Decision numbers are shared across the four changes that make up the editor, so they are not consecutive here.

### D4: Text edits via EditPlanner on the CST
Each GUI operation maps to an `EditPlan` computing `TextEdit`s against CST node ranges: insert into a body (creating `{}` when the declaration ends in `;`), delete a node's full range plus leading doc comment and trailing whitespace line, replace a name token, etc. Indentation is copied from sibling members. Every plan is verified by re-parsing in tests (round-trip). Alternative: pretty-print the whole AST — rejected; destroys formatting/comments.

### D6: Combined undo
A palette add produces (a) a `WorkspaceEdit` on `.sysml` and (b) a diagram edit. The diagram's custom-document edit entry's `undo` callback removes the node and applies the inverse text edit; VS Code's text undo stack is not relied on for cross-file atomicity. Risk acknowledged below.

Model state is saved at once; layout and style stay in memory until the user saves the diagram. Every model edit, from a graphical editor, the tree, or an agent, saves the edited `.sysml` documents as part of the operation. The changes a model edit forces on diagram files (a node for the element just created, reference updates on rename, entries removed on delete) are written to disk on top of each file's last saved state, not by saving the open diagram document, so pending positions, sizes, routing, and styles are not saved and the diagram stays marked as unsaved. People and agents follow the same rule (D11). Undo is itself a model edit and is saved the same way. A diagram entry whose element disappears from the text during the session (for example by Undo in the text editor) is removed; unresolved placeholders are kept only for references that resolved when the diagram was opened. Layout, style, and diagram-only actions (add an existing element, remove from diagram) keep VS Code's normal unsaved state.

Trade-off: saving a `.sysml` file after a diagram edit also saves anything the user had typed in it and not yet saved. Accepted in exchange for the editors and the text never disagreeing.

### D18: Inherited features are read-only from a usage
A feature shown inside a usage but declared in its definition (or a supertype) is marked inherited in the view model. Delete, rename, and retype on it are refused in `ModelService`, so the rule holds for the GUI and for agents alike, and the error carries the declaring element for "Go to Definition". Adding inside a usage inserts into that usage's own body. Redefining an inherited feature in the usage (`:>>`) is not offered in this change.

Alternatives: edit the definition from the usage (rejected: it silently changes every other usage); ask each time (rejected: more to build, and the user decided definitions must not be changed through inheritance).

### D19: How generated text refers to other elements
`ModelService` resolves a reference from the edit location before writing it: (1) if the short name already resolves to the target, write the short name; (2) otherwise add `private import <qualified name>;` to the enclosing package, after its existing imports, and write the short name; (3) if that import would make a name in scope ambiguous, write the fully qualified name and add no import. Names are quoted when they are not basic names or are reserved words.

### D11: Agent edits and undo
Agent tool calls go through `ModelService` like GUI edits: one `WorkspaceEdit` plus diagram edit per call, so they see unsaved buffers and cannot conflict with them. Affected documents are then saved, because agents outside VS Code read files from disk. Each call is one undo step in VS Code's history; there is no separate journal and no `undo` tool. Diagram-only agent edits are not model edits: they follow the layout rule in add-diagram-viewing (unsaved while the diagram is open). If a touched document already had unsaved user edits, saving writes those too; this is documented.

## Risks / Trade-offs

- [Cross-file undo can desync if the user edits text between operations] → Inverse edits are validated against current text; if stale, show a warning and skip the text revert. Confirm the approach with a spike (task 3.1) before building on it.
- [Generated text is checked only by our own parser] → Round-trip tests on the fixtures; an independent parser in CI is a candidate follow-up (trade study, gap 22).
- [Where a new statement goes is ambiguous (owner, file)] → Default to the element the user dropped onto or the diagram's root; the agent tools take the owner explicitly.
- [Agent edits save files, which also saves the user's unsaved edits in them] → Documented; write tools are disabled in untrusted workspaces.
