## ADDED Requirements

### Requirement: Requirements table
The extension SHALL provide a requirements editor that lists requirement definitions and usages within a selected scope (package or file) as a table with columns for short name / id, name, documentation text, owner, and counts of satisfy and verify relationships.

#### Scenario: Open table for a package
- **WHEN** the user runs "Open Requirements Editor" on package `VehicleRequirements`
- **THEN** a table shows each requirement in that package and its nested packages

### Requirement: Edit requirement properties
The user SHALL be able to edit a requirement's id (short name), name, and documentation text in the requirements editor; each edit SHALL modify the corresponding SysML text.

#### Scenario: Edit text
- **WHEN** the user changes the text of requirement `<'R1'> massLimit` to "Vehicle mass shall not exceed 2000 kg"
- **THEN** the `doc /* ... */` comment of that requirement in the `.sysml` file contains the new text

### Requirement: Create and delete requirements
The user SHALL be able to add a new requirement (definition or usage) to the current scope and delete an existing one, with changes applied to the SysML text.

#### Scenario: Add requirement
- **WHEN** the user clicks "Add Requirement" and enters id `R2` and name `rangeReq`
- **THEN** `requirement <'R2'> rangeReq;` is inserted into the scope package

### Requirement: Satisfy relationships
The user SHALL be able to view, add, and remove `satisfy` relationships between a requirement and model elements from the requirements editor.

#### Scenario: Add satisfy
- **WHEN** the user adds a satisfy relationship from requirement `massLimit` to part `vehicle`
- **THEN** a `satisfy massLimit by vehicle;` declaration is added to the model and the satisfy count updates

### Requirement: Verify relationships
The user SHALL be able to view, add, and remove verification of a requirement. Because SysML v2 allows `verify` only inside a verification case, adding one SHALL require choosing an existing verification case or creating a new one, and SHALL place the `verify` statement in that case's objective.

#### Scenario: Add verify to an existing case
- **WHEN** the user adds verification of `massLimit` and picks verification case `weighVehicle`
- **THEN** `verify massLimit;` is added inside the objective of `weighVehicle`, and the verify count updates

#### Scenario: No verification case exists
- **WHEN** the user adds verification of `massLimit` and no verification case exists
- **THEN** the user is asked to name a new verification case, which is created containing the `verify` statement

### Requirement: Derivation relationships
The user SHALL be able to view, add, and remove derivation between requirements. Derivation SHALL be written as a `#derivation connection` with `#original` and `#derive` ends, as defined by the standard `RequirementDerivation` library, and the import of that library SHALL be added if it is missing.

#### Scenario: Add derivation
- **WHEN** the user marks `chassisMass` as derived from `massLimit`
- **THEN** the model gains `#derivation connection { end #original ::> massLimit; end #derive ::> chassisMass; }` and an import of `RequirementDerivation` if absent, and the file parses without errors

### Requirement: Navigation and consistency
Selecting a requirement in the editor SHALL be able to reveal it in the tree, text, and diagrams; edits made elsewhere SHALL be reflected in the open requirements editor.

#### Scenario: External edit
- **WHEN** a requirement name is changed in the text editor
- **THEN** the open requirements table shows the new name

### Requirement: Document view of requirements
The requirements editor SHALL offer a document view, alongside the table view, that renders a package as a structured specification document: title block, generated table of contents, numbered sections and subsections, prose paragraphs, requirement items, and appendices. The document SHALL be a projection of SysML v2 text only; no separate document file SHALL be stored.

#### Scenario: Open document view
- **WHEN** the user switches the requirements editor for package `VehicleSpec` to Document view
- **THEN** the package renders as a document with a table of contents listing its nested packages as numbered sections

### Requirement: Document sections are SysML packages
In the document view, each nested package of the root package SHALL be a section whose heading is the package's name, with nesting depth setting the heading level. The `doc` and `comment` elements owned by a package SHALL be its prose paragraphs in source order, requirement definitions and usages SHALL be requirement items (short-name id, name, documentation text), and other owned elements SHALL appear as a compact model-elements listing.

#### Scenario: Section content
- **WHEN** package `'Performance Requirements'` contains `doc /* Scope of performance. */`, `requirement <'R3'> accel;`, and `part def TestRig;`
- **THEN** its section shows the heading "Performance Requirements", the paragraph, the requirement item R3 accel, and TestRig in a model-elements listing

### Requirement: Document metadata annotations
Document-only information SHALL be expressed with SysML v2 metadata from a library package shipped with the extension: `DocumentRoot` (title, version) on the root package, and `Appendix` on packages that render as appendices after all sections. Without `DocumentRoot`, the title SHALL default to the package name.

#### Scenario: Annotated source renders as document
- **WHEN** the source is `package VehicleSpec { @DocumentRoot { title = "Vehicle SRS"; } package 'Performance Requirements' { requirement <'R3'> accel; } package Glossary { @Appendix; } }`
- **THEN** the document title is "Vehicle SRS", section 1 is "Performance Requirements", and "Appendix A Glossary" follows the sections

#### Scenario: Unannotated package
- **WHEN** a package has no document metadata
- **THEN** it still renders as a document titled with the package name, with nested packages as sections and no appendices

### Requirement: Generated numbering and table of contents
Section numbers (1, 1.1, …), appendix letters (A, B, …), and the table of contents SHALL be computed from package nesting and source order and SHALL NOT be written into the SysML text. Selecting a table of contents entry SHALL scroll to that section.

#### Scenario: Reorder renumbers
- **WHEN** section 3 is moved before section 2
- **THEN** both sections are renumbered and the table of contents updates, and no numbers appear in the `.sysml` text

### Requirement: Document edits produce valid SysML v2
Edits in the document view SHALL be applied as SysML text edits under the model-synchronization rules. Editing a heading SHALL rename the package (using a quoted name when needed), editing a paragraph SHALL edit the `doc` or `comment` body, and adding a section, appendix, paragraph, or requirement SHALL insert the corresponding SysML declaration. Adding document metadata SHALL also insert the library import if it is missing.

#### Scenario: Add section
- **WHEN** the user adds a section "Safety" after section 2
- **THEN** `package Safety;` is inserted after the second section's package and the document shows it as section 3

#### Scenario: Heading with spaces
- **WHEN** the user renames the heading "Safety" to "Functional Safety"
- **THEN** the package declaration becomes `package 'Functional Safety'` and references and diagram files are updated

#### Scenario: Add appendix
- **WHEN** the user adds an appendix "Glossary" to a file that does not import the document metadata library
- **THEN** `package Glossary { @Appendix; }` and the library import are inserted, and the file parses without errors

### Requirement: Comment terminator in paragraphs
SysML v2 comments cannot contain `*/` and define no escape for it. Paragraph text containing `*/` SHALL be stored as `*\/`, a convention of this extension, and SHALL be shown as `*/` in the document view. The stored text SHALL remain valid SysML v2.

#### Scenario: Paragraph with comment terminator
- **WHEN** the user types a paragraph containing `*/`
- **THEN** the resulting SysML text still parses, the `.sysml` file contains `*\/` at that position, and the document view shows `*/`

### Requirement: Section reorder and delete
Reordering sections in the table of contents SHALL move the package declaration in the text, and deleting a section SHALL delete its package after confirmation.

#### Scenario: Move section
- **WHEN** the user drags section 3 above section 2 in the table of contents
- **THEN** the third section's package declaration now precedes the second's in the text

#### Scenario: Delete section
- **WHEN** the user deletes section "Safety" and confirms
- **THEN** its package and contents are removed from the text and the following sections are renumbered

### Requirement: Prose formatting
Paragraph bodies SHALL support a limited Markdown subset (emphasis, inline code, bulleted and numbered lists, links) for rendering in the document view, while being stored as plain SysML comment text.

#### Scenario: List in paragraph
- **WHEN** a `doc` body contains lines beginning with `- `
- **THEN** the document view renders them as a bulleted list
