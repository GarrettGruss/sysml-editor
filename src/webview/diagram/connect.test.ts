import { describe, expect, test } from "vitest";
import { quickBarItems } from "../../diagram/palette.js";
import type { ViewModel, VmNode } from "../../diagram/view-model.js";
import { endProblem, freeRoute, facingSide, ghostRoute, handleBoxesOf, handleRelation, hasHandles, sideAt, sidePoint } from "./connect.js";
import { isOrthogonal } from "./routing.js";

const node = (id: string, shape: VmNode["shape"], extra: Partial<VmNode> = {}): VmNode => ({ id, shape, label: id, resolved: true, ...extra });
const vm = (kind: string, nodes: VmNode[]): ViewModel => ({ kind, nodes, edges: [] }) as unknown as ViewModel;
const box = { x: 100, y: 100, w: 80, h: 40 };

describe("ghost line", () => {
  test("is orthogonal and leaves from the given side", () => {
    const pts = ghostRoute(box, "R", { x: 400, y: 300 });
    expect(isOrthogonal(pts)).toBe(true);
    expect(pts[0]).toEqual(sidePoint(box, "R"));
    expect(pts[pts.length - 1]).toMatchObject({ x: 400, y: 300 });
  });
  test("snaps to the border of a target", () => {
    const tgt = { x: 300, y: 100, w: 80, h: 40 };
    const pts = ghostRoute(box, undefined, { x: 330, y: 120 }, tgt);
    const last = pts[pts.length - 1]!;
    expect(last.x === tgt.x || last.x === tgt.x + tgt.w || last.y === tgt.y || last.y === tgt.y + tgt.h).toBe(true);
  });
  test("faces the pointer", () => {
    expect(facingSide(box, { x: 500, y: 120 })).toBe("R");
    expect(facingSide(box, { x: 140, y: 400 })).toBe("D");
  });
});

describe("what may be connected", () => {
  test("flows connect features, not control nodes", () => {
    const m = vm("actionFlow", [node("f", "fork"), node("p", "usage")]);
    expect(endProblem(m, "flow", "p", "f")).toMatch(/features, not control nodes/);
    expect(endProblem(m, "flow", "f", "p")).toBeUndefined();
  });
  test("successions accept control nodes and refuse start as a target and themselves", () => {
    const m = vm("actionFlow", [node("a", "action"), node("f", "fork"), node("s", "start")]);
    expect(endProblem(m, "succession", "a", "f")).toBeUndefined();
    expect(endProblem(m, "succession", "a", "s")).toMatch(/start/);
    expect(endProblem(m, "succession", "a", "a")).toMatch(/different/);
  });
  test("transitions connect states", () => {
    const m = vm("stateTransition", [node("a", "state"), node("b", "action")]);
    expect(endProblem(m, "transition", "a", "a")).toBeUndefined();
    expect(endProblem(m, "transition", "a", "b")).toMatch(/states/);
  });
});

describe("quick-connect handles and the quick bar", () => {
  test("handles on states and Action Flow nodes only, never on inherited ones", () => {
    const st = vm("stateTransition", [node("a", "state"), node("i", "state", { props: { locked: "inherited" } as VmNode["props"] })]);
    expect(hasHandles(st, st.nodes[0]!)).toBe(true);
    expect(hasHandles(st, st.nodes[1]!)).toBe(false);
    const af = vm("actionFlow", [node("a", "action"), node("f", "fork"), node("d", "done")]);
    expect(af.nodes.map((n) => hasHandles(af, n))).toEqual([true, true, false]);
    const g = vm("general", [node("a", "usage")]);
    expect(hasHandles(g, g.nodes[0]!)).toBe(false);
    expect(handleRelation("stateTransition")).toBe("transition");
    expect(handleRelation("actionFlow")).toBe("succession");
  });
  test("a handle is found at the middle of a side, outside the border", () => {
    const hb = handleBoxesOf(box, 10);
    expect(sideAt(box, { x: hb.R.x + 5, y: hb.R.y + 5 }, 10)).toBe("R");
    expect(hb.R.x).toBeGreaterThanOrEqual(box.x + box.w);
    expect(sideAt(box, { x: 140, y: 120 }, 10)).toBeUndefined();
  });
  test("the quick bar offers the node kinds valid for the diagram and the line", () => {
    expect(quickBarItems("actionFlow", "succession").map((i) => i.kind)).toEqual(["action", "fork", "join", "decide", "merge"]);
    expect(quickBarItems("stateTransition", "transition").map((i) => i.kind)).toEqual(["state"]);
    expect(quickBarItems("general", "connection")).toEqual([]);
  });
});

describe("free ghost route", () => {
  test("ends exactly at the pointer, in every direction, and is orthogonal", () => {
    for (const to of [{ x: 400, y: 300 }, { x: 20, y: 300 }, { x: 140, y: 20 }, { x: 150, y: 100.5 }]) {
      for (const side of ["R", "L", "U", "D"] as const) {
        const pts = ghostRoute(box, side, to);
        expect(pts[pts.length - 1]).toEqual(to);
        expect(isOrthogonal(pts)).toBe(true);
        expect(pts[0]).toEqual(sidePoint(box, side));
      }
    }
    expect(freeRoute({ x: 0, y: 0 }, "R", { x: 100, y: 50 }).length).toBeGreaterThan(2);
  });
});
