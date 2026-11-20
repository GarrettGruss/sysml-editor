import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UAF_TO_DODAF, VIEWS, VIEW_IDS, isViewId, viewMapping } from "./mapping.js";

describe("DoDAF mapping", () => {
  it("covers all 17 views once", () => {
    expect(VIEW_IDS).toHaveLength(17);
    expect(VIEWS.map((v) => v.id)).toEqual([...VIEW_IDS]);
    for (const v of VIEWS) expect(v.form === "diagram" ? v.diagramKind : "x", v.id).toBeTruthy();
    expect(viewMapping("OV-5b")?.diagramKind).toBe("actionFlow");
    expect(isViewId("OV-3")).toBe(false);
  });

  it("selects only metadata defs that the library declares", () => {
    const lib = readFileSync(join(__dirname, "../../resources/dodaf/DoDAF.sysml"), "utf8");
    for (const v of VIEWS) for (const s of v.selects) expect(lib, s).toContain(`metadata def ${s} `);
    for (const { uaf } of UAF_TO_DODAF) expect(lib, uaf).toContain(`metadata def ${uaf} `);
  });
});
