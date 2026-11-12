/** The questions and messages around model edits, shared by the tree commands and the diagram editor. */
import * as vscode from "vscode";
import type { Element, ModelIndex } from "../model/index.js";
import type { DiagramUi } from "../diagram/diagram-editor.js";
import { ADD_KINDS, confirmationText, deleteImpact, kindLabel, nameProblem, needsConfirmation, spot } from "./support.js";
import { allowedChildKinds, kindProblem } from "./kinds.js";
import { type AddSpec, type ModelService, type Origin, type OpResult, type Target } from "./service.js";
import type { Placement } from "./diagram-changes.js";

export class ModelActions {
  constructor(
    readonly service: ModelService,
    private readonly index: ModelIndex,
    private readonly ui: () => DiagramUi,
  ) {}

  /** Show a refusal (with its actions) or the warnings of a success. Returns the result. */
  async report(r: OpResult, what: string): Promise<OpResult> {
    if (!r.ok) {
      await this.ui().fail(r);
      return r;
    }
    if (r.skippedDiagrams?.length) {
      const n = r.skippedDiagrams.length;
      void vscode.window.showWarningMessage(`${what}. ${n} diagram file${n === 1 ? "" : "s"} could not be read and ${n === 1 ? "was" : "were"} not updated; ${n === 1 ? "it" : "they"} may refer to the old name.`);
    }
    if (r.remainingReferences && r.remainingReferences.count > 0) {
      const n = r.remainingReferences.count;
      void vscode.window.showWarningMessage(`${what}. ${n} reference${n === 1 ? "" : "s"} to it remain elsewhere (${r.remainingReferences.locations.slice(0, 3).map(spot).join(", ")}) and will no longer resolve.`);
    }
    if (r.unjudged && (r.unjudged.count > 0 || r.unjudged.skippedDocuments.length > 0)) {
      const n = r.unjudged.count;
      const skipped = r.unjudged.skippedDocuments.length;
      void vscode.window.showWarningMessage(`${what}. ${n ? `${n} reference${n === 1 ? "" : "s"} could not be checked` : ""}${n && skipped ? " and " : ""}${skipped ? `${skipped} file${skipped === 1 ? "" : "s"} with syntax errors ${skipped === 1 ? "was" : "were"} not examined` : ""}; they may need a manual look.`);
    }
    return r;
  }

  /** "Add Child": choose a kind, then a name; undefined when cancelled. */
  async addChild(owner: Element, opts: { origin?: Origin; placement?: Omit<Placement, "diagram"> & { diagram?: string }; kind?: string; type?: string } = {}): Promise<OpResult | undefined> {
    let kind = opts.kind;
    if (!kind) {
      const allowed = new Set(allowedChildKinds(owner));
      if (!allowed.size) {
        void vscode.window.showInformationMessage(`A ${owner.kind} cannot have members.`);
        return undefined;
      }
      const pick = await this.ui().pick(ADD_KINDS.filter((k) => allowed.has(k.kind)).map((k) => ({ label: k.label, description: k.kind, declKind: k.kind })), { title: `Add Child to ${owner.name ?? owner.kind}`, placeHolder: "Choose the kind of element" });
      if (!pick) return undefined;
      kind = pick.declKind;
    }
    // The kind is checked here (before asking for a name) and again by the service; a kind from a webview is never trusted.
    const wrong = kindProblem(owner, kind);
    if (wrong) {
      void vscode.window.showWarningMessage(wrong);
      return { ok: false, reason: wrong };
    }
    const name = await this.ui().input({
      title: `New ${kindLabel(kind)}`,
      prompt: `Name of the new ${kind} in ${owner.name ?? owner.kind}`,
      validateInput: (v) => nameProblem(v, owner),
    });
    if (name === undefined) return undefined;
    const problem = nameProblem(name, owner);
    if (problem) {
      void vscode.window.showWarningMessage(problem);
      return undefined;
    }
    const spec: AddSpec = { kind, name, ...(opts.type ? { type: opts.type } : {}) };
    const r = await this.service.addElement(owner, spec, { ...(opts.origin ?? {}), ...(opts.placement ? { placement: opts.placement } : {}) });
    return this.report(r, `Added ${kind} ${name}`);
  }

  async rename(target: Target, opts: { origin?: Origin; name?: string } = {}): Promise<OpResult | undefined> {
    const el = target.element;
    const refusal = this.service.refuseIfInherited(target, "renamed");
    if (refusal) return this.report(refusal, "");
    const name =
      opts.name ??
      (await this.ui().input({ title: `Rename ${el.name ?? el.kind}`, prompt: "New name", value: el.name ?? "", valueSelection: [0, (el.name ?? "").length], validateInput: (v) => (v === el.name ? undefined : nameProblem(v, el.owner, el)) }));
    if (name === undefined || name === el.name) return undefined;
    const r = await this.service.rename(target, name, opts.origin);
    return this.report(r, `Renamed ${el.name ?? el.kind} to ${name}`);
  }

  async delete(target: Target, opts: { origin?: Origin; alwaysConfirm?: boolean } = {}): Promise<OpResult | undefined> {
    const el = target.element;
    const refusal = this.service.refuseIfInherited(target, "deleted");
    if (refusal) return this.report(refusal, "");
    await this.service.ready();
    const impact = deleteImpact(this.index, el);
    if (opts.alwaysConfirm || needsConfirmation(impact)) {
      const { message, detail } = confirmationText(el, impact);
      if (!(await this.ui().confirm(message, detail, "Delete"))) return undefined;
    }
    const r = await this.service.deleteElement(target, opts.origin);
    return this.report(r, `Deleted ${el.name ?? el.kind}`);
  }
}
