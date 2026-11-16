# Diagramming gap list

Our editor against each requirement in `../cameo-ui-model/Diagramming.sysml`.

| Requirement | Name | Status | Note |
| --- | --- | --- | --- |
| CAM-DGM-001 | createDialog | Partial | New Diagram… exists (command sysml.newDiagram); no type search by abbreviation. |
| CAM-DGM-002 | createBrowser | Partial | Tree/file New Diagram exists; multi-select creation not verified. |
| CAM-DGM-003 | openDiagram | Partial | Opens from file tree and Show in Diagram; no back/forward history. |
| CAM-DGM-004 | lazyLoad | Missing | Diagrams are separate files, loaded on demand; no option. |
| CAM-DGM-005 | dragToDiagram | Supported | Add to Diagram and Show in Diagram commands; drag from tree to be verified. |
| CAM-DGM-006 | moveDragNest | Supported | Move and nest-by-drop in the diagram editor (add-diagram-authoring). |
| CAM-DGM-007 | displayParts | Partial | Interconnection view shows parts/ports; no show/hide dialog. |
| CAM-DGM-008 | internalStruct | Supported | Interconnection view of a part def shows nested parts. |
| CAM-DGM-009 | relatedElements | Missing | Only manual Add to Diagram. |
| CAM-DGM-010 | displayPaths | Partial | Paths between shown elements appear automatically; no command. |
| CAM-DGM-011 | copyPaste | Missing | No copy/paste of symbols or image export to clipboard. |
| CAM-DGM-012 | diagramTabs | Partial | VS Code editor groups provide split and float; no owner label or full screen mode. |
| CAM-DGM-013 | diagramProps | Partial | Properties panel for elements; diagram properties limited. |
| CAM-DGM-014 | styleProps | Missing | No style properties. |
| CAM-DGM-015 | nameSync | Missing | No diagram context name coupling. |
| CAM-DGM-016 | diagramFrame | Missing | No diagram frame. |
| CAM-DGM-017 | banner | Missing | No banners. |
| CAM-DGM-018 | overview | Missing | No diagram overview shapes. |
| CAM-DGM-019 | legends | Missing | No legends. |
| CAM-DGM-020 | legendFilter | Missing | No filtering by legend. |
| CAM-DGM-021 | infoTable | Missing | No such table. |
| CAM-DGM-022 | changeType | Missing | No type change; the view kind is fixed. |
| CAM-DGM-023 | drawSymbol | Supported | Palette ghost with inline naming; add existing via Add to Diagram. |
| CAM-DGM-024 | deleteSymbol | Supported | Remove from diagram and Delete from Model… commands. |
| CAM-DGM-025 | createRelationship | Partial | Connect by dragging for connections and transitions; limited kinds. |
| CAM-DGM-026 | removeRelationship | Partial | Delete from model works; connection delete via diagram not verified. |
| CAM-DGM-027 | pathStyle | Partial | Orthogonal routes only. |
| CAM-DGM-028 | routePaths | Supported | Auto-layout and orthogonal segment editing. |
| CAM-DGM-029 | roundCorners | Missing | No path corner option. |
| CAM-DGM-030 | lineJump | Missing | Not supported. |
| CAM-DGM-031 | splitPath | Missing | Not supported. |
| CAM-DGM-032 | smartManip | Partial | Connect-by-dragging handles; no create-connected toolbar. |
| CAM-DGM-033 | compartmentCreate | Partial | Inline creation of children via palette nesting; no compartment edit. |
| CAM-DGM-034 | compartmentShow | Missing | No compartment control. |
| CAM-DGM-035 | shapeSizing | Partial | Resize handles; no fit-to-content. |
| CAM-DGM-036 | selection | Partial | Click, shift and rubber-band; no same-type or coverage modes. |
| CAM-DGM-037 | pasteImage | Missing | Not supported. |
| CAM-DGM-038 | zoom | Partial | Wheel zoom and fit on open; no slider, zoom to selection. |
| CAM-DGM-039 | grid | Missing | No grid. |
| CAM-DGM-040 | pusher | Missing | Not supported. |
| CAM-DGM-041 | alignTools | Missing | Not supported. |
| CAM-DGM-042 | autoLayout | Supported | sysml.diagram.autoLayout. |
| CAM-DGM-043 | selectInTree | Partial | Go to Definition; Show in tree not verified. |
| CAM-DGM-044 | labelLayout | Missing | Labels placed by auto-layout only. |
| CAM-DGM-045 | saveImage | Partial | Agent tool returns PNG; no user command or SVG. |
| CAM-DGM-046 | layoutTemplates | Missing | Not supported. |
| CAM-DGM-047 | aspects | Missing | Not supported. |
| CAM-DGM-048 | completeDiagram | Missing | Not supported. |
| CAM-DGM-049 | print | Missing | No print. |
| CAM-DGM-050 | imageExportOpts | Missing | No options. |
| CAM-DGM-051 | presentation | Missing | Not supported. |

## Summary

Total 51: Supported 7, Partial 17, Missing 27.

## Top 10 gaps for capturing system architecture

1. CAM-DGM-007 displayParts (Partial): Interconnection view shows parts/ports; no show/hide dialog.
2. CAM-DGM-009 relatedElements (Missing): Only manual Add to Diagram.
3. CAM-DGM-011 copyPaste (Missing): No copy/paste of symbols or image export to clipboard.
4. CAM-DGM-041 alignTools (Missing): Not supported.
5. CAM-DGM-034 compartmentShow (Missing): No compartment control.
6. CAM-DGM-019 legends (Missing): No legends.
7. CAM-DGM-047 aspects (Missing): Not supported.
8. CAM-DGM-045 saveImage (Partial): Agent tool returns PNG; no user command or SVG.
9. CAM-DGM-025 createRelationship (Partial): Connect by dragging for connections and transitions; limited kinds.
10. CAM-DGM-003 openDiagram (Partial): Opens from file tree and Show in Diagram; no back/forward history.
