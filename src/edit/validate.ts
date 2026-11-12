import { defaultDocumentParser, type ModelIndex } from "../model/index.js";
import { applyEdits, groupByUri } from "./text.js";
import { fail, type PlanResult } from "./types.js";

function nameOf(uri: string): string {
  return decodeURIComponent(uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri);
}

/**
 * Apply the plan's edits to copies of the texts, re-parse every changed document with the real
 * parser, and reject the plan when a changed document has more syntax errors than before. Every
 * planner entry point calls this before returning `ok: true`.
 */
export function validatePlan(index: ModelIndex, plan: PlanResult): PlanResult {
  if (!plan.ok) return plan;
  for (const [uri, edits] of groupByUri(plan.edits)) {
    const state = index.getDocument(uri);
    if (!state) return fail(`${nameOf(uri)} is not loaded, so the edit cannot be checked.`);
    if (index.isReadOnly(uri)) return fail(`${nameOf(uri)} is read-only library content.`);
    let text: string;
    try {
      text = applyEdits(state.text, edits);
    } catch (e) {
      return fail(`The planned edits for ${nameOf(uri)} conflict (${(e as Error).message}); nothing was changed.`);
    }
    let errors;
    try {
      errors = defaultDocumentParser(uri, text).errors;
    } catch (e) {
      return fail(`The edited ${nameOf(uri)} could not be parsed (${String(e)}); nothing was changed.`);
    }
    if (errors.length > state.errors.length) {
      const e = errors[0]!;
      return fail(`The edit would leave a syntax error in ${nameOf(uri)} at ${e.line + 1}:${e.column + 1} (${e.message.split(" expecting")[0]}); nothing was changed.`);
    }
  }
  return plan;
}
