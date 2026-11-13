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
- Editing constructs listed as text-only in [docs/editing-coverage.md](../../../docs/editing-coverage.md) (behaviour editing was added later by `add-behavior-diagrams`).
- Requirement-specific relationships (verify, derivation), which are in `add-requirements-editor`.
- Pretty-printing or reformatting files.
- Deferred: an independent parser in CI to check generated text, and a read-only mode for agent tools.

## Decisions

Decision numbers are shared across the four changes that make up the editor, so they are not consecutive here.

### D21: The diagram editor is a visual editor for the SysML text
Every action that changes the model from a diagram, the tree, the requirements editor or an agent is a text edit planned by the EditPlanner (D4) and applied through `ModelService`: nothing in a view holds model data that is not in the text. The diagram is therefore a visual code editor for SysML, the same way the text editor is a textual one; together with "a diagram is a view into the model, not the model itself" (only layout and style live in `.sysmld`), this decides where every new feature belongs. A gesture that changes meaning (naming, nesting, connecting, editing a doc comment or a trigger) is a model edit, saved at once; a gesture that only changes appearance (position, route, label placement, style, showing or hiding) is a layout edit, saved with the diagram. A new diagram feature must say which of the two it is.

How much of the language can be edited visually is tracked construct by construct in [docs/editing-coverage.md](../../../docs/editing-coverage.md): each construct is either editable from a diagram (and how) or text-only, and growing that list is how the visual editor grows. Constructs outside it stay readable and editable in the text editor; a diagram never blocks or rewrites text it does not understand.

Alternatives: a diagram-first model with the text generated from it (rejected: the text is the source of truth and must keep the user's formatting and comments); a separate visual-only notation (rejected: it would disagree with the text).

### D4: Text edits via EditPlanner on the CST
Each GUI operation maps to an `EditPlan` computing `TextEdit`s against CST node ranges: insert into a body (creating `{}` when the declaration ends in `;`), delete a node's full range plus leading doc comment and trailing whitespace line, replace a name token, etc. Indentation is copied from sibling members. Every plan is verified by re-parsing in tests (round-trip). Alternative: pretty-print the whole AST — rejected; destroys formatting/comments.

### D6: Combined undo
A palette add produces (a) a `WorkspaceEdit` on `.sysml` and (b) a diagram edit. The diagram's custom-document edit entry's `undo` callback removes the node and applies the inverse text edit; VS Code's text undo stack is not relied on for cross-file atomicity. Risk acknowledged below.

Model state is saved at once; layout and style stay in memory until the user saves the diagram. Every model edit, from a graphical editor, the tree, or an agent, saves the edited `.sysml` documents as part of the operation. The changes a model edit forces on diagram files (a node for the element just created, reference updates on rename, entries removed on delete) are written to disk on top of each file's last saved state, not by saving the open diagram document, so pending positions, sizes, routing, and styles are not saved and the diagram stays marked as unsaved. People and agents follow the same rule (D11). Undo is itself a model edit and is saved the same way. A diagram entry whose element disappears from the text during the session (for example by Undo in the text editor) is removed; unresolved placeholders are kept only for references that resolved when the diagram was opened. Layout, style, and diagram-only actions (add an existing element, remove from diagram) keep VS Code's normal unsaved state.

Trade-off: saving a `.sysml` file after a diagram edit also saves anything the user had typed in it and not yet saved. Accepted in exchange for the editors and the text never disagreeing.

**Findings of the spike (task 3.1), observed in VS Code 1.146 by the integration test "Undo investigation (design D6)":**

- VS Code keeps one undo stack per resource. A `WorkspaceEdit` on a text document goes on that document's text stack; a `CustomDocumentEditEvent` goes on the custom document's stack. Nothing links them, and the `undo` command acts on the stack of the active editor only. There is no cross-resource atomic undo to rely on.
- A custom-editor edit event always marks the tab as modified (VS Code ties "dirty" to the stack position and the extension cannot report an edit as already saved). After a model edit made from a diagram the tab therefore shows the modified dot even though the `.sysml` and `.sysmld` files on disk already hold everything; saving it rewrites the same content (plus any pending layout). The internal `DiagramState.dirty` flag (layout actually unsaved) stays separate and is what decides whether pending layout exists.
- `undo` with the diagram active runs our entry's `undo` callback, which may be asynchronous. It applied the inverse text edits as a new `WorkspaceEdit` and the diagram revert in one step: the text buffer and the file on disk were back, and the node was gone.
- That inverse edit is itself a new entry on the text stack. A following `undo` in the text editor undoes the inverse (the element reappears in the buffer, unsaved) and a second one undoes the original edit. This is VS Code's normal behaviour for any edit and is accepted; the diagram does not re-create the node in that case because the text editor's undo is not a diagram action.
- `undo` in the text editor after a diagram-made edit removes the element from the buffer at once (unsaved); the diagram follows through the model change (see below), and a later `undo` in the diagram finds the text already reverted.

**Decided behaviour (built):**

1. A model edit made from a diagram (or by an agent with `diagram` pointing at an open diagram) pushes ONE entry on the diagram's stack. Its `undo` computes the inverse text edits from the plan (`src/model-service/undo.ts`), validates them against the current text (every touched document must be exactly as the edit left it), applies them as one `WorkspaceEdit`, saves, and then reverts the forced diagram changes (memory and the saved state on disk). If the text no longer matches, a warning is shown and NOTHING is reverted: neither the text nor the diagram part (the two would otherwise disagree), and the undo entry is spent. If the text was already reverted (it equals the pre-edit state, for example by Undo in the text editor), no warning and no text edit; only the diagram part is reverted. `redo` repeats the same steps forwards with the same validation.
2. Forced diagram changes are kept in `DiagramState.forced` and re-applied after an undo or redo of an earlier layout edit, so such an undo cannot lose the new node.
3. Undo in the TEXT editor: the element disappears from the text; the diagram entry that this session created for it (`DiagramState.created`, a set of reference keys) is found unresolved at the next refresh and removed from memory and from the file on disk, but ONLY when the document that declared the element parses cleanly at that moment (no syntax errors, not stale, no pending error details), the element is absent from that clean model and rename detection did not match it to a renamed element. While the file does not parse (the user is typing) the entry is kept and nothing is written. The removal is an ordinary forced change that can be reverted: if the element reappears at the same qualified name in the same session (Redo in the text editor), the entry is restored at its previous position. Placeholders stay only for entries that were not created in this session.
4. Edits made without an origin diagram (tree, agent without `diagram`) are one `WorkspaceEdit` and therefore one text-editor undo step; no diagram entry is pushed. The diagram files they force are updated on disk and in memory without making open diagrams dirty.
5. Staleness between planning and applying: every plan carries the texts it was computed from (`base`); the host applies the edits only if every document still has exactly that text, otherwise the operation re-syncs, re-plans once, and fails with a message if the text changed again.

### D18: Inherited features are read-only from a usage
A feature shown inside a usage but declared in its definition (or a supertype) is marked inherited in the view model. Delete, rename, retype and adding members on it, and on anything beneath it (an own member of an inherited feature), are refused in `ModelService`; nested nodes are marked inherited too and standard library supertypes are not followed, so the rule holds for the GUI and for agents alike, and the error carries the declaring element for "Go to Definition". Adding inside a usage inserts into that usage's own body. Redefining an inherited feature in the usage (`:>>`) is not offered in this change.

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
