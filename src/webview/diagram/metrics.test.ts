import { describe, expect, it } from "vitest";
import type { ViewModel } from "../../diagram/view-model.js";
import { checkEdges } from "./metrics.js";

const vm = (nodes: ViewModel["nodes"], edges: ViewModel["edges"]): ViewModel => ({ kind: "general", root: "r", nodes, edges });
const node = (id: string, extra: object = {}) => ({ id, shape: "usage" as const, label: id, resolved: true, ...extra });
const edge = (id: string, source: string, target: string) => ({ id, source, target, style: "generic" as const, derived: false, resolved: true });

describe("checkEdges", () => {
  const abs = new Map([["a", { x: 0, y: 0, w: 100, h: 60 }], ["b", { x: 300, y: 0, w: 100, h: 60 }]]);
  const v = vm([node("a"), node("b")], [edge("e", "a", "b")]);
  it("accepts a clean horizontal route", () => {
    const r = checkEdges(v, abs, new Map([["e", [{ x: 100, y: 30 }, { x: 300, y: 30 }]]]), new Map([["e", { x: 160, y: 14, w: 40, h: 13 }]]));
    expect(r).toEqual({ diagonalSegments: 0, edgesThroughEndNodes: 0, labelsOverEndNodes: 0, labelsOnOwnEdge: 0, portsOffBorder: 0 });
  });
  it("flags diagonals, routes through an end node and labels over an end node", () => {
    const r = checkEdges(v, abs, new Map([["e", [{ x: 50, y: 30 }, { x: 300, y: 30 }, { x: 350, y: 80 }]]]), new Map([["e", { x: 10, y: 10, w: 40, h: 13 }]]));
    expect(r.diagonalSegments).toBe(1);
    expect(r.edgesThroughEndNodes).toBe(1);
    expect(r.labelsOverEndNodes).toBe(1);
  });
  it("flags a label that sits on its own edge", () => {
    const bent = new Map([["e", [{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 120 }, { x: 300, y: 120 }, { x: 300, y: 60 }]]]);
    expect(checkEdges(v, abs, bent, new Map([["e", { x: 180, y: 70, w: 40, h: 13 }]])).labelsOnOwnEdge).toBe(1);
    expect(checkEdges(v, abs, bent, new Map([["e", { x: 204, y: 70, w: 40, h: 13 }]])).labelsOnOwnEdge).toBe(0);
  });
  it("flags a port that is off its owner's border", () => {
    const w = vm([node("o"), node("p", { shape: "port", attachedTo: "o" })], []);
    const on = new Map([["o", { x: 0, y: 0, w: 100, h: 100 }], ["p", { x: 93, y: 40, w: 14, h: 14 }]]);
    const off = new Map([["o", { x: 0, y: 0, w: 100, h: 100 }], ["p", { x: 40, y: 40, w: 14, h: 14 }]]);
    expect(checkEdges(w, on, new Map(), new Map()).portsOffBorder).toBe(0);
    expect(checkEdges(w, off, new Map(), new Map()).portsOffBorder).toBe(1);
  });
});
