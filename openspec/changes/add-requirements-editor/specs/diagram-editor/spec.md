## ADDED Requirements

### Requirement: Requirement relationships on diagrams
The Requirements View palette SHALL offer satisfy, verify, and derivation relationships, and drawing one SHALL produce the same text as the requirements editor.

#### Scenario: Draw derivation
- **WHEN** the user draws a derivation edge from `massLimit` to `chassisMass` on a Requirements View
- **THEN** a `#derivation connection` is added to the model and the edge appears
