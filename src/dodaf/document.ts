/** Writes the DoDAF document from rendered sections (D80). Pure; no `vscode` import. */
import { VIEWS, VIEW_IDS, type ViewId } from "./mapping.js";

export interface DocumentSection {
  id: ViewId;
  /** Rendered table or tree Markdown, when the view has one. */
  markdown?: string;
  /** Path of the view's image relative to the document, e.g. `images/OV-1.svg`. */
  image?: string;
  /** Why the view was left out (e.g. diagram view unavailable). */
  skipped?: string;
  /** Narrative text (e.g. package documentation). */
  narrative?: string;
}

export const EMPTY_VIEW_TEXT = "_No model elements for this view._";

/** Markdown for `sections` in DoDAF order, titled `title`. Views without a section are omitted. */
export function writeDocument(title: string, sections: readonly DocumentSection[]): string {
  const parts = [`# ${title}`];
  for (const id of VIEW_IDS) {
    const s = sections.find((x) => x.id === id);
    if (!s) continue;
    const view = VIEWS.find((v) => v.id === id)!;
    parts.push(`## ${id} ${view.title}`);
    if (s.skipped) {
      parts.push(`_Skipped: ${s.skipped}_`);
      continue;
    }
    const body: string[] = [];
    if (s.narrative?.trim()) body.push(s.narrative.trim());
    if (s.image) body.push(`![${id} ${view.title}](${s.image})`);
    if (s.markdown?.trim()) body.push(s.markdown.trim());
    parts.push(body.length ? body.join("\n\n") : EMPTY_VIEW_TEXT);
  }
  return parts.join("\n\n") + "\n";
}
