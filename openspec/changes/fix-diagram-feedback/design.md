# Design

## Context

Feedback issues #88 to #93 on v0.3.0. All are in view derivation (`src/diagram/view-model.ts`), layout (`layout.ts`, `sequence-layout.ts`) and drawing (`svg.ts`); none edits the model. Decision numbers continue after D69.

## Decisions

### D70: Decisions get their layer from the succession graph
`layout.ts` sorts loose nodes by model `rank` and uses `considerModelOrder` with `cycleBreaking: MODEL_ORDER`; synthetic `decide` nodes come last in model order, so ELK reverses their incoming edge. Decision nodes get the rank of their incoming source plus one (right after it) instead of the last rank, and cycle breaking uses `GREEDY` unless the graph really has a cycle. Metric: in the `Review` fixture no succession points upward.

### D71: `layoutDirection` is a layout style
`style.layoutDirection` is `"down"` or `"right"`. `flowsDown(vm)` becomes `direction(vm)`: the style value, else today's per-kind default. The toolbar toggle writes the style in memory and re-runs Auto-layout only on request; the style is saved with the diagram (layout, not model, per the save rules). Label-in-ELK handling (now tied to `flowsDown`) follows the direction, not the kind.

### D72: Actors share one definition node
In the general-view derived edges, when a use case's `actor` usage is not a node, its type (the definition) is used as the association target if that is a node. The edge goes from the use case to the definition, deduplicated by the existing `have` key, so two use cases give one actor node. No new option; showing the usage keeps today's behaviour.

### D73: Containment edges are a style option
`derived` composition edges are built only for `general`. They are also built for `requirements` when `style.containment` is true, for owned requirement usages shown as separate (not nested) nodes. Off by default so existing diagrams do not change. A toolbar checkbox sets it.

### D74: Interface is a connection; parallel edges are fanned
`EDGE_STYLES` gains `interface: "connection"`. Edges with the same unordered end pair are numbered; ELK edges are not deduplicated by pair for them and the router offsets the n-th by 12 px perpendicular to the first segment. Labels are placed on their own offset route, so they stack. Metric: label overlaps 0 in the two-interface fixture.

### D75: Sequence alternatives are frames over message rows
`layoutSequence` gains an optional `fragments` list: `{ kind: "alt", branches: [{ guard, rows }] }`. The view model derives branches from `decide` / `if` successions between messages, or from nested occurrences that each hold messages. Rows keep time order; a frame spans the lifelines of its messages, and each branch adds a guard row and a dashed `else` divider. Replies (message whose source is the target of an earlier message in the same occurrence) are drawn with `DASHED`, via a new `reply` flag on the message edge. Unrecognised structures fall back to today's linear list.

## Risks

- D70 and D71 both change `layout.ts`; they are separate functions but share `flowsDown`, so group A is one agent.
- D75 is the largest item; the fallback keeps old diagrams unchanged.
