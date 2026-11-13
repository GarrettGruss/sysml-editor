# Design

## Context

This change reworks the requirements editor from `add-requirements-editor`. It reuses `DocumentModel` and `moveMember` (D14). Decisions continue after D37.

## Goals / Non-Goals

**Goals:**
- One authoring view that reads as a document.
- A matrix derived from the model for review and export.

**Non-Goals:**
- Test results in the model or the matrix (results stay out of the trace).
- Specialization editing.

## Decisions

### D38: Document layout is the default
The default view of a package or requirement definition is a document: owner as heading, requirement as `<id> : <name>` sub-heading, text as paragraph, satisfy and verify status as inline badges. If the existing document view can show plain packages without `DocumentAnnotations`, it is restyled and made the default; no third view is built. Edits are in place with the same model edits and conflict detection as today. "+ requirement" is an inline control at the end of each section.

### D39: Hierarchy follows ownership
A requirement that owns requirements is a heading with its requirements beneath, at any depth. Numbering (1, 1.1, 1.1.2) is computed from nesting and order, never stored. Headings collapse and expand; the TOC lists requirement headings.

### D40: Ghost placement shared by add and move
The right-click palette (Requirement, Child Requirement, Package) and dragging an existing item use the same ghost with live gaps: items shift to show where it will land, including the nesting level. Positions the language does not allow show no gap. A new item is written once its id and name are confirmed in inline inputs (model edit, saved at once). A move is a `moveMember` edit with leading comments, refused with a reason if it would change what a name resolves to. Dropping onto a requirement nests it, creating `{ }` if needed.

### D41: Verification matrix replaces the table
The matrix is derived from the model and read-only except for add and remove of `satisfy` and `verify` (as in the document view). Columns: id and name, satisfied by, verification method, verified by, status. The method comes from `@VerificationMethod { kind = VerificationMethodKind::test; }` on the verification case. A child counts its parent's satisfy (inheritance-aware status). Cells link to their declaration. A coverage summary and gap filters sit on top. Export is CSV and Markdown. The agent tool is `sysml_read_verification_matrix`.

### D42: Results stay out of the trace
Pass and fail results are not part of the model, so there is no result column.

## Risks / Trade-offs

- Removing the table drops inline editing of id and name in rows; the document view covers it.
- Live gaps need care with collapsed headings and long documents.

## Open Questions

- The table is replaced by the matrix (accepted).
- Whether the matrix status wording ("not satisfied", "no verification", "covered") needs more states; confirm.
- A trace line (requirement to design to verification) is shown for a selected requirement; confirm the exact form.
