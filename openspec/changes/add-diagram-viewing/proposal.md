## Why

Engineers read architectures as diagrams, and agents need to see them too. This change adds diagrams with saved, user-arranged layout, kept in files separate from the SysML text, without yet editing the model from them.

## What Changes

- A diagram file format (`*.sysmld`) that stores layout and view state only and references SysML elements, never duplicating model content.
- A graphical editor for General, Interconnection, and Requirements views: move, resize, auto-layout, add existing elements, remove from diagram.
- Tree actions to show an element in a diagram, add it to one, and create a diagram.
- Agent tools to list, read (JSON plus PNG), generate, and arrange diagrams.

## Capabilities

### New Capabilities
- `diagram-files`: Format, lifecycle, and element-reference rules for diagram files.
- `diagram-editor`: Graphical editor for diagrams: rendering and layout manipulation.

### Modified Capabilities
- `model-tree-view`: adds diagram actions from the tree.
- `agent-integration`: adds diagram tools and the rules for agent edits.

## Impact

- Second of four changes; depends on `add-model-foundation`.
- New code: custom editor for `.sysmld`, diagram webview with layout and rendering, diagram agent tools.
- New dependencies: a layout engine (`elkjs`) and a diagram canvas library (maxGraph preferred, confirmed by a spike).
