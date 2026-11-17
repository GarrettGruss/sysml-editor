# Projects gap list

Our editor against each requirement in `../cameo-ui-model/Projects-2.sysml`. Ratings checked against `src/` and `package.json` on the work/cameo-model branch.

| Requirement | Name | Status | Note |
| --- | --- | --- | --- |
| CAM-PRJ-001 | createProject | Partial | A folder opened in VS Code is the project; New File and New Folder exist (sysml.tree.newFile), no project-type dialog. |
| CAM-PRJ-002 | newProjectStructure | Partial | Standard library is indexed read-only (src/model/library.ts); no fixed Model root. |
| CAM-PRJ-003 | projectProperties | Missing | No project-level metadata dialog or command in package.json. |
| CAM-PRJ-004 | compatibilityRange | Missing | No profile versioning in src/. |
| CAM-PRJ-005 | advancedProjectTabs | Missing | No shared package or used project concept in src/. |
| CAM-PRJ-006 | resetIds | Missing | SysML text has no element ids to reset. |
| CAM-PRJ-007 | switchProjects | Partial | VS Code multi-root workspaces; src/workspace scans all workspace folders but the SysML tree does not switch projects. |
| CAM-PRJ-008 | closeAllProjects | Partial | VS Code asks about dirty files; model edits are saved at once so there is nothing to ask. |
| CAM-PRJ-009 | copyBetweenProjects | Partial | Diagram Copy Nodes and Paste Nodes exist; no cross-project element paste in the tree. |
| CAM-PRJ-010 | saveProject | Supported | Model edits are written to .sysml at once; Ctrl+S saves the diagram (.sysmld). |
| CAM-PRJ-011 | saveFormats | Missing | Only .sysml text and .sysmld diagram files. |
| CAM-PRJ-012 | saveBackup | Missing | No backup option in package.json configuration. |
| CAM-PRJ-013 | autoRecovery | Partial | Model edits are saved immediately and VS Code provides hot exit; no recovery file in src/. |
| CAM-PRJ-014 | openProject | Partial | VS Code Open Folder; viewsWelcome offers Open Folder when no folder is open. |
| CAM-PRJ-015 | openLastProject | Partial | VS Code restores the last folder; not an extension feature. |
| CAM-PRJ-016 | xmiStorage | Missing | Storage is SysML text; no XMI. |
| CAM-PRJ-017 | openLegacyProject | Missing | Not applicable to .sysml; no legacy formats. |
| CAM-PRJ-018 | exportFormats | Partial | Diagram image export (sysml.diagram.saveImage) and requirements Markdown/CSV export via sysml_read_verification_matrix; no project export formats. |
| CAM-PRJ-019 | exportEclipseUml2 | Missing | No export. |
| CAM-PRJ-020 | exportAsTemplate | Missing | No template concept. |
| CAM-PRJ-021 | customTemplate | Missing | No template concept. |
| CAM-PRJ-022 | newFromTemplate | Missing | No template concept. |
| CAM-PRJ-023 | importAnotherProject | Partial | SysML import statements across files and packages (text); no import command or wizard. |
| CAM-PRJ-024 | attachFile | Missing | No attached-file element kind in src/model/kinds.ts. |
| CAM-PRJ-025 | reattachFile | Missing | No attachments. |
| CAM-PRJ-026 | detachFile | Missing | No attachments. |
| CAM-PRJ-027 | openAttachedFile | Missing | No attachments. |
| CAM-PRJ-028 | attachedImageInHtml | Missing | No HTML text boxes in diagrams. |
| CAM-PRJ-029 | saveAttachedFileAs | Missing | No attachments. |
| CAM-PRJ-030 | imageShapeFromAttached | Missing | No image shapes in src/diagram. |
| CAM-PRJ-031 | disclaimerConfig | Missing | No stereotypes or open-time dialogs. |
| CAM-PRJ-032 | disclaimerMessages | Missing | No stereotypes or tag values. |
| CAM-PRJ-033 | projectOptions | Partial | Four VS Code settings (sysml.exclude, imageTheme, followCursor, agent.channels); no project options dialog. |
| CAM-PRJ-034 | browserOptions | Missing | No such settings; sysml.tree.changeView only. |
| CAM-PRJ-035 | interchangeOptions | Missing | No OWL support. |
| CAM-PRJ-036 | filterBrowser | Partial | sysml.tree.changeView switches the tree view; no per-kind filter dialog. |
| CAM-PRJ-037 | filterSearch | Missing | Search box has one text field (src/tree/search-view.ts). |
| CAM-PRJ-038 | notificationWindow | Missing | No notification window; the VS Code Problems panel is not fed by the model. |
| CAM-PRJ-039 | notificationToolbar | Missing | No notification window. |
| CAM-PRJ-040 | notificationTabs | Missing | No notification window. |
| CAM-PRJ-041 | standardProfiles | Partial | The standard library is read-only and virtual (src/model/library-uri.ts); no warning dialogs. |
| CAM-PRJ-042 | profileVersions | Missing | No version bookkeeping. |
| CAM-PRJ-043 | oclRules | Missing | No OCL or validation rule suites. |
| CAM-PRJ-044 | findDialog | Partial | The tree search box filters by name (src/tree/search-view.ts); no dialog, no stereotype or documentation search. |
| CAM-PRJ-045 | findScope | Missing | Search is name-only across the whole tree. |
| CAM-PRJ-046 | findOptions | Missing | No such options. |
| CAM-PRJ-047 | searchResultsActions | Missing | No favorites or smart packages. |
| CAM-PRJ-048 | findById | Missing | No element ids in SysML text. |
| CAM-PRJ-049 | quickFind | Partial | The tree search box searches as you type; no scope choice or paging. |
| CAM-PRJ-050 | quickFindMatching | Missing | No camel-case matching or next-result keys. |
| CAM-PRJ-051 | quickFindFilters | Missing | No such filters. |
| CAM-PRJ-052 | findTodo | Missing | No To Do property. |
| CAM-PRJ-053 | findAndReplace | Partial | sysml.tree.rename renames one element; no bulk replace. |
| CAM-PRJ-054 | findInDiagram | Missing | No in-diagram search in src/webview. |
| CAM-PRJ-055 | searchBackground | Missing | Tree search is synchronous filtering. |
| CAM-PRJ-056 | textIndexing | Partial | The model index is rebuilt on scan; sysml.tree.refresh rescans; no visible progress or index command. |
| CAM-PRJ-057 | partitionConcept | Partial | SysML packages span files and import across them; no used-project role or accessibility. |
| CAM-PRJ-058 | decomposeGuidelines | Missing | No guidance or analysis in src/. |
| CAM-PRJ-059 | exportPackages | Missing | No such command in package.json. |
| CAM-PRJ-060 | shareData | Missing | No shared-package concept. |
| CAM-PRJ-061 | indexUnloaded | Missing | No proxies. |
| CAM-PRJ-062 | useProject | Partial | SysML import statements bring in other packages (text); no wizard. |
| CAM-PRJ-063 | usedAccessibility | Missing | No usage modes. |
| CAM-PRJ-064 | importUsedProject | Missing | No such command. |
| CAM-PRJ-065 | reloadUsedProject | Partial | sysml.tree.refresh rescans all files. |
| CAM-PRJ-066 | loadModes | Missing | All files are always indexed; sysml.exclude hides files. |
| CAM-PRJ-067 | usedProjectsDialog | Missing | No such dialog. |
| CAM-PRJ-068 | integrityValidation | Partial | sysml_validate checks unresolved names and syntax across files; no project-level integrity command. |
| CAM-PRJ-069 | automatedUsages | Missing | No usage tracking. |
| CAM-PRJ-070 | resolveUnconfirmed | Missing | No usage tracking. |
| CAM-PRJ-071 | recoveredElements | Partial | Unresolved references exist in the model index, not marked as recovered elements. |
| CAM-PRJ-072 | integrityAnalysis | Partial | sysml_validate lists unresolved references (src/agent-tools/unresolved.ts); no dedicated analysis view. |
| CAM-PRJ-073 | replaceRecovered | Missing | No such command. |
| CAM-PRJ-074 | removeUnresolved | Missing | No such command. |
| CAM-PRJ-075 | removeRecoveredSymbol | Missing | No recovered symbols in src/diagram. |
| CAM-PRJ-076 | avoidRecovery | Missing | No such options. |
| CAM-PRJ-077 | importFormats | Missing | No importers in package.json. |
| CAM-PRJ-078 | mofExport | Missing | No export. |
| CAM-PRJ-079 | mofImport | Missing | No importers. |
| CAM-PRJ-080 | ecoreProject | Missing | No Ecore. |
| CAM-PRJ-081 | ecoreModeling | Missing | No Ecore. |
| CAM-PRJ-082 | ecoreExport | Missing | No export. |
| CAM-PRJ-083 | ecoreImport | Missing | No importers. |
| CAM-PRJ-084 | eaImport | Missing | No importers. |
| CAM-PRJ-085 | eaOptions | Missing | No importers. |
| CAM-PRJ-086 | eaSpecificData | Missing | No importers. |
| CAM-PRJ-087 | eaDiagrams | Missing | No importers. |
| CAM-PRJ-088 | eaTransformations | Missing | No importers. |
| CAM-PRJ-089 | eaLimitations | Missing | No importers. |

## Summary

- Supported: 1
- Partial: 23
- Missing: 65
- Total: 89

## Top 10 gaps for capturing system architecture

1. CAM-PRJ-044 findDialog: Search by documentation, metadata and wildcards over the architecture; the base for finding any requirement or part.
2. CAM-PRJ-045 findScope: Scope and element-kind filters so a search can target one package or definition kind.
3. CAM-PRJ-053 findAndReplace: Bulk replace of names and documentation, needed for consistent refactoring of a large architecture.
4. CAM-PRJ-057 partitionConcept: Used-project style partitioning with read-only reuse of shared libraries across several models.
5. CAM-PRJ-059 exportPackages: Export a package into its own file as a reusable part, with dependency checks.
6. CAM-PRJ-068 integrityValidation: Project-level validation: cycles between files and unresolved imports.
7. CAM-PRJ-071 recoveredElements: Visible dangling references, with Replace and Clean commands, after moving or deleting shared elements.
8. CAM-PRJ-036 filterBrowser: Per-kind filter of the model tree to cut large architectures down.
9. CAM-PRJ-038 notificationWindow: One place that lists model errors with links to the element.
10. CAM-PRJ-054 findInDiagram: Find text inside an open diagram.
