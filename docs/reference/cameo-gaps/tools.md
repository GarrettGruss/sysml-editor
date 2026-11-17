# Tools gap list

Our editor against each requirement in `../cameo-ui-model/Tools.sysml`. Ratings judged from `src/` and `package.json` contributes.

| Requirement | Name | Status | Note |
| --- | --- | --- | --- |
| CAM-TLS-001 | mergeTypes | Missing | No merge feature; version comparison is left to git. |
| CAM-TLS-002 | changeKinds | Missing | No change model for merging. |
| CAM-TLS-003 | dependentChanges | Missing | No dependency tracking between changes. |
| CAM-TLS-004 | conflictsEquivalents | Missing | No conflict detection. |
| CAM-TLS-005 | mergeOptions | Missing | No merge options. |
| CAM-TLS-006 | startLocalMerge | Missing | No merge command. |
| CAM-TLS-007 | startServerMerge | Missing | No server or branch concept in the extension. |
| CAM-TLS-008 | mergeSummaryLegend | Missing | No merge window. |
| CAM-TLS-009 | mergedResultTree | Missing | No merged-result tree. |
| CAM-TLS-010 | propertyDiffPanel | Missing | No property comparison. |
| CAM-TLS-011 | changeDetailsPanel | Missing | No change details view. |
| CAM-TLS-012 | changeNavigation | Missing | No merge toolbar. |
| CAM-TLS-013 | conflictNavigation | Missing | No conflict filter. |
| CAM-TLS-014 | acceptRejectMenu | Missing | No merge menus. |
| CAM-TLS-015 | diagramDiffViewer | Missing | No diagram diff. |
| CAM-TLS-016 | diffReport | Missing | No report export. |
| CAM-TLS-017 | finishCancelMerge | Missing | No merge finish step. |
| CAM-TLS-018 | patchTypes | Missing | No patch concept. |
| CAM-TLS-019 | createPatch | Missing | No patch export. |
| CAM-TLS-020 | applyPatch | Missing | No patch import. |
| CAM-TLS-021 | patchDependencies | Missing | No dependency check for exchanged content. |
| CAM-TLS-022 | metricSuiteCreate | Missing | No metrics concept. |
| CAM-TLS-023 | metricSuiteConventions | Missing | No metric instances. |
| CAM-TLS-024 | metricSuiteTarget | Missing | No suite target. |
| CAM-TLS-025 | metricParameters | Missing | No parameter definitions. |
| CAM-TLS-026 | metricDefinitions | Missing | No metric formulas. |
| CAM-TLS-027 | metricUseCases | Missing | No expression scripting. |
| CAM-TLS-028 | validationMetric | Missing | No validation rules to measure. |
| CAM-TLS-029 | validationDashboard | Missing | No dashboards. |
| CAM-TLS-030 | transformationsAvailable | Missing | No transformations. |
| CAM-TLS-031 | transformationWizard | Missing | No wizard. |
| CAM-TLS-032 | transformationDestination | Missing | No destination choice. |
| CAM-TLS-033 | transformationDetails | Missing | No transformation properties. |
| CAM-TLS-034 | typeMap | Missing | No type maps. |
| CAM-TLS-035 | typeMapBehavior | Missing | No type map tags. |
| CAM-TLS-036 | transformationTraces | Missing | No trace data for transformations. |
| CAM-TLS-037 | transformationUpdate | Missing | No update flow. |
| CAM-TLS-038 | profileMigration | Missing | No profiles or migration. |
| CAM-TLS-039 | executableConcepts | Partial | SysML constraint and calc elements parse and show in the tree, but nothing is evaluated. |
| CAM-TLS-040 | oclConstraints | Missing | Constraint text is edited as plain SysML; no OCL. |
| CAM-TLS-041 | resourceManager | Missing | Left to the VS Code extension marketplace; only the annotation library copy command exists. |
| CAM-TLS-042 | customResources | Missing | No distribution mechanism. |
| CAM-TLS-043 | setterGetter | Missing | No code engineering. |
| CAM-TLS-044 | implementOverride | Missing | No override generator, although redefinition can be typed in text. |
| CAM-TLS-045 | instantiationWizard | Missing | Only manual creation of usages. |
| CAM-TLS-046 | instantiationParts | Missing | No part expansion. |
| CAM-TLS-047 | instantiationTarget | Missing | No instance package or diagram creation. |
| CAM-TLS-048 | spellAsYouType | Missing | No spelling support in the editors. |
| CAM-TLS-049 | spellProject | Missing | No project spell run. |
| CAM-TLS-050 | spellOptions | Missing | No spelling options. |
| CAM-TLS-051 | spellCustomElements | Missing | No customization classes. |
| CAM-TLS-052 | projectStatistics | Missing | No statistics export. |
| CAM-TLS-053 | operationPerformance | Missing | No profiler. |
| CAM-TLS-054 | modelObfuscation | Missing | No obfuscation. |
| CAM-TLS-055 | customObfuscation | Missing | No plugin API. |
| CAM-TLS-056 | serverCertificates | Missing | No server connections. |
| CAM-TLS-057 | packageStructureConfig | Missing | No configuration elements. |
| CAM-TLS-058 | createPackageStructure | Partial | Add Child creates one package at a time; no templated structure. |

## Summary

- Supported: 0
- Partial: 2
- Missing: 56
- Total: 58

Most of this section is outside the editor's scope: merge and patch overlap with git, plugins and servers do not exist in the extension, and code engineering is UML and Java specific.

## Top 10 gaps for capturing system architecture

1. CAM-TLS-028 (validationMetric): Model-quality metrics and validation counts that show architecture health are absent.
2. CAM-TLS-001 (mergeTypes): A model-aware merge of two versions (3-way) would help teams combine architectures; today git text merge is the only route.
3. CAM-TLS-002 (changeKinds): A semantic change list (add, move, rename, reorder) would make reviews of architecture changes readable.
4. CAM-TLS-018 (patchTypes): Exchanging one package between projects is useful for reuse and is missing.
5. CAM-TLS-017 (finishCancelMerge): Accepting changes selectively, then finishing, is missing along with the rest of the merge flow.
6. CAM-TLS-045 (instantiationWizard): Expanding a block into instances with multiplicities speeds building a system architecture.
7. CAM-TLS-058 (createPackageStructure): Templated package structures give consistent architecture layouts; only single children can be added.
8. CAM-TLS-044 (implementOverride): Generating redefinitions of inherited features would help specialisation of definitions.
9. CAM-TLS-046 (instantiationParts): Part counts from multiplicity are the core of the instantiation wizard.
10. CAM-TLS-048 (spellAsYouType): Spell checking of names and documentation improves requirement and model text quality.
