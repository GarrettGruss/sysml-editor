/** The document view as Markdown for agents: generated numbers, a table of contents, and qualified-name markers. No `vscode`. */
import { sectionLabel, type DocumentModel, type Section, type SectionBlock } from "./document-model.js";

/** Characters kept in one result; the note says how to read the rest. */
export const DOCUMENT_CHAR_CAP = 60000;

/** Model text is untrusted: it must not be able to forge a marker. */
const safe = (s: string) => s.replace(/<!--/g, "&lt;!--").replace(/-->/g, "--&gt;");
const marker = (qn: string) => `<!-- qn: ${safe(qn)} -->`;
const oneLine = (s: string) => safe(s.replace(/\s+/g, " ").trim());

function blockLines(b: SectionBlock): string[] {
  if (b.kind === "paragraph") return [safe(b.text), ""];
  if (b.kind === "elements") return [`Model elements: ${b.items.map((i) => `${i.kind} ${oneLine(i.name)}`).join(", ")}`, ""];
  const i = b.info;
  const head = `**${oneLine([i.shortName, i.name].filter((x) => x !== undefined).join(" ") || "(unnamed requirement)")}** (${i.kind}) ${marker(i.qualifiedName)}`;
  const out = [head, ""];
  if (i.text) out.push(safe(i.text), "");
  const rel = [
    ["Satisfied by", b.summary.satisfiedBy],
    ["Verified by", b.summary.verifiedBy],
    ["Derived from", b.summary.derivedFrom],
    ["Derives", b.summary.derives],
  ] as const;
  for (const [label, names] of rel) if (names.length) out.push(`- ${label}: ${names.map(oneLine).join(", ")}`);
  if (rel.some(([, n]) => n.length)) out.push("");
  return out;
}

function sectionLines(s: Section, out: string[]): void {
  out.push(`${"#".repeat(Math.min(6, s.level + 1))} ${oneLine(sectionLabel(s))} ${marker(s.qualifiedName)}`, "");
  for (const b of s.blocks) out.push(...blockLines(b));
  for (const c of s.children) sectionLines(c, out);
}

export function documentToMarkdown(doc: DocumentModel, cap = DOCUMENT_CHAR_CAP): { text: string; truncated: boolean } {
  const out: string[] = [`# ${oneLine(doc.title)} ${marker(doc.qualifiedName)}`, ""];
  if (doc.version) out.push(`Version ${oneLine(doc.version)}`, "");
  const sections = doc.toc.filter((t) => t.kind === "section");
  if (sections.length) {
    out.push("## Table of contents", "");
    for (const t of sections) out.push(`${"  ".repeat(t.level - 1)}- ${oneLine(sectionLabel(t))}`);
    out.push("");
  }
  for (const b of doc.blocks) out.push(...blockLines(b));
  for (const s of [...doc.sections, ...doc.appendices]) sectionLines(s, out);
  let text = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  if (text.length <= cap) return { text, truncated: false };
  text = text.slice(0, cap);
  text = text.slice(0, text.lastIndexOf("\n") + 1);
  return { text: text + `\n[Truncated at ${cap} characters. Request a nested package (its qualified name is in the <!-- qn: --> marker of its heading) to read the rest.]\n`, truncated: true };
}
