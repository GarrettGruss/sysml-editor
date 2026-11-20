/** Shared table shape and the Markdown and CSV renderers (D78). No `vscode` import. */

/** A model problem a table builder found; the generator report lists it (D79). */
export interface Gap {
  view: string;
  /** Qualified name of the element at fault, when there is one. */
  element?: string;
  message: string;
}

export interface Table {
  columns: string[];
  rows: string[][];
  gaps: Gap[];
}

/** Escapes model text for Markdown: no HTML, links, images or table breaks come out of it. Newlines are kept. */
export function escapeMd(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\|/g, "\\|")
    .replace(/^!/, "\\!");
}

function mdCell(s: string): string {
  const lead = /^ */.exec(s)![0].length;
  return "&nbsp;".repeat(lead) + escapeMd(s.slice(lead)).replace(/\r?\n/g, "<br>");
}

/** A GitHub-style Markdown table. Pipes are escaped, newlines become `<br>`, leading spaces survive as `&nbsp;`. */
export function renderMarkdown(table: Table): string {
  const head = `| ${table.columns.map(mdCell).join(" | ")} |`;
  const sep = `| ${table.columns.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map((r) => `| ${table.columns.map((_, i) => mdCell(r[i] ?? "")).join(" | ")} |`);
  return [head, sep, ...rows].join("\n") + "\n";
}

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with CRLF line ends. */
export function renderCsv(table: Table): string {
  return [table.columns, ...table.rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
