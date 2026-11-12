## ADDED Requirements

### Requirement: Extension-hosted MCP server
While VS Code is open on a workspace, the extension SHALL host a Model Context Protocol (MCP) server that exposes tools for reading and generating SysML v2 models and diagrams to any MCP-compliant agent harness on the same machine. Agent tools SHALL be available only while VS Code is running with that workspace open; operation without VS Code is out of scope.

#### Scenario: External agent connects
- **WHEN** VS Code is open on the workspace and an MCP client outside VS Code connects using the documented configuration
- **THEN** the server lists its tools and every read and write tool works against that workspace

#### Scenario: Discovery in VS Code
- **WHEN** the extension is installed in VS Code
- **THEN** the MCP server is registered with VS Code so in-editor agents can use it without manual configuration

#### Scenario: VS Code not running
- **WHEN** an MCP client tries to connect while VS Code is not open on the workspace
- **THEN** the connection fails with a message stating that VS Code must be open on the workspace

### Requirement: VS Code Language Model Tools channel
The extension SHALL register the same agent tool set as VS Code Language Model Tools, so in-editor agents can call them without an MCP client. Each tool SHALL have the same name, input schema, result content, and behavior on both channels.

#### Scenario: In-editor agent reads an element
- **WHEN** an in-editor agent calls the get-element tool through Language Model Tools
- **THEN** it receives the same JSON as the MCP tool returns

#### Scenario: Unsaved buffers visible
- **WHEN** a `.sysml` file has unsaved edits in VS Code and an agent reads it through either channel
- **THEN** the result reflects the unsaved editor content

#### Scenario: Channel equivalence
- **WHEN** the same tool call is made over MCP and over Language Model Tools against the same workspace state
- **THEN** both produce identical results and identical file changes

### Requirement: Read model structure
Agent tools SHALL include tools to list SysML files, browse the element hierarchy, and get an element's details (kind, qualified name, type, multiplicity, documentation, owned members, relationships, source location) as structured JSON.

#### Scenario: Inspect element
- **WHEN** an agent requests details for `VehicleModel::Vehicle`
- **THEN** it receives JSON including its kind, owned members with kinds and types, and the file and line range of its declaration

#### Scenario: Depth limit
- **WHEN** an agent browses the element hierarchy without giving a depth
- **THEN** only a default number of levels is returned, each truncated element says how many members it has, and the agent can request a subtree by qualified name

### Requirement: Validate model
Agent tools SHALL include a validate tool that reports syntax errors and unresolved names for one file or the whole workspace, each with file, line, and message. It SHALL reflect unsaved editor content, and files changed on disk by an agent SHALL be included without the agent doing anything else.

#### Scenario: Agent checks its own edit
- **WHEN** an agent writes a `.sysml` file directly with an unclosed brace and then calls validate on it
- **THEN** the result lists the syntax error with its line

#### Scenario: Unresolved name
- **WHEN** a file declares `part engine : Engin;` and no element `Engin` is visible
- **THEN** validate reports an unresolved name at that position

#### Scenario: Clean model
- **WHEN** validate is called on a workspace with no problems
- **THEN** it returns an empty list
