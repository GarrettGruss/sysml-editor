import { describe, expect, it } from "vitest";
import { makeExcludeFilter, makeIndexFilter } from "./exclude.js";

describe("exclude filter", () => {
  const f = makeExcludeFilter(["**/node_modules/**", "fixtures/**", "build"]);
  it("matches nested and root paths", () => {
    expect(f("node_modules/x/a.sysml")).toBe(true);
    expect(f("pkg/node_modules/x/a.sysml")).toBe(true);
    expect(f("fixtures/a/b.sysml")).toBe(true);
    expect(f("src/fixtures/a.sysml")).toBe(false);
    expect(f("src/a.sysml")).toBe(false);
  });
  it("excludes everything below a matching folder", () => {
    expect(f("build/out/a.sysml")).toBe(true);
    expect(f("builds/a.sysml")).toBe(false);
  });
  it("handles windows separators, leading slashes, braces and wildcards", () => {
    expect(f("fixtures\\a.sysml")).toBe(true);
    expect(f("/abs/node_modules/a.sysml")).toBe(true);
    const g = makeExcludeFilter(["**/{gen,tmp}/**", "*.bak.sysml", "a?.sysml"]);
    expect(g("x/gen/a.sysml")).toBe(true);
    expect(g("x/tmp/a.sysml")).toBe(true);
    expect(g("x/other/a.sysml")).toBe(false);
    expect(g("old.bak.sysml")).toBe(true);
    expect(g("d/old.bak.sysml")).toBe(false);
    expect(g("ab.sysml")).toBe(true);
    expect(g("abc.sysml")).toBe(false);
  });
  it("combines sysml.exclude with the true entries of search.exclude", () => {
    const c = makeIndexFilter(["fixtures/**"], { "**/node_modules": true, "**/skipme": false, "**/*.code-search": true });
    expect(c("fixtures/a.sysml")).toBe(true);
    expect(c("a/node_modules/b.sysml")).toBe(true);
    expect(c("a/skipme/b.sysml")).toBe(false);
    expect(c("a/b.sysml")).toBe(false);
  });
  it("empty pattern list excludes nothing", () => {
    expect(makeExcludeFilter([])("a/b.sysml")).toBe(false);
  });
});
