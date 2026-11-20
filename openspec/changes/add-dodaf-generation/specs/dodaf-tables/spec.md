## ADDED Requirements

### Requirement: Table builders
The tool layer SHALL build the rows of AV-1, AV-2, CV-1, OV-4, OV-5a, SV-5a, StdV-1 and DIV-2 from the model index alone, deterministically, and return them as JSON, Markdown or CSV. Builders SHALL NOT import `vscode`.

#### Scenario: Same input, same output
- **WHEN** a builder runs twice on an unchanged model
- **THEN** the output is byte-identical (rows sorted by qualified name unless the view defines an order)

### Requirement: Dictionary and standards
AV-2 SHALL list every DoDAF-annotated element (name, DoDAF kind, definition from documentation). StdV-1 SHALL list each `@Standard` element with its identifier, title and the elements that cite it.

#### Scenario: Missing definition
- **WHEN** an annotated element has no documentation
- **THEN** its AV-2 row shows an empty definition and the generator's report names it

### Requirement: Decomposition and allocation
OV-5a SHALL be an indented tree of operational activities by containment. SV-5a SHALL be a matrix of system functions against operational activities, one mark per `allocate` or `satisfy` relationship; rows or columns with no mark SHALL be reported.

#### Scenario: Allocation
- **WHEN** system function `Track` is allocated to activity `Observe`
- **THEN** the SV-5a cell (Observe, Track) is marked and no other cell in that row is
