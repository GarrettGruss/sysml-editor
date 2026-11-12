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

- `version`: always `1`. `kind`: `general`, `interconnection` or `requirements`.
- `root`: qualified name of the root element. `sources`: workspace-relative paths of the `.sysml` files
  the diagram draws from; when a qualified name is declared in several files, the declaration in a
  listed source wins.
- Node: `id`, a reference, optional `x`, `y`, `w`, `h`, `collapsed`, `parent` (id of the containing
  node), `style`. All geometry is optional, so agents can write a diagram with references only; nodes
  without a position are laid out automatically when the diagram is opened, and saving writes the
  computed positions.
- Edge: `id`, a reference, `source` and `target` (node ids; a port is a node), optional `points`
  (`[{ "x": 0, "y": 0 }]`) and `style`.
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
the rest sorted; locator keys `owner, kind, ends, index`. Nodes and edges are sorted by `id`, `sources`
are sorted and de-duplicated, style objects have recursively sorted keys, and geometry numbers (`x`, `y`, `w`, `h` and
the coordinates in `points`) are rounded to two decimals; every other number (style values, unknown
properties) is written unchanged, except `-0`, which becomes `0`. Opening and saving an unchanged canonical file is byte-identical. A file that was not
canonical is normalised by the first save.

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
