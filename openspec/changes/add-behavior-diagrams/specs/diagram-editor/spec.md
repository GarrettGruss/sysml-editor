## ADDED Requirements

### Requirement: Action Flow View
The editor SHALL support an Action Flow View that shows the actions nested in an action, their successions and control nodes (start, done, fork, join, decide, merge), and the flows between their parameters, in SysML v2 graphical notation.

#### Scenario: Succession
- **WHEN** an Action Flow View of an action containing `first start; then action provide; then action deliver;` is open
- **THEN** `provide` and `deliver` are shown as action nodes connected in that order, starting from the start node

#### Scenario: Decision
- **WHEN** the action contains a `decide` node with guarded successions
- **THEN** the decision node is shown with one outgoing edge per branch, labeled with its guard

### Requirement: State Transition View
The editor SHALL support a State Transition View that shows the states nested in a state, their entry, do, and exit actions, and the transitions between them labeled with trigger, guard, and effect.

#### Scenario: Transition
- **WHEN** a State Transition View of a state containing `transition off_to_on first off accept TurnOn then on;` is open
- **THEN** `off` and `on` are shown as state nodes joined by an edge labeled `TurnOn`

#### Scenario: Nested states
- **WHEN** a state contains nested states
- **THEN** the nested states are drawn inside their owner

### Requirement: Sequence View
The editor SHALL support a Sequence View that shows the parts taking part in an interaction as lifelines and the messages between them in time order.

#### Scenario: Messages in order
- **WHEN** a Sequence View of an occurrence containing two `message` usages ordered by succession is open
- **THEN** each participating part is a lifeline, and the two messages are drawn as arrows between lifelines, the earlier one above the later one

### Requirement: Use cases in the General View
The General View SHALL show use case definitions and usages, their subject and actors, and include relationships, in SysML v2 graphical notation.

#### Scenario: Use case with actor
- **WHEN** a General View shows a use case that declares `actor driver : Driver;`
- **THEN** the use case and the actor are shown, connected to each other

### Requirement: Edit actions from the Action Flow View
The Action Flow View SHALL provide a palette to add actions and control nodes and to draw successions between them, and SHALL allow deleting them from the model. Each edit SHALL be written to the SysML text under the model-synchronization rules.

#### Scenario: Add action
- **WHEN** the user drags "Action" from the palette into action `deliverOrder` and names it `pack`
- **THEN** `action pack;` is inserted in the body of `deliverOrder` and a `pack` node appears

#### Scenario: Draw succession
- **WHEN** the user draws a succession from `pack` to `ship`
- **THEN** `first pack then ship;` is added to the owning action and the edge appears

### Requirement: Edit states from the State Transition View
The State Transition View SHALL provide a palette to add states and to draw transitions between them, SHALL allow editing a transition's trigger, guard, and effect as text in the properties panel, and SHALL allow deleting states and transitions from the model.

#### Scenario: Add state
- **WHEN** the user drags "State" from the palette into state `operating` and names it `idle`
- **THEN** `state idle;` is inserted in the body of `operating` and an `idle` node appears

#### Scenario: Draw transition
- **WHEN** the user draws a transition from `off` to `on` and enters trigger `TurnOn`
- **THEN** a transition declaration `first off accept TurnOn then on` is added to the owning state and the labeled edge appears

#### Scenario: Invalid guard text
- **WHEN** the user enters guard text that is not a valid expression
- **THEN** the edit is refused with the syntax error, and the text is unchanged

### Requirement: Edit messages from the Sequence View
The Sequence View SHALL allow adding a message between two lifelines and deleting a message from the model. The vertical order of messages SHALL always reflect the model's time order.

#### Scenario: Add message
- **WHEN** the user draws a message from lifeline `driver` to lifeline `vehicle`
- **THEN** a `message` declaration from `driver` to `vehicle` is added to the interaction, ordered after the existing messages, and the arrow appears below them

#### Scenario: Time order is not editable by dragging
- **WHEN** the user drags a message above an earlier message
- **THEN** the message returns to its position in time order and no file changes

### Requirement: Layout of behaviour diagrams
In the Action Flow, State Transition, and Sequence views the user SHALL be able to arrange nodes, add existing elements, and remove elements from the diagram without changing the model, as in the other diagram kinds.

#### Scenario: Move a state
- **WHEN** the user moves a state node and saves
- **THEN** only the `.sysmld` file changes
