## ADDED Requirements

### Requirement: Shipped metadata library
The extension SHALL ship `DoDAF.sysml`, a package of `metadata def`s: `ArchitectureDescription`, `Vision`, `Capability`, `OperationalPerformer`, `OperationalActivity`, `OperationalExchange`, `System`, `SystemFunction`, `Service`, `Standard`, `DataElement`. Each SHALL carry an optional `viewpoint` text and apply to the element kinds that fit it. A command and the generator SHALL copy it into the workspace on request without overwriting an existing file.

#### Scenario: Library parses
- **WHEN** the library file is parsed
- **THEN** it has no syntax or unresolved-name errors and declares every metadata def above

### Requirement: Models are found by metadata, then by structure
For each DoDAF model the generator SHALL select elements by their DoDAF metadata annotation (`@OperationalPerformer`), and fall back to structure (an `action` owned by an annotated performer) where the mapping table says so. An element with no annotation SHALL not appear in any view.

#### Scenario: Annotated performer
- **WHEN** a part usage is annotated `@OperationalPerformer`
- **THEN** it is listed in OV-2 and OV-4 and in the AV-2 dictionary as kind Operational Performer

### Requirement: Mapping table
The mapping from each core model to SysML v2 constructs and to a diagram kind or table SHALL be documented in `docs/dodaf.md` and returned by `sysml_dodaf_generate` with `plan: true`.

#### Scenario: Plan lists every view
- **WHEN** an agent calls `sysml_dodaf_generate` with `plan: true`
- **THEN** each of the 17 views is listed with its form (diagram kind or table), its root element and what is missing
