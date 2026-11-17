# Diagramming gap list

Our editor against each requirement in `../cameo-ui-model/Diagramming.sysml`. Ratings checked against `src/` and `package.json` on the v0.3.0 deploy branch.

| Requirement | Name | Status | Note |
| --- | --- | --- | --- |
| CAM-DGM-001 | createDialog | Partial | New Diagram... (sysml.newDiagram) exists; no type search by abbreviation. |
| CAM-DGM-002 | createBrowser | Partial | Tree New Diagram exists; multi-select creation and creation from a properties panel are not provided. |
| CAM-DGM-003 | openDiagram | Partial | Open from tree and Show in Diagram; Go Back and Go Forward commands exist (sysml.diagram.back, sysml.diagram.forward); no new-tab versus same-tab choice. |
| CAM-DGM-004 | lazyLoad | Missing | Diagrams are separate files read on demand; no loading mode option. |
| CAM-DGM-005 | dragToDiagram | Supported | Add to Diagram and Show in Diagram commands; tree drag-and-drop onto the diagram not verified. |
| CAM-DGM-006 | moveDragNest | Supported | Move and nest by drop in the diagram editor (add-diagram-authoring). |
| CAM-DGM-007 | displayParts | Partial | Show/Hide Parts and Ports... (sysml.diagram.showHideParts); no nested shift-select or by-kind panel. |
| CAM-DGM-008 | internalStruct | Supported | Interconnection view of a part def shows nested parts. |
| CAM-DGM-009 | relatedElements | Partial | Display Related Elements... (sysml.diagram.displayRelated) exists; option set not compared. |
| CAM-DGM-010 | displayPaths | Partial | Paths between shown elements appear automatically; no on-demand command. |
| CAM-DGM-011 | copyPaste | Partial | Copy Nodes, Paste Nodes and Copy Diagram as Image commands exist. |
| CAM-DGM-012 | diagramTabs | Partial | VS Code editor groups provide split and float for the custom editor. |
| CAM-DGM-013 | diagramProps | Partial | No specification window for the diagram itself; the Properties panel handles elements. |
| CAM-DGM-014 | styleProps | Missing | Style is limited to hidden compartments, legend toggle and aspects in .sysmld. |
| CAM-DGM-015 | nameSync | Missing | No coupling between a diagram and its context name. |
| CAM-DGM-016 | diagramFrame | Missing | No diagram frame. |
| CAM-DGM-017 | banner | Missing | No banners. |
| CAM-DGM-018 | overview | Missing | No diagram overview shapes. |
| CAM-DGM-019 | legends | Partial | Toggle Legend (sysml.diagram.toggleLegend) shows a key; no user-defined legend items. |
| CAM-DGM-020 | legendFilter | Missing | No filtering by legend. |
| CAM-DGM-021 | infoTable | Missing | No such table. |
| CAM-DGM-022 | changeType | Missing | The view kind is fixed at creation. |
| CAM-DGM-023 | drawSymbol | Supported | Palette ghost with inline naming; Add to Diagram for existing elements. |
| CAM-DGM-024 | deleteSymbol | Supported | Remove from diagram and Delete from Model... (sysml.diagram.deleteFromModel). |
| CAM-DGM-025 | createRelationship | Partial | Connect by dragging for connections and transitions; limited kinds; no Create Relation from selection. |
| CAM-DGM-026 | removeRelationship | Partial | Delete from model works; remove-from-diagram for connections not verified. |
| CAM-DGM-027 | pathStyle | Partial | Orthogonal routes only; segment editing in route-edit. |
| CAM-DGM-028 | routePaths | Supported | Auto-layout and orthogonal segment editing. |
| CAM-DGM-029 | roundCorners | Missing | No path corner option. |
| CAM-DGM-030 | lineJump | Missing | Not supported. |
| CAM-DGM-031 | splitPath | Missing | Not supported. |
| CAM-DGM-032 | smartManip | Partial | Connect-by-dragging handles; no create-connected toolbar. |
| CAM-DGM-033 | compartmentCreate | Partial | Inline creation of children through palette nesting; no per-compartment create. |
| CAM-DGM-034 | compartmentShow | Partial | Hidden compartments per node are kept in the diagram style; no element list dialog. |
| CAM-DGM-035 | shapeSizing | Partial | Resize handles; no fit-to-content or inherited size. |
| CAM-DGM-036 | selection | Partial | Click, Shift, rubber-band and Ctrl+A; no same-type or coverage modes. |
| CAM-DGM-037 | pasteImage | Missing | Not supported. |
| CAM-DGM-038 | zoom | Partial | Wheel zoom and fit on open; no slider, zoom to selection or 1:1. |
| CAM-DGM-039 | grid | Partial | Shapes snap on move; grid is not visible or configurable. |
| CAM-DGM-040 | pusher | Missing | Not supported. |
| CAM-DGM-041 | alignTools | Partial | Align and Distribute commands (sysml.diagram.align*, distribute*); no make-same-size. |
| CAM-DGM-042 | autoLayout | Supported | sysml.diagram.autoLayout; no algorithm options. |
| CAM-DGM-043 | selectInTree | Partial | Go to Definition and Show in Diagram; no explicit select-in-tree from the diagram. |
| CAM-DGM-044 | labelLayout | Missing | Labels placed by auto-layout only. |
| CAM-DGM-045 | saveImage | Partial | Save Diagram as Image... (sysml.diagram.saveImage) for the active diagram; no selection scope or multi-diagram. |
| CAM-DGM-046 | layoutTemplates | Missing | Not supported. |
| CAM-DGM-047 | aspects | Partial | Save, Apply, Clear and Delete Aspect store diagram styles; no stereotype-matching aspects. |
| CAM-DGM-048 | completeDiagram | Missing | Not supported. |
| CAM-DGM-049 | print | Missing | No print. |
| CAM-DGM-050 | imageExportOpts | Missing | No options; export uses fixed settings. |
| CAM-DGM-051 | presentation | Missing | Not supported. |
| CAM-DGM-052 | recentDiagrams | Missing | No recent diagram list. |
| CAM-DGM-053 | openTabMode | Missing | No tab-mode option. |
| CAM-DGM-054 | dragFilesToElements | Missing | Not supported. |
| CAM-DGM-055 | dragFromSpecification | Missing | No specification window drag and drop. |
| CAM-DGM-056 | dragBehaviors | Missing | No semantic drops. |
| CAM-DGM-057 | longDragMenu | Missing | No long-drag menu. |
| CAM-DGM-058 | displayPartsLayoutOptions | Missing | No such dialog options. |
| CAM-DGM-059 | hideAllPorts | Partial | Show/Hide Parts and Ports handles visibility per element. |
| CAM-DGM-060 | portProperties | Missing | Not supported. |
| CAM-DGM-061 | displayPathsOnDrop | Partial | Paths between shown elements appear automatically. |
| CAM-DGM-062 | copyAsImageFormats | Partial | Copy Diagram as Image exists in one format. |
| CAM-DGM-063 | copyUrl | Missing | No element URLs. |
| CAM-DGM-064 | pasteWithNewElement | Missing | Paste Nodes pastes symbols only. |
| CAM-DGM-065 | pasteStyle | Missing | No symbol style properties. |
| CAM-DGM-066 | pasteAsOverview | Missing | No overview shapes. |
| CAM-DGM-067 | fullScreen | Missing | No full-screen mode for the editor. |
| CAM-DGM-068 | showOwnerOnTab | Missing | Tab shows the diagram name only. |
| CAM-DGM-069 | diagramInfoModes | Missing | No such table. |
| CAM-DGM-070 | frameHeader | Missing | No frame. |
| CAM-DGM-071 | diagramShapeAppearance | Missing | No diagram shapes. |
| CAM-DGM-072 | overviewEdit | Missing | No overview shapes. |
| CAM-DGM-073 | bannerPositions | Missing | No banners. |
| CAM-DGM-074 | legendItemManagement | Missing | No legend items. |
| CAM-DGM-075 | legendAdornment | Missing | No adornments. |
| CAM-DGM-076 | legendPriority | Missing | No legends to conflict. |
| CAM-DGM-077 | legendApplyTo | Missing | No legend items. |
| CAM-DGM-078 | legendTableCells | Missing | Requirements editor has no legends. |
| CAM-DGM-079 | legendExtract | Missing | No extraction. |
| CAM-DGM-080 | legendSuspend | Missing | No legend state. |
| CAM-DGM-081 | legendFilterPreference | Missing | No filtering. |
| CAM-DGM-082 | changeTypeRules | Missing | View kind is fixed. |
| CAM-DGM-083 | stickyPalette | Missing | Palette tool resets after one use. |
| CAM-DGM-084 | textVerticalPosition | Missing | No symbol properties. |
| CAM-DGM-085 | createRelationFromSelection | Missing | Not supported. |
| CAM-DGM-086 | splitTransitionDialog | Missing | No path splitting. |
| CAM-DGM-087 | pathCompartments | Missing | No path compartments. |
| CAM-DGM-088 | ownershipProblems | Missing | No ownership checking in the diagram. |
| CAM-DGM-089 | multiShapeCompartments | Missing | No dialog. |
| CAM-DGM-090 | inheritedShapeSize | Missing | New shapes use defaults. |
| CAM-DGM-091 | selectSameType | Missing | Not supported. |
| CAM-DGM-092 | coverageModeProject | Missing | Not supported. |
| CAM-DGM-093 | zoomOptions | Missing | No slider. |
| CAM-DGM-094 | gridSettings | Missing | Fixed snap size. |
| CAM-DGM-095 | labelConsideration | Missing | No layout options. |
| CAM-DGM-096 | labelOrientation | Missing | No label rotation. |
| CAM-DGM-097 | saveImageScope | Partial | Only active diagram. |
| CAM-DGM-098 | imageProperties | Missing | No properties. |
| CAM-DGM-099 | templateDefinition | Missing | Not supported. |
| CAM-DGM-100 | templateApply | Missing | Not supported. |
| CAM-DGM-101 | templateManage | Missing | Not supported. |
| CAM-DGM-102 | templateAspect | Missing | Not supported. |
| CAM-DGM-103 | aspectSetup | Missing | Not supported. |
| CAM-DGM-104 | aspectDiagrams | Partial | Apply Aspect and Clear Aspect commands for styles. |
| CAM-DGM-105 | aspectMatching | Missing | Not supported. |
| CAM-DGM-106 | aspectNavigation | Missing | Not supported. |
| CAM-DGM-107 | completeOptions | Missing | Not supported. |
| CAM-DGM-108 | completeUpdate | Missing | Not supported. |
| CAM-DGM-109 | checkComplete | Missing | No validation rule. |
| CAM-DGM-110 | imageExportLimits | Missing | No limits. |
| CAM-DGM-111 | presentationFlow | Missing | Not supported. |
| CAM-DGM-112 | presentationSimulation | Missing | No simulation. |
| CAM-DGM-113 | toolbarStyleTools | Missing | Only align and layout tools. |
| CAM-DGM-114 | toolbarLabelTools | Missing | Not supported. |

## Summary

Total 114: Supported 7, Partial 29, Missing 78.

## Top 10 gaps for capturing system architecture

1. CAM-DGM-010 displayPaths (Partial): Paths between shown elements appear automatically; no on-demand command.
2. CAM-DGM-007 displayParts (Partial): Show/Hide Parts and Ports... (sysml.diagram.showHideParts); no nested shift-select or by-kind panel.
3. CAM-DGM-009 relatedElements (Partial): Display Related Elements... (sysml.diagram.displayRelated) exists; option set not compared.
4. CAM-DGM-011 copyPaste (Partial): Copy Nodes, Paste Nodes and Copy Diagram as Image commands exist.
5. CAM-DGM-025 createRelationship (Partial): Connect by dragging for connections and transitions; limited kinds; no Create Relation from selection.
6. CAM-DGM-034 compartmentShow (Partial): Hidden compartments per node are kept in the diagram style; no element list dialog.
7. CAM-DGM-047 aspects (Partial): Save, Apply, Clear and Delete Aspect store diagram styles; no stereotype-matching aspects.
8. CAM-DGM-019 legends (Partial): Toggle Legend (sysml.diagram.toggleLegend) shows a key; no user-defined legend items.
9. CAM-DGM-045 saveImage (Partial): Save Diagram as Image... (sysml.diagram.saveImage) for the active diagram; no selection scope or multi-diagram.
10. CAM-DGM-036 selection (Partial): Click, Shift, rubber-band and Ctrl+A; no same-type or coverage modes.
