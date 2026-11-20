# Tasks

Groups A to C can run in parallel after A.1; D needs A to C; E and F need D.

## A. Library and mapping. Files: `resources/dodaf/DoDAF.sysml`, `src/dodaf/library.ts`, `src/dodaf/mapping.ts`, `docs/dodaf.md`, matching tests

- [x] A.1 Write `DoDAF.sysml` (D76); test it parses with no errors and declares each metadata def, and that `allocate` and metadata annotations on usages parse
- [x] A.2 `selectByMetadata(index, def)` (annotation lookup on parts, actions, items); test annotated and unannotated elements
- [x] A.3 Mapping table as data (D77) and the UAF-to-DoDAF name table (D85), documented in `docs/dodaf.md`; test it covers all 17 views
- [x] A.4 Command `SysML: Add DoDAF Library` that copies the file without overwriting; test with a fake file system

## B. Tables. Files: `src/dodaf/tables/*.ts`, `render.ts`, tests

- [x] B.1 Renderer for Markdown and CSV with escaping; test pipes and newlines in cells
- [x] B.2 AV-1, AV-2, CV-1 (D78); test the example rows and the missing-definition gap
- [x] B.3 OV-4 and OV-5a trees; test indentation and a cycle-safe walk
- [x] B.4 SV-5a matrix and its gaps; test a marked cell and an empty row
- [x] B.5 StdV-1 and DIV-2; test citations and attribute multiplicity

## C. Planner and writer. Files: `src/dodaf/plan.ts`, `src/dodaf/document.ts`, tests

- [x] C.1 `planViews(index, root, views)` returns form, root, file name and missing items (D80); test a partly tagged model
- [x] C.2 `writeDocument(sections)` to Markdown with DoDAF ordering and image links; test the link targets and the empty-view text

## D. Generator tool and command. Files: `src/agent-tools/dodaf-tools.ts`, `manifest.ts`, `index.ts`, `src/extension.ts`, `docs/agents.md`, tests

- [x] D.1 Executor creating missing diagrams, reusing existing ones, requesting images (D80, D82, D83); test with a fake diagram port that existing files are not rewritten and that no view means skipped sections
- [x] D.2 Tool `sysml_dodaf_generate` (`root`, `folder`, `views`, `format`, `plan`) and manifest entry; test schema, `plan: true` writes nothing, and the report lists gaps
- [x] D.3 Command `SysML: Generate DoDAF Document` with root and folder pickers; test the picker flow through the command seam
- [x] D.4 OV-1 graphic link and copy (D81); test the image lands in `images/`

## E. Skill. Files: `src/skills/sysml-dodaf/SKILL.md`, `src/skills/skills.test.ts`

- [ ] E.1 Write the skill (tag, plan, fill gaps, generate, review, raise issues); test it is installed and names the tool

## F. Acceptance example. Files: `test/fixtures/dodaf-example/**`, `src/dodaf/example.test.ts`, `src/test-integration/`

- [ ] F.1 Small DoDAF model, `.sysmld` files and expected Markdown (D84); test table sections match byte for byte
- [ ] F.2 Integration test generates all 17 views with images and checks every link resolves
