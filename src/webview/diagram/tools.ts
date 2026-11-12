/**
 * The palette and the properties panel of the diagram editor (HTML next to the SVG drawing), and
 * what they report to the test API. The panels only collect user input; the host runs the model edit.
 */
import { paletteFor, type PaletteItem } from "../../diagram/palette.js";
import type { ModelIntent, PropertyChanges } from "../../diagram/protocol.js";
import type { ViewModel, VmNode } from "../../diagram/view-model.js";

export type Tool = { kind: "add"; item: PaletteItem } | { kind: "connect" };
export type Field = "name" | "shortName" | "type" | "multiplicity" | "documentation";
export interface Suggestion { name: string; qualifiedName: string; library: boolean }

export interface ToolsHost {
  onModel(intent: ModelIntent): void;
  suggest(id: string, query: string): Promise<Suggestion[]>;
  chooseTool(tool: Tool | undefined): void;
}

export interface PropertiesState {
  visible: boolean;
  /** Id of the node shown; absent when the panel asks for a single selection. */
  id?: string;
  kind?: string;
  qualifiedName?: string;
  fields: Record<string, { value: string; disabled: boolean }>;
  note?: string;
}

const FIELDS: { field: Field; label: string; multiline?: boolean }[] = [
  { field: "name", label: "Name" },
  { field: "shortName", label: "Short name" },
  { field: "type", label: "Type" },
  { field: "multiplicity", label: "Multiplicity" },
  { field: "documentation", label: "Documentation", multiline: true },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Tools {
  readonly palette = el("div", "palette");
  readonly props = el("div", "props");
  private kind?: string;
  private tool?: Tool;
  private shown?: VmNode;
  private readonly inputs = new Map<Field, HTMLInputElement | HTMLTextAreaElement>();
  private readonly list = el("datalist");
  private readonly body = el("div", "props-body");
  private readonly noticeLine = el("div", "props-notice");
  private suggestSeq = 0;
  private buttons: HTMLButtonElement[] = [];

  constructor(host: HTMLElement, private readonly cb: ToolsHost) {
    this.palette.setAttribute("role", "toolbar");
    this.palette.setAttribute("aria-label", "Palette");
    this.props.setAttribute("role", "region");
    this.props.setAttribute("aria-label", "Properties");
    this.list.id = "type-suggestions";
    this.props.append(el("h2", "props-title", "Properties"), this.body, this.noticeLine, this.list);
    host.append(this.palette, this.props);
    this.showNothing("Select one element to edit its properties.");
  }

  // ---- palette ---------------------------------------------------------------------------

  setDiagram(vm: ViewModel): void {
    if (this.kind === vm.kind) return;
    this.kind = vm.kind;
    this.palette.replaceChildren(el("div", "panel-title", "Palette"));
    this.buttons = [];
    for (const item of paletteFor(vm.kind)) {
      const b = el("button", "palette-item", item.label);
      b.type = "button";
      b.dataset.kind = item.kind;
      b.title = item.kind === "connection" ? "Connection: click the source, then the target" : `${item.label}: click here, then click the container (or the canvas) to create it`;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => this.cb.chooseTool(this.tool && this.isActive(item) ? undefined : item.kind === "connection" ? { kind: "connect" } : { kind: "add", item }));
      this.palette.append(b);
      this.buttons.push(b);
    }
  }

  private isActive(item: PaletteItem): boolean {
    return item.kind === "connection" ? this.tool?.kind === "connect" : this.tool?.kind === "add" && this.tool.item.kind === item.kind;
  }

  setTool(t: Tool | undefined): void {
    this.tool = t;
    for (const b of this.buttons) {
      const on = !!t && (t.kind === "connect" ? b.dataset.kind === "connection" : b.dataset.kind === t.item.kind);
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("active", on);
    }
  }

  // ---- properties ------------------------------------------------------------------------

  private showNothing(message: string): void {
    this.shown = undefined;
    this.inputs.clear();
    this.body.replaceChildren(el("p", "props-hint", message));
  }

  /** Show the node when exactly one is selected. */
  setSelection(vm: ViewModel | undefined, ids: readonly string[]): void {
    const keepFocus = this.props.contains(document.activeElement) && ids.length === 1 && this.shown?.id === ids[0];
    if (!vm || ids.length !== 1) return this.showNothing(ids.length > 1 ? "Select a single element to edit its properties." : "Select one element to edit its properties.");
    const node = vm.nodes.find((n) => n.id === ids[0]);
    if (!node) return this.showNothing("Select one element to edit its properties.");
    if (keepFocus && this.shown && JSON.stringify(this.shown.props) === JSON.stringify(node.props)) {
      this.shown = node;
      return;
    }
    this.shown = node;
    this.build(node);
  }

  private build(node: VmNode): void {
    this.inputs.clear();
    const p = node.props;
    const rows: HTMLElement[] = [];
    const ro = (label: string, value: string, cls: string) => {
      const row = el("div", "props-row");
      row.append(el("label", undefined, label), el("div", `props-ro ${cls}`, value));
      return row;
    };
    rows.push(ro("Kind", p?.kind ?? node.shape, "props-kind"));
    let reason: string | undefined;
    let goto = false;
    if (!node.resolved || !p) reason = `This item is unresolved (${node.unresolvedRef ?? "unknown"}), so it has no properties to edit. Use Re-link… to point it at an element.`;
    else if (p.locked === "library") reason = "This is standard library content and is read-only.";
    else if (p.locked === "inherited") {
      reason = `Inherited from ${node.inherited?.from ?? "its definition"}: it cannot be changed from here. Change it in the definition, which changes every usage.`;
      goto = true;
    }
    for (const f of FIELDS) {
      const row = el("div", "props-row");
      const id = `prop-${f.field}`;
      const label = el("label", undefined, f.label);
      label.htmlFor = id;
      const input = f.multiline ? el("textarea") : el("input");
      input.id = id;
      input.dataset.field = f.field;
      let value = "";
      if (p) {
        value = f.field === "name" ? (p.name ?? "") : f.field === "shortName" ? (p.shortName ?? "") : f.field === "type" ? (p.type ?? "") : f.field === "multiplicity" ? (p.multiplicity ?? "") : (p.documentation ?? "");
      }
      input.value = value;
      let disabled = reason !== undefined;
      let why = reason;
      if (!disabled && p && !p.isUsage && (f.field === "type" || f.field === "multiplicity")) { disabled = true; why = "Only usages have a " + f.label.toLowerCase() + "."; }
      if (!disabled && p && p.name === undefined && f.field === "name") { disabled = true; why = "This element has no name."; }
      input.disabled = disabled;
      if (why) input.title = why;
      if (input instanceof HTMLInputElement) {
        input.type = "text";
        if (f.field === "type") {
          input.setAttribute("list", this.list.id);
          input.addEventListener("input", () => void this.suggest(node.id, input.value));
          input.addEventListener("focus", () => void this.suggest(node.id, input.value));
        }
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); else if (e.key === "Escape") { input.value = value; input.blur(); } e.stopPropagation(); });
      } else {
        input.rows = 3;
        input.addEventListener("keydown", (e) => { if (e.key === "Escape") { input.value = value; input.blur(); } e.stopPropagation(); });
      }
      input.addEventListener("change", () => this.commit(node, f.field, input.value, value));
      this.inputs.set(f.field, input);
      row.append(label, input);
      rows.push(row);
    }
    rows.push(ro("Qualified name", p?.qualifiedName ?? "", "props-qn"));
    if (reason) {
      const note = el("p", "props-reason", reason);
      note.setAttribute("role", "note");
      rows.push(note);
      if (goto) {
        const b = el("button", "props-goto", "Go to Definition");
        b.type = "button";
        b.addEventListener("click", () => this.cb.onModel({ kind: "goToDefinition", id: node.id }));
        rows.push(b);
      }
    }
    this.body.replaceChildren(...rows);
  }

  private commit(node: VmNode, field: Field, value: string, original: string): void {
    if (value === original) return;
    const changes: PropertyChanges = {};
    if (field === "name") {
      if (value.trim() === "") return;
      changes.name = value;
    } else changes[field] = value === "" ? null : value;
    this.cb.onModel({ kind: "setProperties", id: node.id, changes });
  }

  private async suggest(id: string, query: string): Promise<void> {
    const seq = ++this.suggestSeq;
    const items = await this.cb.suggest(id, query);
    if (seq !== this.suggestSeq) return;
    this.list.replaceChildren(...items.map((i) => { const o = el("option"); o.value = i.qualifiedName; o.label = i.name + (i.library ? " (library)" : ""); return o; }));
  }

  notice(message: string): void {
    this.noticeLine.textContent = message;
    this.noticeLine.hidden = message === "";
  }

  // ---- test API ----------------------------------------------------------------------------

  setField(field: Field, value: string): void {
    const input = this.inputs.get(field);
    if (!input) throw new Error(`the properties panel has no ${field} field (select a single element first)`);
    if (input.disabled) throw new Error(`the ${field} field is disabled`);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  state(): { palette: string[]; tool: string | undefined; properties: PropertiesState } {
    const fields: PropertiesState["fields"] = {};
    for (const [k, i] of this.inputs) fields[k] = { value: i.value, disabled: i.disabled };
    const note = this.body.querySelector(".props-reason")?.textContent ?? undefined;
    const p = this.shown?.props;
    return {
      palette: this.buttons.map((b) => b.textContent ?? ""),
      tool: this.tool?.kind === "add" ? this.tool.item.kind : this.tool?.kind,
      properties: { visible: !!this.shown, ...(this.shown ? { id: this.shown.id } : {}), ...(p ? { kind: p.kind } : {}), ...(p?.qualifiedName !== undefined ? { qualifiedName: p.qualifiedName } : {}), fields, ...(note ? { note } : {}) },
    };
  }
}
