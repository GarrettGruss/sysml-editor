## ADDED Requirements

### Requirement: Generate a document
The command `SysML: Generate DoDAF Document` and the tool `sysml_dodaf_generate` SHALL take an architecture root package and an output folder and produce `<folder>/<Name>.md` plus `<folder>/images/`. The document has one section per view in the scope, in DoDAF order, each with a title, the model number and an SVG or PNG image or a Markdown table. The tool SHALL accept `views` to narrow the set, `format` (`svg` or `png`) and `plan` to report without writing.

#### Scenario: Full document
- **WHEN** the tool runs on the example architecture
- **THEN** the folder holds the Markdown file and one image per diagram view, and every image link in the file resolves

### Requirement: Diagrams are created on demand
For each diagram view whose `.sysmld` file is missing the generator SHALL create it through the diagram tools; an existing diagram SHALL be reused and never overwritten, so the user's layout is kept. New diagrams are auto-laid-out. Images come from the diagram view; with no diagram editor available the generator SHALL write the table views, list the diagram views as skipped and say why.

#### Scenario: Existing layout kept
- **WHEN** `OV-2.sysmld` already exists with positions
- **THEN** the generator exports it unchanged

### Requirement: Never writes the model
Generation SHALL write only `.sysmld` files and the output folder. A view with no matching elements SHALL be written as a section stating that no elements are tagged, not omitted.

#### Scenario: Empty view
- **WHEN** no element is annotated `@Standard`
- **THEN** the StdV-1 section says so and the report lists it

### Requirement: Agent skill
The extension SHALL ship the `sysml-dodaf` skill, installed like the other skills, describing the workflow: tag, plan, fix gaps, generate, review.

#### Scenario: Skill installed
- **WHEN** skills are installed
- **THEN** `sysml-dodaf/SKILL.md` exists and names `sysml_dodaf_generate`
