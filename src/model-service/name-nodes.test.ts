import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../diagram/format.js";
import { referenceKey } from "../diagram/resolve.js";
import { nameNodesChange } from "./diagram-changes.js";

const loc = (index?: number) => ({ owner: "P::A", kind: "fork", ends: [], ...(index !== undefined ? { index } : {}) });
const doc: DiagramDocument = { version: 1, kind: "actionFlow", root: "P::A", sources: ["m.sysml"], nodes: [{ id: "n1", locator: loc(0) }, { id: "n2", locator: loc(1) }, { id: "n3", locator: loc(2) }], edges: [] };

describe("nameNodesChange", () => {
  const ctx = { uri: "file:///w/d.sysmld", sourceOf: (u: string) => u };
  it("replaces the locator by the new reference, shifts later twins and reverts exactly", () => {
    const ch = nameNodesChange([{ oldKey: referenceKey({ locator: loc(1) }), ref: "P::A::fork1" }], "x");
    const d = ch.apply(doc, ctx);
    expect(d.nodes[1]).toMatchObject({ id: "n2", ref: "P::A::fork1" });
    expect(d.nodes[1]!.locator).toBeUndefined();
    expect(d.nodes[0]!.locator!.index).toBe(0);
    expect(d.nodes[2]!.locator).toEqual(loc(1));
    expect(ch.revert(d, ctx)).toEqual(doc);
  });
});
