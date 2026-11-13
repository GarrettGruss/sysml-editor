import { describe, expect, it } from "vitest";
import type { DiagramEdit } from "../../diagram/protocol.js";
import type { Box } from "./geometry.js";
import { GRID, Interaction, Scene, handleAt, hitTest, planMove, planResize, rubberBand, snap, tabOrder, type InteractionHost, type PointerInput, type SceneItem } from "./interaction.js";

/** A container (parent) with a child and a port, plus a free node. Absolute origin of the container is (100, 100). */
function scene(): Scene {
  const item = (id: string, rel: Box, abs: Box, extra: Partial<SceneItem> = {}): SceneItem => ({ id, rel, abs, min: { w: 60, h: 40 }, headerH: 30, ...extra });
  return new Scene([
    item("box", { x: 100, y: 100, w: 400, h: 300 }, { x: 100, y: 100, w: 400, h: 300 }, { min: { w: 250, h: 150 } }),
    item("kid", { x: 40, y: 80, w: 120, h: 60 }, { x: 140, y: 180, w: 120, h: 60 }, { parent: "box" }),
    item("free", { x: 600, y: 100, w: 100, h: 60 }, { x: 600, y: 100, w: 100, h: 60 }),
    item("port", { x: 393, y: 100, w: 14, h: 14 }, { x: 493, y: 200, w: 14, h: 14 }, { owner: "box", min: { w: 14, h: 14 } }),
  ]);
}

describe("snap", () => {
  it("rounds to the 8 px grid", () => {
    expect(snap(13)).toBe(16);
    expect(snap(11)).toBe(8);
    expect(snap(-3)).toBe(-0);
    expect(GRID).toBe(8);
  });
});

describe("hit testing", () => {
  it("finds the topmost item, ports first, and nothing on the background", () => {
    const s = scene();
    expect(hitTest(s, { x: 150, y: 200 })).toBe("kid");
    expect(hitTest(s, { x: 450, y: 350 })).toBe("box");
    expect(hitTest(s, { x: 500, y: 206 })).toBe("port");
    expect(hitTest(s, { x: 5, y: 5 })).toBeUndefined();
  });
  it("finds resize handles on the outline", () => {
    expect(handleAt({ x: 100, y: 100, w: 400, h: 300 }, { x: 500, y: 400 })).toBe("se");
    expect(handleAt({ x: 100, y: 100, w: 400, h: 300 }, { x: 300, y: 250 })).toBeUndefined();
  });
});

describe("planMove", () => {
  it("moves a container without listing its children (they follow), snapped to the grid", () => {
    const p = planMove(scene(), ["box", "kid", "port"], 13, 11);
    expect([...p.keys()]).toEqual(["box"]);
    expect(p.get("box")).toEqual({ x: 112, y: 112 });
  });
  it("keeps a child inside its container", () => {
    const left = planMove(scene(), ["kid"], -500, -500).get("kid")!;
    expect(left.x).toBe(10);
    expect(left.y).toBe(40); // header 30 + padding 10
    const right = planMove(scene(), ["kid"], 900, 900).get("kid")!;
    expect(right.x + 120).toBeLessThanOrEqual(400 - 10);
    expect(right.y + 60).toBeLessThanOrEqual(300 - 10);
  });
  it("slides a port along its owner's border and flips sides, staying on the border", () => {
    const down = planMove(scene(), ["port"], 0, 40).get("port")!;
    expect(down.x).toBe(400 - 7);
    expect(down.y).toBe(144);
    const left = planMove(scene(), ["port"], -300, 0).get("port")!;
    expect(left.x).toBe(-7);
    const below = planMove(scene(), ["port"], 0, 5000).get("port")!;
    expect(below.y).toBe(300 - 14);
    const above = planMove(scene(), ["port"], 0, -5000).get("port")!;
    expect(above.y).toBe(30);
  });
});

describe("planResize", () => {
  it("resizes by a handle, snapped, and moves ports with the border", () => {
    const p = planResize(scene(), "box", "se", 51, 29);
    expect(p.get("box")).toEqual({ x: 100, y: 100, w: 452, h: 332 });
    expect(p.get("port")).toEqual({ x: 452 - 7, y: 100 });
    expect(p.has("kid")).toBe(false);
  });
  it("never goes below the content size or lets a container shrink under its children", () => {
    const p = planResize(scene(), "box", "se", -1000, -1000).get("box")!;
    expect(p.w!).toBeGreaterThanOrEqual(250);
    expect(p.h!).toBeGreaterThanOrEqual(150);
    expect(p.x + p.w!).toBeGreaterThanOrEqual(100 + 160 + 10 + 0); // kid right edge at rel 160 + padding
    expect(p.h!).toBeGreaterThanOrEqual(80 + 60 + 10);
  });
  it("keeps nested nodes where they are when the top-left corner moves", () => {
    const p = planResize(scene(), "box", "nw", -20, -28);
    expect(p.get("box")).toEqual({ x: 80, y: 72, w: 420, h: 328 });
    expect(p.get("kid")).toEqual({ x: 60, y: 108 });
  });
  it("does not resize a port, and stays inside the parent", () => {
    expect(planResize(scene(), "port", "e", 10, 0).size).toBe(0);
    const grow = planResize(scene(), "kid", "se", 5000, 5000).get("kid")!;
    expect(grow.x + grow.w!).toBeLessThanOrEqual(400 - 10);
    expect(grow.y + grow.h!).toBeLessThanOrEqual(300 - 10);
  });
});

describe("rubber band and tab order", () => {
  it("selects what lies completely inside", () => {
    expect(rubberBand(scene(), { x: 90, y: 90, w: 430, h: 330 }).sort()).toEqual(["box", "kid", "port"]);
    expect(rubberBand(scene(), { x: 130, y: 170, w: 140, h: 80 })).toEqual(["kid"]);
  });
  it("orders by reading position", () => {
    expect(tabOrder(scene())).toEqual(["box", "free", "kid", "port"]);
  });
});

function setup() {
  const edits: DiagramEdit[] = [];
  const selections: string[][] = [];
  const previews: (Map<string, Box> | undefined)[] = [];
  const pans: [number, number][] = [];
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let tid = 0;
  const menus: string[] = [];
  const host: InteractionHost = {
    onSelection: (ids) => selections.push(ids),
    onPreview: (b) => previews.push(b),
    onEdit: (e) => edits.push(e),
    onPan: (dx, dy) => pans.push([dx, dy]),
    onPanEnd: () => {},
    onMenu: (id) => menus.push(id),
    zoom: () => 1,
    setTimer: (fn, ms) => { const t = { fn, ms, id: ++tid }; timers.push(t); return t.id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
  };
  const ia = new Interaction(host);
  ia.setScene(scene());
  const ptr = (x: number, y: number, o: Partial<PointerInput> = {}): PointerInput => ({ x, y, sx: x, sy: y, button: 0, shift: false, mod: false, space: false, ...o });
  return { ia, edits, selections, previews, pans, timers, menus, ptr };
}

describe("Interaction", () => {
  it("selects on click, multi-selects with shift and clears with Escape", () => {
    const t = setup();
    t.ia.pointerDown(t.ptr(600, 120)); t.ia.pointerUp(t.ptr(600, 120));
    expect(t.ia.selection).toEqual(["free"]);
    t.ia.pointerDown(t.ptr(150, 200, { shift: true })); t.ia.pointerUp(t.ptr(150, 200));
    expect(t.ia.selection.sort()).toEqual(["free", "kid"]);
    t.ia.pointerDown(t.ptr(600, 120, { shift: true })); t.ia.pointerUp(t.ptr(600, 120));
    expect(t.ia.selection).toEqual(["kid"]);
    expect(t.ia.keyDown({ key: "Escape", shift: false, mod: false })).toBe(true);
    expect(t.ia.selection).toEqual([]);
    expect(t.edits).toEqual([]);
  });

  it("posts exactly one edit for a drag, however many moves it has", () => {
    const t = setup();
    t.ia.pointerDown(t.ptr(600, 120));
    for (let i = 1; i <= 20; i++) t.ia.pointerMove(t.ptr(600 + i * 3, 120 + i));
    expect(t.edits).toEqual([]);
    t.ia.pointerUp(t.ptr(660, 140));
    expect(t.edits).toEqual([{ kind: "layout", label: "Move", boxes: [{ id: "free", x: 664, y: 120 }] }]);
  });

  it("does not move on a click, and a drag of a child outside its container is held at the edge", () => {
    const t = setup();
    t.ia.pointerDown(t.ptr(150, 200)); t.ia.pointerUp(t.ptr(150, 200));
    expect(t.edits).toEqual([]);
    t.ia.pointerDown(t.ptr(150, 200)); t.ia.pointerMove(t.ptr(-900, 200)); t.ia.pointerUp(t.ptr(-900, 200));
    const e = t.edits[0] as Extract<DiagramEdit, { kind: "layout" }>;
    expect(e.boxes[0]).toEqual({ id: "kid", x: 10, y: 80 });
  });

  it("resizes through a handle with one edit", () => {
    const t = setup();
    t.ia.setSelection(["free"]);
    t.ia.pointerDown(t.ptr(700, 160)); // se handle
    t.ia.pointerMove(t.ptr(740, 190)); t.ia.pointerMove(t.ptr(752, 200));
    t.ia.pointerUp(t.ptr(752, 200));
    expect(t.edits).toEqual([{ kind: "layout", label: "Resize", boxes: [{ id: "free", x: 600, y: 100, w: 152, h: 100 }] }]);
  });

  it("rubber-bands with shift on the background and pans without it", () => {
    const t = setup();
    t.ia.pointerDown(t.ptr(90, 90, { shift: true })); t.ia.pointerMove(t.ptr(520, 420, { shift: true })); t.ia.pointerUp(t.ptr(520, 420, { shift: true }));
    expect(t.ia.selection.sort()).toEqual(["box", "kid", "port"]);
    t.ia.pointerDown(t.ptr(800, 600)); t.ia.pointerMove(t.ptr(790, 590)); t.ia.pointerUp(t.ptr(790, 590));
    expect(t.pans).toEqual([[-10, -10]]);
    expect(t.ia.selection.length).toBe(3); // a pan does not clear the selection
    t.ia.pointerDown(t.ptr(800, 600)); t.ia.pointerUp(t.ptr(800, 600));
    expect(t.ia.selection).toEqual([]);
  });

  it("pans with space-drag even over a node", () => {
    const t = setup();
    t.ia.pointerDown(t.ptr(600, 120, { space: true })); t.ia.pointerMove(t.ptr(620, 120, { space: true })); t.ia.pointerUp(t.ptr(620, 120));
    expect(t.pans).toEqual([[20, 0]]);
    expect(t.edits).toEqual([]);
  });

  it("nudges by one grid step per press and coalesces presses within 500 ms into one edit", () => {
    const t = setup();
    t.ia.setSelection(["free"]);
    t.ia.keyDown({ key: "ArrowRight", shift: false, mod: false });
    t.ia.keyDown({ key: "ArrowRight", shift: false, mod: false });
    t.ia.keyDown({ key: "ArrowDown", shift: false, mod: false });
    expect(t.edits).toEqual([]);
    expect(t.timers).toHaveLength(1);
    expect(t.timers[0]!.ms).toBe(500);
    t.timers[0]!.fn();
    expect(t.edits).toEqual([{ kind: "layout", label: "Nudge", boxes: [{ id: "free", x: 616, y: 108 }] }]);
  });

  it("flushes a pending nudge before the next action", () => {
    const t = setup();
    t.ia.setSelection(["free"]);
    t.ia.keyDown({ key: "ArrowLeft", shift: false, mod: false });
    t.ia.pointerDown(t.ptr(5, 5)); t.ia.pointerUp(t.ptr(5, 5));
    expect(t.edits).toEqual([{ kind: "layout", label: "Nudge", boxes: [{ id: "free", x: 592, y: 100 }] }]);
  });

  it("Delete removes the selection in one edit and Backspace does nothing; Ctrl+A selects all; Tab walks the nodes", () => {
    const t = setup();
    expect(t.ia.keyDown({ key: "Delete", shift: false, mod: false })).toBe(false);
    t.ia.keyDown({ key: "a", shift: false, mod: true });
    expect(t.ia.selection.sort()).toEqual(["box", "free", "kid", "port"]);
    t.ia.setSelection(["kid"]);
    expect(t.ia.keyDown({ key: "Backspace", shift: false, mod: false })).toBe(false);
    expect(t.edits).toEqual([]);
    t.ia.keyDown({ key: "Delete", shift: false, mod: false });
    expect(t.edits).toEqual([{ kind: "remove", ids: ["kid"] }]);
    t.ia.setScene(scene());
    t.ia.setSelection([]);
    t.ia.keyDown({ key: "Tab", shift: false, mod: false });
    expect(t.ia.selection).toEqual(["box"]);
    t.ia.keyDown({ key: "Tab", shift: false, mod: false });
    expect(t.ia.selection).toEqual(["free"]);
    t.ia.keyDown({ key: "Tab", shift: true, mod: false });
    expect(t.ia.selection).toEqual(["box"]);
    expect(t.ia.keyDown({ key: "Tab", shift: true, mod: false })).toBe(false);
  });

  it("drops selected ids that no longer exist when the scene changes", () => {
    const t = setup();
    t.ia.setSelection(["kid", "free"]);
    t.ia.setScene(new Scene(scene().items.filter((i) => i.id !== "kid")));
    expect(t.ia.selection).toEqual(["free"]);
  });
});
