# Tasks

## 1. Model layer

- [x] 1.1 Expose successions, control nodes, and parameter flows of actions in the model layer; verify unit tests against the action examples in the fixtures
- [x] 1.2 Expose states, entry/do/exit actions, and transitions with trigger, guard, and effect text; verify unit tests against the state examples in the fixtures
- [x] 1.3 Expose messages, their participants, and their ordering; verify unit tests against the interaction sequencing examples in the fixtures
- [x] 1.4 Extend structural locators (design D3) to successions, transitions, and messages; verify they still resolve after unrelated statements are added to the owner

## 2. Action Flow and State Transition views

- [x] 2.1 Add the `actionFlow` and `stateTransition` diagram kinds to the `.sysmld` schema, "New Diagram…", and `docs/diagram-format.md`; verify existing diagrams still validate
- [x] 2.2 Implement action notation (action nodes, start and done, fork, join, decide, merge, successions with guards, flows); verify the "Succession" and "Decision" scenarios with image snapshots
- [x] 2.3 Implement state notation (state nodes with entry/do/exit compartments, nested states, labeled transitions); verify the "Transition" and "Nested states" scenarios with image snapshots
- [x] 2.4 Apply top-to-bottom layered layout for both kinds; verify unpositioned diagrams of fixture models lay out without overlaps

## 3. Sequence view

- [x] 3.1 Spike lifelines and messages on the canvas library; record in design.md whether the library is used or sequence views are drawn directly
- [x] 3.2 Add the `sequence` diagram kind with lifeline order and width stored in the diagram file and message positions computed from time order; verify the "Messages in order" and "Time order is not editable by dragging" scenarios

## 4. Use cases

- [x] 4.1 Add use case, actor, subject, and include notation to the General View; verify the "Use case with actor" scenario with an image snapshot

## 5. Behaviour editing

- [x] 5.1 Implement edit plans for successions, transitions (with trigger, guard, and effect text validated before applying), and messages (design D20); verify round-trip tests on fixture models and the "Invalid guard text" scenario
- [x] 5.2 Add the Action Flow palette (action, control nodes, succession) and delete from model; verify the "Add action" and "Draw succession" scenarios including undo
- [x] 5.3 Add the State Transition palette (state, transition) and trigger, guard, and effect fields in the properties panel; verify the "Add state" and "Draw transition" scenarios
- [x] 5.4 Add message drawing and deletion in the Sequence View; verify the "Add message" scenario
- [x] 5.5 Confirm the `add-model-editing` rules hold in the new views (immediate save, inherited features read-only, reference writing); verify one test per rule

## 6. Agent tools and integration

- [x] 6.1 Extend `read_diagram`, `create_diagram`, and the other diagram tools to the new kinds, with successions, transitions, and messages in the JSON description; verify the "Generate a state diagram" scenario on both channels
- [x] 6.2 Extend the agent write tools to actions, states, successions, transitions, and messages; verify the "Agent adds a transition" scenario and text parity with the GUI
- [x] 6.3 End-to-end test: generate one diagram of each new kind from fixture models, edit each from the diagram and from an agent, save, reopen, and read as JSON and PNG; verify text, diagrams, and agent output agree
