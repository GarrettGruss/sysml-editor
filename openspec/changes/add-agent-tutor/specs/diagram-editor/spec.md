## ADDED Requirements

### Requirement: Highlight overlay and dismissal
The diagram and requirements webviews SHALL draw highlights only on request from the host over `postMessage`. Esc and a close button on the callout SHALL clear all highlights. A highlight SHALL clear when its target disappears (node deleted, menu closed, view switched). Highlights SHALL not block input to the target and SHALL not change the model or diagram state.

#### Scenario: Esc clears
- **WHEN** a highlight is shown and the user presses Esc
- **THEN** all highlights are removed

#### Scenario: Close button
- **WHEN** the user presses the callout's close button
- **THEN** that highlight is removed

#### Scenario: Target disappears
- **WHEN** the highlighted node is deleted
- **THEN** the highlight is cleared

### Requirement: Walkthroughs
The extension SHALL contribute two walkthroughs: "First steps" (create a file, create a diagram, add a requirement) and "Diagram basics". Each step SHALL complete when its command runs.

#### Scenario: Step completes
- **WHEN** the user runs the command a step names
- **THEN** the step shows as completed
