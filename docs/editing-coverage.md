# Editing coverage

The diagram editor is a visual editor for the SysML text ([decision D21](../openspec/changes/add-model-editing/design.md#d21-the-diagram-editor-is-a-visual-editor-for-the-sysml-text)).
This table lists, construct by construct, how each one can be edited today. Constructs marked **text only** are edited in the text editor.

Cell values: **create**, **rename**, **delete** and **properties** (the diagram's properties panel) are supported. **read only** means shown but not editable. **—** means not shown. **text only** means only the text editor can change it.

Columns: *Diagram* is any diagram view that offers the construct. *Tree* is the Elements view context menu. *Requirements editor* is the requirements editor. *Agent tools* are the `sysml_*` write tools.

## Structure

| Construct | Diagram | Tree | Requirements editor | Agent tools | Notes |
| --- | --- | --- | --- | --- | --- |
| Package | — | create, rename, delete | section: rename (heading), add, delete, move | create, rename, delete, set properties | No palette entry. Nested package is a section. |
| part def | create (General), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Properties panel: name, short name, documentation. |
| port def | create (General), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | |
| attribute def | create (General), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Values and constraints: text only. |
| item def | create (General), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | |
| part | create (General, Interconnection), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Type and multiplicity in properties (usages only). Inherited: read-only from usage. |
| port | create (General, Interconnection), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Drawn on the owner's border. Inherited: read-only from usage. |
| attribute | create (General, Interconnection), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Values: text only. Inherited: read-only from usage. |
| item | create (General), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Item type of a flow or message: text only. |
| connection (`connect a to b;`) | create (Interconnection, between two ends) | — | — | create (`sysml_create_relationship`) | Written in the nearest common owner. Agent delete does not take a connection. Diagram delete from model not verified. |
| interface | text only | text only | — | text only | No create kind. Drawing not verified. |

## Behaviour

| Construct | Diagram | Tree | Requirements editor | Agent tools | Notes |
| --- | --- | --- | --- | --- | --- |
| action def | create (General), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | |
| action | create (General, Action Flow), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Action Flow nodes. |
| perform, send, accept, assign, terminate, if, while, loop, for | read only | text only | — | text only | Drawn as action nodes. Not created by any tool. Tree delete and rename not verified. |
| fork, join, decide, merge | create (Action Flow), rename, delete | create, rename, delete | — | create, rename, delete | Need a name. Only inside an action or action def. |
| succession (`first a then b;`) | create (Action Flow), delete from model | — | — | create (guard optional), delete | Guard: agent only. `then x;` written inside a node cannot be deleted alone. |
| flow (`flow from a.x to b.y;`) | read only | text only | — | text only | Drawn in Action Flow. No create tool. |
| state | create (State Transition), rename, delete, properties | create, rename, delete | — | create, rename, delete, set properties | Nested state inside a state. |
| state def | — | create, rename, delete | — | create, rename, delete, set properties | Not in any palette. |
| entry, do, exit actions | read only | text only | — | text only | Listed in the state node. Not editable as elements. |
| transition (`transition first a accept T if g do e then b;`) | create (State Transition), delete from model | — | — | create, set transition, delete | Trigger, guard and effect as text fields in the properties panel. |
| message (`message m from a to b;`) | create (Sequence), delete from model | — | — | create, delete | Name and item type at creation only. Order: written after the last message. |
| use case, use case def, include use case | read only | text only | — | text only | Drawn in General. No create kind. Tree rename and delete not verified. |

## Requirements

| Construct | Diagram | Tree | Requirements editor | Agent tools | Notes |
| --- | --- | --- | --- | --- | --- |
| requirement def | create (Requirements), rename, delete | create, rename, delete | create, edit id, name, text; delete | create (definition flag), rename, delete | Text is the doc comment. |
| requirement | create (Requirements), rename, delete | create, rename, delete | create, edit id, name, text; delete | create, rename, delete | Id is the short name. Subject and attributes: text only. |
| satisfy (`satisfy R by x;`) | create (Requirements palette) | — | add, remove | create | Written in the owner package. `not satisfy` is read, not created. |
| verify (`verify R;`) | create (Requirements palette) | — | add (existing or new case), remove | create (existing or new case) | Only inside a verification objective. |
| derivation (`#derivation connection`) | create (Requirements palette) | — | add, remove | create | Hand-written forms are read. Removing one derived end of a hand-written connection is refused. |
| verification def, verification | — | create, rename, delete | created by verify | create, rename, delete | |
| document annotations (`@DocumentRoot`, `@Appendix`) | — | — | read (title, version); add appendix section | read (requirements document) | Title is not editable in the view. |

## Cross-cutting

| Construct | Diagram | Tree | Requirements editor | Agent tools | Notes |
| --- | --- | --- | --- | --- | --- |
| names | rename (inline or F2), properties | rename | edit id, name; heading renames package | rename, set properties | Quoted when needed. References follow. Inherited: read-only from usage. |
| short names | properties | — | requirement id | create, set properties | |
| types | properties (usages only) | — | — | create, set properties | One type only. Import added when needed. |
| multiplicities | properties (usages only) | — | — | create, set properties | For example `0..1`, `*`. |
| doc comments | properties (any element) | — | edit, add paragraph (packages) | create, set properties | Paragraphs use `doc` or `comment` in the document view. |
| imports | text only | text only | text only | text only | Added automatically when a reference needs one. |
| specialization, redefinition | text only | text only | text only | text only | Shown as edges where drawn. Not created. |
| visibility | text only | text only | text only | text only | |
| values, constraints, expressions | text only | — | text only | text only | Not created or changed by any tool. |

## Not read by the diagrams

From the header of `src/model/behavior.ts`. These are not drawn. They stay in the text and are not changed by the diagrams:

- successions that bind to nested features by a path beyond the first segment (`then a.b;`);
- the bodies of `perform` actions;
- `send` and `accept` actions used as message ends;
- messages without `from` and `to`;
- flows between ports.

Anything else a view cannot place is not drawn.

## Not yet verified

These cells were written from the code without running the feature, and may understate what works:

- Deleting a connection, or a satisfy, verify or derivation relationship, from a diagram with Delete from Model. The agent delete tool cannot delete a connection (it takes qualified names or succession, transition and message locators).
- Renaming and deleting use cases, flows and action-like nodes (perform, send, accept, assign, terminate, if, while, loop, for) from the tree. The tree's commands are generic, so these probably work; they are marked "text only" until tested.
- Whether interfaces and state definitions are drawn by any view.
- Whether a succession's guard is shown on the diagram (it can be set only by the agent tool).
