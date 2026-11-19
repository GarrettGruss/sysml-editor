## ADDED Requirements

### Requirement: Decisions sit between their neighbours
In an Action Flow View, Auto-layout SHALL place each `decide` node in a layer after its incoming succession source and before its targets, so no succession out of a decision points upward.

#### Scenario: Review action
- **WHEN** the user runs Auto-layout on the Action Flow View of `Review` (`inspect`, decision, `approve`, `deny`)
- **THEN** the decision is below `inspect` and above `approve` and `deny`

### Requirement: Layout direction
A diagram SHALL accept `"style": { "layoutDirection": "down" | "right" }`. Auto-layout SHALL use it for every diagram kind; when absent it SHALL keep today's default (down for action flow and state transition, right otherwise). The toolbar SHALL offer a toggle that sets the style in memory; it is saved with the diagram like other layout style.

#### Scenario: Parts tree downward
- **WHEN** a General View has `layoutDirection` `down` and the user runs Auto-layout on `Vehicle`, `engine`, `wheels`
- **THEN** `engine` and `wheels` are below `Vehicle`

### Requirement: Actor definition association
In the General View, when a use case has an `actor` usage that is typed by a definition shown on the diagram and the usage is not shown, an `association` edge SHALL be drawn from the use case to that definition. Several use cases SHALL share one actor node.

#### Scenario: One operator
- **WHEN** `Operator`, `StartJob` and `StopJob` are shown and each use case has `actor operator : Operator`
- **THEN** one association edge joins `StartJob` to `Operator` and one joins `StopJob` to `Operator`

### Requirement: Requirement containment edges
The Requirements View SHALL accept the style `containment: true`. With it, an owned requirement usage shown as its own node (not nested) SHALL be joined to its owner by a derived `composition` edge drawn with the containment symbol.

#### Scenario: Top requirement
- **WHEN** `top`, `top::child1`, `top::child2` are shown as separate nodes with `containment` on
- **THEN** two containment edges run from `top`

### Requirement: Interface edges
An interface usage SHALL be drawn with the `connection` edge style and its name as the label. Edges between the same two ends SHALL be routed apart and their labels SHALL NOT overlap after Auto-layout.

#### Scenario: Two interfaces
- **WHEN** `statusApi` and `dataApi` both connect `client.output` to `server.input` and the user runs Auto-layout
- **THEN** two connection edges have different routes and their labels do not overlap

### Requirement: Alternatives in the Sequence View
The Sequence View SHALL draw alternative messages as a frame labelled `alt` with a guard for each branch, separated by dashed `else` lines. Branches come from a `decide` / `if` in the occurrence or from a nested occurrence per alternative. Reply messages (from the callee back to the caller) SHALL be drawn with a dashed line.

#### Scenario: Ok or error
- **WHEN** the view of `RequestSequence` has `ok` and `error` as two alternatives
- **THEN** one `alt` frame holds `ok` under its guard and `error` under an `else` guard, and both are dashed
