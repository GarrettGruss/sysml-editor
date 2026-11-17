# Working with model elements gap list

Our editor against each requirement in `../cameo-ui-model/ModelElements.sysml`. Ratings checked by grepping `src/` and `package.json` on the v0.3.0 deploy branch.

| Requirement | Name | Status | Note |
| --- | --- | --- | --- |
| CAM-ELM-001 | pasteListCreatesElements | Missing | No paste-to-create from clipboard text; tree add is one element at a time (sysml.tree.addChild). |
| CAM-ELM-002 | importMapSave | Missing | No spreadsheet import at all. |
| CAM-ELM-003 | mapGroups | Missing | No import maps. |
| CAM-ELM-004 | importDialogAreas | Missing | No import dialog. |
| CAM-ELM-005 | importMappingOptions | Missing | No import options. |
| CAM-ELM-006 | migrateLegacyMaps | Missing | No legacy import. |
| CAM-ELM-007 | importNestedRequirementsReq | Partial | Requirements editor builds nested requirements by hand; no file import. |
| CAM-ELM-008 | importBlocksReq | Missing | No import. |
| CAM-ELM-009 | importRelationshipsReq | Missing | No import. |
| CAM-ELM-010 | importInstancesReq | Missing | No instance import. |
| CAM-ELM-011 | specWindowFunctions | Partial | Diagram property panel edits name, type, multiplicity and documentation; the tree has rename and add child; no element-wide specification view. |
| CAM-ELM-012 | specWindowNavigation | Missing | No specification window; diagrams have back/forward only for diagrams (sysml.diagram.back). |
| CAM-ELM-013 | specSelectInTree | Partial | Show in tree via reveal exists in the tree; no specification refresh. |
| CAM-ELM-014 | propertyGroupViews | Missing | No properties view with these modes. |
| CAM-ELM-015 | quickFilter | Missing | No property list. |
| CAM-ELM-016 | defaultPropertiesProject | Missing | No default property settings. |
| CAM-ELM-017 | defaultPropertiesDiagram | Missing | No diagram customization. |
| CAM-ELM-018 | longTextEditor | Partial | Documentation edited inline in the diagram property panel; no long-text dialog or HTML mode. |
| CAM-ELM-019 | multilineValueEditor | Missing | No multi-value editor. |
| CAM-ELM-020 | booleanToggle | Partial | Diagram property panel and requirements editor have limited toggles; no generic boolean editing. |
| CAM-ELM-021 | pickFromFixedList | Partial | Type fields use pickers in the diagram panel; no unspecified option. |
| CAM-ELM-022 | pickFromEditableList | Partial | Diagram panel type field offers model elements; no select-element dialog with creation. |
| CAM-ELM-023 | pickMultipleValues | Missing | No multi-select picker. |
| CAM-ELM-024 | innerElementValue | Partial | Add child exists in the tree and on diagrams; no property-based ownership editing. |
| CAM-ELM-025 | valueSpecificationValue | Missing | No value specification editing. |
| CAM-ELM-026 | ownedElementGroups | Partial | State and action behaviour is edited in diagrams (src/edit/behavior.ts); no owner-specification groups. |
| CAM-ELM-027 | sortInnerElements | Partial | Requirements editor drag-to-reorder exists; general tree reordering is not provided. |
| CAM-ELM-028 | redefinePart | Partial | Inherited features are shown read-only (src/model/inherited.ts); no redefine action. |
| CAM-ELM-029 | convertElementKind | Missing | No convert command. |
| CAM-ELM-030 | replaceElement | Missing | No replace command. |
| CAM-ELM-031 | reverseRelationship | Missing | No reverse command. |
| CAM-ELM-032 | swapShapes | Missing | No swap command. |
| CAM-ELM-033 | reverseInfoFlowReq | Missing | No information flow reversal. |
| CAM-ELM-034 | extractSequence | Missing | No extract refactoring. |
| CAM-ELM-035 | extractActivity | Missing | No extract refactoring. |
| CAM-ELM-036 | extractStateMachine | Missing | No extract refactoring. |
| CAM-ELM-037 | extractStructure | Missing | No extract refactoring. |
| CAM-ELM-038 | symbolPropertiesDialog | Partial | Per-diagram legend, compartments and description toggles in the .sysmld style (src/diagram/style.ts); no symbol properties dialog or fill, font colours. |
| CAM-ELM-039 | applyImageToSymbol | Missing | No symbol images. |
| CAM-ELM-040 | rakeIcon | Partial | Double-click navigation into diagrams exists via Show in Diagram; no rake icon. |
| CAM-ELM-041 | symbolStyles | Missing | No symbol styles. |
| CAM-ELM-042 | styleInheritance | Missing | No property inheritance flags. |
| CAM-ELM-043 | stereotypeStyles | Missing | No stereotype styles. |
| CAM-ELM-044 | usedProjectStyles | Missing | No styles. |
| CAM-ELM-045 | pasteStyle | Missing | Copy/paste nodes exists (sysml.diagram.copyNodes) but not style-only paste. |
| CAM-ELM-046 | defaultStyleTemplate | Missing | No templates. |
| CAM-ELM-047 | customizeLists | Missing | No customization. |
| CAM-ELM-048 | hyperlinkTabs | Missing | No hyperlinks. |
| CAM-ELM-049 | hyperlinkElementDisplay | Missing | No hyperlinks. |
| CAM-ELM-050 | hyperlinkDefaults | Missing | No options. |
| CAM-ELM-051 | hyperlinkOnElements | Missing | No hyperlinks. |
| CAM-ELM-052 | openAndLocateHyperlink | Missing | No hyperlinks. |
| CAM-ELM-053 | selectionDialogMultiple | Missing | No selection dialogs. |
| CAM-ELM-054 | selectionDialogCreateClone | Missing | No selection dialogs. |
| CAM-ELM-055 | typeFilters | Missing | Type fields do not filter. |
| CAM-ELM-056 | typeSelectionMode | Partial | Creating a part usage on a diagram asks for a name and type in the panel; no auto-type mode. |
| CAM-ELM-057 | numberingAutomatic | Partial | Requirements editor and verification matrix number requirements by ownership (src/requirements/matrix.ts); ids are not generated into the model. |
| CAM-ELM-058 | numberingManual | Missing | No numbering. |
| CAM-ELM-059 | favoritesList | Missing | No favorites. |
| CAM-ELM-060 | htmlEditor | Missing | Documentation is plain text. |
| CAM-ELM-061 | synchronizeParameters | Missing | No parameter synchronization. |
| CAM-ELM-062 | elementUrls | Missing | Tree/diagram have no copy URL; source locations are via go to definition only. |
| CAM-ELM-063 | dateTimeDialog | Missing | No date properties. |
| CAM-ELM-064 | ownerDisplay | Missing | Nodes show names only. |
| CAM-ELM-065 | qualifiedNameStyle | Partial | Qualified names are used internally (src/model-service/support.ts); no display option. |
| CAM-ELM-066 | selectElementTypeDialog | Partial | The tree view has search and a Change View command (sysml.tree.changeView); no kind filter dialog. |
| CAM-ELM-067 | tooltipStyle | Missing | No tooltip setting. |
| CAM-ELM-068 | auxiliaryElements | Missing | No auxiliary mark. |
| CAM-ELM-069 | reorderInLists | Partial | Requirements editor drag reorder; other lists lack it. |

## Summary

- Supported: 0
- Partial: 18
- Missing: 51
- Total: 69

## Top 10 gaps for capturing system architecture

1. CAM-ELM-011 specWindowFunctions: one place to view and edit every property, owned element and relationship of an element.
2. CAM-ELM-028 redefinePart: redefining inherited parts is central to specializing architectures.
3. CAM-ELM-026 ownedElementGroups: edit behaviours and owned elements from the owner.
4. CAM-ELM-038 symbolPropertiesDialog: readable diagrams need fill, font and line control.
5. CAM-ELM-001 pasteListCreatesElements: bulk element creation from a text list.
6. CAM-ELM-007 and the import group: bulk import of requirements and structure from spreadsheets.
7. CAM-ELM-029 convertElementKind: change kind without rebuilding.
8. CAM-ELM-057 numberingAutomatic: stable ids for traceability.
9. CAM-ELM-031 reverseRelationship and CAM-ELM-030 replaceElement: cheap model repairs.
10. CAM-ELM-035 extractActivity: split big behaviours into sub-activities.
