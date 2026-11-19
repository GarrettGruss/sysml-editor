## ADDED Requirements

### Requirement: Image format and aspect tools
`sysml_read_diagram` SHALL accept `format` of `png` (default) or `svg` with `includeImage`. A write tool SHALL show or hide a node's parts and ports and apply or clear an aspect. In an untrusted workspace the write tool SHALL refuse; each result SHALL say it is a layout edit.

#### Scenario: SVG image
- **WHEN** an agent reads a diagram with `includeImage` and `format: "svg"`
- **THEN** the result carries SVG text

#### Scenario: Untrusted workspace
- **WHEN** the workspace is untrusted and an agent applies an aspect
- **THEN** the call is refused
