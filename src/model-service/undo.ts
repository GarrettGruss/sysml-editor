/**
 * Undo and redo of a model edit as new text edits, computed from the plan and validated against the
 * current text (design D6). `vscode`-free.
 */
import { applyEdits, groupByUri, type TextEdit } from "../edit/index.js";

/** What one model edit did to the text: enough to reverse and repeat it. */
export interface EditRecord {
  /** The edits as planned, against `before`. */
  edits: TextEdit[];
  before: ReadonlyMap<string, string>;
  after: ReadonlyMap<string, string>;
}

export function makeRecord(edits: readonly TextEdit[], before: ReadonlyMap<string, string>): EditRecord {
  const after = new Map<string, string>();
  const base = new Map<string, string>();
  for (const [uri, es] of groupByUri([...edits])) {
    const text = before.get(uri) ?? "";
    base.set(uri, text);
    after.set(uri, applyEdits(text, es));
  }
  return { edits: [...edits], before: base, after };
}

/** The edits that turn `after` back into `before`: each planned edit, shifted by the edits before it. */
export function inverseEdits(rec: EditRecord): TextEdit[] {
  const out: TextEdit[] = [];
  for (const [uri, es] of groupByUri(rec.edits)) {
    const text = rec.before.get(uri) ?? "";
    const sorted = es.map((e, i) => ({ e, i })).sort((a, b) => a.e.range.start - b.e.range.start || a.e.range.end - b.e.range.end || a.i - b.i).map((x) => x.e);
    let delta = 0;
    for (const e of sorted) {
      const start = e.range.start + delta;
      out.push({ uri, range: { start, end: start + e.newText.length }, newText: text.slice(e.range.start, e.range.end) });
      delta += e.newText.length - (e.range.end - e.range.start);
    }
  }
  return out;
}

export type UndoPlan = { ok: true; edits: TextEdit[]; expected: Map<string, string> } | { ok: false; reason: string };

function name(uri: string): string {
  return decodeURIComponent(uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri);
}

/** The text to revert, or why it cannot be: every touched document must still be exactly as the edit left it. */
export function planUndo(rec: EditRecord, current: ReadonlyMap<string, string | undefined>): UndoPlan {
  for (const [uri, after] of rec.after) {
    if (current.get(uri) !== after) return { ok: false, reason: `${name(uri)} was changed after the edit, so the edit cannot be reverted automatically.` };
  }
  return { ok: true, edits: inverseEdits(rec), expected: new Map(rec.before) };
}

/** The edits to repeat: every touched document must be exactly as it was before the edit. */
export function planRedo(rec: EditRecord, current: ReadonlyMap<string, string | undefined>): UndoPlan {
  for (const [uri, before] of rec.before) {
    if (current.get(uri) !== before) return { ok: false, reason: `${name(uri)} was changed since the edit was undone, so the edit cannot be repeated automatically.` };
  }
  return { ok: true, edits: rec.edits, expected: new Map(rec.after) };
}
