import type { DocumentState, Element, ModelIndex } from "../model/index.js";
import { fail, type PlanFailure } from "./types.js";

export type Checked = { ok: true; state: DocumentState } | PlanFailure;

function shortMessage(m: string): string {
  const cut = m.split(" expecting")[0]!.trim();
  return cut.length > 100 ? cut.slice(0, 97) + "..." : cut;
}

function nameOf(uri: string): string {
  const base = uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

/**
 * Whether the document may be edited: known, not read-only library content, not pending,
 * not stale and free of syntax errors. A valid file with constructs the tools do not display is fine.
 */
export function checkDocument(index: ModelIndex, uri: string): Checked {
  const state = index.getDocument(uri);
  if (!state) return fail(`${nameOf(uri)} is not loaded in the model, so it cannot be edited.`);
  if (index.isReadOnly(uri)) return fail(`${nameOf(uri)} is standard library content and is read-only.`);
  if (/\.kerml$/i.test(uri.split(/[?#]/, 1)[0]!)) return fail(`${nameOf(uri)} is a KerML file; editing KerML files is not supported.`);
  if (state.detailsPending) return fail(`${nameOf(uri)} is still being checked for syntax errors; try again in a moment.`);
  if (state.errors.length > 0 || state.stale) {
    const e = state.errors[0];
    const where = e ? ` at ${nameOf(uri)}:${e.line + 1}:${e.column + 1} (${uri}#L${e.line + 1},${e.column + 1}): ${shortMessage(e.message)}` : "";
    return fail(`${nameOf(uri)} has a syntax error${where}. Fix the error before editing the model; no text was changed.`);
  }
  return { ok: true, state };
}

/** `checkDocument` for the element's document, plus a check that the element belongs to its current model. */
export function checkElement(index: ModelIndex, el: Element): Checked {
  const c = checkDocument(index, el.uri);
  if (!c.ok) return c;
  let root = el;
  while (root.owner) root = root.owner;
  if (!c.state.model.roots.includes(root)) return fail(`The element is out of date (${nameOf(el.uri)} changed since it was read); refresh and try again.`);
  return c;
}

export function describeElement(el: Element): string {
  return el.qualifiedName ?? (el.name !== undefined ? el.name : `unnamed ${el.kind}`);
}

export function describeLocation(el: Element): string {
  return `${nameOf(el.uri)}:${el.range.start.line + 1}:${el.range.start.column + 1}`;
}
