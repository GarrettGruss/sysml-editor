import { defaultDocumentParser, type Element, type ModelIndex } from "../model/index.js";
import { sourceOf } from "./hash.js";
import { snapshotResolutions, resolutionKey, type Decl, type Snapshot } from "./refscan.js";
import { applyEdits, groupByUri, positionOf } from "./text.js";
import { fail, type PlanResult, type PlanSource, type TextEdit } from "./types.js";

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
  // Remember the exact texts the plan is computed from (`isPlanCurrent`).
  const sources = new Map<string, PlanSource>();
  for (const s of plan.sources ?? []) sources.set(s.uri, s);
  for (const uri of [...plan.edits.map((e) => e.uri), ...(plan.reads ?? [])]) {
    const st = index.getDocument(uri);
    if (st && !sources.has(uri)) sources.set(uri, sourceOf(uri, st.text));
  }
  plan.sources = [...sources.values()];
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

// ---------------------------------------------------------------------------- resolution check

export interface ResolutionExpectations {
  /** Only references written inside this element (and merged declarations of it) are checked; default: all documents. */
  within?: Element;
  /** The snapshot of the unedited index, when the caller already has it (saves one pass over all references). */
  before?: Snapshot;
}

/** Position after the edits; undefined when the position is inside text the edits remove or replace. */
function mapOffset(edits: readonly TextEdit[], off: number): number | undefined {
  let delta = 0;
  for (const e of edits) {
    const { start, end } = e.range;
    if (end <= off) {
      delta += e.newText.length - (end - start);
    } else if (start <= off && off < end) {
      if (off === start && e.newText !== "") continue; // a replaced name keeps its start
      return undefined;
    }
  }
  return off + delta;
}

function fileOf(uri: string): string {
  const base = uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

/**
 * The semantic safety net for plans that parse but may mean something else. Records what every
 * resolvable reference resolves to now (by declaration position, mapped through the edits), applies the
 * plan to a scratch copy of the index (only the changed documents are parsed again) and resolves
 * everything again. A reference that now resolves to a different element, or no longer resolves,
 * refuses the plan; the reason names the first few with file and line.
 */
export function checkResolutionPreserved(index: ModelIndex, plan: PlanResult, expectations: ResolutionExpectations = {}): PlanResult {
  if (!plan.ok) return plan;
  const byUri = groupByUri(plan.edits);
  const texts = new Map<string, string>();
  for (const [uri, edits] of byUri) {
    const st = index.getDocument(uri);
    if (!st) return fail(`${fileOf(uri)} is not loaded, so the edit cannot be checked.`);
    try {
      texts.set(uri, applyEdits(st.text, edits));
    } catch (e) {
      return fail(`The planned edits for ${fileOf(uri)} conflict (${(e as Error).message}); nothing was changed.`);
    }
  }
  const before = expectations.before ?? snapshotResolutions(index, expectations.within);
  const scratch = index.withTexts(texts);
  const after = snapshotResolutions(scratch, expectations.within);
  const minKey = (ds: Decl[]) => ds.map((d) => `${d.uri}\0${String(d.off).padStart(10, "0")}`).sort()[0]!;
  const problems: string[] = [];
  for (const [k, b] of before) {
    const seg = Number(k.split("\0")[2]);
    const tok = mapOffset(byUri.get(b.uri) ?? [], b.tok);
    if (tok === undefined) continue;
    const mapped: Decl[] = [];
    let gone = false;
    for (const d of b.decls) {
      const o = mapOffset(byUri.get(d.uri) ?? [], d.off);
      if (o === undefined) gone = true;
      else mapped.push({ uri: d.uri, off: o });
    }
    if (gone) continue; // the plan removes what it pointed at
    const a = after.get(resolutionKey(b.uri, tok, seg));
    const where = `${fileOf(b.uri)}:${b.line + 1}`;
    if (!a) problems.push(`'${b.text}' at ${where} would no longer resolve (it resolves to ${b.desc} now)`);
    else if (minKey(a.decls) !== minKey(mapped)) problems.push(`'${b.text}' at ${where} would resolve to ${a.desc} instead of ${b.desc}`);
  }
  if (problems.length) {
    const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : "";
    return fail(`The edit would change what existing names refer to: ${problems.slice(0, 3).join("; ")}${more}. Nothing was changed.`);
  }
  return plan;
}
