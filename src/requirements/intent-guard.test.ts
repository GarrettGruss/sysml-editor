import { describe, expect, test } from "vitest";
import { MAX_NAME, MAX_TEXT, parseIntent } from "./intent-guard.js";

const good: unknown[] = [
  { type: "setCell", qn: "P::r", field: "text", value: "v", expected: "e" },
  { type: "addRequirement", kind: "requirement def", id: "", name: "n" },
  { type: "addRequirement", kind: "requirement", id: "R1", name: "n", ownerQn: "P", afterQn: "P::a" },
  { type: "deleteRequirement", qn: "P::r" },
  { type: "addSatisfy", qn: "P::r" },
  { type: "removeSatisfy", key: "k" },
  { type: "removeDerivation", connectionKey: "k", derivedQn: "P::r" },
  { type: "navigate", qn: "P", to: "diagram" },
  { type: "setHeading", qn: "P", value: "v", expected: "e" },
  { type: "setParagraph", key: "k", value: "v", expected: "e" },
  { type: "addSection", parentQn: "P", name: "n", appendix: true, afterQn: "P::a" },
  { type: "addParagraph", pkgQn: "P", text: "t" },
  { type: "moveSection", qn: "P", how: "up" },
  { type: "moveSection", qn: "P", how: { beforeQn: "P::a" } },
  { type: "deleteSection", qn: "P" },
];
const bad: unknown[] = [
  null, "x", [], {}, { type: "nope" }, { type: 5 },
  { type: "setCell", qn: "P", field: "owner", value: "v", expected: "e" },
  { type: "setCell", qn: "P", field: "text", value: "v" },
  { type: "setCell", qn: 5, field: "text", value: "v", expected: "e" },
  { type: "setCell", qn: "P", field: "text", value: "x".repeat(MAX_TEXT + 1), expected: "e" },
  { type: "setCell", qn: "x".repeat(MAX_NAME + 1), field: "text", value: "v", expected: "e" },
  { type: "addRequirement", kind: "part", id: "", name: "n" },
  { type: "addRequirement", kind: "requirement", id: 1, name: "n" },
  { type: "addRequirement", kind: "requirement", id: "", name: "n", ownerQn: 7 },
  { type: "removeSatisfy" },
  { type: "removeDerivation", connectionKey: "k", derivedQn: {} },
  { type: "navigate", qn: "P", to: "browser" },
  { type: "addSection", parentQn: "P", name: "n", appendix: "yes" },
  { type: "addParagraph", pkgQn: "P" },
  { type: "moveSection", qn: "P", how: "sideways" },
  { type: "moveSection", qn: "P", how: { beforeQn: 1 } },
  { type: "moveSection", qn: "P", how: { beforeQn: "a", afterQn: "b" } },
  { type: "setParagraph", key: "k", value: "v" },
];

describe("intent shape guard", () => {
  test("accepts well-formed intents", () => {
    for (const g of good) expect(parseIntent(g), JSON.stringify(g)).toMatchObject({ ok: true });
  });
  test("rejects malformed ones with a reason", () => {
    for (const b of bad) {
      const r = parseIntent(b);
      expect(r.ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(5);
    }
  });
});
