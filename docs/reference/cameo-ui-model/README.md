# Cameo UI reference model

A SysML v2 model of how the Cameo/MagicDraw user interface works, derived from the scraped user guide in `docs/reference/cameo-user-guide/`. It is a reference for features our editor could implement. It is not editor code. All `.sysml` files are written by hand: there is no generator, and nothing reads them at build time. Each section also yields an acceptance document (`../cameo-acceptance/<section>.md`) and a gap list (`../cameo-gaps/<section>.md`).

## Layout

- `CameoUI.sysml`: root package `CameoUI` with shared definitions (Window, Panel, Menu, MenuItem, Toolbar, Dialog, Command, DiagramType, DiagramElement, Shape, Path, Compartment, Property, Mode, WizardStep). It starts with `private import ScalarValues::*;`. Section files must not edit it; the merge step moved shared definitions (SelectElementDialog, ProjectOptionsDialog, EnvironmentOptionsDialog, QuickFindDialog, ValidationResultsPanel, ContainmentTreePanel, StatusLine, Legend, Stereotype, ProjectResource, Notification, ShortcutBinding, Perspective, Tab, Visibility, SymbolProperties) into it.
- One package per guide section, in `<Section>.sysml` (for example `Diagramming.sysml`). Package names are unique across the model: a section package is named `CameoUI_<code>` (the section code below), for example `CameoUI_DGM`. Section packages are siblings of the root package, not nested in it, and are never given the bare section name. If a file passes about 1000 lines, split it into `<Section>-<Part>.sysml`, each a package `CameoUI_<code>_<Part>`.
- Every section file starts with `private import CameoUI::*;` and `private import ScalarValues::*;` inside its package.

## Section codes

| Guide section | Code | File | Package |
| --- | --- | --- | --- |
| 001 Getting started | GST | `GettingStarted.sysml` | `CameoUI_GST` |
| 002 Working with projects | PRJ | `Projects.sysml`, `Projects-2.sysml` | `CameoUI_PRJ`, `CameoUI_PRJ_2` |
| 005 Diagrams | DGT | `DiagramTypes.sysml` | `CameoUI_DGT` |
| 006 Diagramming | DGM | `Diagramming.sysml` | `CameoUI_DGM` |
| 009 Working with model elements | ELM | `ModelElements.sysml` | `CameoUI_ELM` |
| 010 Tools | TLS | `Tools.sysml` | `CameoUI_TLS` |

Sections 007, 011, 012 and 013 are only summarised, not modelled.

Other sections get a new unique three-letter code from the lead before work starts; a code is never reused.

## Reserved words

Names of packages, definitions, usages, steps and requirements must not be SysML or KerML keywords, because the parser rejects them or reads them as syntax. Do not use any of these as a name: `frame`, `part`, `port`, `action`, `state`, `view`, `item`, `flow`, `connection`, `interface`, `package`, `import`, `alias`, `doc`, `comment`, `requirement`, `constraint`, `calc`, `case`, `analysis`, `verification`, `use`, `concern`, `rendering`, `allocation`, `metadata`, `enum`, `event`, `message`, `then`, `first`, `if`, `else`, `accept`, `send`, `do`, `entry`, `exit`. Also avoid `standard`, `state` (also as an attribute name), `attribute`, `occurrence`, `ref`, `end`, `all`, `in`, `out`, `inout`, `abstract`, `perform`, `include`, `filter`, `merge`, `result`, `return`, `loop`, `render`, `assign`, `terminate`, `subject`, `actor`, `dependency`, `satisfy`, `expose`, `snapshot`. Prefer a verb phrase or a compound (`displayFrame`, not `frame`). If a guide label equals a keyword, add a suffix (`SendAction`) or use the quoted form `'send'` only when no other choice exists.

## Naming

- Definitions: UpperCamelCase; section packages: `CameoUI_<code>`, English, no spaces. Usages: lowerCamelCase.
- Commands and menu items: `action def` named after the guide's label, no spaces (`CreateDiagram`, `SelectAll`). Menu paths go in a `doc` comment (`Diagrams > Create Diagram`), shortcuts in a `MenuItem` attribute.
- Dialogs: `part def <Name>Dialog` (`SaveAsImageDialog`). Panels/screens: `<Name>Panel` or `<Name>Pane`.
- Procedures: `action <verbNoun>` or `action def`, named after the guide's "To do X" title (`createDiagramFromBrowser`).
- Requirement ids: `CAM-<3-letter section code>-<3 digits>`, unique and never reused (`CAM-DGM-012`). Codes are in the Section codes table. Ids are numbered in file order, from 001.
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
