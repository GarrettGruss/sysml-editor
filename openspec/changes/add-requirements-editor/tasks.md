# Tasks

## 1. Requirements table

- [x] 1.1 Implement the requirements table webview scoped to a package or file; verify it lists the requirements of a fixture package with satisfy and verify counts
- [x] 1.2 Implement editing of id, name, and documentation, and adding and deleting requirements; verify the "Edit text" and "Add requirement" scenarios
- [x] 1.3 Implement navigation to the tree, text, and diagrams, and live refresh from external edits; verify the "External edit" scenario

## 2. Requirement relationships

- [x] 2.1 Implement the satisfy relationship pane (view, add, remove); verify the "Add satisfy" scenario
- [x] 2.2 Implement verify: pick or create a verification case and insert `verify` into its objective; verify both "Verify relationships" scenarios
- [x] 2.3 Implement derivation as a `#derivation connection` with the `RequirementDerivation` import added when missing; verify the "Add derivation" scenario and that the fixture derivation examples are read back as derivations
- [x] 2.4 Add satisfy, verify, and derivation to the Requirements View palette; verify the "Draw derivation" scenario

## 3. Document view

- [x] 3.1 Add the `DocumentAnnotations.sysml` metadata library, index it read-only, and offer to copy it into the workspace; verify `@DocumentRoot` and `@Appendix` resolve in a fixture
- [x] 3.2 Implement the `DocumentModel` (sections, paragraphs, items, model-elements listing, appendices, computed numbering and table of contents); verify the "Section content", "Annotated source renders as document", "Unannotated package", and "Reorder renumbers" scenarios in unit tests
- [x] 3.3 Implement comment-body handling: margin stripping and regeneration, the `*\/` convention, and the Markdown subset renderer with no raw HTML; verify the "Paragraph with comment terminator" and "List in paragraph" scenarios
- [x] 3.4 Implement the `moveMember` edit plan (with leading comments and re-indentation, using `RenameService` for moves to another parent); verify round-trip tests
- [x] 3.5 Build the document view in the requirements webview (Table/Document toggle, title block, clickable table of contents, inline editing of headings, paragraphs, and items, adding sections, appendices, paragraphs, and requirements, drag reorder, delete with confirmation); verify the "Add section", "Heading with spaces", "Add appendix", "Move section", and "Delete section" scenarios
- [x] 3.6 Document the document-view mapping, the metadata library, and the `*\/` convention in `docs/requirements-document.md`

## 4. Agent requirement tools

- [x] 4.1 Implement `read_requirements_document` (Markdown from the `DocumentModel` with qualified-name markers); verify the "Agent reads specification" scenario
- [x] 4.2 Implement `create_requirement` and satisfy, verify, and derivation through `create_relationship`; verify the "Agent adds derivation" scenario produces the same text as the requirements editor
- [x] 4.3 Add the new tools to the channel contract test and to `docs/agents.md`; verify identical results on both channels

## 5. Integration

- [x] 5.1 End-to-end test: edit a requirement in the table, the document view, the text, and through an agent; verify all four views agree after each edit
- [ ] 5.2 Package with `vsce package` and verify the requirements editor opens from an installed `.vsix`
