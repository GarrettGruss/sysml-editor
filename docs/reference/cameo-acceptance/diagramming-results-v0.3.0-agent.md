# Diagramming acceptance results, v0.3.0 (agent run 2, UI tools)

Method: a real VS Code 1.146 (extension development host, `sysml.agent.uiControl` on, workspace trust off) was driven
only through the MCP tools: `sysml_ui_diagram` gestures, `sysml_ui_command`, `sysml_ui_answer`, `sysml_ui_state`,
`sysml_ui_screenshot`, `sysml_read_diagram`, `sysml_create_element`, `sysml_create_relationship`. No integration test code.
Model: a `UiFleet` package (Ship, Frigate :> Ship with engine, radar and mass, Destroyer :> Frigate, Engine, Radar).
Screenshots (each one viewed) are in `docs/reference/cameo-acceptance/shots-v0.3.0-agent/`.

| Scenario | Verdict | Evidence |
|---|---|---|
| DGM-003 open, Back, Forward | Pass | Opened a.sysmld then b.sysmld (`sysml_ui_diagram`); `workbench.action.navigateBack` made `sysml_ui_state.activeEditor` a.sysmld; `navigateForward` returned b.sysmld. |
| DGM-007 show ports on a shape | Pass | Context menu "Show/Hide Parts and Ports…" on an interconnection diagram, `sysml_ui_answer` picks engine and radar. The port node sits at x=-7 relative to the frame (on the border); `dgm007-ic.png` shows the square on the left border. |
| DGM-009 display related elements | Pass | "Display Related Elements…" offered Specialization and Ownership; picking Specialization added Ship and Destroyer and the two lines (`dgm009-rel.png`). |
| DGM-011 copy shapes to another diagram | Pass (cosmetic issue D2) | Ctrl+C on Ship and Frigate (clipboard `elements`), Ctrl+V in b: Frigate added, Ship already present so not duplicated (`dgm011-b.png`). |
| DGM-019 apply a legend | Pass | `legend show:true` lists "Part def" and "Specialization", exactly the kinds drawn (`dgm019-legend.png`). |
| DGM-025 draw a relationship | Pass | Connection tool gesture (`connect`, relation specialization) Cutter to Ship wrote `part def Cutter :> Ship;` and drew the hollow triangle. `sysml_create_relationship` dependency wrote `dependency from Engine to Ship;` (`placed: true`); specialization Sloop to Ship wrote `:>` and drew a line (`dgm025-a.png`). |
| DGM-034 hide a compartment | Pass | Context menu "Show Attributes" (toggle) shrank Frigate from h=160 to h=122; the attributes compartment is gone (`dgm034-rel.png`). |
| DGM-041 align left | Pass | Three nodes selected, "Align Left": all three x=40 (`dgm041-after.png`). |
| DGM-045 save as image | Pass | `sysml.diagram.saveImage` opened a save prompt; answered `rel.png`; a 1170x616 PNG was written showing nodes, lines and legend, attributes compartment hidden (`dgm045-rel-saved.png`). |
| DGM-047 apply an aspect | Pass | `sysml.diagram.applyAspect` offered "Hulls"; after picking it only n1 and n2 remained (Engine hidden), `dgm047-asp.png`. |

Counts: Pass 10, Fail 0, Not agent-testable 0.

## Defects and observations

- **D1 (minor): a plain click on a node inside a multi-selection keeps the multi-selection.** Repro: in a diagram with three nodes
  selected (after Align Left), `sysml_ui_diagram` gesture `{"kind":"select","id":"n1"}` leaves `selected` as `["n1","n3","n2"]`,
  repeatedly. Escape clears it. With no prior multi-selection the same gesture selects one node. May be the intended
  "keep the group so it can be dragged" behaviour; a click without a drag should arguably collapse it. No screenshot (state only).
- **D2 (cosmetic): pasted nodes are placed at their source coordinates.** Repro: copy Ship and Frigate from a.sysmld, paste into
  b.sysmld that already has Engine at the top left: Ship lands on top of Engine. See `shots-v0.3.0-agent/dgm011-b.png`.
- **D3 (minor, usability): compartment menu items do not show state.** "Show Attributes", "Show Parts", "Show Ports" are always
  labelled "Show ...", also when the compartment is visible and the click hides it.

## Issue #48 oddities

1. **Specialization line leaving from the side of the "ports" row: still happens.** In `dgm009-rel.png` and `dgm045-rel-saved.png`
   the Destroyer to Frigate line ends at the right edge of Frigate in the "ports" compartment row (in `dgm034-rel.png`, with attributes
   hidden, at the bottom of the ports row). The attachment is the middle of the node's side, so it looks arbitrary on nodes with
   compartments. The Frigate to Ship line attaches at the header and looks fine.
2. **`sysml_create_relationship` `placed: false` although the line is drawn: still happens** for `specialization`
   (Sloop to Ship: `diagram: {path: "a.sysmld", placed: false}`, line visible in `dgm025-a.png`, and `sysml_read_diagram` lists
   `edges: []`). Specializations are derived from the model rather than stored as diagram edges, so `placed: false` is accurate
   about the file but misleading to a caller. For `dependency` the result is `placed: true`.
