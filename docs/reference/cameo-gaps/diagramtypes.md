# Gaps: 005 Diagrams (DGT)

Status of our editor per requirement, judged from `src/` and `package.json`.

| Requirement | Status | Note |
| --- | --- | --- |
| CAM-DGT-001 offerUmlDiagramTypes | Partial | Six kinds exist (general, interconnection, requirements, actionFlow, stateTransition, sequence) in src/diagram/format.ts; no UML-only kinds. |
| CAM-DGT-002 groupViewsByArchitecture | Missing | New Diagram offers a flat kind list. |
| CAM-DGT-003 showClassAndInterfaceStructure | Partial | General view shows definitions and relationships from src/diagram/view-model.ts; no operations compartment on classes. |
| CAM-DGT-004 showObjectInstancesAndLinks | Partial | Usages appear in the general view; slot values and link instances are not drawn. |
| CAM-DGT-005 modelActorsAndUseCases | Partial | Use case and actor usages can be shown in the general view; no dedicated palette or subject boundary. |
| CAM-DGT-006 modelMessagesBetweenParts | Missing | No communication diagram kind. |
| CAM-DGT-007 modelLifelinesAndMessages | Supported | sequence kind in src/diagram/format.ts with message edits. |
| CAM-DGT-008 enableExecutionSpecMode | Missing | No execution specification mode. |
| CAM-DGT-009 dropBehaviorOnExecSpec | Missing | No execution specifications. |
| CAM-DGT-010 openBehaviorFromExecSpec | Missing | No execution specifications. |
| CAM-DGT-011 setMethodFromMessageOperation | Missing | No execution specifications. |
| CAM-DGT-012 anchorTimeConstraintToBar | Missing | No time constraints in sequence diagrams. |
| CAM-DGT-013 displayInnerStateElements | Partial | stateTransition kind exists; show/hide parts exists, no Display Inner Elements command. |
| CAM-DGT-014 convertStateBehavior | Missing | No refactor/convert command. |
| CAM-DGT-015 restrictProtocolStateMachine | Missing | No protocol state machine kind. |
| CAM-DGT-016 toggleBehaviorCreationMode | Missing | No creation mode in src/diagram/palette.ts. |
| CAM-DGT-017 pasteListAsActions | Missing | Paste handles diagram nodes only (src/diagram/clipboard.ts). |
| CAM-DGT-018 showDynamicCenterlines | Missing | No alignment guides. |
| CAM-DGT-019 setDiagramOrientation | Missing | No orientation property. |
| CAM-DGT-020 cascadeDeleteInActivity | Partial | deleteFromModel is explicit (src/diagram/edits.ts); plain delete never removes from the model. |
| CAM-DGT-021 displayInnerActivityElements | Partial | showHideParts on action defs partly covers this. |
| CAM-DGT-022 modelComponentsAndDependencies | Partial | General view only. |
| CAM-DGT-023 modelNodesAndDeployment | Partial | General view only; no node notation. |
| CAM-DGT-024 showPackageStructure | Partial | General view draws packages and imports. |
| CAM-DGT-025 offerPackageRelationships | Partial | Palette in src/diagram/palette.ts has no package-specific relations. |
| CAM-DGT-026 offerProfileDiagram | Missing | No profile diagram. |
| CAM-DGT-027 decomposeClassifierInternals | Supported | interconnection kind. |
| CAM-DGT-028 autoCreateDiagramContext | Missing | Not applicable to SysML interconnection views. |
| CAM-DGT-029 chooseContextCreationPolicy | Missing | No such option. |
| CAM-DGT-030 changeDiagramContext | Missing | No diagram specification window. |
| CAM-DGT-031 nestPartsThatAreAssociationEnds | Partial | Part nesting exists in the interconnection view; association ends are not modelled as in UML. |
| CAM-DGT-032 mapPortsAutomaticallyOnTypeChange | Missing | No port re-mapping on typing change. |
| CAM-DGT-033 mapPortsManually | Missing | No Port Mapping dialog. |
| CAM-DGT-034 pasteListAsNestedParts | Missing | No external list paste. |
| CAM-DGT-035 modelInteractionFlow | Missing | No such kind. |
| CAM-DGT-036 createDependencyMatrix | Missing | No matrix diagram kind; only the requirements matrix. |
| CAM-DGT-037 setMatrixCriteriaFields | Missing | No criteria area. |
| CAM-DGT-038 chooseMatrixElementTypes | Missing | No matrix. |
| CAM-DGT-039 scopeMatrixByPackages | Missing | No matrix. |
| CAM-DGT-040 buildMatrixHierarchyByQuery | Missing | No matrix. |
| CAM-DGT-041 chooseDependencyCriteria | Missing | No matrix. |
| CAM-DGT-042 chooseMatrixDirection | Missing | No matrix. |
| CAM-DGT-043 filterMatrixByRelationState | Missing | The requirements matrix has status filters only. |
| CAM-DGT-044 refreshMatrix | Missing | No matrix. |
| CAM-DGT-045 drawCellDependencies | Missing | No matrix. |
| CAM-DGT-046 showCellCounts | Missing | Requirements matrix shows status counts only. |
| CAM-DGT-047 showCellTooltip | Missing | No matrix. |
| CAM-DGT-048 createRelationFromCell | Missing | Requirements matrix links go through the requirements editor, not cells. |
| CAM-DGT-049 createManyRelationsFromCells | Missing | No matrix. |
| CAM-DGT-050 deleteRelationFromCell | Missing | No matrix. |
| CAM-DGT-051 navigateFromCell | Missing | No matrix. |
| CAM-DGT-052 sortAndShiftMatrixAxes | Missing | No matrix. |
| CAM-DGT-053 styleMatrixRelations | Missing | Diagram legend exists (toggleLegend) but not per-relation styles. |
| CAM-DGT-054 highlightMatrixViolations | Missing | No matrix. |
| CAM-DGT-055 transposeMatrix | Missing | No matrix. |
| CAM-DGT-056 exportMatrixToCsv | Partial | Requirements matrix exports CSV and Markdown (src/requirements/editor.ts); not a dependency matrix. |
| CAM-DGT-057 removeVersusDeleteMatrixElement | Missing | No matrix. |
| CAM-DGT-058 offerMatrixContextMenus | Missing | No matrix. |
| CAM-DGT-059 createRelationMap | Missing | No relation map; displayRelated exists on general diagrams. |
| CAM-DGT-060 setRelationMapCriteria | Partial | displayRelated has relations, direction, scope, depth (src/diagram/related.ts); no layouts. |
| CAM-DGT-061 changeRelationMapContext | Missing | No map. |
| CAM-DGT-062 cutRelationMapNames | Missing | No map. |
| CAM-DGT-063 toggleSingleNodePerElement | Missing | No map. |
| CAM-DGT-064 showMapElementNumbers | Missing | No map. |
| CAM-DGT-065 colorMapRelations | Missing | No map. |
| CAM-DGT-066 collapseMapBranches | Missing | No map. |
| CAM-DGT-067 zoomAndPanMap | Partial | Zoom and fit exist for diagrams (DiagramCommand in src/diagram/protocol.ts). |
| CAM-DGT-068 hideOrDeleteMapNode | Partial | Diagram delete and deleteFromModel exist for diagrams. |
| CAM-DGT-069 restoreMapLayout | Missing | No map. |
| CAM-DGT-070 createRelatedElementInMap | Missing | No map. |
| CAM-DGT-071 createSiblingWhileNaming | Missing | No map. |
| CAM-DGT-072 followRobustnessRules | Missing | No robustness kind or rule check. |
| CAM-DGT-073 prototypeUserInterfaces | Missing | No such kind. |
| CAM-DGT-074 editUiTablesAndTrees | Missing | No UI modeling. |
| CAM-DGT-075 saveUiPrototypeAsImage | Partial | saveImage exists for diagrams. |
| CAM-DGT-076 drawContentDiagram | Missing | No content diagram. |
| CAM-DGT-077 drawNetworkTopology | Missing | No such kind. |
| CAM-DGT-078 drawCorbaIdl | Missing | No such kind. |
| CAM-DGT-079 drawTimingDiagram | Missing | No such kind. |
| CAM-DGT-080 drawFreeFormShapes | Missing | No free drawing. |
| CAM-DGT-081 composeTableAreas | Partial | Requirements editor has a toolbar and table-like list, no general tables. |
| CAM-DGT-082 offerTableToolbars | Missing | No tables. |
| CAM-DGT-083 specifyTableScope | Missing | No tables. |
| CAM-DGT-084 collectRowsByExpression | Missing | No tables. |
| CAM-DGT-085 editCellsIntoModel | Partial | Requirements editor edits text and fields in place and saves at once (src/requirements). |
| CAM-DGT-086 selectTableRegions | Missing | No tables. |
| CAM-DGT-087 openSpecFromCell | Missing | No specification window. |
| CAM-DGT-088 clearCellValues | Missing | No tables. |
| CAM-DGT-089 moveBetweenCellsByKeys | Missing | No tables. |
| CAM-DGT-090 manageTableColumns | Missing | No tables. |
| CAM-DGT-091 defineCustomColumns | Missing | No tables. |
| CAM-DGT-092 showDetailedColumnNames | Missing | No tables. |
| CAM-DGT-093 addTableRows | Missing | No tables. |
| CAM-DGT-094 removeRowVersusDelete | Missing | No tables. |
| CAM-DGT-095 sortTableRows | Missing | No tables. |
| CAM-DGT-096 moveTableRows | Partial | Requirements editor drags to reorder (src/requirements/layout.ts). |
| CAM-DGT-097 toggleElementNumbers | Partial | Requirements document numbers by source order. |
| CAM-DGT-098 showTableHierarchy | Partial | Requirements editor shows hierarchy (src/requirements/document-model.ts). |
| CAM-DGT-099 addNestedRequirement | Supported | Requirements editor inline add and nest (src/requirements/commands.ts). |
| CAM-DGT-100 pasteExternalTableData | Missing | No tables. |
| CAM-DGT-101 copyTableDataOut | Missing | No tables. |
| CAM-DGT-102 filterTableRows | Partial | Requirements matrix has status filters (matrix-view.ts). |
| CAM-DGT-103 keepFilterOnReload | Missing | No tables. |
| CAM-DGT-104 exportTableToFile | Partial | Requirements matrix exports CSV and Markdown only. |
| CAM-DGT-105 createGenericTable | Missing | No tables. |
| CAM-DGT-106 useGenericTableWizard | Missing | No wizards. |
| CAM-DGT-107 changeGenericElementTypes | Missing | No tables. |
| CAM-DGT-108 fillGenericFromModel | Missing | No tables. |
| CAM-DGT-109 addGlossaryTerms | Missing | No glossary. |
| CAM-DGT-110 insertGlossaryTerms | Missing | No glossary. |
| CAM-DGT-111 specifyInstanceClassifier | Missing | No tables. |
| CAM-DGT-112 chooseInstanceColumns | Missing | No tables. |
| CAM-DGT-113 createInstancesInTable | Missing | No tables. |
| CAM-DGT-114 setInstanceSlotValues | Missing | No tables. |
| CAM-DGT-115 createMetricTable | Missing | No metrics. |
| CAM-DGT-116 calculateMetrics | Missing | No metrics. |
| CAM-DGT-117 linkExcelOrCsvFile | Missing | No sync. |
| CAM-DGT-118 readAndWriteSyncedFile | Missing | No sync. |
| CAM-DGT-119 loadTablePartially | Missing | No tables. |

## Summary

- Supported: 0
- Partial: 0
- Missing: 0
- Total: 119

1. Dependency matrix (CAM-DGT-036 to 058): Tracing allocation and satisfaction between structure and requirements is the main architecture review view; today only the requirements matrix exists.
2. Relation map (CAM-DGT-059 to 071): A navigable graph of related elements helps explore a large model; displayRelated is only one hop set on a general diagram.
3. Generic table (CAM-DGT-105 to 108, 090 to 094): Editable property tables over any element type are the quickest way to review and bulk-edit parts, attributes and ports.
4. Table filter, sort and export (CAM-DGT-095, 102 to 104): Large models need filter and export beyond requirements.
5. Excel/CSV sync (CAM-DGT-117 to 118): Many teams keep interface lists and budgets in spreadsheets.
6. Paste lists into diagrams (CAM-DGT-017, 034): Fast capture of a part tree or action list from notes or documents.
7. Port mapping on type change (CAM-DGT-032, 033): Retyping a part is common in architecture work; losing connectors is costly.
8. Instance table (CAM-DGT-111 to 114): Configurations and test cases as instance rows.
9. Metric table (CAM-DGT-115 to 116): Coverage and completeness metrics for architecture review.
10. Glossary table (CAM-DGT-109 to 110): Consistent vocabulary across requirements and structure.
