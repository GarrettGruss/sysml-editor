## ADDED Requirements

### Requirement: Document layout default
The requirements editor SHALL open a package or requirement definition as a document: the owner as a heading, each requirement as a sub-heading `<id> : <name>`, its text as a paragraph, and satisfy and verify status as inline badges. Every part SHALL be editable in place with the same model edits and conflict detection as before. A plain package with no annotations SHALL render this way.

#### Scenario: Open a plain package
- **WHEN** the user opens `MiningFrigateRequirementsDef` with no `DocumentAnnotations`
- **THEN** it shows as a heading with `MFRQ01 : OreExtractionEfficiencyRequirement` and its text below

#### Scenario: Edit in place
- **WHEN** the user edits the paragraph of a requirement
- **THEN** the `doc` of that requirement is rewritten at once

### Requirement: Inline add
Each section SHALL end with an inline "+ requirement" control. The Add Requirement bar SHALL be removed.

#### Scenario: Add at the end
- **WHEN** the user clicks "+ requirement" in a section
- **THEN** inline inputs for id and name open and the requirement is written on confirm

### Requirement: Requirement hierarchy
A requirement that owns requirements SHALL be a heading with its requirements as sub-headings at any depth. Numbers SHALL be computed from nesting and order and never stored. Headings SHALL collapse and expand, and the TOC SHALL include requirement headings.

#### Scenario: Nested numbering
- **WHEN** `MFRQ01` owns two requirements
- **THEN** they are numbered 1.1 and 1.2 and no number appears in the text

#### Scenario: Collapse
- **WHEN** the user collapses a heading
- **THEN** its sub-headings are hidden

### Requirement: Right-click palette with ghost
Right-clicking the background or the space between two items SHALL open a palette at the pointer with Requirement, Child Requirement, and Package. Choosing one SHALL show a ghost following the pointer and open a gap with live shifting at each allowed position, including the nesting level. Disallowed positions SHALL show no gap.

#### Scenario: Package in a requirement
- **WHEN** the user moves a Package ghost over a requirement
- **THEN** no gap opens there

### Requirement: Confirm a placed requirement
A click SHALL confirm the position and open inline inputs for id and name; the SysML SHALL be written once they are confirmed (model edit, saved at once). Escape SHALL cancel at any point and write nothing.

#### Scenario: Child requirement
- **WHEN** the user chooses Child Requirement and clicks the gap below `MFRQ01`
- **THEN** the new requirement is written inside the body of `MFRQ01`

#### Scenario: Escape
- **WHEN** the user presses Escape after the click
- **THEN** nothing is written

### Requirement: Reorder and nest by dragging
Dragging a requirement SHALL use the same ghost and live gaps. Dropping between items SHALL move the declaration with its leading comments (model edit, saved at once, undoable); dropping onto a requirement SHALL nest it, creating `{ }` if needed; dragging out SHALL un-nest. A move that would change what a name resolves to SHALL be refused with a reason. "Move up" and "Move down" SHALL be available from the keyboard and menu.

#### Scenario: Reorder
- **WHEN** the user drops `MFRQ02` above `MFRQ01`
- **THEN** the declaration of `MFRQ02` is moved above in the text with its comments

#### Scenario: Refused move
- **WHEN** a move would change what a name resolves to
- **THEN** it is refused with a reason

### Requirement: Verification matrix
The requirements editor SHALL provide a verification matrix, replacing the table, with one row per requirement, hierarchical and numbered, and columns for id and name, satisfied by, verification method, verified by, and status. The matrix SHALL be derived from the model.

#### Scenario: Rows
- **WHEN** a package has nested requirements
- **THEN** rows are numbered and nested like the document

### Requirement: Matrix cells
The method SHALL be read from `VerificationMethod` metadata on the verification case (inspect, analyze, demo, test). Cells SHALL link to their declaration. The matrix SHALL be read-only, except that cells offer the document view's add and remove actions for `satisfy` and `verify`.

#### Scenario: Method from metadata
- **WHEN** a verification case has `@VerificationMethod { kind = VerificationMethodKind::test; }` and verifies `MFRQ01`
- **THEN** the row of `MFRQ01` shows method "test" and the case as verified by

#### Scenario: Add satisfy from a cell
- **WHEN** the user adds a satisfying element in the Satisfied by cell
- **THEN** a `satisfy` statement is written at once

### Requirement: Matrix status and coverage
Status SHALL be one of "not satisfied", "no verification", or "covered", and a child SHALL count its parent's `satisfy`. A coverage summary and filters for the gaps SHALL be shown.

#### Scenario: Inherited satisfy
- **WHEN** a parent requirement is satisfied and its child has no own `satisfy`
- **THEN** the child is not shown as "not satisfied"

#### Scenario: Filter gaps
- **WHEN** the user filters for "no verification"
- **THEN** only those rows are shown

### Requirement: Matrix export
The matrix SHALL be exportable as CSV and Markdown with the same rows and columns.

#### Scenario: Export CSV
- **WHEN** the user chooses export as CSV
- **THEN** a CSV file with one row per requirement is written to the chosen path

### Requirement: Trace line
For a selected requirement the editor SHALL show a trace line from the requirement to its satisfying elements and its verification cases. Results SHALL NOT be part of it.

#### Scenario: Select a requirement
- **WHEN** the user selects `MFRQ01`
- **THEN** its satisfying elements and verification cases are shown

### Requirement: No overlap in the old table layout
Until the table is removed, its ID and Name inputs SHALL NOT truncate, the Owner SHALL NOT overrun the Satisfy column, and badges SHALL NOT wrap mid-word.

#### Scenario: Normal width
- **WHEN** the table is shown at normal width
- **THEN** no text overlaps another column
