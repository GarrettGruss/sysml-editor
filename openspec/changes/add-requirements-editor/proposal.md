## Why

Requirements are usually read and reviewed as tables and documents, not as code. This change adds both views over SysML v2 requirements, with the text remaining the only stored form.

## What Changes

- A requirements table: id, name, text, and satisfy and verify counts, with inline editing.
- A document view that renders a package as a specification (title, generated table of contents, numbered sections, prose, requirement items, appendices). Structure is expressed in SysML v2 itself: packages, comments, and metadata from a shipped library.
- Requirement relationships written the way SysML v2 defines them: `satisfy`, `verify` inside a verification case, and derivation as a `#derivation connection`.
- Agent tools to read the document and edit requirements.

## Capabilities

### New Capabilities
- `requirements-editor`: GUI for viewing and editing SysML v2 requirements as a table or a structured document.

### Modified Capabilities
- `agent-integration`: adds requirement tools.
- `diagram-editor`: adds requirement relationships on diagrams.

## Impact

- Fourth of four changes; depends on `add-model-editing`.
- New code: requirements webview, document model, comment handling, section move, `DocumentAnnotations.sysml` library.
