## ADDED Requirements

### Requirement: Agent tools cover behaviour diagrams
The diagram tools (list, read as JSON and PNG, generate, add, remove, re-run layout) SHALL work for Action Flow, State Transition, and Sequence views. The JSON description SHALL include successions, transitions with their trigger, guard, and effect, and messages with their order.

#### Scenario: Generate a state diagram
- **WHEN** an agent requests a State Transition View of a state definition
- **THEN** a `.sysmld` file is written listing its states and transitions, and reading it returns them in the JSON description and in the image

### Requirement: Agent tools edit behaviour
Agent tools SHALL be able to create and delete actions, states, successions, transitions, and messages, producing the same text as the behaviour diagrams.

#### Scenario: Agent adds a transition
- **WHEN** an agent creates a transition from `off` to `on` with trigger `TurnOn`
- **THEN** the model receives the same transition text the State Transition View would produce
