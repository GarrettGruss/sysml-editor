import { describe, expect, it } from "vitest";
import { inlineKeyAction } from "./inline-input.js";

describe("inline input keys", () => {
  it("commits on Enter and cancels on Escape", () => {
    expect(inlineKeyAction({ key: "Enter" }, false)).toBe("commit");
    expect(inlineKeyAction({ key: "Enter", shiftKey: true }, false)).toBe("commit");
    expect(inlineKeyAction({ key: "Escape" }, true)).toBe("cancel");
  });
  it("adds a line on Shift+Enter in a multi-line input only", () => {
    expect(inlineKeyAction({ key: "Enter", shiftKey: true }, true)).toBe("newline");
    expect(inlineKeyAction({ key: "Enter" }, true)).toBe("commit");
    expect(inlineKeyAction({ key: "a" }, true)).toBeUndefined();
  });
});
