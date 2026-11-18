import { describe, expect, it } from "vitest";
import { CALLOUT_MAX, Highlighter, calloutPosition, type Box, type OverlayEl, type OverlayEnv } from "./highlight.js";

class El implements OverlayEl {
  textContent: string | null = null;
  style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  children: El[] = [];
  listeners: Record<string, () => void> = {};
  removed = false;
  constructor(public tag: string) {}
  setAttribute(n: string, v: string) { this.attrs[n] = v; }
  append(...c: OverlayEl[]) { this.children.push(...(c as El[])); }
  remove() { this.removed = true; }
  addEventListener(t: string, f: () => void) { this.listeners[t] = f; }
}

function setup() {
  const attached: El[] = [];
  let box: Box | undefined = { left: 100, top: 50, width: 40, height: 20 };
  const env: OverlayEnv = {
    create: (t) => new El(t),
    attach: (e) => attached.push(e as El),
    find: () => box,
    viewport: () => ({ width: 800, height: 600 }),
  };
  return { h: new Highlighter(env), attached, setBox: (b: Box | undefined) => { box = b; } };
}

describe("Highlighter", () => {
  it("renders agent text as plain text only", () => {
    const { h, attached } = setup();
    expect(h.show({ node: "n" }, "<img src=x onerror=alert(1)> hello")).toBeUndefined();
    const callout = attached.find((e) => e.attrs["data-testid"] === "tutor-callout")!;
    expect(callout.children[0]!.textContent).toBe("<img src=x onerror=alert(1)> hello");
    expect(callout.children.every((c) => c.tag === "span" || c.tag === "button")).toBe(true);
    expect(attached.find((e) => e.attrs["data-testid"] === "tutor-spotlight")!.style["pointerEvents"]).toBe("none");
  });

  it("truncates the text to 280 characters", () => {
    const { h, attached } = setup();
    h.show({ node: "n" }, "z".repeat(1000));
    expect(attached.find((e) => e.attrs["data-testid"] === "tutor-callout")!.children[0]!.textContent).toHaveLength(CALLOUT_MAX);
  });

  it("clears on Esc, on the close button, and when the target is lost", () => {
    const { h, attached, setBox } = setup();
    h.show({ node: "n" }, "t");
    expect(h.key("a")).toBe(false);
    expect(h.key("Escape")).toBe(true);
    expect(h.active).toBe(false);
    expect(attached.every((e) => e.removed)).toBe(true);

    h.show({ node: "n" }, "t");
    attached.find((e) => e.attrs["data-testid"] === "tutor-callout")!.children.find((c) => c.tag === "button")!.listeners["click"]!();
    expect(h.active).toBe(false);

    h.show({ node: "n" }, "t");
    setBox(undefined);
    h.refresh();
    expect(h.active).toBe(false);
  });

  it("reports a missing target and draws nothing", () => {
    const { h, attached, setBox } = setup();
    setBox(undefined);
    expect(h.show({ selector: "#nope" }, "t")).toMatch(/not found/);
    expect(attached).toHaveLength(0);
  });

  it("keeps the callout inside the viewport", () => {
    const p = calloutPosition({ left: 790, top: 580, width: 10, height: 10 }, { width: 800, height: 600 });
    expect(p.left).toBeLessThanOrEqual(800 - 280 - 4);
    expect(p.top).toBeLessThan(580);
  });
});
