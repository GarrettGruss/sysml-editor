# Trade study: feasibility of the VS Code SysML v2 graphical editor

Date: 2026-11-11. Scope: the original single OpenSpec change `add-sysml-graphical-editor` (6 capability specs with 51 requirements, `design.md`, `tasks.md` with 62 tasks), since replaced by four changes (section 1b).

## 1. Verdict

The project is feasible. Nothing in the requirements is blocked by VS Code, by the SysML v2 language, or by the licences of the material we depend on. Three parts of the current plan would not survive contact with real models, and each has a workable alternative.

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| 1 | The parser plan fails on most real files. Design decision D2 is a hand-written grammar for a subset of the language, and the specs block editing on any file with parse errors. | Only 13% of fixture files (38 of 288) use nothing outside the planned subset. | Use a full-grammar parser. Reuse the MIT-licensed ANTLR4 grammar that already tracks release 2026-09.1 (section 5.1). |
| 2 | Diagram files cannot identify many of the things they must draw. The specs identify every node and edge by qualified name, with `elementId` as a fallback. | The textual notation has no `elementId`. Roughly 6 in 10 structural connections in the fixtures have no name. | Identify elements by qualified name plus a structural locator for unnamed elements, and detect renames (section 5.3). |
| 3 | The change is too large to deliver or verify as one unit. | 51 requirements and 62 tasks, with the riskiest work (text edits, cross-document undo) arriving after everything else. | Split into four changes ordered by risk (section 5.7), and run four short spikes first (section 8). |

Seven requirements also describe SysML v2 syntax that does not exist or behaves differently, most visibly `derive` (section 6.1).

On the market: I found no shipping open-source tool that combines VS Code, graphical editing that writes back to text, and saved layout. The closest are a commercial VS Code product in early access (Astah) and an MIT-licensed hobby extension with read-only diagrams (section 4). The gap is real, but two competitors are close enough that a phased delivery matters.

## 1a. Decision after this study: VS Code is required

After this study was written, the plan was narrowed so that the product runs only while VS Code is open. The extension hosts the MCP server, and the standalone server was removed. Cloud agents and CI pipelines are deferred until the core use case, a person and an agent working on one architecture in VS Code, is verified. The rest of this study describes the plan as it was before that decision.

The decision changes these parts of the study:

| Section | Effect |
|---|---|
| 5.4 Rendering and canvas | Diagrams are drawn only in the webview, with maxGraph as the preferred canvas library pending a spike. The text-measurement and rasteriser points no longer apply. |
| 5.5 Undo and save | Agent edits now join VS Code's undo history and are saved after each call. The diagram and text save coupling for edits made by a person is still open. |
| 5.6 Agent access | Conflicting writes with unsaved editor changes can no longer happen. The missing validate tool and the unbounded `get_element_tree` output remain. |
| 6.3, gaps 19 to 21 | Native modules are gone, so remote hosts are simpler. Write tools are disabled in untrusted workspaces. The hosted server listens on loopback only, with a per-session token. |
| 8, spike S4 | Replaced by the canvas library spike (task 5.7) and the unopened-diagram image check (task 8.3). |

Sections 5.1 to 5.3, 5.7, 6.1 and 6.2 are unaffected: the parser, element identity, scope split and the seven syntax contradictions are still open.

## 1b. Decisions taken on this study's recommendations

- **Parser (section 5.1):** accepted. The third-party ANTLR4 grammar is used, behind an acceptance gate on the fixtures, with our own full-grammar TypeScript parser as the fallback.
- **Scope (section 5.7):** accepted. The single change was replaced by four: `add-model-foundation`, `add-diagram-viewing`, `add-model-editing` and `add-requirements-editor`, under `openspec/changes/`.
- **Syntax contradictions (section 6.1):** all seven corrected in the specs of those changes. This includes element identity (section 5.3).

- **Behaviour diagrams (gap 11):** added to scope as a fifth change, `add-behavior-diagrams` (views of actions, states, sequences and use cases).
- **Deferred:** gaps 12 to 17, 19, 22 to 28 and 30, and the read-only mode in gap 21. Each is listed as a non-goal in the design of the change it belongs to. Gap 29 (licensing) is deferred until the extension is published.

- **Gap 9 (imports and visibility):** short name when visible, otherwise add an import, fully qualified name only when the import would clash.
- **Gap 10 (inherited features):** read-only from a usage; the definition cannot be changed through inheritance.
- **Gap 18 (save coupling):** every model edit is saved at once, and the editors and the text must stay in sync.
- **Agent validate tool and tree depth limit (section 5.6):** added to `add-model-foundation`.
- **Behaviour editing:** included in `add-behavior-diagrams`, which therefore also depends on `add-model-editing`. Spike S1 is now the parser acceptance gate, S2 and S3 are tasks in `add-model-editing`, and S4 was replaced as described in section 1a.

## 2. What was reviewed and how

- **Requirements:** all six spec files, `design.md` and `tasks.md`, as they are on disk today.
- **Fixtures:** `fixtures/sysml-v2-release` at tag `2026-09.1` and `fixtures/sysml-v2-models` (GfSE community models). I profiled every `.sysml` and `.kerml` file, the official textual and graphical grammars in `bnf/`, the standard library, and the specification PDF in `doc/`.
- **Web:** searches on 2026-11-11 for competing tools, parsers, MCP servers, VS Code APIs and research on AI-generated SysML v2. Two vendor sites and two GitHub repositories were read in full.
- **Direct checks:** the current VS Code API typings (`@types/vscode` 1.146.0) and the `sysml-v2-lsp` npm package (0.43.0), both downloaded and inspected without running them.

Limits to keep in mind:

- The fixture statistics come from regular-expression tallies of the leading keyword of each statement, after stripping comments. They are estimates, not parses. They are good enough to compare 13% with 90%, not 57% with 60%.
- I did not run any third-party parser against the fixtures. Section 8 proposes that as the first spike.
- Competitor facts come from vendor pages and READMEs. Claims such as parsing speed or "two-way editing" are the vendors' own.

## 3. What the fixtures show

### 3.1 Corpus

| Set | Files | Lines | Largest file |
|---|---|---|---|
| Release examples, training and validation (`sysml/`) | 252 `.sysml` | 14,727 | 1,581 lines (Annex A SimpleVehicleModel) |
| Release KerML examples (`kerml/`) | 58 `.kerml` | 2,793 | not measured |
| Standard library (`sysml.library/`) | 58 `.sysml` + 36 `.kerml` | 28,603 | 2,726 lines |
| GfSE community models | 36 `.sysml` | 5,110 | 598 lines |

The official grammars are about 350 rules for SysML and 290 for KerML. The graphical grammar is 2,264 lines across 25 element categories, with 284 reference images.

### 3.2 Findings that affect the plan

| Finding | Numbers | Why it matters |
|---|---|---|
| The planned parser subset covers a minority of real content. | 57% of statements; 33 of 252 release files and 5 of 36 community files are fully inside the subset. | With "edits blocked on parse errors", the editor would refuse to edit about 87% of the example files. |
| Expressions are everywhere. | About 17 to 19% of statements start with no keyword (shorthand redefinitions such as `:>> mass = 1200 [kg];`, parameters, expressions). About 15% of part, attribute, item and port usages carry a value expression. | A grammar without the expression language cannot parse ordinary attribute values. |
| The standard library depends on KerML. | 36 of 94 library files are `.kerml`. 38% of library imports in the examples (115 of 304) target packages defined in KerML, such as `ScalarValues`. | Type resolution needs a KerML parser or a prebuilt index. The plan mentions neither. The document-view library in design decision D14 itself imports `ScalarValues::String`. |
| Behaviour modelling is a large share of the examples. | 374 actions and action definitions, 148 states, 50 transitions and more than 20 use cases in the release examples. | The three planned diagram kinds (general, interconnection, requirements) cannot show any of it. |
| Most relationships have no name. | 91 bare `connect` statements against 23 named `connection` usages. 82 `bind`, 27 `satisfy`, 11 `verify` and 138 `perform` statements are almost all unnamed. | A qualified name cannot point at them, so diagram edges cannot be stored as specified. |
| Requirements are more than id, name and text. | 167 `subject` declarations, 90 `require` and 21 `assume` constraints across both sets. | The requirements table and document view show and edit only id, name and documentation. |
| Models span files. | 113 imports resolve to a package in another file. 8 files hold more than one root package and 6 hold none. | A workspace-wide index is required (the plan has one), and "one file, one package" cannot be assumed. |
| Derivation is not a keyword. | `derive` is absent from the grammar. Four fixture files express derivation as `#derivation connection { end #original ::> a; end #derive ::> b; }` using the `RequirementDerivation` library. | Every `derive` requirement in the specs needs rewording. |
| The language has its own view constructs. | `view`, `expose`, `render` and `filter` are keywords. The library defines eight standard views. The release examples contain 13 view usages. | The `.sysmld` file's "which elements are shown" overlaps a native concept (section 5.2). |
| Names with spaces are normal. | About 1,000 quoted names such as `'Performance Requirements'`. | Supports the document view's use of package names as headings. |
| Documentation comments follow one convention. | 148 of 177 multi-line `doc` comments use a leading `*` margin. None contain HTML. 10 look like Markdown. | The margin handling in D14 matches the specification's own rule. Markdown in comments is our convention, not existing practice. |
| No fixture file tests the performance target. | No file exceeds 2,726 lines. The requirement is "1 second for files up to 5,000 lines". | The real load is the 28,603-line library at start-up, which has no requirement. |
| The fixture checkout is mostly unused. | 253 MB, of which 145 MB is XMI, 60 MB PDFs and 43 MB installers. About 6 MB is model text and grammars. | A sparse checkout would cut clone and CI time. |

### 3.3 What the specification says

- **Layout is not standardised.** Clause 8.2.3 defines the graphical notation and says "Shapes within the graphical notation may generally be relocated anywhere within a given graphical layout." The specification text contains no diagram interchange format and no rule for storing positions.
- **Conformance has named levels.** Clause 2 defines Abstract Syntax, Concrete Syntax (Textual Notation and Graphical Notation variants), Semantic and Model Interchange conformance. Graphical Notation Conformance requires that notation can be "created, read, updated, and deleted". The plan covers part of the notation and should not claim conformance.
- **Identity in text is name-based.** The grammar rule for identification is an optional short name in angle brackets followed by an optional name. There is nowhere to write an element ID.
- **Comments cannot contain `*/`.** The lexical rule is `'/*' COMMENT_TEXT '*/'` with no escape sequence.

## 4. Landscape

| Tool | Form | Open source | Diagrams | Graphical edits written to text | AI / agents |
|---|---|---|---|---|---|
| Astah SysMLv2 Modeler | VS Code extension | No; licensing "to be announced" | Generated from text | Claimed: "Two-Way Diagram Editing" in real time | "Any AI agent" on `.sysml` files |
| daltskin SysML v2 extension with `sysml-v2-lsp` | VS Code extension and language server | Yes, MIT | 10 generated views (general, interconnection, action flow, state, sequence and others) | No. Editing is through tables, applied as one workspace edit; names are not editable | `sysml-mcp` command-line MCP server |
| Sensmetry Syside | VS Code extension, Python library, CLI | Editor free, licence not stated; diagrams in the paid Business plan | Generated, with auto-layout and export | No. Tables have "editable cells that write back to the model" | "Your AI assistant can read your models"; MCP not stated |
| Eclipse SysON | Web application | Yes | Full graphical modeller | Graphical-first, with textual import and export | Third-party MCP server (`@casys/mcp-syson`, 31 tools) |
| OMG Pilot Implementation | Eclipse and Jupyter | Yes | Generated (PlantUML-based) | No | None |
| Sensmetry `sysml-2ls` | VS Code language server | Yes | None | No | None; archived 13 October 2025 |

What this means for the project:

- **The exact combination is still open.** No open-source tool pairs VS Code graphical editing with text write-back and saved, user-arranged layout.
- **Astah is the closest threat.** It is in early access with no release date, and its page does not say which diagram types it supports or where layout is stored.
- **The daltskin project is the closest asset.** It uses the same stack this plan chose (TypeScript, ELK layout, an MCP server), is MIT-licensed, and published 53 versions between February and November 2026. Its maintainer describes it as "a hobby project ... maintained in my spare time".
- **Langium has a cautionary precedent.** Sensmetry's Langium-based server was archived in favour of a rewrite described as "significantly more performant". Langium's own maintainers describe "a rather sluggish user experience when working on large files or workspaces".
- **MCP for SysML v2 is no longer novel.** At least four MCP servers exist. The differentiator would be diagram generation and image output, which I did not find elsewhere.

## 5. Trade studies

### 5.1 Parser

The parser must cover the release grammar, keep exact source positions so edits stay minimal, tolerate half-typed text, and run in Node with no extra runtime.

| Option | Grammar coverage | Exact source positions | Tolerates broken text | Runs in Node alone | Effort and exposure |
|---|---|---|---|---|---|
| A. Hand-written Langium grammar for a subset (current D2) | Poor: 13% of files | Good | Good | Yes | High and recurring; we would own about 640 rules to reach full coverage |
| B. Vendor the open ANTLR4 grammar (`daltskin/sysml-v2-grammar`) with the `antlr4ng` runtime | Claimed complete for 2026-09.1; unverified | Good: parse tree with token ranges | Fair: ANTLR error recovery | Yes | Medium; grammar can be forked if upstream stops |
| C. Run `sysml-v2-lsp` as a child server and query it | Same as B | Poor: its interface returns a model, not a syntax tree | Fair | Yes, as a second process | Low to start; tied to a hobby project's releases |
| D. `tree-sitter-sysml` | Unknown; version 0.1.0 | Good | Good: built for it | Yes (WASM or native) | Medium; authors say the official grammar maps poorly onto tree-sitter |
| E. Rust parser compiled to WASM (`sysml-v2-parser`, Syster) | Unknown; Syster is alpha | Unknown | `sysml-v2-parser` has a "resilient editor mode" | Yes | Medium to high; adds a Rust toolchain |
| F. OMG Pilot Implementation (Java) as a server | Best: it is the reference | Good | Fair | No; needs a JVM | Poor fit for an `npx`-launched MCP server |

**Recommendation: B, confirmed by spike S1.** It is the only option that plausibly gives full coverage, exact positions and a Node-only runtime at medium effort. The `sysml-v2-lsp` npm package exports only the path to a bundled server, so reuse means vendoring the grammar files and building our own model layer on the parse tree, not importing a library. Keep D as the fallback. Use F only as a test oracle (section 6.3, item 22).

This replaces task 2.1 ("evaluate reuse") with a decision and a measurement.

### 5.2 Where diagram content and layout live

| Option | Meets "separate diagram files" | Other tools can show the same view | Complexity |
|---|---|---|---|
| A. Everything in `.sysmld` (current) | Yes | No | Lowest |
| B. A SysML `view` usage holds what is shown; `.sysmld` holds only positions | Yes for layout; view content moves into the model | Yes | Medium; we must parse and write `expose` and `filter` |
| C. Everything in SysML metadata | No | Partly | Highest; coordinates pollute the model |

**Recommendation: keep A for the first release, and make it compatible with B.** The requirement for separate files is explicit and the specification leaves layout to tools. Two cheap steps keep B available later:

- Name diagram kinds after the standard views (`GeneralView`, `InterconnectionView`, and later `ActionFlowView`, `StateTransitionView`, `SequenceView`). "Requirements View" is not a standard view; it is a general view filtered to requirements.
- Add an optional field in `.sysmld` that names a `view` usage, so a diagram can later take its content from the model.

### 5.3 Element identity in diagram files

| Option | Handles unnamed elements | Survives a rename typed in the text editor | Touches the user's model |
|---|---|---|---|
| A. Qualified name only (current; the `elementId` fallback does not exist) | No | No | No |
| B. Qualified name, plus a structural locator for unnamed elements (owner, kind, endpoints, position among siblings), plus rename detection | Yes | Usually: when one element disappears and one of the same kind and type appears under the same owner, treat it as a rename | No |
| C. Write an ID into the text as a short name or metadata annotation | Yes | Yes | Yes; changes every element shown on a diagram |

**Recommendation: B.** It needs no change to the user's text. Offer C later as an opt-in for teams that want durable links.

### 5.4 Rendering and canvas

The plan (D7) draws diagrams with one SVG renderer shared by the editor and by agent images, and builds interaction by hand. That is the right architecture for image parity and the most expensive option for interaction.

- **Layout:** `elkjs` supports nested nodes and ports and runs in Node and the browser. The daltskin extension and Sprotty both use ELK. Low risk.
- **Interaction:** selection, drag, resize, edge routing, connection drawing and keyboard access are the largest single cost in the project. A library such as Sprotty would cut it but cannot render without a browser.
- **Text measurement:** not addressed in the plan. Node has no font metrics, so label widths computed for an agent image will differ from the browser's. Bundle one font and measure with the same metrics in both places, or labels will overflow in one of them.
- **Rasteriser:** `@resvg/resvg-js` is a native module, which forces a separate extension package per platform. A WebAssembly build of resvg avoids that at some speed cost.

**Recommendation: keep D7's shared renderer, deliver read-only diagrams first, and add interaction in a later change.** Read-only diagrams with saved layout already match what the open-source competitor offers, and they make agent image output possible early.

### 5.5 Undo and save across text and diagram

A diagram edit that changes the model touches two documents: the `.sysml` text and the `.sysmld` diagram. VS Code keeps a separate undo history and unsaved-changes flag for each. The plan (D6) undoes both from the diagram's history by applying an inverse text edit. Three cases are unspecified:

- **Undo in the text editor.** The element disappears from the text, and under the current rules the diagram shows a permanent "unresolved" placeholder for it.
- **Save one, not the other.** Saving the diagram does not save the text. Closing the text without saving leaves a diagram that points at an element that was never written.
- **Stale inverse edits.** If the text changed between the edit and the undo, the inverse edit no longer applies. The design says to warn and skip.

**Recommendation:** add two requirements. First, a diagram entry created in this session whose element disappears is removed silently; placeholders are only for references that resolved at the last save. Second, saving a diagram also saves the `.sysml` files it changed. Confirm the rest with spike S3 before building on it.

### 5.6 Agent access

The two-channel design (MCP and VS Code Language Model Tools over one tool definition) holds up.

- **APIs:** `LanguageModelDataPart.image` and `lm.registerMcpServerDefinitionProvider` are both in the stable `@types/vscode` 1.146.0 typings. This settles the open question in task 8.9, apart from choosing the minimum version. One secondary source dates the MCP registration API to VS Code 1.105.
- **Conflicting writes:** the standalone MCP server reads and writes disk and cannot see unsaved editor changes. If an agent writes a file the user has open with unsaved edits, VS Code reports a conflict on save and one side's work is lost. When the extension is running, the MCP server should detect it and route writes through it.
- **Missing tools:** there is no validate or diagnostics tool, no search, and no way to apply several edits atomically. Research on AI-generated SysML v2 reports weak results (the best model in one benchmark scored 62% on its F1 measure), so agents need to check and repair their output.
- **Output size:** `get_element_tree` has no paging or depth limit. On a workspace that includes the 28,603-line library it would flood an agent's context.

### 5.7 Scope and sequencing

The current plan is one change with nine task groups. The risky work sits in groups 3 and 6, behind the parser, and nothing is usable until most of it is done.

**Recommendation: four changes, each shippable.**

| Change | Contents | Relative size | Main risk retired |
|---|---|---|---|
| 1. Model foundation | Full-grammar parser, workspace and library index, model tree (read-only), agent read tools | Medium if the grammar is reused; very large if written | Parser coverage |
| 2. Read-only diagrams | `.sysmld` files, layout, shared renderer, pan/zoom/move with saved layout, `read_diagram` with image, `create_diagram` | Large | Rendering parity, identity |
| 3. Model editing | Edit planner, palette and delete on diagrams, tree actions, rename, undo, agent write tools and journal | Very large | Text edits, undo, concurrency |
| 4. Requirements | Table view, document view, requirement relationships | Medium to large | Comment handling, section moves |

I have not estimated calendar time because team size is not known. Change 3 is the largest and the least certain.

## 6. Gaps

### 6.1 Requirements that contradict SysML v2

These should be corrected before implementation.

| # | Requirement | Problem | Fix |
|---|---|---|---|
| 1 | Requirements editor "Requirement relationships"; diagram editor "Supported diagram kinds"; agent `create_relationship` | `derive` is not a keyword. | Generate a `#derivation connection` with `#original` and `#derive` ends, and import `RequirementDerivation`. |
| 2 | Requirements editor "Requirement relationships" | `verify` is only valid inside a verification case's objective. It is not a free relationship between a requirement and any element. | "Add verify" must pick or create a verification case. |
| 3 | Diagram files "Linking to model elements" | `elementId` cannot be declared in the textual notation. | Remove it; adopt section 5.3. |
| 4 | Diagram files "Linking to model elements" | Edges must reference an element by qualified name, but most connections, bindings and satisfy statements have none. | Structural locator (section 5.3). |
| 5 | Model synchronization "Behavior with parse errors", with design D2 | A subset grammar reports errors on valid files and then blocks editing them. | Full grammar (section 5.1). Block edits only on genuine syntax errors. |
| 6 | Design D2 and D14 | The standard library cannot be resolved without KerML. | Parse KerML, or ship a prebuilt index of library names. |
| 7 | Requirements editor "Comment terminator escaping" | Storing `*/` as `*\/` is our convention. Other tools will show the backslash. | Keep it, and state it as a tool convention, or reject `*/` in paragraphs. |

### 6.2 Missing requirements likely to surface during the build

| # | Gap | Detail |
|---|---|---|
| 8 | Where generated statements go | The specs say what text is produced but not which element owns a new `satisfy` or `connect`, or which file receives a new element when a diagram spans files. |
| 9 | Visibility and imports | Typing `engine` as `Engine` fails if `Engine` is not visible from that package. Edits need to add an import or use a qualified name, and to quote names that are reserved words. |
| 10 | Usages and inherited features | A part usage typed by a definition shows that definition's parts. Adding or deleting a nested part "inside" the usage must either change the definition or create a redefinition. Interconnection editing depends on this rule and the specs are silent. |
| 11 | Behaviour views | Action flow, state transition, sequence and use case views are absent and not listed as out of scope. The open-source competitor has all of them, read-only. |
| 12 | Existing `view` usages | Models that already define views get no benefit. Opening a `view` usage as a diagram would be a cheap form of interoperability. |
| 13 | Requirement structure | Subject, attributes, and `require` and `assume` constraints are not shown or editable. Nested requirements and the difference between a requirement definition and a usage are not addressed in the table. |
| 14 | Project boundaries | No rule for which files form a model, for multi-root workspaces, or for the library version. The standard ships libraries as KPAR archives with a `.project.json`, and Sensmetry's open-source `sysand` package manager uses the same format. |
| 15 | Text editing support | The plan contributes the `sysml` language but no highlighting, diagnostics or completion. Users will install another SysML extension for that, and two extensions will then disagree about what is valid. Decide whether to own text editing or to coexist. |
| 16 | Document view limits | No export or print, no figures (diagrams embedded in the document), no cross-references. Section order comes from source order, so reordering text for other reasons reorders the document. |
| 17 | Document metadata portability | A file that imports `DocumentAnnotations` shows an unresolved import in every other SysML tool unless the library file is in the workspace. Copy it into the workspace or publish it as a KPAR. |

### 6.3 Product and platform gaps

| # | Gap | Detail |
|---|---|---|
| 18 | Save and unsaved-changes coupling | Covered in section 5.5. Also unspecified: VS Code's backup and restore of unsaved diagrams. |
| 19 | Remote and web hosts | WSL, SSH and containers run the extension remotely and the webview locally, so native modules must match the remote platform. A Node-only core rules out vscode.dev. The competitor supports the web host. |
| 20 | Workspace Trust | Agent write tools and a server that writes files should be disabled in untrusted workspaces. Not mentioned. |
| 21 | Agent safety | No rule confining MCP writes to the workspace, no read-only mode, and no note that model text returned to agents (documentation comments, names) is untrusted content. |
| 22 | Independent validation | "Generated text is valid SysML v2" is verified only by our own parser, which is circular. The GfSE fixture's CI runs a MontiCore parser jar; that or the Pilot Implementation could serve as an independent check in CI. |
| 23 | Git workflows | Coordinates in JSON produce merge conflicts. No diff view for diagrams. Renaming or moving a `.sysml` file does not update `sources` in `.sysmld`. The agent journal is not tied to a branch. |
| 24 | Diagram file versioning | `.sysmld` has a `version` field but no requirement for migrating old files. |
| 25 | Performance at workspace scale | No requirement for start-up time with the library loaded, memory, file count, or node count per diagram. No large fixture exists to test the 5,000-line target. |
| 26 | Diagram usability basics | Copy and paste, alignment, search within a diagram, and image export for people are not specified. The mockups show a minimap, zoom controls and a diagram list in the sidebar that no requirement covers. |
| 27 | Accessibility | Keyboard support covers select, delete and rename. Screen-reader access to diagram content is not addressed; the model tree is the natural fallback and should be stated as such. |
| 28 | Tracking the standard | The fixtures are at 2026-09.1 and the specification was updated editorially in March 2026 for ISO submission. There is no process for moving to a new release or for supporting more than one. |
| 29 | Licensing | The standard library and examples are under EPL 2.0 and the community models under BSD 3-Clause. Bundling the library means carrying its notices. The extension's own licence is undecided. This needs a decision, and legal review if the extension is to be sold. |
| 30 | Fixture weight | Sparse-checkout `sysml`, `kerml`, `sysml.library` and `bnf` to drop more than 240 MB. |

### 6.4 What holds up

- **Separate layout files.** The specification leaves layout to tools, so `.sysmld` is consistent with it.
- **Generated syntax in the scenarios.** `satisfy X by Y;`, `connect a.b to c.d;`, `requirement <'R2'> name;`, `package Name;` and `@Appendix;` inside a package are all valid against the grammar and appear in the fixtures.
- **Document view mapping.** Packages as sections, quoted names as headings, and metadata for title and appendix are idiomatic. The margin handling for comments is the specification's own rule.
- **Agent channels.** Both VS Code APIs are stable, and MCP servers for SysML v2 already exist, which shows agents can use them.
- **Toolchain.** Node, TypeScript and ELK are what the closest open-source project uses.

## 7. Feasibility by capability

| Capability | Feasibility | Main dependency or risk |
|---|---|---|
| Model tree view | High | Parser and index. The tree API is standard. |
| Diagram files | High | Element identity (section 5.3). |
| Diagram editor, read-only with saved layout | High | Renderer breadth; text measurement. |
| Diagram editor, graphical editing | Medium | Hand-built interaction; inherited-feature rule (gap 10). |
| Model synchronization | Medium | Exact source positions from the parser; cross-document undo. |
| Requirements table | High | Verify and derive semantics (gaps 1 and 2). |
| Requirements document view | Medium | Comment round-tripping; moving sections. |
| Agent integration | High | Conflicting writes; missing validate tool. |

## 8. Spikes to run first

Each is a few days and has a pass condition. Together they retire the three findings in section 1.

| Spike | What to do | Pass condition |
|---|---|---|
| S1. Parser bake-off | Parse all 288 fixture `.sysml` files and the 94 library files with the ANTLR4 grammar (and tree-sitter if time allows). | At least 99% of files parse without errors. Re-joining tokens reproduces each file byte for byte. Library parse time is measured. |
| S2. Edit round trip | Apply five edits (add part, delete part with body, rename with references, add `connect`, edit `doc`) to the 1,581-line Annex A model. | Text outside the edit is byte-identical, and an independent parser accepts the result. |
| S3. Undo and save | Build a minimal custom editor that edits a text document. | One undo from either editor leaves both consistent. Saving the diagram saves the text. A change on disk during editing is handled. |
| S4. Headless rendering | Lay out and render one interconnection diagram in Node and in a webview. | Node positions match exactly, and label bounds match within one pixel. |

## 9. Sources

Local:

- `fixtures/sysml-v2-release` at tag `2026-09.1`: `bnf/SysML-textual-bnf.kebnf`, `bnf/KerML-textual-bnf.kebnf`, `bnf/SysML-graphical-bnf.kgbnf`, `doc/2a-OMG_Systems_Modeling_Language.pdf` (clauses 2 and 8.2.3), `sysml.library/`, `sysml/src/`
- `fixtures/sysml-v2-models` (GfSE), including `CI/parse.py`
- `@types/vscode` 1.146.0 and `sysml-v2-lsp` 0.43.0 from the npm registry

Web, retrieved 2026-11-11:

- [SysML v2 Release repository](https://github.com/Systems-Modeling/SysML-v2-Release)
- [daltskin VS Code SysML extension](https://github.com/daltskin/VSCode_SysML_Extension) and [sysml-v2-lsp](https://github.com/daltskin/sysml-v2-lsp)
- [Astah SysMLv2 Modeler](https://astah.net/products/sysmlv2-modeler/)
- [Sensmetry Syside](https://sensmetry.com/syside/) and [plans](https://sensmetry.com/plans/)
- [Sensmetry sysml-2ls (archived)](https://github.com/sensmetry/sysml-2ls)
- [Eclipse SysON](https://mbse-syson.org) and the [SysON 2025.6 release post](https://blog.obeosoft.com/syson-2025-6)
- [TypeFox on Langium's limits](https://www.typefox.io/blog/xtext-langium-what-next/) and [Fastbelt benchmarks](https://www.typefox.io/blog/fastbelt-introduction)
- [tree-sitter-sysml](https://gitlab.com/nomograph/tree-sitter-sysml/-/tags/v0.1.0), [sysml-v2-parser (Rust)](https://docs.rs/crate/sysml-v2-parser/0.23.0), [Syster](https://gh.r-mj.com/jade-codes/syster)
- [@casys/mcp-syson](https://jsr.io/@casys/mcp-syson/0.6.0/README.md), [open-mcp-sysml](https://open-mcp-sysml.pages.dev/chapters/10-architecture), [OpenKer Modeler](https://glama.ai/mcp/servers/cslv1/OpenKer-Modeler)
- [SysMBench benchmark](https://web3.arxiv.org/pdf/2508.03215) and [INCOSE IS 2025 paper 197](https://www.incose.org/wp-content/uploads/legacy/presentation/is2025-pdf/Paper-197.pdf)
- [VS Code Language Model Tools guide](https://code.visualstudio.com/api/extension-guides/tools)
- [SysML v2 Resources list](https://github.com/daltskin/SysML-v2-Resources)
