# Design

## Context

This is change 5 for the VS Code SysML v2 editor. It builds on the diagram files, canvas, and agent diagram tools from `add-diagram-viewing` and on the edit planner, save rule, and agent write tools from `add-model-editing`. See the [trade study](../../../docs/trade-study.md), gap 11, for why it is in scope.

## Goals / Non-Goals

**Goals:**
- Show and edit the behaviour in a model with the same saved-layout diagrams and agent tools as structure.
- Reuse the diagram file format, canvas library, and renderer without a second code path.

**Non-Goals:**
- Reordering messages by dragging, and an expression editor: triggers, guards, and effects are edited as text.
- Executing or simulating behaviour.
- Geometry, Grid, and Browser views.

## Decisions

### D15: Diagram kinds follow the standard view definitions
The new `kind` values in `.sysmld` are `actionFlow`, `stateTransition`, and `sequence`, matching `ActionFlowView`, `StateTransitionView`, and `SequenceView` in the standard library's `StandardViewDefinitions`. The existing `general` and `interconnection` kinds already match `GeneralView` and `InterconnectionView`. Use cases have no standard view of their own, so they are drawn in the General View.

### D16: Model layer additions
The model layer exposes what these views draw: successions and control nodes, transitions with trigger, guard, and effect text, and messages with their ordering. Guards, triggers, and effects are shown as the source text of the expression, not evaluated. Most of these elements are unnamed, so they use the structural locator from D3 (owner, kind, endpoints).

### D17: Layout per kind
Action Flow and State Transition views use the layered layout already used for interconnection diagrams, with direction top-to-bottom. Sequence views do not use graph layout: lifelines are columns the user can reorder and resize, and the vertical position of each message is computed from time order, so it is not stored in the diagram file.

Alternative: store message positions like node positions — rejected, because a diagram that shows messages out of time order would misrepresent the model.

#### Sequence layout: decision (task 3.1)
The spike drew lifelines and messages through the existing hand-built SVG renderer (`SvgRenderer`, `svg.ts`; the diagram library in use is ELK for layered layout plus this renderer, not a canvas library) and asked whether the layered graph layout could place them. It cannot do the two things a sequence diagram needs: columns whose order and widths are the user's (stored `x` and `w`), and rows whose order is the model's time order. The layered layout would place lifelines by their connections and the messages between them as ordinary edges, with no row order at all.

Decision: a **dedicated DOM-free layout function**, `src/webview/diagram/sequence-layout.ts` (`layoutSequence`), used instead of ELK when the diagram kind is `sequence`. It places lifelines left to right by stored `x` (those without one follow in model order, with one common width and an equal gap, so they are evenly spaced; a stored position that would overlap its left neighbour moves right) and gives every message a row from its time order. Everything else is reused: node boxes, hit testing, selection, drag, resize, undo, export and metrics (a lifeline is a node whose box is its whole column; a message is an edge whose route is fixed, `fixed: true` in the view model, so the router and label placer leave it alone). Only `x` and `w` of a lifeline are written to the diagram file (`applyBoxPatches`, `applyAutoLayout` and `applyLayout` drop `y`, `h` and message routes for the `sequence` kind). Dragging a message is not wired to anything: a press on an arrow only selects it, and the next drawing is computed from the model again.

### D20: Behaviour edit plans
New edit plans on the edit planner from `add-model-editing`: insert an action, state, or control node (the existing insert-member plan); insert a succession as `first a then b;` in the owner; insert a transition as `transition first a [accept T] [if guard] [do effect] then b;`; insert a `message` usage between two participants, ordered after the last message of the interaction. Trigger, guard, and effect are taken as text, parsed before the edit is applied, and refused if they do not parse. Deleting a node also deletes the successions or transitions that reference it, after confirmation. The rules of `add-model-editing` apply unchanged: immediate save (D6), inherited features read-only (D18), reference writing (D19).

### Reading the language (D16, as built)
`src/model/behavior.ts` reads: `first a then b;`, `succession s first a then b;`, guarded `first a if g then b;`, `if g then b;` and `else b;` after a node, `then b;`, `then action b ...;`, `then fork;` and the other node declarations written after `then`, `first start;`, `then done;` and `entry; then s;`; `flow [name] [of T] from a.x to b.y;`; named and shorthand transitions (`accept`, `if`, `do`, `then` parts kept as source text; the shorthand's source is the preceding state); `entry`, `do` and `exit` actions of a state; messages with and without names, `of [n :] T`, and their order from `first m1 then m2;`, `then message ...;` and `then event m.sourceEvent;` chains inside participants. Not read: successions or flows between nested features by a path (only the first segment names a node), `perform` bodies, `send` and `accept` actions as message ends, messages without `from` and `to`, flows between ports. `start`, `done` and implied successions get synthetic elements (cached per owner) so structural locators (D3) apply to them.

Grammar limits met while building this: the parser rejects `then done;` right after a `flow ...;` or after a `first a then b;` statement (it reads `done` as a node declaration), so new statements are inserted after the later of the two nodes first and, when the parse check refuses that, at the end of the body; and the fast parse path declines some valid combinations (for example `entry x;` followed by `first start then s;`, and some `if ... else` successions), which then go through the parse worker.

## Risks / Trade-offs

- [Message order can be only partly specified in a model] → Messages with no ordering between them are drawn in source order and marked as unordered.
- [The canvas library may not suit lifelines] → Spike first (task 3.1).
- [Behaviour syntax has many equivalent forms, e.g. `then` shorthand versus explicit successions] → Read all forms; write one canonical form (D20) and never rewrite existing statements.
- [Notation breadth: the graphical grammar has many action and state variants] → Cover the constructs that occur in the fixtures first; draw anything else as a generic node with its keyword.
