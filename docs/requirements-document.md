# Requirements editor and document view

The requirements editor (`SysML: Open Requirements Editor`, `sysml.openRequirementsEditor`; tree context menu on a package, Explorer
context menu on a `.sysml` file, or the command palette) shows a package or file in two views, switched with the **Table / Document**
tabs. SysML text is the only stored form: every edit goes through the same model operations as the tree, the diagrams and the agent
tools (one workspace edit, saved at once, refused on files with syntax errors, library content, excluded or out-of-workspace files).

## Table

Columns: id (short name), name, text (the `doc` comment), owner, number of satisfy and number of verify relationships. Cells edit in place and
commit on change. Requirements with no satisfy or verify relationship are marked (*unsatisfied*, *unverified*). **Add Requirement** (kind, id, name) writes
`requirement <'R2'> rangeReq;`; Delete asks first. The detail pane of the selected requirement lists *satisfied by*, *verified by*, *derived from*
and *derives*, with add and remove, and has **Reveal in Tree**, **Go to Text** and **Show in Diagram**. The view refreshes when the model
changes (also from the text editor); a cell being edited and the selection are kept.

### Relationships as SysML v2 defines them

| Relationship | Text written |
| --- | --- |
| satisfy | `satisfy <requirement> by <element>;`, in the package that owns the satisfying element |
| verify | `verify <requirement>;` inside the `objective` of a verification case (the only place SysML v2 allows it). An objective is created when the case has none; "new case" writes `verification <name> { objective { verify <requirement>; } }` |
| derivation | `#derivation connection { end #original ::> <original>; end #derive ::> <derived>; }` (one `end #derive` per derived requirement); `derive` is not a keyword. `private import RequirementDerivation::*;` is added when those names are not visible |

A requirement *definition* is verified with `verify requirement : R;` (an anonymous requirement usage typed by the definition), which the relation reader
recognises. A derivation connects requirement usages: a definition is refused. A second derivation from the same original in the same owner adds
`end #derive ::> x;` to the existing connection instead of a second one; a duplicate end is refused. References written inside a verification case or
derivation are written qualified when the requirement's name collides with a feature those inherit (`subject`, `objective`, `verdict`, ...), and a plan whose
written reference would not resolve to the intended element after the edit is refused.

Satisfy statements are read in all their forms: `satisfy R by x;`, `satisfy R;` (the owning element satisfies), and `satisfy requirement r : R by x;` (counted
against `R`). `not satisfy R by x;` and `assert not satisfy ...` are shown as *not satisfied by x* and do not count as satisfied.

Existing derivations are read back, both the untyped form above and the typed form (`#derivation connection : Def { end r1 ::> a; ... }`,
where the roles come from the definition's `#original` and `#derive` ends), and hand-written forms: a connection annotated `@DerivationMetadata` or
`metadata DerivationMetadata`, or typed by `DerivationConnections::Derivation` (resolved through specialization). They count like the others. Removing a whole
derivation works for every form; removing one derived requirement from a hand-written connection with several is disabled (with an explanation), because its ends are
required by the definition. The Requirements View palette offers the same three tools (click
the source, then the target; derivation goes from the original to the derived requirement) and writes identical text.

## Document view

The document is a projection of SysML text; no second file exists.

| SysML | Document |
| --- | --- |
| root package | the document; title and version from `@DocumentRoot { title = "..."; version = "..."; }` on it, else the package name |
| nested package | a section; heading = package name (quoted in SysML when needed), heading level = nesting depth |
| `doc` / `comment` owned by a package | its paragraphs, in source order |
| requirement definitions and usages | requirement items: id (short name), name, text, relationship summary |
| other owned elements | a compact "model elements" listing |
| packages of the root annotated `@Appendix` | appendices after all sections, lettered A, B, ... |

**Computed, never stored:** section numbers (1, 1.1, ...), appendix letters and the table of contents come from nesting and source order.
Reordering therefore never rewrites numbers into the text. Selecting a table-of-contents entry scrolls to the section; entries can be
dragged to reorder (within the same parent), and each section has **Move up** / **Move down** buttons (keyboard accessible).

Edits: a heading renames the package (`package 'Functional Safety'`; references and diagram files follow, as for any rename); a paragraph edits the
comment body in the existing comment's style (single-line stays single-line, multi-line keeps its ` * ` margins); **Add section / subsection /
appendix / paragraph / requirement**; **Delete** of a section asks first and states what it contains. A new paragraph is a `doc` when the package has none,
else a `comment`. Moving a declaration cuts it with its attached leading comments and reinserts it re-indented; a move that would change what any
name refers to is refused. (Moving into another parent is available in the edit planner, which does not rewrite references or diagram files; the
view only offers reordering within a parent.)

### The metadata library

`DocumentRoot` and `Appendix` come from `DocumentAnnotations.sysml`, bundled with the extension next to the standard library and indexed read-only:

```sysml
library package DocumentAnnotations {
    private import ScalarValues::String;
    metadata def DocumentRoot { attribute title : String; attribute version : String; }
    metadata def Appendix;
}
```

Files using it need `private import DocumentAnnotations::*;`, which the editor inserts when it adds an appendix. Other SysML tools do not know the
library: **SysML: Copy Document Annotations Library to Workspace** copies the file into the workspace folder.

### The comment terminator

SysML v2 comments cannot contain `*/` and define no escape. This extension stores `*/` in paragraph (and documentation) text as `*\/` and shows it as
`*/`. It is a convention of this extension; other tools show the backslash. The convention is a bijection on runs of backslashes between `*` and `/`: writing adds one
backslash to each such run (`*/` becomes `*\/`, `*\/` becomes `*\\/`), reading removes one. A literal `*\/` typed by the user is therefore stored as `*\\/` and shown
again as `*\/`. It is applied wherever comment text is shown for editing or in the Document view and the agent's Markdown (and in the table's text column);
raw displays such as the Diagram's documentation property and the tree tooltip show the stored text. **Existing files:** a comment that already contains `*\/` is
displayed as `*/`, because that is the convention.

### Edit conflicts

Every cell, heading and paragraph edit carries the text the field was opened with. The host applies it only when the element still has that text; otherwise nothing
changes and the field shows the current model text beside your draft with **Overwrite** (sends the draft against the new text) and **Discard**. A live refresh keeps a
draft only while the model text it was started from is unchanged. Paragraphs are identified by their owner, kind and index among the owner's `doc`/`comment` members, so
inserting text above a paragraph does not move an edit to another paragraph.

### The DocumentAnnotations copy

**SysML: Copy Document Annotations Library to Workspace** never overwrites an existing file and asks which folder when several are open. A workspace declaration of the root
package `DocumentAnnotations` shadows the bundled one entirely (name resolution and qualified-name lookup see only the workspace copy), so resolution is never ambiguous and
nothing tries to edit the bundled copy. Standard library packages are never shadowed.

### Paragraph formatting

Paragraph text is plain comment text rendered with a small Markdown subset: `*emphasis*`, `**strong**`, `` `code` ``, bulleted (`- `) and numbered (`1. `) lists, and
`[text](https://...)` links (only `http` and `https`). There is no raw HTML: angle brackets are text, and the view is built from DOM nodes with `textContent`, never `innerHTML`.
Emphasis must wrap word characters, so `*/` and `/*` stay text.

## What is not covered

Editing subjects, attributes and constraint expressions; export to PDF or Word; figures and cross-references; nested requirements in the table; renaming
`@DocumentRoot` titles from the view.
