# Cameo UI reference model

A SysML v2 model of how the Cameo/MagicDraw user interface works, derived from the scraped user guide in `docs/reference/cameo-user-guide/`. It is a reference for features our editor could implement. It is not editor code. Each section also yields an acceptance document (`../cameo-acceptance/<section>.md`) and a gap list (`../cameo-gaps/<section>.md`).

## Layout

- `CameoUI.sysml`: root package `CameoUI` with shared definitions (Window, Panel, Menu, MenuItem, Toolbar, Dialog, Command, DiagramType, DiagramElement, Shape, Path, Compartment, Property, Mode, WizardStep). Do not edit it from a section; if a shared definition is missing, add it in your section and note it in your report.
- One package per guide section, in `<Section>.sysml` (for example `Diagramming.sysml`, package `Diagramming`). If a file passes about 600 lines, split into `<Section>-<Part>.sysml`, each a package `<Section>_<Part>`.
- Every section file starts with `private import CameoUI::*;` inside its package.

## Naming

- Packages and definitions: UpperCamelCase, English, no spaces. Usages: lowerCamelCase.
- Commands and menu items: `action def` named after the guide's label, no spaces (`CreateDiagram`, `SelectAll`). Menu paths go in a `doc` comment (`Diagrams > Create Diagram`), shortcuts in a `MenuItem` attribute.
- Dialogs: `part def <Name>Dialog` (`SaveAsImageDialog`). Panels/screens: `<Name>Panel` or `<Name>Pane`.
- Procedures: `action <verbNoun>` or `action def`, named after the guide's "To do X" title (`createDiagramFromBrowser`).
- Requirement ids: `CAM-<3-letter section code>-<3 digits>`, unique and never reused (`CAM-DGM-012`). Codes: Diagramming DGM; others are allotted by the lead when a section is assigned. Ids are numbered in file order, from 001.
- Requirement short name is the id: `requirement <'CAM-DGM-012'> zoomToFit { doc /* ... Source: <url> */ }`.

## Modelling mapping

| Guide content | SysML |
| --- | --- |
| Screen, panel, dialog, toolbar, palette | `part def` (and `part` usages inside the owning window) |
| Command, menu item, toolbar button | `action def` (UI placement as `MenuItem`/`ToolbarButton` parts referencing it) |
| Procedure "To do X: 1. 2. 3." | `action` with one child `action` per step and `first ... then ...` successions; alternatives ("do one of the following") as separate `action` steps in a `fork`/`decide`, or listed in `doc` |
| Mode, wizard step, toggled state | `state def` / `state` with transitions |
| Setting | `attribute` or `part : Option` |
| Capability ("can", "must", "allows") | `requirement` with id and a `doc` comment: one sentence in our own words, then `Source: <URL>` |

Procedure step names are verb phrases. Put the guide page title and the Source URL in the `doc` of each procedure. Write in your own words; never copy passages.

## Unresolved cross-section references

If a procedure or requirement needs something owned by another section, add a placeholder name (a `ref`, or a plain comment) and a line comment next to it:

`// TODO xref: <name> (<section>)`

The merge step greps for `TODO xref`. Do not define the missing element yourself.

## Companion documents (each section)

- Acceptance (`cameo-acceptance/<section>.md`): table or list of scenarios, each with ID (`ACC-<code>-nnn`), title, preconditions, steps, expected result, Source URL, requirement id tested.
- Gaps (`cameo-gaps/<section>.md`): per requirement, our status Supported / Partial / Missing with a one-line note, then counts and the ten most valuable gaps for capturing system architecture. Judge from `docs/editing-coverage.md`, `docs/trade-study.md`, `openspec/changes/*/proposal.md`, `package.json` contributes.

## Verification

Every `.sysml` file must parse with zero syntax errors using `src/parser/parse.ts` (see `scripts/parser-gate.ts`).
