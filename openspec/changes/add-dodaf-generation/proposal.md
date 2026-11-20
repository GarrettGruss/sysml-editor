## Why

Users and agents can model a system in SysML v2 and draw it, but cannot produce a DoDAF 2.02 architecture description from the model. UAFML 1.2 and DoDAF 2.02 share most intent, and SysML v2 text can express it, but the editor lacks a shared vocabulary to mark which element plays which DoDAF role, tabular views, and a generator that assembles the document.

## What Changes

- Ship a DoDAF/UAF metadata library (`DoDAF.sysml`: `metadata def`s such as `OperationalPerformer`, `OperationalActivity`, `Capability`, `System`, `Service`, `Standard`) and a rule for how each core DoDAF model maps to SysML v2 constructs (D76, D77).
- Add pure table builders for the tabular models AV-1, AV-2, CV-1, OV-4 (table form), OV-5a, SV-5a, StdV-1, DIV-2, computed without `vscode` (D78, D79).
- Add the document generator: a pure planner, the command `SysML: Generate DoDAF Document` and the MCP tool `sysml_dodaf_generate`. It creates missing `.sysmld` diagrams, asks the diagram view for SVG/PNG, and writes one Markdown file per architecture with the images in a folder (D80 to D83).
- Add the `sysml-dodaf` agent skill and an acceptance example with a generated document.

Scope is the core set: AV-1, AV-2, CV-1, CV-2, OV-1, OV-2, OV-4, OV-5a, OV-5b, OV-6c, SV-1, SV-2, SV-4, SV-5a, SV-10c, StdV-1, DIV-2.

## Capabilities

### New Capabilities
- `dodaf-library`: the metadata vocabulary and the model-to-view mapping.
- `dodaf-tables`: table builders for the tabular models.
- `dodaf-document`: planner, command, MCP tool and output layout.

## Impact

- Depends on the diagram kinds and export of `add-diagram-viewing`, `add-behavior-diagrams` and `add-architecture-diagram-tools`; adds no diagram kind and no second renderer.
- Touches `src/dodaf/` (new, no `vscode` import), `src/agent-tools/dodaf-tools.ts`, `src/agent-tools/manifest.ts`, `src/extension.ts` (command), `src/skills/sysml-dodaf/`, `resources/dodaf/DoDAF.sysml`, `docs/agents.md`, `docs/dodaf.md`, `test/fixtures/dodaf-example/`.
- Sources: DoDAF 2.02 (local `fixtures/dodaf`, git-ignored) and UAFML 1.2 (`fixtures/uaf`), which includes the DoDAF mapping.
