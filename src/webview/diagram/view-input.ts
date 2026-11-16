/** Wheel zoom and arrow-key panning of the canvas. No DOM, so it is unit tested. */

/** Exponent per wheel delta unit: 1.5 times the v0.1.0 value of 0.0015. */
export const WHEEL_ZOOM = 0.0015 * 1.5;
/** Pan distance per arrow key press, in screen px (Shift: `PAN_STEP_LARGE`). */
export const PAN_STEP = 40;
export const PAN_STEP_LARGE = 160;

/** The zoom factor of a wheel event; zooming in and out by the same delta cancel out. */
export const wheelFactor = (deltaY: number): number => Math.exp(-deltaY * WHEEL_ZOOM);

/** How far the view moves for an arrow key (the content follows the arrow's direction), or undefined for any other key. */
export function arrowPan(key: string, shift: boolean): { dx: number; dy: number } | undefined {
  const s = shift ? PAN_STEP_LARGE : PAN_STEP;
  switch (key) {
    case "ArrowLeft": return { dx: s, dy: 0 };
    case "ArrowRight": return { dx: -s, dy: 0 };
    case "ArrowUp": return { dx: 0, dy: s };
    case "ArrowDown": return { dx: 0, dy: -s };
    default: return undefined;
  }
}
