import { describe, expect, it } from "vitest";
import { compartmentLabel } from "./menu.js";

describe("compartmentLabel", () => {
  it("reads Hide when shown and Show when hidden", () => {
    expect(compartmentLabel("ports", true)).toBe("Hide Ports");
    expect(compartmentLabel("doc", false)).toBe("Show Description");
  });
});
