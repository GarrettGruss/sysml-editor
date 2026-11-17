# Cameo UI trade study

How our editor compares with the Cameo-style user interface described in `cameo-ui-model/` (599 requirements), and which gaps are worth closing. Per-section evidence is in `cameo-gaps/*.md`. This study follows GitHub issue #50. Features in the in-flight `add-agent-ui-testing` change are treated as planned, not supported.

## Principles that shape the ratings

- Text is the source of truth (D21). A diagram is a visual code editor, so anything that exists only to manage a separate model store (ids, XMI, project formats, recovery files, attached files, merge of binary projects) has no meaning here.
- VS Code supplies much of the chrome: search, git and diff, settings, keybindings, the Problems panel, multi-root workspaces, layout and views. Requirements about windows, menus, perspectives and memory are host features, not ours to rebuild.
- Agents are first class. Many gaps can be met by an LM tool (bulk create, validate, report) at a fraction of the cost of a dialog.
- No standalone mode, no server. Cameo licensing, Teamwork and server features do not apply.

## Summary of ratings

Re-rating checked each section against `src/` and `package.json`. Most bulk ratings held; nine requirements moved up (all Missing to Partial) because validation, matrix reports, image export, imports and grid snapping exist in some form.

| Section | Total | Supported before | Partial before | Missing before | Supported after | Partial after | Missing after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Getting started (GST) | 150 | 21 | 49 | 80 | 21 | 49 | 80 |
| Diagramming (DGM) | 114 | 7 | 29 | 78 | 7 | 30 | 77 |
| Diagram types (DGT) | 119 | 3 | 24 | 92 | 3 | 24 | 92 |
| Model elements (ELM) | 69 | 0 | 17 | 52 | 0 | 18 | 51 |
| Projects (PRJ) | 89 | 1 | 18 | 70 | 1 | 23 | 65 |
| Tools (TLS) | 58 | 0 | 2 | 56 | 0 | 4 | 54 |
| Overall | 599 | 32 | 139 | 428 | 32 | 148 | 419 |

Changed: CAM-DGM-094, CAM-ELM-057, CAM-PRJ-018, CAM-PRJ-023, CAM-PRJ-062, CAM-PRJ-068, CAM-PRJ-072, CAM-TLS-028, CAM-TLS-029 (Missing to Partial). CAM-GST-038 stays Partial with a corrected note: validation is the sysml_validate tool, and no Problems-panel diagnostics collection exists in `src/`. The ELM and TLS zeros for Supported were largely right: rename, delete and search exist, but they map to Cameo requirements about whole dialogs (specification window, property views, merge, metrics) that we only cover in part.

## Gaps by theme

Value is for capturing system architecture. Cost: S is days, M is a sprint-sized change, L is a multi-change effort.

### 1. Diagramming (DGM, most of DGT)
Value High, cost M to L. Biggest remaining gaps: create-relation from a selection and tree (DGM-085, GST-036), on-demand display of paths (DGM-010), selection modes (DGM-091), frames and banners (DGM-016, 017), style properties and symbol styles (DGM-014, ELM-038, 041), legend filtering, line-jump and path polish (DGM-029 to 031), image export options, many diagram types still missing (parametric, package, matrix, table types in DGT). Note: style stays in memory until saved, and pure presentation features (rounded corners, line jumps) have low architecture value. Prioritise relationship authoring, more diagram kinds, and style basics.

### 2. Model navigation and search (GST browser, PRJ find)
Value High, cost S to M. Search is name-only. Missing: scope and kind filters (PRJ-036, 045, 046, 051), documentation search, bulk replace (PRJ-053), result navigation, inheritance and structure trees (GST-044, 048), relations branch (GST-022). VS Code's own symbol and text search could cover some of it; a workspace symbol provider is cheap and gives quick open for free.

### 3. Project and file management (PRJ, part of GST)
Value Low to Med, cost S to L. Files are the project, git is the store. Needed: export of a package to its own file, templates (new from template), import wizard for packages (PRJ-059, 062). Not needed: project properties, formats, backup, recovery, reset ids, XMI, legacy projects.

### 4. Model element editing (ELM, GST-013 and 034)
Value High, cost M. A general properties panel for any element (ELM-011, 014), redefine action for inherited features (ELM-028), convert kind (029), replace (030), reverse relationship (031), reorder members (027), multi-value pickers, element lists with type filters. Hyperlinks and images are low value.

### 5. Tools, validation and reports (TLS, PRJ-038 to 043)
Value Med to High, cost M. Real diagnostics in the Problems panel (not just an agent tool), model-quality metrics (TLS-028), requirement and coverage reports (partly present in the requirements Matrix), instantiation wizard (TLS-045 to 047), package structure templates (TLS-058). Merge and patch (TLS-001 to 021) are replaced by git; a semantic diff could be a later nicety. Spelling is better left to existing VS Code spell extensions. Obfuscation, profiler, certificates, code engineering are not relevant.

### 6. Collaboration
Value Low, cost L. Server projects, locking, commit dialogs (GST-056, 087) are replaced by git and VS Code Live Share. Do not build.

### 7. Analysis
Value Med, cost L. Executable constraints and calculations (TLS-039), simulation and parametrics. SysML v2 makes these first-class, but evaluation needs an engine; defer. Cheaper intermediate step: dependency and impact views (who references this element).

### 8. Customization and UI chrome (GST menus, perspectives, environment)
Value Low, cost S to L. Perspectives, toolbar customization, memory, welcome tab, expert mode are VS Code's. A few settings (tree sort, qualified names, grid) are cheap and useful.

## Top 20 candidate features

| # | Feature | Requirement ids | Value | Cost | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | Problems-panel diagnostics from parser and unresolved-reference checks | GST-038, PRJ-038 to 040, 068, 072, TLS-028 | High | S | The validator already exists as a tool; publishing it as diagnostics gives errors with links for free. |
| 2 | Create relationship from selection and from the tree | DGM-025, 085, GST-036 | High | M | Relationships are the point of architecture diagrams; today the kinds are limited. |
| 3 | General properties panel for any element | ELM-011, 012, 014, 015, GST-037, 081 | High | M | One place to see and edit everything about an element. |
| 4 | Search scope, kind and documentation filters, next/prev result | PRJ-036, 044 to 046, 049 to 051, GST-031, 093 | High | S | Large models need targeted search; builds on the existing search view. |
| 5 | Bulk find-and-replace of names and documentation | PRJ-053 | Med | S | Safe refactor using the rename planner already in `src/edit/rename.ts`. |
| 6 | Redefine inherited feature from a usage | ELM-028, TLS-044 | High | M | Specialization is core to SysML v2; inherited features are visible but read-only. |
| 7 | Convert, replace and reverse relationship commands | ELM-029 to 031 | Med | S | Cheap model repairs expressible as text edits. |
| 8 | Inheritance and structure trees plus related-elements submenu | GST-041, 044, 046, 048, 049, 050 | High | M | Browse a definition's usages and specializations without diagrams. |
| 9 | Additional diagram kinds (package, parametric, tables and matrices) | DGT group | High | L | Fills the largest block of Missing requirements. |
| 10 | Instantiation wizard (parts from multiplicity) | TLS-045 to 047 | Med | M | Speeds building a system from definitions. |
| 11 | Diagram frames, banners and style properties | DGM-014, 016, 017, ELM-038, 041 | Med | M | Readable, publishable diagrams; style stays in the diagram file. |
| 12 | Display paths on demand and selection modes | DGM-010, 091, 036 | Med | S | Small, frequent diagram operations. |
| 13 | Package export and templates | PRJ-020 to 022, 059 | Med | M | Reuse of architecture fragments across workspaces. |
| 14 | Package structure templates | TLS-057, 058 | Med | S | Consistent layouts; tool-driven for agents. |
| 15 | Model-quality metrics and coverage dashboard | TLS-022 to 029 | Med | M | Extends the requirements matrix into an architecture health view. |
| 16 | Diagram search and find-in-diagram | PRJ-054 | Med | S | Navigation in big diagrams. |
| 17 | Member reordering in the tree and owner lists | ELM-027, 069, GST-092 | Low | S | Order matters for documents and requirements. |
| 18 | Tree options: sort toggle, qualified names, relations branch | GST-019, 022, 030, 033, ELM-065 | Low | S | Cheap view settings. |
| 19 | Numbering of requirements | ELM-057, 058 | Med | S | Stable ids for traceability, generated into declared short names. |
| 20 | Semantic model diff on top of git | TLS-001 to 017 | Med | L | Readable architecture review; git handles the merge itself. |

## Won't do

- Server, Teamwork, locking, licensing, certificates, commit dialogs (TLS-056, GST-056, 087, collaboration section): no server, and git covers versioning.
- Project formats, XMI, Ecore, EA import, legacy project open, MOF import and export (PRJ-016, 017, 078 to 089): text is the single source of truth and the models are SysML v2, not UML.
- Used-project bookkeeping, usage modes, recovered elements, reset ids, integrity bookkeeping beyond diagnostics (PRJ-004 to 006, 060 to 076): imports and text replace the mechanism.
- Merge, patch and project-level obfuscation (TLS-001 to 021, 054, 055): git; no model-level patches.
- UML-only diagram and element kinds, OCL, profiles and stereotypes, code engineering, Java generation (TLS-025, 038, 040, 043, GST-032, 042, 053): not part of SysML v2.
- Window chrome: perspectives, memory monitor, memory allocation, welcome tab, toolbar customization, special characters, expert mode (GST-105, 130 to 135, 142, 143, 150): VS Code owns these.
- Spell check (TLS-048 to 051): leave to existing VS Code spelling extensions.
- Backup, auto recovery, save formats, startup project (PRJ-011 to 015): files, hot exit and git cover it.
