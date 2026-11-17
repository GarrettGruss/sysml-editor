# Getting started gap list

Our editor against each requirement in `../cameo-ui-model/GettingStarted.sysml`, judged from `src/` and `package.json`. Many requirements describe the host application (windows, license, JVM memory) that VS Code already provides or that does not apply; those are marked as such.

| Requirement | Name | Status | Note |
| --- | --- | --- | --- |
| CAM-GST-001 | mainMenuGroups | Partial | VS Code owns the menu bar; the extension adds commands to editor, view-title and context menus only (package.json menus). |
| CAM-GST-002 | fileMenuProject | Partial | File handling is VS Code's; no import or export of external model formats, no print. |
| CAM-GST-003 | editMenuDiagram | Partial | Copy Nodes, Paste Nodes and select all exist; no cut, no whole-diagram paste, no project-wide Find dialog. |
| CAM-GST-004 | viewMenuZoomGridToolbars | Partial | Zoom and fit exist in the diagram toolbar; no grid, no toolbar customization. |
| CAM-GST-005 | layoutMenu | Supported | Align, distribute and auto-layout commands exist (sysml.diagram.align*, distribute*, autoLayout). |
| CAM-GST-006 | diagramsMenu | Partial | New Diagram exists; no wizards, no history list, no custom diagram types. |
| CAM-GST-007 | optionsMenu | Partial | Settings UI offers four sysml.* settings; no perspectives. |
| CAM-GST-008 | toolsAnalyzeMenus | Missing | No transformation, report, macro or analysis commands. |
| CAM-GST-009 | collaborateWindowHelpMenus | Partial | Window and Help are VS Code's; no server projects (files live in Git). |
| CAM-GST-010 | toolbarCustomizeFromView | Partial | Diagram toolbar buttons are fixed; VS Code lets users hide editor-title actions only. |
| CAM-GST-011 | browserShownWithProject | Supported | SysML Model tree view in its own activity-bar container (package.json views); VS Code lets users move it. |
| CAM-GST-012 | browserHierarchy | Supported | Tree provider builds a nested tree with collapsible nodes (src/tree/tree-provider.ts). |
| CAM-GST-013 | browserOperations | Partial | Create, rename, delete, drag-move, filter-by-search exist; no copy, cut or paste of elements, no type filter dialog. |
| CAM-GST-014 | browserTabsSet | Missing | One tree only; the view-mode switch (sysml.tree.changeView) does not offer these tabs. |
| CAM-GST-015 | browserDividerResize | Supported | VS Code sash between the Search and SysML Model views. |
| CAM-GST-016 | browserZoom | Missing | Tree text size follows VS Code window zoom only. |
| CAM-GST-017 | browserPositionOption | Supported | VS Code can move a view container to the secondary side bar. |
| CAM-GST-018 | browserTabClosing | Partial | VS Code Reset View Locations covers the view; no separate tabs. |
| CAM-GST-019 | browserSortAlphabetical | Partial | Tree sorts folders and files by name; no toggle (src/tree/tree-model.ts). |
| CAM-GST-020 | containmentGroupsModel | Supported | The SysML Model tree groups by file, package and element. |
| CAM-GST-021 | containmentOpening | Supported | The SysML Model view opens from the activity bar. |
| CAM-GST-022 | relationsBranch | Missing | Relationships are not shown as a separate branch. |
| CAM-GST-023 | auxiliaryResourcesToggle | Partial | Library files are always hidden from the tree (isLibraryUri); no toggle. |
| CAM-GST-024 | hyperlinksBranch | Missing | No element hyperlinks. |
| CAM-GST-025 | codeEngineeringSets | Missing | No code generation or reverse engineering. |
| CAM-GST-026 | treeToolbarCollapseAll | Partial | Collapse All exists (showCollapseAll); no recursive collapse of one node. |
| CAM-GST-027 | openInNewTree | Missing | No secondary trees. |
| CAM-GST-028 | favorites | Missing | No favorites. |
| CAM-GST-029 | quickFind | Partial | The Search view filters the tree as you type; it is not a dialog. |
| CAM-GST-030 | treeOptionsMenu | Partial | Only Change View and Clear Search exist in the tree title bar. |
| CAM-GST-031 | elementTypeFilter | Partial | Change View switches between views; no per-kind filter. |
| CAM-GST-032 | appliedStereotypesToggle | Missing | No stereotype display; metadata annotations are not shown on tree nodes. |
| CAM-GST-033 | fullTypesToggle | Partial | Tree descriptions show a type name; no qualified-name toggle. |
| CAM-GST-034 | treeContextMenu | Partial | Add Child, New Diagram, Go to Definition, Rename, Delete, Show in Diagram exist; the rest do not. |
| CAM-GST-035 | createElementInTree | Supported | sysml.tree.addChild and sysml.newDiagram in the tree context menu. |
| CAM-GST-036 | createRelationFromTree | Missing | Relationships are created in diagrams or text only. |
| CAM-GST-037 | openSpecificationWindow | Partial | Diagram properties panel and the requirements editor edit properties; no general specification window. |
| CAM-GST-038 | validationCommands | Partial | sysml_validate LM tool reports syntax and unresolved names; no VS Code Problems-panel collection in src/, no suites. |
| CAM-GST-039 | goToCommand | Supported | sysml.goToDefinition. |
| CAM-GST-040 | refactorConvert | Missing | No convert-to command. |
| CAM-GST-041 | relatedElementsList | Missing | No related-elements submenu in the tree (the diagram has Display Related Elements). |
| CAM-GST-042 | applyProfilesProjectUsages | Missing | No profiles or project usages. |
| CAM-GST-043 | generateReportFromTree | Missing | No report templates. |
| CAM-GST-044 | structureTab | Missing | No structure browser (the interconnection diagram shows one level of parts). |
| CAM-GST-045 | structureOpenNewTree | Missing | No secondary trees. |
| CAM-GST-046 | inheritedStructureOption | Missing | Not offered in the tree. |
| CAM-GST-047 | nestSatisfiedRequirements | Missing | Satisfy relations are not shown in the tree. |
| CAM-GST-048 | inheritanceTab | Missing | No inheritance tree. |
| CAM-GST-049 | inheritanceInvertTree | Missing | No inheritance tree. |
| CAM-GST-050 | inheritanceSelectInTrees | Partial | Reveal in tree exists for diagrams (revealInTree); there is no inheritance tab. |
| CAM-GST-051 | diagramsTab | Missing | Diagrams appear as .diagram files in the tree; no grouping by type. |
| CAM-GST-052 | diagramsTabCommands | Partial | Open and show-in-tree exist; no print, no grouping. |
| CAM-GST-053 | modelExtensionsTab | Missing | No stereotypes tree. |
| CAM-GST-054 | searchResultsTab | Partial | Search view filters the existing tree; no result groups. |
| CAM-GST-055 | searchResultsToolbar | Missing | No result list to manage. |
| CAM-GST-056 | lockViewTab | Missing | Not applicable to Git-based files; no locking. |
| CAM-GST-057 | treeRename | Supported | sysml.tree.rename with the f2 keybinding. |
| CAM-GST-058 | treeCopyCutPaste | Missing | No copy, cut or paste in the tree; move works by drag. |
| CAM-GST-059 | copyElementReference | Missing | No such commands. |
| CAM-GST-060 | treeDelete | Supported | sysml.tree.delete (with confirmation). |
| CAM-GST-061 | treeDragMove | Supported | Tree drag and drop controller (src/extension.ts). |
| CAM-GST-062 | editorTabTypes | Partial | Diagram editors open in VS Code tabs; no Welcome or Samples tab. |
| CAM-GST-063 | editorTabsCommands | Partial | VS Code's own editor commands apply. |
| CAM-GST-064 | samplesView | Missing | No bundled samples in the extension. |
| CAM-GST-065 | welcomeSearchBar | Missing | No Welcome tab. |
| CAM-GST-066 | statusLineIndications | Partial | Zoom and fit are in the diagram toolbar; VS Code status bar is not used by the extension. |
| CAM-GST-067 | statusLineVisibility | Missing | No status line items. |
| CAM-GST-068 | quickPropertiesPanel | Partial | Diagram properties panel exists; no zoom or documentation tab. |
| CAM-GST-069 | zoomTabPreview | Missing | No overview map. |
| CAM-GST-070 | zoomTabFitInWindow | Partial | Fit button in the diagram toolbar; no Ctrl+W binding. |
| CAM-GST-071 | zoomSliderOption | Missing | No slider. |
| CAM-GST-072 | documentationTab | Partial | Requirements editor edits doc text; diagrams have no documentation tab, no HTML. |
| CAM-GST-073 | propertiesTab | Partial | Diagram properties panel shows element and style properties; no tags, traceability or multi-kind logic. |
| CAM-GST-074 | imageLibrary | Missing | No image library. |
| CAM-GST-075 | lookAndFeel | Supported | Inherited from VS Code themes; diagram webview follows the editor theme. |
| CAM-GST-076 | shortcutFindDialogs | Partial | VS Code global search and the Search view; no model-aware Find and Replace. |
| CAM-GST-077 | shortcutDeleteSymbolOrElement | Partial | Delete key removes the symbol; Delete from Model is a menu command without key. |
| CAM-GST-078 | shortcutSelectAll | Supported | interaction.ts handles Ctrl+A. |
| CAM-GST-079 | shortcutSelectInTree | Partial | Reveal in tree exists without that binding. |
| CAM-GST-080 | shortcutMultiSelect | Partial | Shift-click multi-select; no same-type selection. |
| CAM-GST-081 | shortcutOpenSpecification | Missing | Enter on a symbol starts rename or nothing; no specification dialog. |
| CAM-GST-082 | shortcutAssignOnSymbol | Partial | Inline label edit exists; no completion list. |
| CAM-GST-083 | shortcutNewLineInCompartment | Supported | Inline input treats Shift+Enter as newline for multiline fields. |
| CAM-GST-084 | shortcutClipboard | Partial | Copy Nodes and Paste Nodes exist; no cut, new-element paste, drag copy or style paste. |
| CAM-GST-085 | shortcutSaveUndoRedo | Supported | VS Code document save and undo; diagram edits flow through text edits. |
| CAM-GST-086 | shortcutPrint | Missing | No print. |
| CAM-GST-087 | shortcutServerCommit | Missing | No server; Git commits are VS Code's. |
| CAM-GST-088 | shortcutRecentDiagrams | Partial | VS Code reopens closed editors with its own binding; no diagram history list. |
| CAM-GST-089 | shortcutFullScreen | Supported | VS Code full screen. |
| CAM-GST-090 | shortcutReportWizard | Missing | No report wizard. |
| CAM-GST-091 | shortcutReversePath | Missing | Not supported in connect tool. |
| CAM-GST-092 | shortcutReorder | Missing | Requirements editor reorders by drag only. |
| CAM-GST-093 | shortcutNextResult | Missing | No result navigation in the tree. |
| CAM-GST-094 | shortcutBrowserZoom | Missing | See browser zoom. |
| CAM-GST-095 | assignShortcut | Supported | VS Code Keyboard Shortcuts editor covers all sysml.* commands. |
| CAM-GST-096 | shortcutConflict | Supported | VS Code flags conflicts in its editor. |
| CAM-GST-097 | removeShortcut | Supported | VS Code removes keybindings. |
| CAM-GST-098 | restoreShortcuts | Supported | VS Code reset keybinding. |
| CAM-GST-099 | envDialogStructure | Partial | VS Code Settings UI offers filter and description for four sysml.* settings. |
| CAM-GST-100 | envGeneralDisplay | Partial | Language and font follow VS Code; none of the other options exist. |
| CAM-GST-101 | envEditingOptions | Missing | No such options. |
| CAM-GST-102 | envGeneralMisc | Partial | VS Code manages recent files, editor limits and undo. |
| CAM-GST-103 | envImageExport | Partial | Only sysml.diagram.imageTheme exists. |
| CAM-GST-104 | envInternalErrors | Missing | Errors go to the extension host log. |
| CAM-GST-105 | envMemorySettings | Missing | Runs inside VS Code's Node runtime. |
| CAM-GST-106 | envMergeCompare | Missing | Merging is Git's. |
| CAM-GST-107 | envNavigationOptions | Missing | Diagram open behavior is fixed. |
| CAM-GST-108 | envSaveLoad | Partial | VS Code provides backups and window restore; none of the rest. |
| CAM-GST-109 | envSpecificationOptions | Missing | No Specification window. |
| CAM-GST-110 | envUsageAnalyticsOption | Missing | No analytics are collected. |
| CAM-GST-111 | envDiagramEditing | Missing | Fixed behavior. |
| CAM-GST-112 | envDiagramDisplay | Missing | No grid or centerlines. |
| CAM-GST-113 | envSymbolManipulation | Partial | Marquee selection exists without a coverage choice. |
| CAM-GST-114 | envZoomOptions | Partial | Wheel zoom follows a fixed factor (view-input.ts); not configurable. |
| CAM-GST-115 | envSmartManipulators | Missing | No smart manipulators. |
| CAM-GST-116 | envToolbarOptions | Missing | Fixed palette. |
| CAM-GST-117 | envRelationMap | Missing | No relation map. |
| CAM-GST-118 | envBrowserOptions | Missing | Tree has no options. |
| CAM-GST-119 | envCompositionInspection | Missing | No used projects. |
| CAM-GST-120 | envCollaboration | Missing | No server. |
| CAM-GST-121 | envLicensing | Missing | No licensing. |
| CAM-GST-122 | envNetworkProxy | Missing | VS Code proxy settings apply. |
| CAM-GST-123 | envPluginsResources | Partial | VS Code Extensions view. |
| CAM-GST-124 | envSpelling | Missing | No spell check. |
| CAM-GST-125 | envExperienceModes | Missing | No modes. |
| CAM-GST-126 | envExternalTools | Missing | No external tool launch. |
| CAM-GST-127 | envNotifications | Missing | VS Code notifications. |
| CAM-GST-128 | envServerCertificates | Missing | No servers. |
| CAM-GST-129 | envPluginAreas | Missing | None of these plugins exist. |
| CAM-GST-130 | perspectiveSet | Missing | No perspectives. |
| CAM-GST-131 | perspectiveCustomize | Missing | Not offered. |
| CAM-GST-132 | perspectiveExpertToggle | Missing | No expert mode. |
| CAM-GST-133 | perspectiveSelectDialog | Missing | No dialog. |
| CAM-GST-134 | perspectiveManage | Missing | No perspectives. |
| CAM-GST-135 | perspectiveAreaDialog | Missing | No dialog. |
| CAM-GST-136 | configFilesLocation | Partial | VS Code settings.json stores sysml.* settings. |
| CAM-GST-137 | configFilesRedirect | Missing | VS Code profiles cover it. |
| CAM-GST-138 | configJavaSettings | Missing | Not applicable. |
| CAM-GST-139 | disableInboundNetwork | Missing | The MCP server listens on 127.0.0.1 (src/mcp/server.ts) with no switch except sysml.agent.channels. |
| CAM-GST-140 | usageAnalyticsOptOut | Missing | No analytics at all. |
| CAM-GST-141 | backgroundTaskManager | Partial | Progress notifications exist for indexing (withProgress); no manager. |
| CAM-GST-142 | memoryMonitor | Missing | Not applicable to the extension host. |
| CAM-GST-143 | memoryAllocation | Missing | Not applicable. |
| CAM-GST-144 | activeValidationPeriod | Missing | Indexing is event-driven; no period. |
| CAM-GST-145 | performanceAdvice | Partial | Files are partitioned by nature; parse runs in a worker (parse-worker.ts). |
| CAM-GST-146 | reportUnresponsive | Missing | Not applicable. |
| CAM-GST-147 | internalErrorsDialog | Partial | Errors are written to the extension output channel. |
| CAM-GST-148 | pathVariables | Missing | Paths in imports are workspace relative. |
| CAM-GST-149 | launchers | Missing | VS Code opens files itself. |
| CAM-GST-150 | specialCharacters | Missing | Not applicable: SysML text files hold UTF-8 text. |

## Summary

- Requirements: 150
- Supported: 21
- Partial: 49
- Missing: 80

## Top 10 gaps for capturing system architecture

1. Structure browser (structureTab, inheritedStructureOption). A nested-properties tree of a part def is the quickest way to read a system architecture; today only one level shows in the interconnection view.
2. Inheritance tree (inheritanceTab). Specialization hierarchy of definitions is the backbone of a type-based architecture and is invisible in the tree.
3. Element copy, cut and paste in the tree (treeCopyCutPaste). Reusing and restructuring parts without retyping text.
4. Relations branch and Create Relation (relationsBranch, createRelationFromTree). Connections, satisfy and allocate links cannot be browsed or created from the tree.
5. Specification window (openSpecificationWindow, shortcutOpenSpecification). One place to edit all properties of any element, opened with Enter.
6. Type filter and tree options (elementTypeFilter, treeOptionsMenu). Narrowing a large tree to part defs or requirements.
7. Diagrams grouped by type (diagramsTab). Finding the right view in a model with many diagrams.
8. Open in new tree and favorites (openInNewTree, favorites). Focus on one subsystem as its own root.
9. Overview and fit shortcut (zoomTabPreview, zoomTabFitInWindow). Navigating large diagrams.
10. Full Find with result tab (searchResultsTab, searchResultsToolbar). Model-aware search results, rerun and saved as a set.
