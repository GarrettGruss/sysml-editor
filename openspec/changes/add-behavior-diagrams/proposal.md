## Why

Behaviour is a large share of real SysML v2 models: the official examples contain 374 actions, 148 states, and 50 transitions, and the first diagram kinds (general, interconnection, requirements) cannot show any of it. A person and an agent reviewing an architecture together need to see how the system behaves, not only how it is built.

## What Changes

- Three more diagram kinds, named after the standard SysML v2 views: Action Flow View, State Transition View, and Sequence View.
- Use cases, actors, and their relationships shown in the General View.
- Editing behaviour from these diagrams: adding actions, states, successions, transitions, and messages, and deleting them, written to the SysML text.
- The same saved layout and agent tools (read as JSON and PNG, generate, arrange, edit) as the existing diagram kinds.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `diagram-editor`: adds the behaviour diagram kinds, behaviour editing, and use case notation.
- `agent-integration`: extends the diagram and model-editing tools to behaviour.

## Impact

- Fifth change for the editor; depends on `add-diagram-viewing` and `add-model-editing`.
- New code: notation shapes and layout rules for actions, states, and sequences in the diagram webview; model-layer support for successions, transitions, and messages.
- New code: edit plans for successions, transitions, and messages.
- Out of scope: reordering messages by dragging, editing use cases from the General View beyond what `add-model-editing` already allows for any element, and executing behaviour.
