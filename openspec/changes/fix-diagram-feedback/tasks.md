# Tasks

Three groups can run in parallel; each group touches disjoint files.

## A. Layout (#90, #91). Files: `src/webview/diagram/layout.ts`, `layout.test.ts`, `src/diagram/style.ts`, `docs/diagram-format.md`, toolbar in `src/webview/diagram/main.ts`

- [x] A.1 Rank decide nodes after their incoming source and use `GREEDY` cycle breaking when acyclic (D70); test with the `Review` fixture that no succession points upward and that two decisions sit in different layers
- [x] A.2 Add `layoutDirection` style, replace `flowsDown` with `direction(vm)`, validate the value, document it (D71); test the Vehicle example places `engine` and `wheels` below, and that an absent style keeps the per-kind default
- [x] A.3 Add the toolbar toggle that sets the style in memory; test the message round trip and that the style is saved only on diagram save

## B. Derived edges (#89, #92). Files: `src/diagram/view-model.ts`, `src/diagram/view-model.test.ts`, `src/diagram/style.ts` (the `containment` key only), toolbar checkbox in `src/webview/diagram/main.ts`

- [ ] B.1 Association from use case to the actor definition when the usage is not shown (D72); test the Operator/StartJob/StopJob example gives two edges and one actor node
- [ ] B.2 Derived containment edges in the Requirements View under `style.containment` (D73); test the `top` example gives two edges, and none when the style is off or the child is nested
- [ ] B.3 Toolbar checkbox for `containment`; test the setting round trip

## C. Edges and sequence (#93, #88). Files: `src/diagram/view-model.ts` (the `EDGE_STYLES` line and the sequence derivation only), `src/webview/diagram/routing.ts`, `src/webview/diagram/sequence-layout.ts`, `src/webview/diagram/svg.ts`, matching tests

- [x] C.1 `interface` uses the connection style (D74); test the style of `statusApi`
- [x] C.2 Fan parallel edges and stack their labels (D74); test the two-interface fixture has different routes and 0 label overlaps
- [x] C.3 Mark reply messages and draw them dashed (D75); test `data-style`/dash in the SVG of `RequestSequence`
- [x] C.4 Derive `alt`/`else` fragments and lay out and draw the frames (D75); test the `ok`/`error` example gives one frame with two guards and that a model without alternatives is unchanged
