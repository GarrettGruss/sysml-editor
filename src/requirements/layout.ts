/** Layout decisions of the requirements webview, kept free of the DOM so they can be tested. */

/** Below this panel width (px) each requirement is drawn as a stacked card instead of a table row. */
export const CARD_BELOW = 520;
/** From this panel width (px) the detail pane sits beside the table, below it otherwise. */
export const DETAIL_BESIDE_FROM = 1000;
/** Widths a test may force (px); anything else is rejected. */
export const MIN_TEST_WIDTH = 200;
export const MAX_TEST_WIDTH = 4000;

export interface RequirementsLayout {
  mode: "table" | "card";
  detail: "beside" | "below";
}

export function layoutFor(panelWidth: number): RequirementsLayout {
  return { mode: panelWidth < CARD_BELOW ? "card" : "table", detail: panelWidth >= DETAIL_BESIDE_FROM ? "beside" : "below" };
}

/** A forced width, or undefined (no override) for null and for values that are not a sensible width. */
export function parseTestWidth(w: unknown): number | undefined {
  return typeof w === "number" && Number.isFinite(w) && w >= MIN_TEST_WIDTH && w <= MAX_TEST_WIDTH ? Math.round(w) : undefined;
}
