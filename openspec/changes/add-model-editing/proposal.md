## Why

The editor's purpose is that a person or an agent can change the architecture graphically and have the SysML text follow. This change adds every operation that writes SysML text, which is the riskiest part of the editor and so comes after the model and diagrams are proven.

## What Changes

- Edits from diagrams (palette, connections, delete from model, rename, properties) and from the tree are written to the linked `.sysml` text as minimal, format-preserving edits.
- Rename updates references in text and in diagram files.
- One undo step reverses both the text change and the diagram change.
- Every model edit is saved at once, so the graphical editors and the SysML text never disagree. Diagram layout and style are saved only when the user saves the diagram.
- Features a usage inherits from its definition are shown as inherited and cannot be changed from the usage.
- Agent tools to create, delete, rename, and connect elements, under the same rules as the GUI.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `model-synchronization`: adds the rules by which edits translate to SysML text.
- `diagram-editor`: adds model editing from diagrams.
- `diagram-files`: adds reference maintenance on rename.
- `model-tree-view`: adds model-editing actions.
- `agent-integration`: adds model-editing tools.

## Impact

- Third of four changes; depends on `add-model-foundation` and `add-diagram-viewing`.
- New code: edit planner, rename service, palette and property panel, agent write tools.
