## ADDED Requirements

### Requirement: Harness-agnostic MCP server
The product SHALL ship a Model Context Protocol (MCP) server, runnable over stdio as a standalone process against a workspace directory, that exposes tools for reading and generating SysML v2 models and diagrams. It SHALL NOT require VS Code to be running, and SHALL work with any MCP-compliant agent harness.

#### Scenario: Run without VS Code
- **WHEN** an MCP client launches the server with a workspace path and VS Code is not running
- **THEN** the server lists its tools and every read and write tool works against the files in that workspace

#### Scenario: Discovery in VS Code
- **WHEN** the extension is installed in VS Code
- **THEN** the MCP server is registered with VS Code so in-editor agents can use it without manual configuration

### Requirement: VS Code Language Model Tools channel
The extension SHALL register the same agent tool set as VS Code Language Model Tools, so in-editor agents can call them without the MCP server. Each tool SHALL have the same name, input schema, result content, and behavior on both channels; diagram images SHALL be returned as image data parts.

#### Scenario: In-editor agent reads a diagram
- **WHEN** an in-editor agent calls the read-diagram tool through Language Model Tools with an image requested
- **THEN** it receives the same JSON description as the MCP tool plus a PNG image data part

#### Scenario: Unsaved buffers visible
- **WHEN** a `.sysml` file has unsaved edits in VS Code and an agent reads it through Language Model Tools
- **THEN** the result reflects the unsaved editor content

#### Scenario: Channel equivalence
- **WHEN** the same tool call is made over MCP and over Language Model Tools against the same saved workspace
- **THEN** both produce identical results and identical file changes

### Requirement: Behavior parity with the GUI
Model-changing agent tools, on either channel, SHALL follow the same model-synchronization rules as GUI edits: minimal format-preserving text edits, valid generated SysML v2 text, refusal on files with parse errors, and diagram reference maintenance on rename.

#### Scenario: Agent adds a part
- **WHEN** an agent calls the add-element tool to add `part engine : Engine` to `VehicleModel::Vehicle`
- **THEN** the `.sysml` file receives the same text edit the diagram palette would produce

### Requirement: Read model structure
Agent tools SHALL include tools to list SysML files and diagrams, browse the element hierarchy, and get an element's details (kind, qualified name, type, multiplicity, documentation, owned members, relationships, source location) as structured JSON.

#### Scenario: Inspect element
- **WHEN** an agent requests details for `VehicleModel::Vehicle`
- **THEN** it receives JSON including its kind, owned members with kinds and types, and the file and line range of its declaration

### Requirement: Read diagram as structure and image
A read-diagram tool SHALL return a structured JSON description of a diagram (kind, root, nodes and edges with resolved element names, kinds, types, containment, positions, and unresolved references) and, when requested, a PNG image of the rendered diagram as MCP image content. Rendering SHALL NOT require the diagram to be open in an editor.

#### Scenario: Read with image
- **WHEN** an agent calls read-diagram on `vehicle.sysmld` with image requested
- **THEN** the result contains the JSON description and an `image/png` content item showing the diagram in the same notation as the editor

#### Scenario: Read without image
- **WHEN** an agent calls read-diagram without requesting an image
- **THEN** only the JSON description is returned

### Requirement: Generate diagrams
Agent tools SHALL include a tool to create a diagram file from a root element and diagram kind, optionally restricted to a list of elements, with automatic layout, returning the new diagram's path and description.

#### Scenario: Generate general view
- **WHEN** an agent requests a General View of `VehicleModel::Vehicle`
- **THEN** a new `.sysmld` file is written with laid-out nodes for `Vehicle` and its direct members, and opening it in the editor displays the diagram

### Requirement: Edit diagrams and model
Agent tools SHALL include tools to add existing elements to a diagram, remove elements from a diagram, re-run auto-layout, create elements (optionally placing them on a diagram), delete elements from the model, rename elements, set element properties, and create relationships (connection, satisfy, verify, derive) and requirements.

#### Scenario: Remove vs delete
- **WHEN** an agent calls remove-from-diagram on `engine`
- **THEN** only the diagram file changes; calling delete-element instead removes the declaration from the `.sysml` file

### Requirement: Agent edits apply directly and are undoable
Agent edits SHALL be applied immediately without an approval prompt beyond any confirmation the agent harness itself imposes. Each tool call that writes files SHALL be recorded as one entry in a change journal, and an undo tool SHALL revert the most recent entry (text and diagram changes together), refusing if the affected files changed since that entry. Edits made through Language Model Tools SHALL additionally be applied as VS Code workspace edits, so a single editor Undo also reverts them.

#### Scenario: Undo agent change
- **WHEN** an agent creates a part with placement on a diagram and then calls undo
- **THEN** the declaration and diagram node are both removed

#### Scenario: Stale undo
- **WHEN** the user edits the affected file after the agent's change and the agent then calls undo
- **THEN** undo is refused with an explanation and no files change

### Requirement: Live views reflect agent edits
When VS Code is open on the workspace, changes made through either channel SHALL be reflected in the tree, open diagrams, and requirements editors through the normal file-change propagation.

#### Scenario: Diagram open during agent edit
- **WHEN** a diagram is open and an agent adds an element to it via either channel
- **THEN** the open editor shows the new node without reopening

### Requirement: Read requirements document
Agent tools SHALL include a tool that returns the document view of a package as Markdown (headings with generated numbers, table of contents, paragraphs, requirement items, appendices), with each heading and requirement annotated by its qualified name.

#### Scenario: Agent reads specification
- **WHEN** an agent requests the document for `VehicleSpec`
- **THEN** it receives Markdown matching the document view's structure and numbering, with qualified names it can pass to edit tools
