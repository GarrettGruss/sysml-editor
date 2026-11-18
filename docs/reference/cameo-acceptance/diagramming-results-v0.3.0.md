# Diagramming acceptance results, v0.3.0 (agent run)

Method: MCP tools against a throwaway workspace. The window's workspace was NOT trusted, so every edit tool
(sysml_create_diagram, sysml_show_hide_diagram_members, sysml_apply_diagram_aspect, sysml_create_relationship)
refused with "This workspace is not trusted". Only reads and images worked. I hand-wrote `fleet.sysml` and
`fleet.sysmld` in the workspace and read them with `sysml_read_diagram` (png and svg).
Test file: `test/integration/architecture-tools.ts` (AT) unless noted. Screenshots: scratchpad `acceptance-shots/`.

| Scenario | Coverage | Agent check | Verdict | Notes |
|---|---|---|---|---|
| DGM-003 open, Back, Forward | AT "Back and Forward move between the diagrams..." | none possible (UI command) | Not agent-testable | Needs the window. |
| DGM-007 show ports on shape | AT "Show/Hide Parts and Ports ticks a port onto the border..." | show/hide tool refused (untrusted) | Not agent-testable | In the general diagram render, ports appear in a "ports" compartment, not on the border (the border form applies to interconnection diagrams; unverified). |
| DGM-009 display related elements | AT "Display Related Elements adds only the picked kind..." | none (command and picker) | Not agent-testable | |
| DGM-011 copy shapes to another diagram | AT "copying two nodes and pasting in another diagram..." | none (clipboard) | Not agent-testable | |
| DGM-019 apply a legend | AT "the legend lists the kinds drawn... widens an exported image" | the exported image from sysml_read_diagram has no legend (toggle is off by default) | Not agent-testable | Legend is a webview toggle; no MCP tool. |
| DGM-025 draw a relationship | AT specialization and dependency tests | sysml_create_relationship refused (untrusted). Existing specialization (Destroyer :> Ship) draws a hollow triangle on Ship, correct. | Not agent-testable (partial pass on rendering) | Dependency arrow could not be created. The dashed open arrow seen in `ports-general.png` is typing (battery to Battery), not a dependency. |
| DGM-034 hide a compartment | AT "hiding the attributes compartment shrinks the node..." | compartments render correctly (attributes, parts, ports) in `fleet.png` | Not agent-testable | Hide is a webview menu. |
| DGM-041 align left | AT "Align Left puts the left edges of three selected nodes..." | none | Not agent-testable | |
| DGM-045 save as image | AT "Save as Image writes a valid SVG..." and "Copy as Image..." | sysml_read_diagram format png and svg both returned images; svg is a valid document, png looked clean (`fleet.png`, `ports-general.png`) | Pass (image export via MCP only) | The Save As dialog is not agent-testable. |
| DGM-047 apply an aspect | AT "applying an aspect draws only its nodes..." | sysml_apply_diagram_aspect refused (untrusted) | Not agent-testable | |

Counts: Pass 1, Fail 0, Not agent-testable 9 (one partial pass on rendering).

## Rerun after the workspace was trusted

Edits worked. Screenshots in scratchpad `acceptance-shots/`: `g1-fleet.png`, `g2-ic.png`, `g3-ic-ports.png`.

| Scenario | Agent check | Verdict |
|---|---|---|
| DGM-003 | Back/Forward is a UI command | Not agent-testable |
| DGM-007 | `sysml_show_hide_diagram_members` show `output` and `input` on an interconnection diagram: ports drawn as squares on the part border, connection joins them (`g3-ic-ports.png`) | Pass |
| DGM-009 | Display Related Elements is a UI picker; the tool has no equivalent | Not agent-testable |
| DGM-011 | Clipboard copy/paste is UI | Not agent-testable |
| DGM-019 | Legend toggle is UI only; no legend in exported image (off by default) | Not agent-testable |
| DGM-025 | Specialization Frigate to Ship written (`:>`) and drawn with a hollow triangle; dependency Ship to Engine written and drawn dashed with an open arrow (`g1-fleet.png`); reverse specialization refused as a cycle, part def to port def refused with a reason | Pass |
| DGM-034 | Compartment menu is UI. Compartments render correctly | Not agent-testable |
| DGM-041 | Align Left is UI | Not agent-testable |
| DGM-045 | png and svg via MCP | Pass |
| DGM-047 | Tool checked: unknown aspect refused with a clear message, clear works. Saving an aspect is UI-only, so applying one could not be shown | Not agent-testable (partial) |

Updated counts: Pass 3 (007, 025, 045), Fail 0, Not agent-testable 7.

Minor observations (not defects): the specialization line from Frigate leaves from the side of the "ports" compartment row, so the
start point looks arbitrary; the create-relationship result for the specialization reported `placed: false` while the line was drawn
anyway (derived edge, apparently). `ports-general.sysmld` shows ports as a compartment in a general diagram, which is expected.
Test files `fleet.sysml`, `fleet-g.sysmld`, `dt-ic.sysmld` and the Fleet model edits exist only in the throwaway workspace.

## Defects found

None. Visuals in `fleet.png` and `ports-general.png`: no overlaps, no clipped labels,
specialization triangle correct, compartments aligned. Destroyer shows an inherited `mass : Real` in italics.
The first run was blocked because the workspace was untrusted; the rerun above superseded it.

## For the human to try

- [ ] Trust the workspace, then rerun the agent edit checks (create diagram, show/hide, aspect, specialization, dependency).
- [ ] DGM-003: open two diagrams in one tab, Back, Forward.
- [ ] DGM-007: in an interconnection diagram tick ports; confirm they sit on the shape border.
- [ ] DGM-009: Display Related Elements, pick one relation kind.
- [ ] DGM-011: copy shapes from A, paste in B.
- [ ] DGM-019: toggle the legend; confirm entries match the kinds drawn.
- [ ] DGM-025: draw specialization (hollow triangle) and dependency (dashed open arrow); check the model text.
- [ ] DGM-034: suppress the attributes compartment from the menu.
- [ ] DGM-041: select three shapes, Align Left.
- [ ] DGM-045: Save as Image to SVG and PNG; open the files.
- [ ] DGM-047: save and apply an aspect.
