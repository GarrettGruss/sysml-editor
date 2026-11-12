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

### D20: Behaviour edit plans
New edit plans on the edit planner from `add-model-editing`: insert an action, state, or control node (the existing insert-member plan); insert a succession as `first a then b;` in the owner; insert a transition as `transition first a [accept T] [if guard] [do effect] then b;`; insert a `message` usage between two participants, ordered after the last message of the interaction. Trigger, guard, and effect are taken as text, parsed before the edit is applied, and refused if they do not parse. Deleting a node also deletes the successions or transitions that reference it, after confirmation. The rules of `add-model-editing` apply unchanged: immediate save (D6), inherited features read-only (D18), reference writing (D19).

## Risks / Trade-offs

- [Message order can be only partly specified in a model] → Messages with no ordering between them are drawn in source order and marked as unordered.
- [The canvas library may not suit lifelines] → Spike first (task 3.1).
- [Behaviour syntax has many equivalent forms, e.g. `then` shorthand versus explicit successions] → Read all forms; write one canonical form (D20) and never rewrite existing statements.
- [Notation breadth: the graphical grammar has many action and state variants] → Cover the constructs that occur in the fixtures first; draw anything else as a generic node with its keyword.
