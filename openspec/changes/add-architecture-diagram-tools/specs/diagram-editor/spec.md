## ADDED Requirements

### Requirement: Show and hide parts and ports
A node command SHALL list the direct parts and ports of the selected element, own and inherited, with a tick for each one drawn. Ticking adds the node and its lines; unticking removes only the node and its lines from the diagram. This is a layout edit; the model text SHALL NOT change.

#### Scenario: Show ports
- **WHEN** the user selects `Frigate`, opens Show/Hide Parts and Ports and ticks `radarPort`
- **THEN** `radarPort` is drawn on the border of `Frigate` and the `.sysml` text is unchanged

#### Scenario: Hide a part
- **WHEN** the user unticks `engine`
- **THEN** `engine` and its lines leave the diagram and stay in the model

### Requirement: Display related elements
A node command SHALL ask for relation kinds among those present for the selected element (connections, flows, specialization, typing, satisfy, verify, derivation, ownership) and add the related nodes and lines not yet drawn, laid out near the source. This is a layout edit.

#### Scenario: Pick a kind
- **WHEN** the user chooses Display Related Elements on `Frigate` and picks only specialization
- **THEN** its general and specific definitions and the lines between them are added

#### Scenario: Nothing to add
- **WHEN** every related element is already drawn
- **THEN** a message says so and nothing changes

### Requirement: Copy and paste nodes
Copy SHALL put references to the selected nodes and the lines among them on a clipboard shared by all open diagrams; paste SHALL add nodes for the same elements, offset from the copied position, skipping elements already drawn. Pasting SHALL NOT create model elements. Paste into a diagram whose kind cannot show an element SHALL skip it and report how many.

#### Scenario: Copy to another diagram
- **WHEN** the user copies two nodes in diagram A and pastes in diagram B
- **THEN** B shows nodes for the same two elements and the model is unchanged

#### Scenario: Already drawn
- **WHEN** the user pastes into a diagram that already shows one of them
- **THEN** only the missing one is added

### Requirement: Align and distribute
With two or more nodes selected, commands SHALL align left, right, top, bottom, centre and middle, and distribute horizontally and vertically (three or more). Nodes inside a selected parent SHALL move with it. This is a layout edit and one undo step.

#### Scenario: Align left
- **WHEN** the user selects three nodes and chooses Align Left
- **THEN** their left edges equal the leftmost edge

#### Scenario: Distribute needs three
- **WHEN** two nodes are selected
- **THEN** the distribute commands are disabled

### Requirement: Compartment visibility
A node with attribute, port, part, or doc compartments SHALL offer a menu to show or hide each compartment. The choice is diagram style, held in memory until the diagram is saved; hidden compartments SHALL shrink the node. Inherited features follow the same rule.

#### Scenario: Hide attributes
- **WHEN** the user hides the attributes compartment of `Frigate`
- **THEN** the compartment is gone, the node is smaller, and the model text is unchanged

### Requirement: Legend
A diagram SHALL offer a toggle for a legend listing each node kind and line kind currently drawn with its symbol. The legend SHALL update as content changes and SHALL appear in image exports. The toggle is diagram style.

#### Scenario: Show legend
- **WHEN** the user turns the legend on in a diagram with parts and connections
- **THEN** a box lists Part and Connection with their symbols

### Requirement: Aspects
The user SHALL be able to save the currently drawn nodes as a named aspect of the diagram, apply an aspect, and delete one. Applying an aspect SHALL hide the nodes not in it; clearing SHALL show all again. Aspects are diagram style and never change the model.

#### Scenario: Apply
- **WHEN** an aspect `Power` lists three nodes and the user applies it
- **THEN** only those nodes and the lines among them are drawn

#### Scenario: Clear
- **WHEN** the user clears the aspect
- **THEN** every node is drawn again

### Requirement: Specialization and dependency tools
The general diagram SHALL offer relationship tools for specialization and dependency, with the click-source-then-target flow and the ghost line. Each SHALL write the language text (`:>` on the source, or a `dependency` statement) as a model edit saved at once, and draw the line. Invalid pairs (kind mismatch, cycle, inherited source) SHALL be refused with a reason.

#### Scenario: Specialize
- **WHEN** the user connects part def `Frigate` to part def `Ship` with the specialization tool
- **THEN** `part def Frigate :> Ship` is written and a specialization line is drawn

#### Scenario: Cycle
- **WHEN** the user connects `Ship` to `Frigate` after that
- **THEN** nothing is written and a reason is shown

### Requirement: Diagram navigation history
Each diagram tab SHALL keep a back and forward history of the diagrams opened in it, with commands and title buttons. Back reopens the previous diagram in the same tab; opening a new diagram clears forward entries. A diagram whose file is gone SHALL be skipped.

#### Scenario: Back and forward
- **WHEN** the user opens diagram A, then B in the same tab, then runs Back
- **THEN** A is shown, and Forward shows B
