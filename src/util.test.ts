import { expect, test } from "vitest";
import { isSysmlFile } from "./util";

test("recognises SysML and KerML files", () => {
  expect(isSysmlFile("a/b.sysml")).toBe(true);
  expect(isSysmlFile("a/b.kerml")).toBe(true);
  expect(isSysmlFile("a/b.ts")).toBe(false);
});
