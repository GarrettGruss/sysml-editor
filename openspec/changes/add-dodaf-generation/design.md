# Design

## Context

DoDAF 2.02 and UAFML 1.2 describe the same viewpoints. SysML v2 text can express them, the editor draws general, interconnection, actionFlow, stateTransition, sequence and requirements views, and there is a table view only for requirements (issue #61 asks for generic tables). Decision numbers continue after D75.

## Decisions

### D76: One shared metadata library, annotations select elements
`resources/dodaf/DoDAF.sysml` holds `metadata def`s. Authors annotate elements (`#OperationalPerformer part soldier;`). The generator never guesses roles from names. UAF terms are used as the names; a note in the file maps each to its DoDAF term (e.g. `OperationalPerformer` = DoDAF Performer, `SystemFunction` = SV-4 function).

### D77: Mapping, with the form of each view
| Model | SysML v2 construct | Form |
|---|---|---|
| AV-1 | package doc + `@ArchitectureDescription` (purpose, scope, viewpoint, dates) | table |
| AV-2 | every annotated element and its doc | table |
| CV-1 | `@Capability` doc plus `@Vision` text | table |
| CV-2 | `@Capability` defs and `specializes` / composition | general diagram |
| OV-1 | `@OperationalPerformer` parts, connections, package doc as narrative | general diagram plus narrative; see D81 |
| OV-2 (Operational Resource Flow Description) | performers; `connect` = needline, `flow` of items (`@OperationalExchange`) = resource flow | interconnection diagram |
| OV-4 (Organizational Relationships Chart) | `@Organization` parts and their containment, plus roles/relations between organizations (not performer composition) | table (tree); general diagram optional |
| OV-5a (Operational Activity Decomposition Tree) | nested `action`s under an `@OperationalActivity` (capabilities may head the tree) | table (tree) |
| OV-5b | one activity's actions, successions, flows | actionFlow diagram per root activity |
| OV-6c (Event-Trace Description) | event trace of messages between performers | sequence diagram |
| SV-1 (Systems Interface Description) | `@System` parts and `connect` / `interface` | interconnection diagram |
| SV-2 (Systems Resource Flow Description) | ports and `flow`s of items between systems | interconnection diagram showing ports and flows |
| SV-4 | `@SystemFunction` actions and flows | actionFlow diagram |
| SV-5a (Operational Activity to Systems Function Traceability Matrix) | `allocate` from `@SystemFunction` to `@OperationalActivity`; rows activities, columns functions | matrix table |
| SV-10c | message trace between systems | sequence diagram |
| StdV-1 | `@Standard` elements, cited by | table |
| DIV-2 | `item def` / `attribute def` data model | table (entity, attribute, type, multiplicity) |

### D85: Names, allocation and answered scope
Metadata defs use UAF names; `docs/dodaf.md` holds a table mapping each to its DoDAF 2.02 name. SV-5a uses `allocate` only; `satisfy` stays for requirements. Only tagged elements appear; untagged or missing ones are reported as gaps, never guessed. The default output folder is `docs/dodaf/`, changeable by the tool argument or the command picker. Output is Markdown tables only; no in-editor table view (issue #61 stays separate). Checked against DoDAF 2.02 view definitions.

### D78: Tables are pure builders in `src/dodaf/tables/`
Each builder takes the model index and a root and returns `{ columns, rows, gaps }`. A shared renderer emits Markdown or CSV. No `vscode`, so they run under Vitest. The generic matrix of issue #61 is not required; if it lands, the builders feed it.

### D79: Gaps are data
Each builder returns `gaps` (undocumented element, unallocated function, unreferenced standard). The report lists them so an agent can fix the model.

### D80: Planner, executor, writer
`src/dodaf/plan.ts` (pure) selects views, roots and file names from the model and returns steps. The executor, in the tool layer, creates missing diagrams with the existing diagram tools, requests images through the existing diagram export path (the webview draws, as with `sysml_read_diagram` `includeImage`), and hands text to `writeDocument` (pure: sections to Markdown). The command and the MCP tool share the executor; the command adds pickers for root and folder.

### D81: Views the diagram kinds cannot draw
- OV-1 is a free-form graphic in DoDAF. We draw a general diagram of performers and exchanges and add the narrative from documentation. An author-supplied picture can be linked with `@OV1Graphic { path }` and is copied into `images/` instead.
- OV-6c is drawn by the sequence view; only message order is shown, not time scale.
- SV-10c same as OV-6c.
- OV-4 as a chart of organisational relationships is a table or a general view of composition; no org-chart kind is added.
No new diagram kind is added in this change.

### D82: Diagram files and output layout
Diagrams are created beside the architecture root as `<Name>-<VIEW>.sysmld` and reused if present. Output: `<folder>/<Name>.md`, `<folder>/images/<VIEW>.svg|png`. Default image format is SVG; PNG on request. Overwriting the Markdown and images is allowed; the `.sysmld` is never overwritten.

### D83: Images require the diagram view
Extension-host code does not render. If the diagram view is unavailable the generator writes the tables, marks diagram sections as skipped and returns that in the report. No second renderer (CLAUDE.md).

### D84: Acceptance example
`test/fixtures/dodaf-example/` holds a small model (a mission, two performers, three activities, two systems, one standard, a data model), its `.sysmld` files and the expected generated Markdown. A Vitest test regenerates the tables and compares them to the checked-in Markdown; an integration test generates the images.

## Risks

- Annotation burden: authors must tag elements. Mitigation: the skill, and `plan: true` shows what is missing.
- Metadata on usages and `allocate` parse support must be confirmed against the vendored grammar early (task A.1).
- Image export is asynchronous and depends on an open webview; handled by D83.
