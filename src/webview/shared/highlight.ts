/**
 * The tutor overlay (D63, D65, D66): a dimmed spotlight over one element and a callout with a close button. Shared by the
 * diagram and requirements webviews. Agent text is only ever set with `textContent`. The DOM is reached through a small
 * interface so a unit test can use a fake.
 */

export const CALLOUT_MAX = 280;

export const truncateText = (t: string): string => (t.length > CALLOUT_MAX ? t.slice(0, CALLOUT_MAX - 3) + "..." : t);

export interface Box { left: number; top: number; width: number; height: number }

export interface OverlayEl {
  textContent: string | null;
  style: Record<string, string>;
  setAttribute(name: string, value: string): void;
  append(...children: OverlayEl[]): void;
  remove(): void;
  addEventListener(type: string, fn: () => void): void;
}

export interface OverlayEnv {
  create(tag: string): OverlayEl;
  /** Where the overlay is attached. */
  attach(el: OverlayEl): void;
  /** The element for a target, or undefined when it is not (or no longer) in the page. */
  find(target: HighlightSpec): Box | undefined;
  viewport(): { width: number; height: number };
}

export interface HighlightSpec { node?: string; selector?: string }

/** Where the callout goes: below the target when there is room, else above, kept inside the viewport. */
export function calloutPosition(box: Box, view: { width: number; height: number }, calloutW = 280, calloutH = 90): { left: number; top: number } {
  const below = box.top + box.height + 8;
  const top = below + calloutH <= view.height ? below : Math.max(4, box.top - calloutH - 8);
  const left = Math.min(Math.max(4, box.left), Math.max(4, view.width - calloutW - 4));
  return { left, top };
}

export class Highlighter {
  private els: OverlayEl[] = [];
  private spec: HighlightSpec | undefined;
  private text = "";
  constructor(private readonly env: OverlayEnv) {}

  get active(): boolean { return this.spec !== undefined; }

  /** Draw the overlay for a target; returns an error text when the target is not in the page. */
  show(spec: HighlightSpec, text: string): string | undefined {
    this.clear();
    const box = this.env.find(spec);
    if (!box) return "The target was not found in the page.";
    this.spec = spec;
    this.text = truncateText(text);
    this.draw(box);
    return undefined;
  }

  private draw(box: Box): void {
    this.removeEls();
    const { create, attach, viewport } = { create: (t: string) => this.env.create(t), attach: (e: OverlayEl) => this.env.attach(e), viewport: () => this.env.viewport() };
    const spot = create("div");
    spot.setAttribute("data-testid", "tutor-spotlight");
    Object.assign(spot.style, {
      position: "fixed", left: `${box.left - 4}px`, top: `${box.top - 4}px`, width: `${box.width + 8}px`, height: `${box.height + 8}px`,
      boxShadow: "0 0 0 100vmax rgba(0,0,0,0.5)", border: "2px solid #ffb000", borderRadius: "4px", pointerEvents: "none", zIndex: "2147483000",
    });
    const pos = calloutPosition(box, viewport());
    const callout = create("div");
    callout.setAttribute("data-testid", "tutor-callout");
    callout.setAttribute("role", "dialog");
    Object.assign(callout.style, {
      position: "fixed", left: `${pos.left}px`, top: `${pos.top}px`, maxWidth: "280px", padding: "8px 28px 8px 10px", background: "#fffbe6", color: "#1b1b1b",
      border: "1px solid #ffb000", borderRadius: "4px", font: "13px sans-serif", zIndex: "2147483001", boxSizing: "border-box",
    });
    const body = create("span");
    body.textContent = this.text;
    const close = create("button");
    close.setAttribute("data-testid", "tutor-close");
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    Object.assign(close.style, { position: "absolute", right: "2px", top: "2px", border: "none", background: "transparent", cursor: "pointer", fontSize: "16px", color: "#1b1b1b" });
    close.addEventListener("click", () => this.clear());
    callout.append(body, close);
    attach(spot);
    attach(callout);
    this.els = [spot, callout];
  }

  /** Re-measure after a resize or a DOM change; a missing target clears the highlight (D65). */
  refresh(): void {
    if (!this.spec) return;
    const box = this.env.find(this.spec);
    if (!box) this.clear();
    else this.draw(box);
  }

  /** Esc clears; returns whether it did. */
  key(k: string): boolean {
    if (k !== "Escape" || !this.spec) return false;
    this.clear();
    return true;
  }

  clear(): void {
    this.removeEls();
    this.spec = undefined;
  }

  private removeEls(): void {
    for (const e of this.els) e.remove();
    this.els = [];
  }
}

/** The real DOM environment. `resolve` maps a spec to an element. */
export function domEnv(resolve: (spec: HighlightSpec) => Element | null): OverlayEnv {
  return {
    create: (tag) => document.createElement(tag) as unknown as OverlayEl,
    attach: (el) => document.body.appendChild(el as unknown as Node),
    find: (spec) => {
      let el: Element | null = null;
      try {
        el = resolve(spec);
      } catch {
        el = null; // an invalid selector
      }
      if (!el) return undefined;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
  };
}

/** Wire Esc, resize and DOM changes to a highlighter; the page calls `refresh` from its own state refresh too. */
export function bindHighlighter(h: Highlighter, root: Node): void {
  window.addEventListener("keydown", (e) => { if (h.key(e.key)) e.preventDefault(); });
  window.addEventListener("resize", () => h.refresh());
  let queued = false;
  new MutationObserver(() => {
    if (!h.active || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; h.refresh(); });
  }).observe(root, { childList: true, subtree: true, attributes: true });
}
