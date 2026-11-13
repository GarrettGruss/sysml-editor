## ADDED Requirements

### Requirement: Tree actions edit the model
The tree SHALL provide context-menu actions to add a child element of an allowed kind, rename an element, and delete an element; these actions SHALL apply through the model-synchronization rules.

#### Scenario: Delete from tree
- **WHEN** the user deletes a part usage from the tree and confirms
- **THEN** its declaration is removed from the `.sysml` text and the node disappears from the tree
