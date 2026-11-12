# Diagram file format (`.sysmld`)

A `.sysmld` file stores the presentation state of one diagram: the diagram kind, which elements and
relationships are shown, positions, sizes, edge routing, collapsed state and style overrides. It never
contains SysML semantics (names, types, multiplicities, documentation); model elements are referenced.
Deleting a diagram loses no model content, and moving a node changes only the `.sysmld` file.

The format is published as a JSON Schema: [`schemas/sysmld.schema.json`](../schemas/sysmld.schema.json).
The schema cannot express id uniqueness or that `parent`, `source` and `target` name existing nodes;
the parser (`parseDiagram` in `src/diagram/format.ts`) checks those too and reports problems with
JSON paths such as `$.nodes[2].parent`. A unit test keeps schema and parser in agreement.

```json
{
  "version": 1,
  "kind": "general",
  "root": "VehicleModel::Vehicle",
  "sources": ["model/vehicle.sysml"],
  "nodes": [
    { "id": "n1", "ref": "VehicleModel::Vehicle" },
    { "id": "n2", "ref": "VehicleModel::Vehicle::engine", "x": 40, "y": 80, "w": 160, "h": 60, "parent": "n1" }
  ],
  "edges": [
    { "id": "e1", "locator": { "owner": "VehicleModel::Vehicle", "kind": "connect", "ends": ["engine.drive", "transmission.input"] },
      "source": "n2", "target": "n3" }
  ],
  "style": {}
}
```

## Fields

- `version`: always `1`. `kind`: `general`, `interconnection`, `requirements`, `actionFlow`, `stateTransition` or `sequence` (the last three match `ActionFlowView`, `StateTransitionView` and `SequenceView` of the standard view definitions; use cases have no view of their own and are drawn in the `general` kind).
- `root`: qualified name of the root element. `sources`: workspace-relative paths of the `.sysml` files
  the diagram draws from; when a qualified name is declared in several files, the declaration in a
  listed source wins.
- Node: `id`, a reference, optional `x`, `y`, `w`, `h`, `collapsed`, `parent` (id of the containing
  node), `style`. All geometry is optional, so agents can write a diagram with references only; nodes
  without a position are laid out automatically when the diagram is opened, and saving writes the
  computed positions.
- Edge: `id`, a reference, `source` and `target` (node ids; a port is a node), optional `points`
  (`[{ "x": 0, "y": 0 }]`), optional `label` (layout of the text on the line, below) and `style`.
- Ids are unique across nodes and edges. Unknown extra properties are preserved on a round trip.

## References

Exactly one of `ref` or `locator` is present on each node and edge.

- `ref`: the fully qualified name of a named element, for example `VehicleModel::Vehicle::engine`.
- `locator`: for an unnamed element (`connect`, `bind`, `satisfy`, ...):
  `{ "owner": <qualified name of the nearest named owner>, "kind": <element kind>, "ends": [<end texts>], "index"?: n }`.
  An element matches when it is owned by `owner` (looking through unnamed members), has the same
  `kind`, and its end texts equal `ends` after removing all whitespace. `index` is written only when
  siblings are otherwise identical (same kind and ends); it is the position among them in source
  order and is used only to break that tie. Because the match does not depend on position among
  all statements, a locator keeps resolving when unrelated statements are added to the owner.

## Canonical serialization

Files are written as UTF-8 JSON, 2-space indent, trailing newline, with a fixed key order: document
keys `version, kind, root, sources, nodes, edges, style`, then others sorted; node keys `id, ref,
locator, x, y, w, h`, then the rest sorted; edge keys `id, ref, locator, source, target, points`, then
the rest sorted; label keys `dx, dy, w, h, wrap`; locator keys `owner, kind, ends, index`. Nodes and edges are sorted by `id`, `sources`
are sorted and de-duplicated, style objects have recursively sorted keys, and geometry numbers (`x`, `y`, `w`, `h` and
the coordinates in `points` and the numbers in `label`) are rounded to two decimals; every other number (style values, unknown
properties) is written unchanged, except `-0`, which becomes `0`. Opening and saving an unchanged canonical file is byte-identical. A file that was not
canonical is normalised by the first save.

## Layout, saving and conflicts

A diagram is a view of the model; layout stays in memory until the user saves. Positions computed
automatically for nodes without stored positions (on open or re-render) are not an unsaved change:
the document is not dirty and there is no undo entry. They are written whenever the document is next
saved for any reason. Only a user action (move, resize, Auto-layout, remove) or an agent tool call
makes an undoable, dirtying edit. Stored positions never move; a stored position outside its
container is drawn at the container's inner edge.

Edge `points` hold the whole route as an orthogonal polyline in canvas coordinates, ends included
(each segment horizontal or vertical, the first point on the source's border and the last on the
target's). The editor keeps a stored route only while it still joins the borders of the two end
nodes without crossing them; when an end moves, resizes or its node is edited, the route is dropped
from the file and the editor computes one (routes of edges the model derives, such as composition
and typing, are never stored). A route from automatic layout is stored together with the positions.
A route is adjustable by hand (segment drag, bend drag, double-click to add a bend; collinear bends are
removed, an end segment dragged past its node's edge is routed around the node) for every drawn edge
except those the model derives and sequence messages; the edit writes the whole new route to `points`
and nothing else. Moving or resizing an end node still drops the stored route as described above.

Edge `label` holds the layout of the text drawn on the line (a name, guard, trigger, `«include»`):
`{ "dx": 12, "dy": -20, "w": 120, "h": 30, "wrap": false }`. `dx` and `dy` are the label box's top-left
corner relative to the route's label anchor, the middle of its longest segment, so the label follows
the line when the line or its nodes move. `w` and `h` (positive) are the box size and are absent
while the label has the size of its text; `wrap` is absent (meaning true: text wraps within `w`) or
`false`. The text always comes from the model. Absent `label` means automatic placement; old files
without it load unchanged. Moving, resizing, "Wrap Text" and "Reset Position and Size" (removes the
entry) are layout edits like node moves: saved when the user saves the diagram, never written to the
`.sysml` file, and kept when the route is dropped. Messages and edges the model derives have no `label`.

User edits and what they write: Move and Nudge write `x`, `y` of the moved nodes (relative to the
parent; a port to its owner); Resize writes `x`, `y`, `w`, `h` and shifts the nested nodes' and ports'
positions so they stay where they are; Auto-layout writes `x`, `y`, `w`, `h` for every node and the
routes it computed; Remove from Diagram deletes the node, its child nodes (by `parent`, and ports
attached to them) and every edge attached to any of them; Re-link replaces only the reference;
adding an element appends a node (inside its owner's node in an Interconnection View when that is
shown) and the relationship edges whose ends are on the diagram, and records the element's source file in `sources`.
A stored size is a minimum: the node is never drawn smaller than its content.

Reference updates from rename detection are model-forced: they are written to the `.sysmld` file at
once, on top of the file's last saved state (pending in-memory layout is not written), and applied
in memory without dirtying or an undo entry.

Save checks the file on disk first. If it changed since it was opened or last saved, a modal
warning offers "Overwrite", "Revert to file on disk" or cancel (cancel fails the save, so the
document stays dirty). When the file changes on disk while the document has unsaved changes, a
non-modal warning says so once. A clean document reloads silently. A file that does not parse is
never overwritten: saving it fails with an error. Undo and redo entries from before a reload or
revert do nothing.

## Unresolved references

If a reference matches no element (deleted or renamed in the text), the item stays in the file with
its stored view state and is shown as "unresolved". It is never dropped silently. The user can
remove it from the diagram or re-link it to an existing element (which replaces only the reference).

## Rename detection

`reconcile` (`src/diagram/reconcile.ts`) compares against a snapshot the caller stored after the
previous reconciliation. A named reference that resolved before and no longer does is treated as a
rename when, under the same owner, exactly one element (a) has the same kind, (b) has the same
declared types, (c) was not present in the previous snapshot, and (d) is in the same document and
its name token starts at the same character offset as the lost element's name did. Rule (d) means
only a rename typed in place is detected: deleting `part a : Wheel` and adding an unrelated
`part spare : Wheel` elsewhere is not a rename. The snapshot records each resolved named element's
document URI and name start offset. The reference is then proposed
for update, keeping position and style; references below the renamed element (and the diagram
root) follow it by prefix. Limits: zero or several candidates, a changed kind or type, a rename
combined with other changes under the same owner that add a look-alike element, two lost items
competing for one candidate, text edited earlier in the file in the same change (which moves the
name offset; we deliberately give up), a rename without a previous snapshot (for example a file changed
while the editor was closed) and unnamed elements all stay unresolved for the user to re-link.

## Locator indexes

A locator that matches several identical siblings (same owner, kind and ends) resolves only when it
carries an `index`; without one it stays unresolved rather than guessing the first match. A stored
`index` binds by position among those identical siblings, so it can shift if an identical sibling is
inserted before it.

## Behaviour views

`actionFlow`, `stateTransition` and `sequence` diagrams use the same file layout as the other kinds. A root that does not fit the kind is refused when the diagram is created, with the reason:

| `kind` | Root | Nodes | Edges |
| --- | --- | --- | --- |
| `actionFlow` | an `action` or `action def` | the actions and control nodes (`fork`, `join`, `decide`, `merge`) it owns, nested inside it by `parent`, and its `start` and `done` nodes | successions (with their guards), parameter flows |
| `stateTransition` | a `state` or `state def` | the states it owns (nested states nest by `parent`), the initial pseudostate (`start`) | transitions (trigger, guard and effect), and the `first start then s;` succession |
| `sequence` | an occurrence, part or interaction that owns `message` usages | one lifeline per participant (a part), no `parent` | one edge per message |

`start` and `done` nodes and the successions that are written as part of a node declaration (`then action b;`, `then fork;`, `entry; then s;`) are not elements in the parse tree. They are referenced by locators like any unnamed element: `{ "owner": "Pkg::deliverOrder", "kind": "start", "ends": [] }` and `{ "owner": "Pkg::deliverOrder", "kind": "succession", "ends": ["start", "pack"] }`. Transitions and successions written as separate statements are referenced by the locator of the statement (`ends` has the source and target texts as written; the shorthand `accept T then b;` has only the target), or by `ref` when they have a name (`transition off_to_on first off ...`). Messages with a name use `ref`; unnamed ones use a locator with the participants as `ends`.

Trigger, guard and effect are never stored in the diagram file. They are read from the SysML text (as source text) every time the diagram is drawn.

### Sequence views: what is stored and what is computed

- **Stored** (in the node of each lifeline): `x`, the column position, which decides the **order of the lifelines** from left to right, and `w`, its width. Dragging a lifeline sideways reorders the columns; resizing changes `w`. Both are ordinary layout edits, kept in memory until the diagram is saved. No other geometry is ever written for a lifeline: `y` and `h` are not stored.
- **Computed** (never stored): the **vertical position of every message**, from the time order in the model, and the route of every message arrow. A message edge has no `points`. A diagram that shows messages out of time order would misrepresent the model, so dragging a message does nothing and the message stays at its place in time order.
- The root of a sequence diagram keeps a node (every kind lists its root) that is not drawn.
- **Time order** comes from the model: `first m1 then m2;` between messages, `then message ...;` after another message, and `then event m.sourceEvent;` chains inside the participants. Where the model gives no order between two messages they are drawn in source order and marked with `≈` in front of the label (the JSON description of `sysml_read_diagram` has `unordered: true`).
