import { describe, expect, it } from "vitest";
import { defaultStem, nextFreeName } from "./naming.js";

describe("default names", () => {
  it("builds the stem from the kind", () => {
    expect(defaultStem("part")).toBe("part");
    expect(defaultStem("part def")).toBe("PartDef");
    expect(defaultStem("use case def")).toBe("UseCaseDef");
    expect(defaultStem("exhibit state")).toBe("exhibitState");
  });
  it("takes the next free number", () => {
    expect(nextFreeName("state", new Set())).toBe("state1");
    expect(nextFreeName("state", new Set(["state1", "state2", "state4"]))).toBe("state3");
  });
});
