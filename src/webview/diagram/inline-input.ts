/**
 * The one inline input of the diagram (D32): palette naming, rename and description editing. A text field over the canvas;
 * Enter or a click elsewhere saves, Escape cancels, Shift+Enter adds a line to a multi-line input. A problem found by the
 * optional check shows under the field and keeps the input open. The host's model edit is made by the caller.
 */

export type InlineKey = "commit" | "cancel" | "newline" | undefined;

/** What a key does in the input: Enter commits (Shift+Enter adds a line when multi-line), Escape cancels. */
export function inlineKeyAction(e: { key: string; shiftKey?: boolean }, multiline: boolean): InlineKey {
  if (e.key === "Escape") return "cancel";
  if (e.key === "Enter") return multiline && e.shiftKey ? "newline" : "commit";
  return undefined;
}

export interface InlineInputOptions {
  /** Where the field sits, in client pixels. */
  left: number;
  top: number;
  width: number;
  /** Where the field's corner is on the canvas (the window screenshot places it from this). */
  anchor?: { x: number; y: number };
  /** The field's height in client pixels (multi-line fields). */
  height?: number;
  value: string;
  multiline?: boolean;
  /** `rename`, `add`, `quick` or `doc`: what the input edits (also a CSS class and a test measure). */
  purpose: string;
  label: string;
  /** Why the text cannot be saved, or undefined. Runs on every change and before saving. */
  check?(value: string): Promise<string | undefined>;
  /** Runs once when the field has opened (it may set the value or an error, for instance the default name). */
  init?(input: InlineInput): Promise<void>;
  onCommit(value: string): void;
  onCancel(): void;
}

export class InlineInput {
  readonly el: HTMLDivElement;
  readonly field: HTMLInputElement | HTMLTextAreaElement;
  readonly errorLine: HTMLDivElement;
  readonly purpose: string;
  /** Settled once `init` has run. */
  readonly ready: Promise<void>;
  /** The user typed into the field. */
  touched = false;
  private done = false;
  private seq = 0;
  private busy = false;
  private op: Promise<void> = Promise.resolve();

  constructor(private readonly o: InlineInputOptions, parent: HTMLElement = document.body) {
    this.purpose = o.purpose;
    this.el = document.createElement("div");
    this.el.className = `inline-wrap inline-${o.purpose}`;
    this.el.style.left = `${o.left}px`;
    this.el.style.top = `${o.top}px`;
    this.el.style.width = `${o.width}px`;
    if (o.anchor) { this.el.dataset.ax = String(o.anchor.x); this.el.dataset.ay = String(o.anchor.y); }
    this.field = o.multiline ? document.createElement("textarea") : document.createElement("input");
    this.field.className = "inline-editor";
    if (this.field instanceof HTMLInputElement) this.field.type = "text";
    else this.field.style.height = `${o.height ?? 60}px`;
    this.field.value = o.value;
    this.field.setAttribute("aria-label", o.label);
    this.errorLine = document.createElement("div");
    this.errorLine.className = "inline-error";
    this.errorLine.setAttribute("role", "alert");
    this.errorLine.hidden = true;
    this.el.append(this.field, this.errorLine);
    this.field.addEventListener("keydown", (ev) => {
      const e = ev as KeyboardEvent;
      const a = inlineKeyAction(e, !!o.multiline);
      if (a === "commit") { e.preventDefault(); this.op = this.commit(); }
      else if (a === "cancel") { e.preventDefault(); this.cancel(); }
      e.stopPropagation();
    });
    this.field.addEventListener("input", () => { this.touched = true; void this.validate(); });
    // A click elsewhere saves (the field loses focus), unless the check refuses the text: then it stays open with the error.
    this.field.addEventListener("blur", () => { if (!this.busy) this.op = this.commit(true); });
    parent.append(this.el);
    this.field.focus();
    if (this.field instanceof HTMLInputElement) this.field.select();
    else this.field.setSelectionRange(this.field.value.length, this.field.value.length);
    this.ready = (o.init ? o.init(this) : Promise.resolve()).then(() => this.validate()).then(() => undefined, () => undefined);
  }

  /** Settled when the last save or cancel has run (a test measure). */
  settle(): Promise<void> { return this.op; }

  get value(): string { return this.field.value; }

  /** Replace the text (the default name that arrived late): selected again, and not counted as typed. */
  setValue(v: string, select = true): void {
    this.field.value = v;
    if (select && this.field instanceof HTMLInputElement) this.field.select();
  }

  setError(message: string | undefined): void {
    this.errorLine.textContent = message ?? "";
    this.errorLine.hidden = !message;
    this.el.classList.toggle("has-error", !!message);
  }

  get error(): string | undefined { return this.errorLine.hidden ? undefined : this.errorLine.textContent ?? undefined; }

  private async validate(): Promise<string | undefined> {
    if (!this.o.check) return undefined;
    const seq = ++this.seq;
    const text = this.field.value;
    const problem = await this.o.check(text);
    if (seq === this.seq && !this.done) this.setError(problem);
    return problem;
  }

  /** Save: unless the check refuses the text, in which case the error shows and the input stays open. */
  async commit(fromBlur = false): Promise<void> {
    if (this.done || this.busy) return;
    this.busy = true;
    try {
      const problem = await this.validate();
      if (problem) {
        this.busy = false;
        if (!fromBlur) this.field.focus();
        return;
      }
    } finally {
      this.busy = false;
    }
    if (this.done) return;
    this.done = true;
    const v = this.field.value;
    this.el.remove();
    this.o.onCommit(v);
  }

  cancel(): void {
    if (this.done) return;
    this.done = true;
    this.el.remove();
    this.o.onCancel();
  }

  /** Remove the input without saving or cancelling (the owner redraws or has gone). */
  dispose(): void {
    this.done = true;
    this.el.remove();
  }
}
