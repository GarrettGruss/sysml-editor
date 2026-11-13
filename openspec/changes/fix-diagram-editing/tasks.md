# Tasks

## 1. Line editing

- [x] 1.1 Fix segment drag around nodes and bend flip in `route-edit.ts`; verify the "Drag past a state" and "Corner beside the end node" scenarios in unit tests with the `test` to `Packaged` geometry
- [x] 1.2 Keep the preview drawn until the host confirms (lines, nodes, labels); verify the "Release a line drag" scenario and the rejection path
- [x] 1.3 Label click selects its line; labels drawn above nodes; verify the "Resize in one go" scenario
- [x] 1.4 Draw the selected-line highlight in all themes; verify the "Select a straight line" scenario in a screenshot test

## 2. Layout and model

- [x] 2.1 Pass wrapped label sizes to ELK, stack self-transition loops, add the many-self-transitions fixture; verify 0 label overlaps
- [x] 2.2 Allow nested ends in `addTransition` and `addSuccession`, choose the common owner, replace the messages; verify both scenarios and check the other "out of date" messages
- [x] 2.3 Record feature direction, show "parameters", report it in agent read tools; verify the "Directed feature compartment" and "Read a directed feature" scenarios

## 3. Diagram and canvas

- [x] 3.1 Add the root rules per kind, the invalid-root message and its actions; verify both scenarios
- [x] 3.2 Fit to window on first open; verify the "New diagram" scenario and that a stored view is kept
- [x] 3.3 Remove the canvas focus border, add `:focus-visible` line; check the requirements editor; verify in a screenshot
- [x] 3.4 Wheel zoom 1.5 times; arrow keys pan; verify the three scenarios

## 4. Tree and docs

- [x] 4.1 Remove "Show Element…" and its command; rename to "Add to Diagram"; update README, docs, and mockups; verify both scenarios
- [x] 4.2 Verify tree-to-diagram drag for every kind and add the integration test; verify the "Drop position" scenario
