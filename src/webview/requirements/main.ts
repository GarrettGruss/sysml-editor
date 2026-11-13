/** Entry point of the requirements editor webview (`dist/webview/requirements.js`): the Table and the Document view. */
import type { BlockVM, Gesture, HostToWebview, Intent, ItemVM, RelationVM, RequirementRowVM, RequirementsMetrics, RequirementsScope, RequirementsState, SectionVM, ViewMode, WebviewToHost } from "../../requirements/protocol.js";
import { layoutFor, parseTestWidth } from "../../requirements/layout.js";
import { matrixMetrics, matrixView } from "./matrix-view.js";
import type { MatrixFilter } from "../../requirements/matrix-shape.js";
import { parseMarkdown, type Inline, type MdBlock } from "../../requirements/markdown.js";

interface VsCodeApi {
  postMessage(m: WebviewToHost): void;
  getState(): SavedState | undefined;
  setState(s: SavedState): void;
}
interface SavedState {
  scope?: RequirementsScope;
  view?: ViewMode;
  selected?: string;
  filter?: MatrixFilter;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const post = (m: WebviewToHost) => vscode.postMessage(m);
const errors: string[] = [];
const fail = (e: unknown) => {
  const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  errors.push(message.slice(0, 300));
  post({ type: "error", message });
};
window.addEventListener("error", (e) => fail(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));
post({ type: "ready" });

const saved = vscode.getState() ?? {};
let view: ViewMode = saved.view ?? "matrix";
let matrixFilter: MatrixFilter = saved.filter ?? "all";
let selected: string | undefined = saved.selected;
let scope: RequirementsScope | undefined = saved.scope;
let state: RequirementsState | undefined;
let generation = 0;
let notice: { level: "info" | "error"; message: string } | undefined;
const persist = () => vscode.setState({ ...(scope ? { scope } : {}), view, ...(selected ? { selected } : {}), filter: matrixFilter });

// ------------------------------------------------------------------ DOM helpers (text only, never innerHTML)

type Child = Node | string | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c !== undefined && c !== false) e.append(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
}
const intent = (i: Intent) => post({ type: "intent", intent: i });
const cssId = (qn: string) => "sec-" + qn.replace(/[^A-Za-z0-9_-]/g, "_");
const root = document.getElementById("app") ?? document.body.appendChild(h("div", { id: "app" }));

function renderInline(nodes: readonly Inline[]): Node[] {
  return nodes.map((n): Node => {
    switch (n.t) {
      case "text": return document.createTextNode(n.s);
      case "code": return h("code", {}, n.s);
      case "em": return h("em", {}, ...renderInline(n.c));
      case "strong": return h("strong", {}, ...renderInline(n.c));
      case "link": return h("a", { href: n.href, rel: "noopener noreferrer", title: n.href, class: "md-link" }, ...renderInline(n.c));
    }
  });
}
function renderMarkdown(src: string): HTMLElement {
  const box = h("div", { class: "md" });
  for (const b of parseMarkdown(src) as MdBlock[]) {
    if (b.t === "p") box.append(h("p", {}, ...renderInline(b.c)));
    else box.append(h(b.t, {}, ...b.items.map((it) => h("li", {}, ...renderInline(it)))));
  }
  return box;
}

// ------------------------------------------------------------------ editable fields

/**
 * A text control that commits through `onCommit(value, expected)` when changed; `expected` is the text the field was
 * opened with. It keeps what the user is typing across re-renders, but only while the model text still equals
 * `expected`: otherwise the field shows the conflict (model text beside the draft) with Overwrite and Discard.
 */
const pending = new Map<string, { value: string; caret: number; expected: string; view: ViewMode }>();
/** Drafts whose element changed underneath them (found on a refresh, or reported by the host). */
const conflicts = new Map<string, { draft: string; view: ViewMode }>();
/** The last committed draft per field, to show it if the host reports a conflict. */
const sent = new Map<string, string>();
/** Field keys drawn in the current render. */
let drawn = new Set<string>();

function conflictView(key: string, current: string, draft: string, onCommit: (v: string, expected: string) => void): HTMLElement {
  const box = h("div", { class: "conflict", "data-testid": "conflict", "data-key": key, role: "alert" },
    h("p", { class: "conflict-title" }, "This text was changed elsewhere while you were editing."),
    h("div", { class: "conflict-current" }, h("strong", {}, "Model now"), h("pre", { "data-testid": "conflict-current" }, current)),
    h("div", { class: "conflict-draft" }, h("strong", {}, "Your draft"), h("pre", { "data-testid": "conflict-draft" }, draft)),
  );
  box.append(
    button("Overwrite", "conflict-overwrite", () => {
      conflicts.delete(key);
      sent.set(key, draft);
      onCommit(draft, current);
    }, { title: "Replace the model text with your draft" }),
    button("Discard", "conflict-discard", () => {
      conflicts.delete(key);
      draw();
    }, { title: "Drop your draft and show the model text" }),
  );
  return box;
}

function field(key: string, value: string, opts: { multiline?: boolean; label: string; editable: boolean; className?: string }, onCommit: (v: string, expected: string) => void): HTMLElement {
  drawn.add(key);
  const el: HTMLInputElement | HTMLTextAreaElement = opts.multiline ? h("textarea", { rows: "2" }) : h("input", { type: "text" });
  el.className = "cell-edit " + (opts.className ?? "");
  el.setAttribute("aria-label", opts.label);
  el.setAttribute("data-key", key);
  el.setAttribute("data-orig", value);
  el.value = value;
  if (!opts.editable) {
    el.readOnly = true;
    el.title = "This file cannot be edited";
    return el;
  }
  const p = pending.get(key);
  const c = conflicts.get(key);
  if (c) return conflictView(key, value, c.draft, onCommit);
  if (p && p.expected !== value) {
    // The model text changed since the edit began: never reopen the draft on whatever is there now.
    pending.delete(key);
    conflicts.set(key, { draft: p.value, view: p.view });
    return conflictView(key, value, p.value, onCommit);
  }
  if (p && p.value !== value) {
    el.value = p.value;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(p.caret, p.caret);
    });
  }
  if (opts.multiline) {
    // The text column grows with its content, up to a reasonable height (the CSS max-height), then scrolls.
    const grow = () => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + 2 + "px";
    };
    requestAnimationFrame(grow);
    el.addEventListener("input", grow);
  }
  el.addEventListener("input", () => {
    if (el.value === value) pending.delete(key);
    else pending.set(key, { value: el.value, caret: el.selectionStart ?? el.value.length, expected: pending.get(key)?.expected ?? value, view });
  });
  el.addEventListener("change", () => {
    const expected = pending.get(key)?.expected ?? value;
    pending.delete(key);
    if (el.value !== expected) {
      sent.set(key, el.value);
      onCommit(el.value, expected);
    }
  });
  el.addEventListener("keydown", (ev) => {
    const k = ev as KeyboardEvent;
    if (k.key === "Escape") {
      pending.delete(key);
      el.value = value;
      el.blur();
    } else if (k.key === "Enter" && !opts.multiline) el.dispatchEvent(new Event("change"));
  });
  return el;
}

function button(label: string, testid: string, onClick: () => void, opts: { title?: string; disabled?: boolean; className?: string } = {}): HTMLButtonElement {
  const b = h("button", { type: "button", "data-testid": testid, class: opts.className, title: opts.title ?? label, "aria-label": opts.title ?? label, disabled: opts.disabled }, label);
  b.addEventListener("click", onClick);
  return b;
}

/** A one-line question shown under `anchor` (prompt() is not available in a webview). */
function ask(anchor: HTMLElement, placeholder: string, testid: string, done: (value: string) => void, multiline = false): void {
  anchor.parentElement?.querySelector(`.ask[data-for="${testid}"]`)?.remove();
  const input: HTMLInputElement | HTMLTextAreaElement = multiline ? h("textarea", { rows: "3", placeholder, "aria-label": placeholder, "data-testid": testid + "-input" }) : h("input", { type: "text", placeholder, "aria-label": placeholder, "data-testid": testid + "-input" });
  const ok = button("Add", testid + "-ok", () => submit());
  const cancel = button("Cancel", testid + "-cancel", () => box.remove());
  const box = h("div", { class: "ask", "data-for": testid }, input, ok, cancel);
  const submit = () => {
    const v = input.value.trim();
    if (!v) return;
    box.remove();
    done(v);
  };
  input.addEventListener("keydown", (e: Event) => {
    const ev = e as KeyboardEvent;
    if (ev.key === "Enter" && !(multiline && ev.shiftKey)) {
      ev.preventDefault();
      submit();
    } else if (ev.key === "Escape") box.remove();
  });
  anchor.after(box);
  input.focus();
}

// ------------------------------------------------------------------ table view

function relList(title: string, items: RelationVM[], testid: string, remove: (r: RelationVM) => void, add?: { label: string; onClick: () => void }): HTMLElement {
  const ul = h("ul", { class: "rel-list", "data-testid": testid });
  for (const r of items) ul.append(h("li", {}, h("span", { class: "rel-label" }, r.label), button("Remove", testid + "-remove", () => remove(r), { title: r.removeBlocked ?? `Remove ${r.label}`, className: "icon", disabled: r.removeBlocked !== undefined })));
  if (!items.length) ul.append(h("li", { class: "none" }, "none"));
  return h("div", { class: "rel" }, h("h4", {}, title), ul, add ? button(add.label, testid + "-add", add.onClick) : undefined);
}

function detailPane(row: RequirementRowVM): HTMLElement {
  const pane = h("aside", { class: "detail", "data-testid": "detail", "aria-label": "Relationships of " + row.name });
  pane.append(h("h3", {}, [row.id, row.name].filter(Boolean).join(" ") || row.qn));
  pane.append(
    h("div", { class: "nav" },
      button("Reveal in Tree", "nav-tree", () => intent({ type: "navigate", qn: row.qn, to: "tree" })),
      button("Go to Text", "nav-text", () => intent({ type: "navigate", qn: row.qn, to: "text" })),
      button("Show in Diagram", "nav-diagram", () => intent({ type: "navigate", qn: row.qn, to: "diagram" })),
      button("Delete", "delete-req", () => intent({ type: "deleteRequirement", qn: row.qn }), { className: "danger", disabled: !row.editable }),
    ),
  );
  pane.append(
    relList("Satisfied by", row.satisfiedBy, "rel-satisfy", (r) => intent({ type: "removeSatisfy", key: r.key }), { label: "Add satisfy...", onClick: () => intent({ type: "addSatisfy", qn: row.qn }) }),
    ...(row.notSatisfiedBy.length ? [relList("Not satisfied by", row.notSatisfiedBy, "rel-not-satisfy", (r) => intent({ type: "removeSatisfy", key: r.key }))] : []),
    relList("Verified by", row.verifiedBy, "rel-verify", (r) => intent({ type: "removeVerify", key: r.key }), { label: "Add verification...", onClick: () => intent({ type: "addVerify", qn: row.qn }) }),
    relList("Derived from", row.derivedFrom, "rel-derived-from", (r) => intent({ type: "removeDerivation", connectionKey: r.connectionKey!, ...(r.derivedQn ? { derivedQn: r.derivedQn } : {}) }), { label: "Derived from...", onClick: () => intent({ type: "addDerivedFrom", qn: row.qn }) }),
    relList("Derives", row.derives, "rel-derives", (r) => intent({ type: "removeDerivation", connectionKey: r.connectionKey!, ...(r.derivedQn ? { derivedQn: r.derivedQn } : {}) }), { label: "Add derived...", onClick: () => intent({ type: "addDerives", qn: row.qn }) }),
  );
  return pane;
}

/** An owner name that can wrap only after `::` (never in the middle of a name). */
function ownerParts(qn: string): Child[] {
  const segs = qn.split("::");
  return segs.flatMap((seg, i): Child[] => (i < segs.length - 1 ? [seg + "::", h("wbr")] : [seg]));
}

function tableView(s: RequirementsState): HTMLElement {
  const wrap = h("div", { class: "table-view" });
  const kind = h("select", { "aria-label": "Kind", "data-testid": "add-kind" }, h("option", { value: "requirement" }, "requirement"), h("option", { value: "requirement def" }, "requirement def"));
  const id = h("input", { type: "text", placeholder: "id (e.g. R2)", "aria-label": "Requirement id", "data-testid": "add-id" });
  const name = h("input", { type: "text", placeholder: "name", "aria-label": "Requirement name", "data-testid": "add-name" });
  const add = () => {
    if (!name.value.trim()) {
      name.focus();
      return;
    }
    intent({ type: "addRequirement", kind: kind.value as "requirement" | "requirement def", id: id.value, name: name.value });
    id.value = "";
    name.value = "";
  };
  name.addEventListener("keydown", (ev) => ev.key === "Enter" && add());
  const hasRoot = !!s.scopeQn;
  wrap.append(h("div", { class: "toolbar add-form" }, h("strong", {}, "Add Requirement"), kind, id, name, button("Add Requirement", "add-req", add, { disabled: !hasRoot, title: hasRoot ? "Add Requirement" : "This file has no package to add to" })));
  const rows = s.table.rows;
  if (!rows.length) wrap.append(h("p", { class: "empty" }, "No requirements in this scope yet. Add one above."));
  const table = h("table", { class: "req-table", "data-testid": "table" });
  table.append(h("colgroup", {}, ...["id", "name", "text", "owner", "satisfy", "verify"].map((c) => h("col", { class: "col-" + c }))));
  table.append(h("thead", {}, h("tr", {}, ...["ID", "Name", "Text", "Owner", "Satisfy", "Verify"].map((t) => h("th", { scope: "col" }, t)))));
  const body = h("tbody");
  for (const r of rows) {
    const tr = h("tr", { "data-qn": r.qn, "data-testid": "row", class: (r.qn === selected ? "selected " : "") + (r.satisfy === 0 ? "unsatisfied " : "") + (r.verify === 0 ? "unverified" : ""), "aria-selected": r.qn === selected ? "true" : "false" });
    const set = (f: "id" | "name" | "text") => (v: string, expected: string) => intent({ type: "setCell", qn: r.qn, field: f, value: v, expected });
    const count = (n: number, what: string) => h("td", { class: "num " + (n === 0 ? "warn" : ""), "data-cell": what, "data-label": what === "satisfy" ? "Satisfy" : "Verify" }, h("span", { class: "count" }, String(n)), n === 0 ? h("span", { class: "badge", title: `No ${what} relationship` }, what === "satisfy" ? "unsatisfied" : "unverified") : undefined);
    tr.append(
      h("td", { "data-cell": "id", "data-label": "ID" }, field(r.qn + "|id", r.id, { label: "Id", editable: r.editable, className: "id" }, set("id"))),
      h("td", { "data-cell": "name", "data-label": "Name" }, field(r.qn + "|name", r.name, { label: "Name", editable: r.editable }, set("name"))),
      h("td", { "data-cell": "text", "data-label": "Text" }, field(r.qn + "|text", r.text, { label: "Text", multiline: true, editable: r.editable }, set("text"))),
      h("td", { "data-cell": "owner", "data-label": "Owner", class: "owner", title: r.owner }, ...ownerParts(r.owner)),
      count(r.satisfy, "satisfy"),
      count(r.verify, "verify"),
    );
    tr.addEventListener("click", () => select(r.qn));
    body.append(tr);
  }
  table.append(body);
  const sel = rows.find((r) => r.qn === selected);
  wrap.append(h("div", { class: "split" }, h("div", { class: "table-scroll" }, table), sel ? detailPane(sel) : h("aside", { class: "detail empty", "data-testid": "detail" }, "Select a requirement to see its relationships.")));
  return wrap;
}

function matrixSection(s: RequirementsState): HTMLElement {
  if (!s.matrix) return h("p", { class: "empty" }, "This scope has no verification matrix.");
  return matrixView(s.matrix, { h, button, intent, filter: matrixFilter, setFilter: (f) => { matrixFilter = f; persist(); draw(); }, selected, select });
}

function select(qn: string): void {
  if (selected === qn) return;
  selected = qn;
  persist();
  draw();
}

// ------------------------------------------------------------------ document view

function itemView(i: ItemVM): HTMLElement {
  const sum = (label: string, names: string[]) => (names.length ? h("span", { class: "chip" }, `${label}: ${names.join(", ")}`) : undefined);
  return h("div", { class: "item", "data-qn": i.qn, "data-testid": "item" },
    h("div", { class: "item-head" },
      field(i.qn + "|id", i.id, { label: "Requirement id", editable: i.editable, className: "id" }, (v, expected) => intent({ type: "setCell", qn: i.qn, field: "id", value: v, expected })),
      field(i.qn + "|name", i.name, { label: "Requirement name", editable: i.editable, className: "name" }, (v, expected) => intent({ type: "setCell", qn: i.qn, field: "name", value: v, expected })),
      h("span", { class: "kind" }, i.defKind),
    ),
    field(i.qn + "|text", i.text, { label: "Requirement text", multiline: true, editable: i.editable }, (v, expected) => intent({ type: "setCell", qn: i.qn, field: "text", value: v, expected })),
    i.trace ? h("p", { class: "trace", "data-testid": "trace" }, i.trace) : undefined,
    h("div", { class: "chips" }, sum("Derived from", i.summary.derivedFrom), sum("Derives", i.summary.derives)),
  );
}

function paragraphView(p: Extract<BlockVM, { kind: "paragraph" }>): HTMLElement {
  const box = h("div", { class: "para", "data-key": p.key, "data-testid": "paragraph" });
  const show = () => {
    box.replaceChildren(renderMarkdown(p.text));
    if (p.editable) box.append(button("Edit", "edit-para", edit, { title: "Edit paragraph", className: "icon edit" }));
  };
  const edit = () => {
    const ta = field(p.key, p.text, { label: "Paragraph text", multiline: true, editable: true, className: "para-edit" }, (v, expected) => intent({ type: "setParagraph", key: p.key, value: v, expected }));
    (ta as HTMLTextAreaElement).rows = Math.max(3, p.text.split("\n").length + 1);
    box.replaceChildren(ta);
    ta.addEventListener("blur", () => {
      if (!pending.has(p.key) && !conflicts.has(p.key)) show();
    });
    ta.focus();
  };
  if (pending.has(p.key) || conflicts.has(p.key)) edit();
  else show();
  return box;
}

function blocksView(blocks: BlockVM[]): HTMLElement[] {
  return blocks.map((b) => {
    if (b.kind === "paragraph") return paragraphView(b);
    if (b.kind === "item") return itemView(b);
    return h("div", { class: "elements", "data-testid": "elements" }, h("span", { class: "label" }, "Model elements: "), ...b.items.flatMap((it, i) => [i ? ", " : "", h("code", {}, `${it.kind} ${it.name}`)]));
  });
}

function sectionView(s: SectionVM, parentQn: string, prevQn: string | undefined): HTMLElement {
  const head = h("div", { class: "sec-head" },
    h("span", { class: "num", "data-testid": "sec-number" }, s.appendix && !s.number.includes(".") ? `Appendix ${s.number}` : s.number),
    field(s.qn + "|heading", s.heading, { label: "Heading", editable: s.editable, className: "heading" }, (v, expected) => intent({ type: "setHeading", qn: s.qn, value: v, expected })),
    h("span", { class: "sec-actions" },
      button("Move up", "move-up", () => intent({ type: "moveSection", qn: s.qn, how: "up" }), { disabled: !s.canMoveUp, title: `Move ${s.heading} up` }),
      button("Move down", "move-down", () => intent({ type: "moveSection", qn: s.qn, how: "down" }), { disabled: !s.canMoveDown, title: `Move ${s.heading} down` }),
      button("Delete", "delete-section", () => intent({ type: "deleteSection", qn: s.qn }), { className: "danger", disabled: !s.editable, title: `Delete section ${s.heading}` }),
    ),
  );
  head.setAttribute("role", "heading");
  head.setAttribute("aria-level", String(Math.min(6, s.level + 1)));
  const sec = h("section", { id: cssId(s.qn), "data-qn": s.qn, "data-testid": "section", class: "section level-" + Math.min(s.level, 4) }, head, ...blocksView(s.blocks));
  const adds = h("div", { class: "adds" });
  adds.append(
    button("Add paragraph", "add-paragraph", () => ask(adds, "Paragraph text (Shift+Enter for a new line)", "ask-paragraph", (t) => intent({ type: "addParagraph", pkgQn: s.qn, text: t }), true), { disabled: !s.editable }),
    button("Add requirement", "add-requirement", () => ask(adds, "Requirement name", "ask-requirement", (n) => intent({ type: "addRequirement", kind: "requirement", id: "", name: n, ownerQn: s.qn })), { disabled: !s.editable }),
    button("Add subsection", "add-subsection", () => ask(adds, "Subsection heading", "ask-subsection", (n) => intent({ type: "addSection", parentQn: s.qn, name: n })), { disabled: !s.editable }),
    button("Add section after", "add-section-after", () => ask(adds, "Section heading", "ask-section-after", (n) => intent({ type: "addSection", parentQn: parentQn, name: n, afterQn: s.qn, ...(s.appendix ? { appendix: true } : {}) })), { disabled: !s.editable }),
  );
  sec.append(adds);
  s.children.forEach((c, i) => sec.append(sectionView(c, s.qn, s.children[i - 1]?.qn)));
  void prevQn;
  return sec;
}

function tocView(d: NonNullable<RequirementsState["document"]>): HTMLElement {
  const nav = h("nav", { class: "toc", "aria-label": "Table of contents", "data-testid": "toc" }, h("h2", {}, "Contents"));
  const ul = h("ul");
  const sectionQns = new Set(d.sections.concat(d.appendices).flatMap(function all(s): string[] { return [s.qn, ...s.children.flatMap(all)]; }));
  for (const t of d.toc) {
    const a = h("a", { href: "#" + cssId(t.qualifiedName), class: "toc-link" }, `${t.appendix && !t.number.includes(".") ? "Appendix " : ""}${t.number} ${t.heading}`);
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      document.getElementById(cssId(t.qualifiedName))?.scrollIntoView({ block: "start" });
    });
    const li = h("li", { class: "toc-item level-" + t.level, "data-qn": t.qualifiedName, draggable: sectionQns.has(t.qualifiedName) ? "true" : undefined, "data-testid": "toc-entry" }, a);
    li.addEventListener("dragstart", (ev) => {
      ev.dataTransfer?.setData("text/plain", t.qualifiedName);
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      const r = li.getBoundingClientRect();
      li.classList.toggle("drop-before", ev.clientY < r.top + r.height / 2);
      li.classList.toggle("drop-after", ev.clientY >= r.top + r.height / 2);
    });
    li.addEventListener("dragleave", () => li.classList.remove("drop-before", "drop-after"));
    li.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const from = ev.dataTransfer?.getData("text/plain");
      const r = li.getBoundingClientRect();
      const before = ev.clientY < r.top + r.height / 2;
      li.classList.remove("drop-before", "drop-after");
      if (from && from !== t.qualifiedName) intent({ type: "moveSection", qn: from, how: before ? { beforeQn: t.qualifiedName } : { afterQn: t.qualifiedName } });
    });
    ul.append(li);
  }
  nav.append(ul);
  return nav;
}

function documentView(s: RequirementsState): HTMLElement {
  const d = s.document;
  if (!d) return h("p", { class: "empty" }, "The document view needs a package. This file declares none.");
  const wrap = h("div", { class: "document", "data-testid": "document" });
  wrap.append(h("header", { class: "titleblock" }, h("h1", { "data-testid": "doc-title" }, d.title), d.version ? h("p", { class: "version", "data-testid": "doc-version" }, "Version " + d.version) : undefined, d.annotated ? undefined : h("p", { class: "hint" }, "Title defaults to the package name; add @DocumentRoot { title = \"...\"; } to set it.")));
  wrap.append(tocView(d));
  wrap.append(...blocksView(d.blocks));
  const top = h("div", { class: "adds top" });
  d.sections.forEach((sec, i) => wrap.append(sectionView(sec, d.rootQn, d.sections[i - 1]?.qn)));
  if (d.appendices.length) wrap.append(h("h2", { class: "appendix-title" }, "Appendices"));
  d.appendices.forEach((sec, i) => wrap.append(sectionView(sec, d.rootQn, d.appendices[i - 1]?.qn)));
  top.append(
    button("Add section", "add-section", () => ask(top, "Section heading", "ask-section", (n) => intent({ type: "addSection", parentQn: d.rootQn, name: n })), { disabled: !d.editable }),
    button("Add appendix", "add-appendix", () => ask(top, "Appendix heading", "ask-appendix", (n) => intent({ type: "addSection", parentQn: d.rootQn, name: n, appendix: true })), { disabled: !d.editable }),
    button("Add paragraph", "add-root-paragraph", () => ask(top, "Paragraph text (Shift+Enter for a new line)", "ask-root-paragraph", (t) => intent({ type: "addParagraph", pkgQn: d.rootQn, text: t }), true), { disabled: !d.editable }),
  );
  wrap.append(top);
  return wrap;
}

// ------------------------------------------------------------------ page

function draw(): void {
  const s = state;
  const scrollY = window.scrollY;
  drawn = new Set();
  const focusKey = (document.activeElement as HTMLElement | null)?.getAttribute?.("data-key");
  root.replaceChildren();
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "View" });
  for (const v of ["matrix", "document"] as const) {
    const t = h("button", { type: "button", role: "tab", "aria-selected": String(view === v), "data-testid": "tab-" + v, class: view === v ? "active" : "" }, v === "matrix" ? "Matrix" : "Document");
    t.addEventListener("click", () => {
      view = v;
      persist();
      post({ type: "viewChanged", view: v });
      draw();
    });
    tabs.append(t);
  }
  root.append(h("div", { class: "bar" }, h("span", { class: "scope", "data-testid": "scope" }, s?.scopeName ?? ""), tabs));
  root.append(h("div", { id: "notice", class: "notice " + (notice?.level ?? ""), role: "status", "data-testid": "notice", hidden: !notice }, notice?.message));
  if (!s) root.append(h("p", { class: "empty" }, "Loading..."));
  else if (s.problem) root.append(h("p", { class: "empty error" }, s.problem));
  else root.append(view === "table" ? tableView(s) : view === "matrix" ? matrixSection(s) : documentView(s));
  applyLayout();
  window.scrollTo(0, scrollY);
  // A pending edit or conflict whose field no longer exists (its element is gone) cannot be shown; tell the user.
  if (s && !s.problem) {
    const gone = [...pending, ...conflicts].filter(([k, e]) => !drawn.has(k) && e.view === view).map(([k]) => k);
    if (gone.length) {
      for (const k of gone) {
        pending.delete(k);
        conflicts.delete(k);
      }
      notice = { level: "error", message: "An edit was discarded because its paragraph or requirement no longer exists." };
      document.getElementById("notice")?.removeAttribute("hidden");
      const n = document.getElementById("notice");
      if (n) n.textContent = notice.message;
    }
  }
  if (focusKey && !pending.has(focusKey)) void focusKey;
}

// ------------------------------------------------------------------ responsive layout

/** Test only: the forced page width (px). */
let forcedWidth: number | undefined;
const panelWidth = () => forcedWidth ?? document.documentElement.clientWidth;

/** Choose table or card layout and the place of the detail pane for the current width; CSS does the rest. */
function applyLayout(): void {
  const lay = layoutFor(panelWidth());
  root.dataset.layout = lay.mode;
  root.dataset.detail = lay.detail;
  // Text fields grow with their content; the content wraps differently at another width.
  for (const ta of document.querySelectorAll<HTMLTextAreaElement>("textarea.cell-edit")) {
    if (ta.getAttribute("rows") !== "2") continue;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + 2 + "px";
  }
}
function setForcedWidth(w: number | undefined): void {
  forcedWidth = w;
  document.body.style.width = w === undefined ? "" : w + "px";
  applyLayout();
}
let lastObserved = -1;
new ResizeObserver(() => {
  const w = document.documentElement.clientWidth;
  if (w === lastObserved) return;
  lastObserved = w;
  requestAnimationFrame(applyLayout); // never resize elements inside the observer callback (loop errors)
}).observe(document.documentElement);

// ------------------------------------------------------------------ metrics and PNG

const lightTheme = () => document.body.classList.contains("vscode-light") || document.body.classList.contains("vscode-high-contrast-light");
const text = (e: Element | null | undefined) => (e?.textContent ?? "").trim();
const val = (e: Element | null | undefined) => (e as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";

function metrics(): RequirementsMetrics {
  const rows = [...document.querySelectorAll<HTMLElement>("tr[data-testid=row]")].map((tr) => {
    const c = (n: string) => tr.querySelector(`[data-cell=${n}]`);
    return {
      qn: tr.dataset.qn ?? "",
      cells: { id: val(c("id")?.querySelector("input,textarea")), name: val(c("name")?.querySelector("input,textarea")), text: val(c("text")?.querySelector("input,textarea")), owner: text(c("owner")), satisfy: text(c("satisfy")?.querySelector(".count")), verify: text(c("verify")?.querySelector(".count")) },
      selected: tr.classList.contains("selected"),
      unsatisfied: tr.classList.contains("unsatisfied"),
      unverified: tr.classList.contains("unverified"),
    };
  });
  const detailEl = document.querySelector("aside.detail:not(.empty)");
  const listOf = (id: string) => [...(detailEl?.querySelectorAll(`[data-testid=${id}] li:not(.none) .rel-label`) ?? [])].map((e) => text(e));
  const outline = [...document.querySelectorAll<HTMLElement>("section[data-testid=section]")].map((sec) => {
    const own = (sel: string) => [...sec.querySelectorAll(sel)].filter((e) => e.closest("section") === sec).length;
    return {
      number: text(sec.querySelector(":scope > .sec-head .num")),
      heading: val(sec.querySelector(":scope > .sec-head input.heading")),
      level: Number(/level-(\d)/.exec(sec.className)?.[1] ?? 1),
      appendix: /^Appendix /.test(text(sec.querySelector(":scope > .sec-head .num"))),
      paragraphs: own("[data-testid=paragraph]"),
      items: own("[data-testid=item]"),
      elements: own("[data-testid=elements] code"),
    };
  });
  const paragraphs = [...document.querySelectorAll<HTMLElement>("[data-testid=paragraph]")].map((p) => ({ section: p.closest("section")?.getAttribute("data-qn") ?? "", text: p.querySelector("textarea") ? val(p.querySelector("textarea")) : text(p.querySelector(".md")), lists: p.querySelectorAll("ul,ol").length, links: p.querySelectorAll("a").length }));
  const items = [...document.querySelectorAll<HTMLElement>("[data-testid=item]")].map((i) => ({ section: i.closest("section")?.getAttribute("data-qn") ?? "", id: val(i.querySelector("input.id")), name: val(i.querySelector("input.name")), text: val(i.querySelector("textarea")), trace: text(i.querySelector("[data-testid=trace]")) }));
  const over: string[] = [];
  for (const e of document.querySelectorAll<HTMLElement>("body *")) {
    if (e instanceof HTMLTextAreaElement || e instanceof HTMLInputElement || e.closest(".table-scroll") === e) continue;
    if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible" && !e.matches(".table-scroll")) over.push(`${e.tagName.toLowerCase()}.${e.className}`);
  }
  // A cell squeezed to nothing is as unreadable as clipped text.
  const lay = layoutFor(panelWidth());
  const textWidths = [...document.querySelectorAll<HTMLElement>("td[data-cell=text]")].map((td) => td.clientWidth);
  const rowWidths = [...document.querySelectorAll<HTMLElement>("tr[data-testid=row]")].map((tr) => tr.clientWidth);
  for (const td of document.querySelectorAll<HTMLElement>("td[data-cell=text], td[data-cell=name]")) {
    const w = td.clientWidth;
    const min = lay.mode === "card" ? (td.dataset.cell === "text" ? (td.parentElement?.clientWidth ?? 0) - 32 : 100) : td.dataset.cell === "text" ? 200 : 100;
    if (w < min) over.push(`narrow cell ${td.dataset.cell}: ${w}px`);
  }
  if (root.scrollWidth > root.clientWidth + 1) over.push(`page content wider than its box: ${root.scrollWidth}px in ${root.clientWidth}px`);
  const sc = document.scrollingElement!;
  return {
    view,
    theme: lightTheme() ? "light" : "dark",
    generation,
    scopeName: state?.scopeName ?? "",
    table: {
      rows,
      ...(selected ? { selected } : {}),
      counts: { total: rows.length, unsatisfied: rows.filter((r) => r.unsatisfied).length, unverified: rows.filter((r) => r.unverified).length },
      ...(detailEl && selected ? { detail: { qn: selected, satisfiedBy: listOf("rel-satisfy"), verifiedBy: listOf("rel-verify"), derivedFrom: listOf("rel-derived-from"), derives: listOf("rel-derives") } } : {}),
    },
    document: {
      title: text(document.querySelector("[data-testid=doc-title]")),
      ...(document.querySelector("[data-testid=doc-version]") ? { version: text(document.querySelector("[data-testid=doc-version]")).replace(/^Version /, "") } : {}),
      outline,
      toc: [...document.querySelectorAll("[data-testid=toc-entry]")].map((li) => {
        const t = text(li);
        const m = /^(?:Appendix )?(\S+) (.*)$/.exec(t);
        return { number: m?.[1] ?? "", heading: m?.[2] ?? t, level: Number(/level-(\d)/.exec(li.className)?.[1] ?? 1) };
      }),
      appendixLetters: outline.filter((o) => o.appendix).map((o) => o.number.replace(/^Appendix /, "")),
      paragraphs,
      items,
      rootBlocks: document.querySelectorAll(".document > [data-testid=paragraph], .document > [data-testid=item], .document > [data-testid=elements]").length,
    },
    matrix: matrixMetrics(matrixFilter, selected),
    pendingEdits: [...pending.keys()],
    conflicts: [...conflicts.keys()],
    overflow: { count: over.length, horizontalScroll: (forcedWidth === undefined && sc.scrollWidth > sc.clientWidth + 1) || root.scrollWidth > root.clientWidth + 1, samples: over.slice(0, 5) },
    ...(notice ? { notice } : {}),
    errors,
    size: { width: window.innerWidth, height: window.innerHeight },
    layout: { width: panelWidth(), mode: lay.mode, detail: lay.detail, textWidths, rowWidths },
  };
}

function styledCopy(src: Element): Element {
  const dst = src.cloneNode(false) as Element;
  const cs = getComputedStyle(src);
  let css = "";
  for (let i = 0; i < cs.length; i++) css += `${cs[i]!}:${cs.getPropertyValue(cs[i]!)};`;
  dst.setAttribute("style", css);
  if (src instanceof HTMLInputElement) dst.setAttribute("value", src.value);
  if (src instanceof HTMLTextAreaElement) dst.textContent = src.value;
  else for (const c of Array.from(src.childNodes)) dst.append(c.nodeType === 1 ? styledCopy(c as Element) : c.cloneNode(true));
  return dst;
}

async function exportPng(): Promise<string> {
  const W = Math.min(forcedWidth ?? window.innerWidth, 1400);
  const H = Math.min(Math.max(document.documentElement.scrollHeight, window.innerHeight), 3000);
  const copy = styledCopy(document.body);
  copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const bg = getComputedStyle(document.body).backgroundColor;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${bg}"/><foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(copy)}</foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("PNG export failed: no canvas context");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  c.drawImage(img, 0, 0, W, H);
  const b64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
  if (!b64) throw new Error("PNG export failed: the canvas produced no image");
  return b64;
}

async function gesture(g: Gesture): Promise<void> {
  const find = (sel: string): HTMLElement => {
    const e = document.querySelector<HTMLElement>(sel);
    if (!e) throw new Error(`no element matches ${sel}`);
    return e;
  };
  switch (g.kind) {
    case "click": find(g.selector).click(); break;
    case "input": {
      const e = find(g.selector) as HTMLInputElement | HTMLTextAreaElement;
      e.focus();
      e.value = g.value;
      e.dispatchEvent(new Event("input", { bubbles: true }));
      if ((g.event ?? "change") === "change") e.dispatchEvent(new Event("change", { bubbles: true }));
      break;
    }
    case "key": find(g.selector).dispatchEvent(new KeyboardEvent("keydown", { key: g.key, bubbles: true })); break;
    case "dragToc": {
      const quoted = (q: string) => q.replace(/["\\]/g, "\\$&");
      const from = find(`[data-testid=toc-entry][data-qn="${quoted(g.fromQn)}"]`);
      const onto = find(`[data-testid=toc-entry][data-qn="${quoted(g.ontoQn)}"]`);
      const dt = new DataTransfer();
      from.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
      const r = onto.getBoundingClientRect();
      const y = g.position === "before" ? r.top + 1 : r.bottom - 1;
      onto.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, clientY: y, bubbles: true, cancelable: true }));
      onto.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, clientY: y, bubbles: true, cancelable: true }));
      break;
    }
  }
}

window.addEventListener("message", (ev: MessageEvent<HostToWebview>) => {
  const m = ev.data;
  try {
    switch (m.type) {
      case "render":
        state = m.state;
        scope = m.scope;
        generation = m.generation;
        if (m.view && !saved.view && generation <= 1) view = m.view;
        if (selected && !state.table.rows.some((r) => r.qn === selected) && !state.matrix?.rows.some((r) => r.qn === selected)) selected = undefined;
        persist();
        draw();
        break;
      case "conflict":
        conflicts.set(m.fieldKey, { draft: sent.get(m.fieldKey) ?? pending.get(m.fieldKey)?.value ?? "", view });
        pending.delete(m.fieldKey);
        draw();
        break;
      case "setView":
        view = m.view;
        persist();
        draw();
        break;
      case "notice":
        notice = { level: m.level, message: m.message };
        draw();
        break;
      case "getMetrics": post({ type: "metricsResult", requestId: m.requestId, metrics: metrics() }); break;
      case "exportPng":
        exportPng().then((base64) => post({ type: "pngResult", requestId: m.requestId, base64 }), (e: unknown) => post({ type: "pngResult", requestId: m.requestId, error: e instanceof Error ? e.message : String(e) }));
        break;
      case "testWidth": {
        setForcedWidth(parseTestWidth(m.width));
        const done = () => post({ type: "gestureResult", requestId: m.requestId });
        // let the layout settle (two frames, or a timer when frames are not delivered)
        let sent = false;
        const once = () => { if (!sent) { sent = true; applyLayout(); done(); } };
        requestAnimationFrame(() => requestAnimationFrame(once));
        setTimeout(once, 250);
        break;
      }
      case "testGesture":
        gesture(m.gesture).then(() => post({ type: "gestureResult", requestId: m.requestId }), (e: unknown) => post({ type: "gestureResult", requestId: m.requestId, error: e instanceof Error ? e.message : String(e) }));
        break;
    }
  } catch (e) {
    fail(e);
  }
});
