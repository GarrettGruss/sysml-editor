import { describe, expect, it, vi } from "vitest";
import { RescanScheduler, commonFolder } from "./rescan-scheduler.js";

const R = "file:///w";

describe("RescanScheduler", () => {
  it("runs each delay once and forgets the folder afterwards", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const s = new RescanScheduler<null>(run, [10, 20, 30]);
    s.schedule(`${R}/a`, null);
    expect(s.pending).toBe(3);
    vi.advanceTimersByTime(30);
    expect(run).toHaveBeenCalledTimes(3);
    expect(s.pending).toBe(0);
    expect(s.scheduled).toEqual([]);
    vi.useRealTimers();
  });

  it("skips a path below a scheduled folder and cancels scheduled ones below a new ancestor", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const s = new RescanScheduler<null>(run, [10]);
    s.schedule(`${R}/a/b`, null);
    s.schedule(`${R}/a/b/c`, null);
    expect(s.scheduled).toEqual([`${R}/a/b`]);
    s.schedule(`${R}/a`, null);
    expect(s.scheduled).toEqual([`${R}/a`]);
    vi.advanceTimersByTime(10);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(`${R}/a`, null);
    vi.useRealTimers();
  });

  it("does not mistake a sibling with a common name prefix for a descendant", () => {
    const s = new RescanScheduler<null>(() => {}, [10]);
    s.schedule(`${R}/ab`, null);
    s.schedule(`${R}/a`, null);
    expect(s.scheduled.sort()).toEqual([`${R}/a`, `${R}/ab`]);
    s.clear();
  });

  it("collapses a burst into the common folder, bounded per workspace folder", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const s = new RescanScheduler<string>(run, [10], { max: 5, bucketOf: () => R, merge: (c) => c });
    for (let i = 0; i < 300; i++) s.schedule(`${R}/src/d${i}/e`, "x");
    expect(s.scheduled.length).toBeLessThanOrEqual(5);
    expect(s.pending).toBeLessThanOrEqual(5);
    vi.advanceTimersByTime(10);
    expect(run.mock.calls.length).toBeLessThanOrEqual(5);
    expect(run.mock.calls.some((c) => c[0] === `${R}/src`)).toBe(true);
    vi.useRealTimers();
  });

  it("cancel drops a folder and what is below it", () => {
    const s = new RescanScheduler<null>(() => {}, [10]);
    s.schedule(`${R}/a`, null);
    s.cancel(`${R}/a`);
    expect(s.pending).toBe(0);
  });

  it("commonFolder", () => {
    expect(commonFolder([`${R}/a/b`, `${R}/a/c`])).toBe(`${R}/a`);
  });
});
