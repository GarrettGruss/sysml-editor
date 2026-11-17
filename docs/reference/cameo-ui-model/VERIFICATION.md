# Verification

Run with the project's own code: every file parsed with `ModelIndex` (ANTLR parser) next to the standard library (`fixtures/sysml-v2-release/sysml.library`), then `findUnresolvedNames` (src/agent-tools/unresolved.ts) per file.

## Result

- Syntax errors: 0. Unresolved names: 0. One mid-merge syntax error (attribute named `message`, a reserved word) was fixed.
- Cross-package references are written qualified (`CameoUI_PRJ::OpenProject`); no section imports another section.
- Caveat: the unresolved-name check judges plain qualified names only; feature chains and expressions are not judged.
- Modeller findings: none beyond the above. The index resolved all cross-file imports and qualified names without diagnostics.

## Elements per kind

| Kind | Count |
|---|---|
| action | 1058 |
| doc | 872 |
| requirement | 599 |
| action def | 481 |
| part | 301 |
| part def | 272 |
| state | 141 |
| ref | 112 |
| attribute | 76 |
| state def | 51 |
| transition | 35 |
| enum | 34 |
| attribute def | 21 |
| import | 13 |
| enum def | 12 |
| entry | 9 |

## Elements per package

| Package | Count |
|---|---|
| CameoUI | 105 |
| CameoUI_DGM | 797 |
| CameoUI_DGT | 613 |
| CameoUI_ELM | 650 |
| CameoUI_GST | 700 |
| CameoUI_PRJ | 403 |
| CameoUI_PRJ_2 | 194 |
| CameoUI_TLS | 625 |
