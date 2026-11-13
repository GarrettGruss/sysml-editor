# Vendored SysML v2 ANTLR4 grammar

- Upstream: https://github.com/daltskin/sysml-v2-grammar
- Tag: v2026.09.1 (commit 27a13449545d054e7f1fb97e82195470e13e140e, committed 2026-10-31)
- Vendored: 2026-11-11
- Licence: MIT (Copyright (c) 2026 J Dalton), see LICENSE

Only the `.g4` files and LICENSE are copied.

## Local patches

- `SysMLv2Lexer.g4`: the rules `SINGLE_LINE_NOTE`, `BARE_LINE_COMMENT` and `WS` use `-> channel(HIDDEN)` instead of `-> skip`. Why: upstream discards whitespace and `//` line notes, so the token stream cannot reproduce the source text. The edit planner needs the tokens (including whitespace and comments) to re-join to the exact original file.

