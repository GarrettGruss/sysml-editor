/** The verification matrix of the requirements editor webview: rows, cells that link to declarations, summary, filters, export. */
import { filterRows, usagesText, type MatrixFilter, type MatrixLink, type MatrixRow, type MatrixVM } from "../../requirements/matrix-shape.js";
import type { Intent } from "../../requirements/protocol.js";

type Child = Node | string | undefined | false;
export interface MatrixContext {
  h: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string | boolean | undefined>, ...children: Child[]) => HTMLElementTagNameMap[K];
  button: (label: string, testid: string, onClick: () => void, opts?: { title?: string; disabled?: boolean; className?: string }) => HTMLButtonElement;
  intent: (i: Intent) => void;
  filter: MatrixFilter;
  setFilter: (f: MatrixFilter) => void;
  selected: string | undefined;
  select: (qn: string) => void;
}

export const FILTERS: readonly { id: MatrixFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gaps", label: "Gaps" },
  { id: "not satisfied", label: "Not satisfied" },
  { id: "partly satisfied", label: "Partly satisfied" },
  { id: "no verification", label: "No verification" },
  { id: "covered", label: "Covered" },
];

export const summaryText = (m: MatrixVM): string => {
  const s = m.summary;
  return s.total === 0 ? "No requirements" : `${s.total} requirement${s.total === 1 ? "" : "s"}: ${s.covered} covered (${s.percentCovered}%), ${s.noVerification} with no verification, ${s.partlySatisfied} partly satisfied, ${s.notSatisfied} not satisfied`;
};

export function matrixView(m: MatrixVM, c: MatrixContext): HTMLElement {
  const { h } = c;
  const wrap = h("div", { class: "matrix-view", "data-testid": "matrix-view" });
  const bar = h("div", { class: "matrix-bar" }, h("span", { class: "matrix-summary", "data-testid": "matrix-summary" }, summaryText(m)));
  const filters = h("div", { class: "matrix-filters", role: "group", "aria-label": "Show" });
  for (const f of FILTERS) {
    const b = h("button", { type: "button", "data-testid": "filter-" + f.id.replace(/ /g, "-"), "aria-pressed": String(c.filter === f.id), class: c.filter === f.id ? "active" : "" }, f.label);
    b.addEventListener("click", () => c.setFilter(f.id));
    filters.append(b);
  }
  bar.append(filters, h("span", { class: "matrix-export" }, c.button("Export CSV", "export-csv", () => c.intent({ type: "exportMatrix", format: "csv" })), c.button("Export Markdown", "export-markdown", () => c.intent({ type: "exportMatrix", format: "markdown" }))));
  wrap.append(bar);
  const rows = filterRows(m.rows, c.filter);
  if (!m.rows.length) wrap.append(h("p", { class: "empty" }, "No requirements in this scope yet."));
  else if (!rows.length) wrap.append(h("p", { class: "empty", "data-testid": "matrix-none" }, "No requirement matches this filter."));
  const table = h("table", { class: "matrix", "data-testid": "matrix" });
  table.append(h("thead", {}, h("tr", {}, ...["Requirement", "Satisfied by", "Verification method", "Verified by", "Status"].map((t) => h("th", { scope: "col" }, t)))));
  const body = h("tbody");
  for (const r of rows) body.append(r.kind === "section" ? sectionRow(r, c) : requirementRow(r, c));
  table.append(body);
  wrap.append(h("div", { class: "table-scroll" }, table));
  return wrap;
}

function link(l: MatrixLink, c: MatrixContext, remove?: () => void): HTMLElement {
  const { h } = c;
  const name = l.qn ? h("a", { href: "#", class: "mx-link", "data-qn": l.qn, title: `Go to ${l.qn}` }, l.label) : h("span", {}, l.label);
  if (l.qn) name.addEventListener("click", (ev) => {
    ev.preventDefault();
    c.intent({ type: "navigate", qn: l.qn!, to: "text" });
  });
  return h("li", { class: l.via ? "via" : "", "data-testid": "mx-item" }, name, l.via ? h("span", { class: "via-note", title: `Counted from ${l.via}` }, ` via ${l.via}`) : undefined, remove && !l.via ? c.button("x", "mx-remove", remove, { title: `Remove ${l.label}`, className: "icon" }) : undefined);
}

/** Indent by depth through the CSSOM (a style attribute would be blocked by the page's content security policy). */
function indent(cell: HTMLElement, depth: number): void {
  cell.style.paddingLeft = `${6 + depth * 18}px`;
}

function sectionRow(r: MatrixRow, c: MatrixContext): HTMLElement {
  const { h } = c;
  const tr = h("tr", { class: "mx-section", "data-testid": "mx-row", "data-qn": r.qn, "data-kind": "section" }, h("th", { colspan: "5", scope: "rowgroup", "data-depth": String(r.depth) }, h("span", { class: "num" }, r.number + " "), r.name));
  indent(tr.firstElementChild as HTMLElement, r.depth);
  return tr;
}

function requirementRow(r: MatrixRow, c: MatrixContext): HTMLElement {
  const { h } = c;
  const tr = h("tr", { "data-testid": "mx-row", "data-qn": r.qn, "data-kind": "requirement", "data-status": r.status, class: r.qn === c.selected ? "selected" : "", "aria-selected": r.qn === c.selected ? "true" : "false" });
  const name = h("a", { href: "#", class: "mx-link", title: `Go to ${r.qn}` }, [r.id, r.name].filter(Boolean).join(" ") || r.qn);
  name.addEventListener("click", (ev) => {
    ev.preventDefault();
    c.intent({ type: "navigate", qn: r.qn, to: "text" });
  });
  const first = h("td", { "data-cell": "requirement", "data-depth": String(r.depth) }, h("span", { class: "num" }, r.number + " "), name);
  indent(first, r.depth);
  tr.append(first);
  const list = (links: MatrixLink[], testid: string, remove: (l: MatrixLink) => Intent, add: Intent, addLabel: string, note?: string) =>
    h("td", { "data-cell": testid }, h("div", { class: "mx-box" },
      h("ul", { class: "mx-list", "data-testid": testid }, ...links.map((l) => link(l, c, l.statementKey && r.editable ? () => c.intent(remove(l)) : undefined)), note ? h("li", { class: "usages", "data-testid": "mx-usages" }, note) : undefined),
      c.button("+", testid + "-add", () => c.intent(add), { title: addLabel, disabled: !r.editable, className: "icon" })));
  tr.append(
    list(r.satisfiedBy, "mx-satisfy", (l) => ({ type: "removeSatisfy", key: l.statementKey! }), { type: "addSatisfy", qn: r.qn }, `Add an element that satisfies ${r.name}`, r.usages ? usagesText(r.usages) : undefined),
    h("td", { "data-cell": "mx-method" }, r.methods.join(", ")),
    list(r.verifiedBy, "mx-verify", (l) => ({ type: "removeVerify", key: l.statementKey! }), { type: "addVerify", qn: r.qn }, `Add a verification case for ${r.name}`),
    h("td", { "data-cell": "mx-status" }, h("span", { class: "status status-" + (r.status ?? "").replace(/ /g, "-") }, r.status ?? "")),
  );
  tr.addEventListener("click", () => c.select(r.qn));
  return tr;
}

/** What the metrics report: read from the drawn rows, so tests see what the user sees. */
export function matrixMetrics(filter: MatrixFilter, selected: string | undefined) {
  const t = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const items = (tr: Element, id: string) => [...tr.querySelectorAll(`[data-testid=${id}] > li:not(.usages)`)].map((li) => [t(li.querySelector("a, span")), t(li.querySelector(".via-note"))].filter(Boolean).join(" "));
  const rows = [...document.querySelectorAll<HTMLElement>("tr[data-testid=mx-row]")].map((tr) => {
    const kind = tr.dataset.kind === "section" ? ("section" as const) : ("requirement" as const);
    const num = t(tr.querySelector(".num"));
    return {
      qn: tr.dataset.qn ?? "",
      kind,
      number: num,
      depth: Number((tr.querySelector("td, th") as HTMLElement | null)?.dataset.depth ?? "0"),
      id: kind === "section" ? "" : t(tr.querySelector("[data-cell=requirement] a")),
      satisfiedBy: items(tr, "mx-satisfy"),
      usages: t(tr.querySelector(".usages")),
      method: t(tr.querySelector("[data-cell=mx-method]")),
      verifiedBy: items(tr, "mx-verify"),
      status: tr.dataset.status ?? "",
      links: [...tr.querySelectorAll("a.mx-link")].map((a) => a.getAttribute("data-qn") ?? "").filter(Boolean),
      selected: tr.classList.contains("selected") && tr.getAttribute("aria-selected") === "true" && tr.dataset.qn === selected,
    };
  });
  return { rows, filter, summary: t(document.querySelector("[data-testid=matrix-summary]")), columns: [...document.querySelectorAll("table.matrix th[scope=col]")].map((x) => t(x)) };
}
