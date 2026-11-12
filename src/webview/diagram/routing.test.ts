import { describe, expect, it } from "vitest";
import { collinearOverlap, edgeRoute, isOrthogonal, labelOnRoute, overlapsWith, placeLabel, rectsOverlap, routeFits, routeOrthogonal, routeThroughBox, outwardSide } from "./routing.js";

const box = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h });

describe("routeOrthogonal", () => {
  it("is a straight line when the boxes share a horizontal range", () => {
    const r = routeOrthogonal(box(0, 0), box(200, 10));
    expect(r).toHaveLength(2);
    expect(r[0]!.y).toBe(r[1]!.y);
  });
  it("uses two bends when both ends leave facing each other at different heights", () => {
    const r = routeOrthogonal(box(0, 0), box(200, 100), "R", "L");
    expect(r.length).toBe(4);
    expect(isOrthogonal(r)).toBe(true);
  });
  it("uses one bend when there is a gap on both axes", () => {
    const r = routeOrthogonal(box(0, 0), box(200, 200));
    expect(r.length).toBe(3);
    expect(isOrthogonal(r)).toBe(true);
  });
  it("never passes through its end nodes, in any relative position", () => {
    const a = box(300, 300);
    for (let dx = -400; dx <= 400; dx += 50) for (let dy = -400; dy <= 400; dy += 50) {
      const b = box(300 + dx, 300 + dy);
      if (Math.abs(dx) < 100 && Math.abs(dy) < 60) continue; // overlapping boxes
      const r = routeOrthogonal(a, b);
      expect(isOrthogonal(r), `${dx},${dy}`).toBe(true);
      expect(routeThroughBox(r, a), `a ${dx},${dy}`).toBe(false);
      expect(routeThroughBox(r, b), `b ${dx},${dy}`).toBe(false);
    }
  });
  it("leaves a port on the side facing away from its owner", () => {
    const owner = box(0, 0, 200, 100);
    const port = { x: 193, y: 40, w: 14, h: 14 };
    expect(outwardSide(port, owner)).toBe("R");
    const r = edgeRoute({ box: port, owner }, { box: box(400, 120) });
    expect(r[0]!.x).toBe(207);
    expect(r[1]!.x).toBeGreaterThan(207);
    expect(isOrthogonal(r)).toBe(true);
  });
});

describe("stored routes", () => {
  const a = box(0, 0), b = box(200, 100);
  it("is kept while both ends are where they were", () => {
    const stored = [{ x: 100, y: 30 }, { x: 150, y: 30 }, { x: 150, y: 130 }, { x: 200, y: 130 }];
    expect(routeFits(stored, a, b)).toBe(true);
    expect(edgeRoute({ box: a }, { box: b }, stored)).toEqual(stored);
  });
  it("is replaced when an end moved", () => {
    const stored = [{ x: 100, y: 30 }, { x: 150, y: 30 }, { x: 150, y: 130 }, { x: 200, y: 130 }];
    const moved = box(0, 300);
    expect(routeFits(stored, moved, b)).toBe(false);
    const r = edgeRoute({ box: moved }, { box: b }, stored);
    expect(r).not.toEqual(stored);
    expect(isOrthogonal(r)).toBe(true);
  });
  it("is rejected when diagonal", () => {
    expect(routeFits([{ x: 100, y: 30 }, { x: 200, y: 130 }], a, b)).toBe(false);
  });
});

describe("placeLabel", () => {
  it("sits beside the longest segment, off the end nodes", () => {
    const a = box(0, 0), b = box(300, 0);
    const pts = routeOrthogonal(a, b);
    const l = placeLabel(pts, 60, 13, [a, b]);
    expect(rectsOverlap(l, a)).toBe(false);
    expect(rectsOverlap(l, b)).toBe(false);
    expect(l.y + l.h).toBeLessThanOrEqual(pts[0]!.y);
  });
  it("tries the other side when the first is taken", () => {
    const pts = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const blocker = { x: 60, y: 80, w: 80, h: 18 };
    const l = placeLabel(pts, 60, 13, [blocker]);
    expect(l.y).toBeGreaterThan(100);
  });
});

describe("placeLabel against its own edge", () => {
  it("never puts the label on a line of the same edge, even when a bend sits beside the longest segment", () => {
    // The longest segment is the middle one; the segments after it run where a centred label would go.
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 200, y: 40 }, { x: 200, y: 50 }, { x: 80, y: 50 }, { x: 80, y: 90 }];
    const l = placeLabel(pts, 70, 13, []);
    expect(labelOnRoute(l, pts)).toBe(false);
  });
  it("is beside the longest segment, offset from it", () => {
    const pts = [{ x: 0, y: 100 }, { x: 300, y: 100 }];
    const l = placeLabel(pts, 60, 13, []);
    expect(labelOnRoute(l, pts)).toBe(false);
    expect(l.y + l.h).toBeLessThanOrEqual(100);
  });
});

describe("route choice among candidates", () => {
  it("prefers the fewest bends, then the shortest route, around obstacles on all four sides", () => {
    // Positions of ports-general.sysmld after the move in the integration test (sizes as laid out).
    const drivetrain = { x: 40, y: 40, w: 220, h: 150 };
    const battery = { x: 40, y: 260, w: 200, h: 62 };
    const motor = { x: 300, y: 260, w: 200, h: 62 };
    const power = { x: 584, y: 88, w: 200, h: 62 };
    const usage = { x: 380, y: 60, w: 180, h: 44 };
    const r = edgeRoute({ box: usage }, { box: battery }, undefined, [drivetrain, motor, power]);
    const last = r[r.length - 1]!, before = r[r.length - 2]!;
    expect(isOrthogonal(r)).toBe(true);
    expect(r.length - 2, "bends").toBeLessThanOrEqual(2);
    expect(last.y === battery.y || last.x === battery.x || last.x === battery.x + battery.w, "enters from the top or a side").toBe(true);
    expect(last.y === battery.y + battery.h, "not from below").toBe(false);
    expect(before.y <= last.y || before.x !== last.x).toBe(true);
    for (const o of [drivetrain, motor, power, usage, battery]) expect(routeThroughBox(r, o), JSON.stringify(o)).toBe(false);
  });
});

describe("requirements layout", () => {
  // Boxes and routes as drawn for requirements.sysmld (canvas px).
  const design = { x: 43, y: 72, w: 1514, h: 446 };
  const vehicle = { x: 97, y: 298, w: 308, h: 202 };
  const engine = { x: 152, y: 392, w: 200, h: 90 };
  const engineMass = { x: 532, y: 299, w: 444, h: 131 };
  const vehicleMass = { x: 1102, y: 271, w: 400, h: 188 };
  const massTest = { x: 775, y: 137, w: 200, h: 91 };
  const nodes = [design, vehicle, engine, engineMass, vehicleMass, massTest];
  const r1 = [{ x: 352, y: 411 }, { x: 532, y: 411 }];
  const r2 = [{ x: 405, y: 432 }, { x: 424, y: 432 }, { x: 424, y: 448 }, { x: 994, y: 448 }, { x: 994, y: 412 }, { x: 1102, y: 412 }];
  const r3 = [{ x: 976, y: 365 }, { x: 1102, y: 365 }];
  const r4 = [{ x: 975, y: 182 }, { x: 994, y: 182 }, { x: 994, y: 318 }, { x: 1102, y: 318 }];
  it("keeps every label off every node box and off the other labels and edges", () => {
    const routes = [r1, r2, r3, r4];
    const placed: Rect[] = [];
    routes.forEach((r, i) => {
      const l = placeLabel(r, 60, 13, [], { nodes, containers: [design], routes: routes.filter((x) => x !== r), labels: placed });
      for (const n of nodes) {
        const grown = { x: n.x - 2, y: n.y - 2, w: n.w + 4, h: n.h + 4 };
        if (n === design) expect(l.x >= n.x && l.y >= n.y && l.x + l.w <= n.x + n.w && l.y + l.h <= n.y + n.h, `label ${i} inside the package`).toBe(true);
        else expect(rectsOverlap(l, grown), `label ${i} vs node at ${n.x},${n.y}`).toBe(false);
      }
      for (const o of placed) expect(rectsOverlap(l, o)).toBe(false);
      expect(labelOnRoute(l, r)).toBe(false);
      placed.push(l);
    });
  });
});

interface Rect { x: number; y: number; w: number; h: number }

describe("edges do not run on top of each other", () => {
  // The general view of ports-general.sysmld after the move (canvas px): Drivetrain, battery, Battery, Motor, Power.
  const drivetrain = { x: 48, y: 48, w: 440, h: 300 };
  const battery = { x: 728, y: 88, w: 226, h: 100 };
  const batteryDef = { x: 48, y: 488, w: 196, h: 168 };
  const motor = { x: 568, y: 488, w: 182, h: 168 };
  const power = { x: 1136, y: 144, w: 180, h: 100 };
  const compositionRoute = routeOrthogonal(drivetrain, battery, undefined, undefined, [batteryDef, motor, power]);
  it("routes the composition straight between Drivetrain and battery", () => {
    expect(compositionRoute).toHaveLength(2);
  });
  it("leaves battery for Battery on another line, not through Motor", () => {
    const typing = routeOrthogonal(battery, batteryDef, undefined, undefined, [drivetrain, motor, power], [compositionRoute]);
    expect(overlapsWith(typing, [compositionRoute])).toBe(0);
    expect(isOrthogonal(typing)).toBe(true);
    expect(routeThroughBox(typing, motor)).toBe(false);
    expect(routeThroughBox(typing, drivetrain)).toBe(false);
    expect(routeThroughBox(typing, battery)).toBe(false);
    expect(routeThroughBox(typing, batteryDef)).toBe(false);
    expect(typing[0]!.x === battery.x).toBe(false); // not the left side, where the composition arrives
    const last = typing[typing.length - 1]!;
    expect(last.y === batteryDef.y || last.x === batteryDef.x + batteryDef.w).toBe(true);
    for (let i = 1; i < typing.length; i++) for (let j = 1; j < compositionRoute.length; j++)
      expect(collinearOverlap(typing[i - 1]!, typing[i]!, compositionRoute[j - 1]!, compositionRoute[j]!)).toBeLessThanOrEqual(4);
  });
});
