# DoDAF example

`Rescue.sysml` imports `DoDAF::*` but this folder does not contain the DoDAF library, so open it as the workspace folder and run these in order:

1. `SysML: Add DoDAF Library` (copies `DoDAF.sysml` into the workspace root; do not commit that copy).
2. `SysML: Generate DoDAF Document`.

Without step 1 the generator stops with an error instead of writing empty views.
