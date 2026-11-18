---
name: sysml-modeling
description: Read and edit a SysML v2 model and its diagrams through the SysML Editor MCP tools (sysml_*). Use when the user asks to inspect, create, change or verify SysML elements, relationships, requirements or .sysmld diagrams in a workspace open in VS Code.
---

# SysML modeling with the SysML Editor tools

The tools only work while VS Code is open on the workspace with the SysML Editor extension. They see the same model as the editor, including unsaved edits.

## Connect

- Inside VS Code the tools are available directly (Language Model Tools or MCP).
- From a harness outside VS Code, add the stdio bridge (`node <extension path>/dist/mcp-bridge.js --workspace <absolute workspace folder>`). It finds the running server through `~/.sysml-editor/servers/*.json`. If it prints `VS Code must be open on this workspace`, ask the user to open that folder.

## Read before you write

1. `sysml_list_files`: files, root packages, syntax errors. Fix or report files with errors first; edits to them are refused.
2. `sysml_get_element_tree` (subtree by qualified name) and `sysml_get_element` for details, relationships, file and lines.
3. `sysml_validate` for syntax errors and unresolved names.
4. Requirements: `sysml_read_requirements_document`, `sysml_read_verification_matrix`.
5. What the user is looking at: `sysml_get_editor_context`.

## Edit the model

Write tools: `sysml_create_element`, `sysml_delete_element`, `sysml_rename_element`, `sysml_set_element_properties`, `sysml_create_relationship`, `sysml_set_transition`, `sysml_create_requirement`.

- Each call is one edit, saved at once to the `.sysml` files, with no approval prompt. Do not repeat an edit after a failed save; read `filesChanged`, `filesSaved`, `filesNotSaved` in the result.
- A refusal is an error with a reason and nothing changed (syntax errors in the file, library content, a kind not allowed for the owner, a duplicate name, an untrusted workspace).
- A feature a usage only inherits from its definition cannot be changed from the usage. The error names the declaring definition; use that definition's qualified name instead.
- Pass `diagram` to a create tool to place the new node on a diagram in the same operation.
- Unnamed statements (succession, transition, message) are addressed by the `statement` locator and `fingerprint` from `sysml_read_diagram`.
- `sysml_delete_element` deletes from the model. `sysml_remove_from_diagram` only removes a node from a diagram.

## Diagrams

- `sysml_list_diagrams`, `sysml_read_diagram` (add `includeImage: true` for a PNG), `sysml_create_diagram` (kinds: general, interconnection, requirements, actionFlow, stateTransition, sequence), `sysml_add_to_diagram`, `sysml_remove_from_diagram`, `sysml_layout_diagram`.
- Diagram edits to an open diagram stay unsaved and undoable; a model edit never saves a diagram's layout.

## Verify

After every edit: `sysml_validate`, then `sysml_get_element` (or `sysml_read_diagram`) on the changed element and check name, type, multiplicity and the `filesChanged` list. Report what you read, not what you assumed.
