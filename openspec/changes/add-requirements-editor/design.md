# Design

## Context

This is change 4 of 4 for the VS Code SysML v2 editor: `add-model-foundation`, `add-diagram-viewing`, `add-model-editing`, `add-requirements-editor`, implemented in that order. The feasibility analysis behind the split is in the [trade study](../../../docs/trade-study.md) and UI mockups are in [docs/mockups](../../../docs/mockups/index.html).

This change adds the requirements editor (table and document views), requirement relationships, and the matching agent tools. It builds on the edit planner from `add-model-editing`.

## Goals / Non-Goals

**Goals:**
- Requirements are editable as a table and as a specification document, with SysML text as the only stored form.
- Requirement relationships are written the way SysML v2 defines them.

**Non-Goals:**
- Editing requirement subjects, attributes, and constraint expressions.
- Export to PDF or Word, figures, and cross-references in the document view.
- Deferred: nested requirements and the definition-versus-usage distinction in the table.

## Decisions

Decision numbers are shared across the four changes that make up the editor, so they are not consecutive here.

### D14: Requirements document view
The document view is a projection computed in core (`DocumentModel` built from the package tree) and rendered as HTML in the requirements editor webview, which has a Table / Document toggle. Mapping (see requirements-editor spec): root package → document; nested package → section (heading = name, quoted when needed); `doc`/`comment` → paragraphs; requirements → items; other elements → model-elements listing.

Document-only information uses SysML v2 metadata from a library shipped with the extension, `DocumentAnnotations.sysml`:
```
library package DocumentAnnotations {
    private import ScalarValues::String;
    metadata def DocumentRoot { attribute title : String; attribute version : String; }
    metadata def Appendix;
}
```
Files using it add `private import DocumentAnnotations::*;` (inserted automatically by the editor). The library is indexed read-only like `sysml.library`.

Numbering and TOC are computed, never stored, so reordering never needs text renumbering and the source stays free of derived data. Paragraph bodies are plain comment text, rendered with a CommonMark subset (emphasis, inline code, lists, links; no raw HTML). SysML comments have no escape mechanism, so `*/` is stored as `*\/` and unescaped on display. This is a convention of this extension, and other SysML tools will show the backslash; leading ` * ` margin characters in comment bodies are stripped on read and regenerated on write using the existing comment's style.

Document edits reuse EditPlanner operations (rename, insert member, move member, set comment body); moving a section is a new `moveMember` plan that cuts the declaration (with its leading comments) and reinserts it at the target position with re-indentation. The agent tool `read_requirements_document` renders the same `DocumentModel` to Markdown with `<!-- qn: ... -->` markers.

Alternatives: (a) a separate document file (e.g. Markdown with embedded references), rejected because the user requires the document to adhere to SysML v2 syntax and a second source of truth would drift; (b) storing section numbers as short names (`package <'3.1'> ...`), rejected because reordering would rewrite many declarations and short names are better left for user-assigned ids.

Requirement relationships follow the language, not SysML v1 habits:
- **satisfy**: `satisfy <requirement> by <element>;`, placed in the package that owns the satisfying element unless the user chooses another owner.
- **verify**: valid only inside a verification case, so the edit plan inserts `verify <requirement>;` into the objective of a chosen or newly created `verification` usage.
- **derivation**: `derive` is not a keyword. The edit plan writes `#derivation connection { end #original ::> a; end #derive ::> b; }` and adds `private import RequirementDerivation::*;` when missing.

## Risks / Trade-offs

- [Prose in SysML comments is awkward to edit as raw text] → The document view is the primary prose editor; comment formatting is normalized on write only for the edited comment.
- [Moving sections changes qualified names only if the parent changes] → Cross-parent moves use the RenameService path to update references and diagram files.
- [Files that import `DocumentAnnotations` show an unresolved import in other SysML tools] → Offer to copy the library file into the workspace.
- [The `*\/` convention is not part of SysML v2] → Stated in the spec and documentation; other tools show the backslash.
