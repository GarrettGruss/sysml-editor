import { describe, expect, it } from "vitest";
import { ScanTracker } from "./scan-tracker.js";

describe("ScanTracker", () => {
  it("a change during the scan wins over the scan's disk text", () => {
    const t = new ScanTracker();
    t.touch("file:///a");
    expect(t.resolve("file:///a", "old disk")).toBeUndefined();
    expect(t.resolve("file:///b", "disk b")).toBe("disk b");
  });
  it("a delete during the scan stays deleted", () => {
    const t = new ScanTracker();
    t.touch("file:///gone"); // the watcher's delete event
    expect(t.resolve("file:///gone", "text read before the delete")).toBeUndefined();
  });
  it("open editor content wins over disk", () => {
    const t = new ScanTracker();
    expect(t.resolve("file:///a", "disk", "editor")).toBe("editor");
    t.touch("file:///a"); // opened: handled by the open handler
    expect(t.resolve("file:///a", "disk", "editor")).toBeUndefined();
  });
  it("tracks nothing after the scan ended", () => {
    const t = new ScanTracker();
    t.touch("k");
    t.end();
    t.touch("later");
    expect(t.isTouched("k")).toBe(false);
    expect(t.isTouched("later")).toBe(false);
  });
});
