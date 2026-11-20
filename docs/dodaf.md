# DoDAF 2.02 in SysML v2

The DoDAF generator selects elements only by annotation with the metadata definitions of `DoDAF.sysml` (command `SysML: Add DoDAF Library` copies it into the workspace root; an existing file is never overwritten). Example: `#OperationalPerformer part soldier : Soldier;`. Untagged or missing elements are reported as gaps, never guessed.

View titles were checked against the DoDAF 2.02 view definitions (`fixtures/dodaf/DoDAF_v2-02_web.pdf`).

## View mapping

| View | Title | SysML v2 construct | Form |
|---|---|---|---|
| AV-1 | Overview and Summary Information | package doc + @ArchitectureDescription (purpose, scope, viewpointName, dates) | table |
| AV-2 | Integrated Dictionary | every annotated element and its doc | table |
| CV-1 | Vision | @Capability doc plus @Vision text | table |
| CV-2 | Capability Taxonomy | @Capability defs and specializes / composition | diagram |
| OV-1 | High-Level Operational Concept Graphic | @OperationalPerformer parts, connections, package doc as narrative | diagram |
| OV-2 | Operational Resource Flow Description | performers; connect = needline, flow of items (@OperationalExchange) = resource flow | diagram |
| OV-4 | Organizational Relationships Chart | @Organization parts and their containment, plus relations between organizations | tree |
| OV-5a | Operational Activity Decomposition Tree | nested actions under an @OperationalActivity (capabilities may head the tree) | tree |
| OV-5b | Operational Activity Model | one activity's actions, successions, flows | diagram |
| OV-6c | Event-Trace Description | event trace of messages between performers | diagram |
| SV-1 | Systems Interface Description | @System parts and connect / interface | diagram |
| SV-2 | Systems Resource Flow Description | ports and flows of items between systems | diagram |
| SV-4 | Systems Functionality Description | @SystemFunction actions and flows | diagram |
| SV-5a | Operational Activity to Systems Function Traceability Matrix | allocate from @SystemFunction to @OperationalActivity; rows activities, columns functions | matrix |
| SV-10c | Systems Event-Trace Description | message trace between systems | diagram |
| StdV-1 | Standards Profile | @Standard elements, cited by | table |
| DIV-2 | Logical Data Model | item def / attribute def data model | table |

SV-5a uses `allocate` only; `satisfy` stays for requirements. OV-1 is a general diagram of performers plus the package documentation as narrative; an author picture can be linked with `@OV1Graphic { path = "..."; }`. OV-6c and SV-10c show message order only.

## UAF names and DoDAF terms

| Metadata def (UAF) | DoDAF 2.02 term |
|---|---|
| `ArchitectureDescription` | Architectural Description (AV-1) |
| `Capability` | Capability |
| `Vision` | Vision (CV-1) |
| `OperationalPerformer` | Performer |
| `OperationalActivity` | Operational Activity |
| `OperationalExchange` | Resource Flow (OV-2) |
| `Organization` | Organization |
| `System` | System (resource performer) |
| `SystemFunction` | System Function (SV-4) |
| `Standard` | Standard |
| `OV1Graphic` | OV-1 graphic |
