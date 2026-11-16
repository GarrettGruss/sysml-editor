## ADDED Requirements

### Requirement: Read verification matrix tool
The agent tool `sysml_read_verification_matrix` SHALL return the matrix for a scope with the same rows, columns, and status as the editor.

#### Scenario: Read a matrix
- **WHEN** an agent calls `sysml_read_verification_matrix` on a requirements package
- **THEN** it gets one row per requirement with satisfied by, method, verified by, and status
