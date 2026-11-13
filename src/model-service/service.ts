/**
 * `ModelService`: the one set of model-changing operations used by the tree, the diagram editor and
 * the agent tools. `vscode`-free core; a host applies the plans. It checks the inherited-feature
 * rule, calls the edit planner, applies ALL text edits of an operation as one workspace edit,
 * saves the touched files, and forces the resulting changes onto diagram files (design D6, D11, D18).
 */
import {
  buildDeclaration, planConnect, planDeleteElement, planInsertMember, planRename, planSatisfy, planSetDocumentation,
  planSetMultiplicity, planSetShortName, planSetType, validatePlan,
  isPlanCurrent, sourceMatches, sourceOf,
  detectIndentUnit, escapeTerminator, newCommentDecl, planAddParagraph, planAddSection, planDerivation, planMoveMember, planRemoveDerivation, planRemoveSatisfy,
  planRemoveVerify, planSetCommentBody, planVerify, type MoveTarget,
  freeNodeName, planAddConnectedNode, planAddMessage, planAddSuccession, planReconnect, planAddTransition, planDeleteBehavior, planSetTransition, type MessageSpec, type TransitionParts,
  type DiagramUpdate, type LoadedDiagram, type PlanOk, type PlanResult, type PlanSource, type RemainingReferences, type TextEdit, type UnjudgedReferences,
} from "../edit/index.js";
import { inheritedVia, isLibraryUri, locate, quoteName, type Element, type ModelIndex } from "../model/index.js";
import { ALL_KINDS, DEFINITION_KINDS, USAGE_KINDS, allowedChildKinds, kindProblem } from "./kinds.js";
import { composeChanges, nameNodesChange, placeElementChange, placeNodeAndLineChange, reconnectChange, addStatementChange, removeEntriesChange, retargetChange, type DiagramChange, type Placement } from "./diagram-changes.js";
import { referenceFor } from "../diagram/resolve.js";
import { analyze, isSynthetic, virtualNode } from "../model/index.js";
import { makeRecord, planRedo, planUndo, type EditRecord } from "./undo.js";

export interface ElementInfo {
  uri: string;
  kind: string;
  name?: string;
  qualifiedName?: string;
}

export interface SourceSpot {
  uri: string;
  /** 0-based. */
  line: number;
  column: number;
}

export interface OpFailure {
  ok: false;
  reason: string;
  /** For syntax-error refusals: where the first error is ("Go to error"). */
  goToError?: SourceSpot;
  /** For refusals on inherited features: the declaring element ("Go to Definition"). */
  goToDefinition?: SourceSpot & { name: string };
}

export interface OpOk {
  ok: true;
  description: string;
  /** URIs of the `.sysml` files whose text changed (all saved). */
  files: string[];
  /** The element the operation created or changed, as it is after the edit. */
  element?: ElementInfo;
  /** Rename: references updated (not counting the declaration) and references that could not be judged. */
  referencesUpdated?: number;
  unjudged?: UnjudgedReferences;
  /** Delete: references to the deleted element (or what it owned) that remain elsewhere. */
  remainingReferences?: RemainingReferences;
  /** Rename: diagram files that could not be parsed and were not updated. */
  skippedDiagrams?: string[];
  /** What the operation did to the text, for undo and redo. */
  record: EditRecord;
  /** What it forced on diagram files, if anything. */
  diagramChange?: DiagramChange;
  /** URIs of the diagram files written to disk. */
  diagramFiles: string[];
  /**
   * Set when the edit was applied but some documents could not be saved: they keep the edit as unsaved changes in
   * the editor. `unsaved` lists their URIs; the rest of `files` was saved.
   */
  saveError?: { unsaved: string[]; message: string };
  /** Diagram files a forced change could not be written to (`failed`) or did not apply to (`skipped`, e.g. a diagram with parse errors). */
  diagramProblems?: { failed: string[]; skipped: string[] };
  /** Closed diagram files that changed on disk after the plan was made and so were not updated. */
  diagramsChangedMeanwhile?: string[];
}

export type OpResult = OpOk | OpFailure;

/** `unsaved`: URIs of documents the edit was applied to but that could not be saved. */
export type ApplyOutcome = { ok: true; unsaved?: string[] } | { ok: false; stale: true } | { ok: false; stale?: false; reason: string };

/** What `ModelService` needs from its environment; the VS Code implementation is in `vscode-host.ts`. */
export interface ModelHost {
  readonly index: ModelIndex;
  /** Make the index reflect the open editors, and wait until syntax details have settled. */
  sync(): Promise<void>;
  /** The text of a document as it is now (the open buffer, else the file). */
  currentText(uri: string): Promise<string | undefined>;
  /**
   * Apply the edits as ONE workspace edit if every edited document still has the text its `sources`
   * entry describes (`sourceMatches`), then save each touched document.
   */
  applyAndSave(edits: readonly TextEdit[], sources: readonly PlanSource[]): Promise<ApplyOutcome>;
  /** Saved state of the diagram files that are not open in an editor (open ones follow renames themselves). */
  closedDiagrams(): Promise<LoadedDiagram[]>;
  writeDiagramFiles(updates: readonly DiagramUpdate[]): Promise<void>;
  /** Apply or revert a forced change on the matching diagram files. */
  forceDiagramChange(change: DiagramChange, mode: "apply" | "revert"): Promise<ForceOutcome>;
  /** Why a document must not be edited (outside every workspace folder, excluded by `sysml.exclude`, ...), or undefined. */
  editBlocker?(uri: string): string | undefined;
  /** Show the user a warning, with an optional action (a VS Code command). */
  warn?(message: string, action?: { label: string; command: string }): void;
  /** A model edit was made from a diagram: record one undo entry there. */
  recordUndoEntry?(originDiagram: string, result: OpOk): void;
}

export interface ForceOutcome {
  /** URIs written. */
  written: string[];
  /** URIs where writing or applying threw. */
  failed: string[];
  /** URIs the change could not be applied to (the diagram has parse errors). */
  skipped: string[];
}

export interface Origin {
  /** URI of the diagram the edit is made from (it gets the undo entry). */
  diagram?: string;
}

export interface AddSpec {
  /** Declaration kind, e.g. `part`, `part def`, `port`. */
  kind: string;
  name?: string;
  shortName?: string;
  /** Qualified name or name of the type (usages only). */
  type?: string;
  multiplicity?: string;
  documentation?: string;
}

export interface Properties {
  name?: string;
  shortName?: string | null;
  /** Qualified name or name; `null` removes the type. */
  type?: string | null;
  multiplicity?: string | null;
  documentation?: string | null;
}

export interface Target {
  element: Element;
  /** The element it is shown in, when that is not its owner (the usage that inherits it). */
  context?: Element;
}

import { dependentsOf } from "../edit/index.js";
import { referenceKey as referenceKeyOf } from "../diagram/resolve.js";
const dependentStatements = dependentsOf;

const nameOfUri = (uri: string) => decodeURIComponent(uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri);

const unsavedMessage = (unsaved: readonly string[]): string =>
  `The edit was applied, but ${unsaved.map(nameOfUri).join(", ")} could not be saved. ${unsaved.length === 1 ? "It keeps" : "They keep"} the change as unsaved edits in the editor; save ${unsaved.length === 1 ? "it" : "them"} to keep the change on disk.`;

const fail = (reason: string, extra: Partial<OpFailure> = {}): OpFailure => ({ ok: false, reason, ...extra });
const info = (e: Element): ElementInfo => ({ uri: e.uri, kind: e.kind, ...(e.name !== undefined ? { name: e.name } : {}), ...(e.qualifiedName !== undefined ? { qualifiedName: e.qualifiedName } : {}) });

/** The nearest element that owns both (never one of the two themselves). */
export function commonOwner(a: Element, b: Element): Element | undefined {
  const chain = new Set<Element>();
  for (let o = a.owner; o; o = o.owner) chain.add(o);
  for (let o = b.owner; o; o = o.owner) if (chain.has(o)) return o;
  return undefined;
}

export { ALL_KINDS, DEFINITION_KINDS, USAGE_KINDS, allowedChildKinds };

/** The message for an element that is no longer in the model: said once it really changed, and naming it. */
function gone(what: string, el?: Element | Target | string): string {
  const e = el !== undefined && typeof el !== "string" && "element" in el ? el.element : el;
  const name = typeof e === "string" ? e : e?.qualifiedName ?? e?.name;
  return `${what}${name ? ` (${name})` : ""} is no longer in the model: it was renamed, moved or deleted since it was read. Refresh and try again.`;
}

export class ModelService {
  /** Operations are serialised: two edits never plan against the same text at once. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly host: ModelHost) {}

  private get index(): ModelIndex {
    return this.host.index;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.queue.then(fn, fn);
    this.queue = r.catch(() => undefined);
    return r;
  }

  /** The element as it is in the current model (it may have been re-parsed since the caller read it). */
  private fresh(el: Element): Element | undefined {
    const state = this.index.getDocument(el.uri);
    if (!state) return undefined;
    let root = el;
    while (root.owner) root = root.owner;
    if (state.model.roots.includes(root)) return el;
    if (el.qualifiedName === undefined) return undefined;
    return this.index.findByQualifiedName(el.qualifiedName).find((x) => x.kind === el.kind && x.uri === el.uri);
  }

  private spot(uri: string): SourceSpot | undefined {
    const e = this.index.getDocument(uri)?.errors[0];
    return e ? { uri, line: e.line, column: e.column } : undefined;
  }

  private failure(reason: string, uris: string[]): OpFailure {
    for (const u of uris) {
      const s = this.spot(u);
      if (s && /syntax error/.test(reason)) return fail(reason, { goToError: s });
    }
    return fail(reason);
  }

  /** Why `uri` must not be edited: library content, not a file on disk, or what the host says (outside the workspace, excluded). */
  blockedReason(uri: string): string | undefined {
    const n = nameOfUri(uri);
    if (isLibraryUri(uri)) return `${n} is standard library content, which is read-only.`;
    if (!uri.startsWith("file:")) return `${n} is not a file on disk, so it cannot be edited.`;
    return this.host.editBlocker?.(uri);
  }

  private guard(uris: readonly string[]): OpFailure | undefined {
    for (const u of new Set(uris)) {
      const why = this.blockedReason(u);
      if (why) return fail(why);
    }
    return undefined;
  }

  private warn(message: string, action?: { label: string; command: string }): void {
    this.host.warn?.(message, action);
  }

  /** Plan, apply, save and force diagram changes; re-plans once when the text changed in between. */
  private async run(
    plan: () => PlanResult | OpFailure | Promise<PlanResult | OpFailure>,
    after: (plan: PlanOk, ctx: { before: ReadonlyMap<string, string> }) => { element?: () => Element | undefined; change?: () => DiagramChange | undefined; extra?: Partial<OpOk> },
    origin: Origin | undefined,
    touched: () => string[],
  ): Promise<OpResult> {
    const blockedTarget = this.guard(touched());
    if (blockedTarget) return blockedTarget;
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.host.sync();
      const p = await plan();
      if (!p.ok) return this.failure(p.reason, touched());
      if (p.edits.length === 0) return fail("Nothing to change.");
      const blocked = this.guard(p.edits.map((e) => e.uri));
      if (blocked) return blocked;
      // The one staleness check: everything the plan read or edits must still have the text it was computed from.
      const sources = p.sources ?? [];
      // Documents that are written (and diagram files) are read from the host as they are now; the others
      // are compared with the model the plan was computed from.
      const present = new Map<string, string | undefined>();
      const written = new Set([...p.edits.map((e) => e.uri), ...(p.diagramUpdates?.map((u) => u.uri) ?? [])]);
      for (const s of sources) if (written.has(s.uri)) present.set(s.uri, await this.host.currentText(s.uri));
      if (!isPlanCurrent((u) => (present.has(u) ? present.get(u) : this.index.getDocument(u)?.text), p)) {
        continue;
      }
      const base = new Map<string, string>();
      for (const uri of new Set(p.edits.map((e) => e.uri))) {
        const t = present.get(uri) ?? this.index.getDocument(uri)?.text;
        if (t === undefined) return fail(`${nameOfUri(uri)} is not loaded, so it cannot be edited.`);
        base.set(uri, t);
      }
      const record = makeRecord(p.edits, base);
      const hooks = after(p, { before: base });
      const outcome = await this.host.applyAndSave(p.edits, sources);
      if (!outcome.ok && outcome.stale) continue;
      if (!outcome.ok) return fail(outcome.reason);
      // From here the edit IS applied (documents that could not be saved keep it as unsaved changes): everything
      // that belongs to the operation still happens, and the result says what was and was not saved.
      const unsaved = outcome.unsaved ?? [];
      await this.host.sync();
      const diagramFiles: string[] = [];
      const changedMeanwhile: string[] = [];
      if (p.diagramUpdates?.length) {
        // A closed diagram is only written when its file still has the text the update was computed from.
        const fresh: DiagramUpdate[] = [];
        for (const u of p.diagramUpdates) {
          const src = sources.find((x) => x.uri === u.uri);
          if (src && sourceMatches(src, await this.host.currentText(u.uri))) fresh.push(u);
          else changedMeanwhile.push(u.uri);
        }
        if (fresh.length) await this.host.writeDiagramFiles(fresh);
        diagramFiles.push(...fresh.map((u) => u.uri));
      }
      const el = hooks.element?.();
      const change = hooks.change?.();
      let diagramProblems: { failed: string[]; skipped: string[] } | undefined;
      if (change) {
        const f = await this.host.forceDiagramChange(change, "apply");
        diagramFiles.push(...f.written);
        if (f.failed.length || f.skipped.length) diagramProblems = { failed: f.failed, skipped: f.skipped };
      }
      const files = [...base.keys()];
      const result: OpOk = {
        ok: true,
        description: p.description,
        files,
        ...(el ? { element: info(el) } : {}),
        ...(p.unjudged ? { unjudged: p.unjudged } : {}),
        ...(p.remainingReferences ? { remainingReferences: p.remainingReferences } : {}),
        ...(p.skippedDiagrams?.length ? { skippedDiagrams: p.skippedDiagrams } : {}),
        record,
        ...(change ? { diagramChange: change } : {}),
        diagramFiles,
        ...(unsaved.length ? { saveError: { unsaved, message: unsavedMessage(unsaved) } } : {}),
        ...(diagramProblems ? { diagramProblems } : {}),
        ...(changedMeanwhile.length ? { diagramsChangedMeanwhile: changedMeanwhile } : {}),
        ...hooks.extra,
      };
      if (origin?.diagram) this.host.recordUndoEntry?.(origin.diagram, result);
      this.noteUnsaved(unsaved);
      if (diagramProblems) {
        const names = [...diagramProblems.failed, ...diagramProblems.skipped].map(nameOfUri);
        this.warn(`${p.description}: ${names.length} diagram file${names.length === 1 ? "" : "s"} could not be updated (${names.join(", ")}); ${names.length === 1 ? "it" : "they"} may not match the model.`);
      }
      if (changedMeanwhile.length) {
        this.warn(`${p.description}: ${changedMeanwhile.map(nameOfUri).join(", ")} changed on disk while the edit was being made and ${changedMeanwhile.length === 1 ? "was" : "were"} not updated; ${changedMeanwhile.length === 1 ? "it" : "they"} may refer to the old name.`);
      }
      return result;
    }
    return fail("The file changed while the edit was being prepared, twice. Nothing was changed; try again.");
  }

  /** The user is told which files could not be saved, with a "Save All" action. */
  private noteUnsaved(unsaved: readonly string[]): void {
    if (unsaved.length) this.warn(unsavedMessage(unsaved), { label: "Save All", command: "workbench.action.files.saveAll" });
  }

  // ---- inherited rule ------------------------------------------------------------------------

  /** Resolves once the index reflects the open editors. */
  ready(): Promise<void> {
    return this.host.sync();
  }

  /** The refusal for an edit of a feature that `t.context` only inherits, or undefined. */
  refuseIfInherited(t: Target, what: string): OpFailure | undefined {
    return this.inheritedRefusal(t, what);
  }

  /**
   * Refuse an edit of a feature that `target.context` only inherits, or of anything beneath such a feature
   * (an own member of an inherited feature is part of the definition that declares it).
   */
  private inheritedRefusal(t: Target, what: string): OpFailure | undefined {
    if (!t.context) return undefined;
    const via = inheritedVia(this.index, t.element, t.context);
    if (!via) return undefined;
    const from = via.declaredIn;
    const def = from.name ?? from.kind;
    const name = t.element.name ?? t.element.kind;
    const where = via.member === t.element ? `'${name}' is inherited` : `'${name}' lies beneath '${via.member.name ?? via.member.kind}', which is inherited`;
    const spot = { uri: from.uri, line: (from.nameRange ?? from.range).start.line, column: (from.nameRange ?? from.range).start.column, name: from.qualifiedName ?? def };
    return fail(
      `${where} from ${def}${from.qualifiedName ? ` (${from.qualifiedName})` : ""}, so it cannot be ${what} from ${t.context.qualifiedName ?? t.context.name ?? "this element"}. Change it in ${def} instead (Go to Definition); that changes every usage of ${def}.`,
      { goToDefinition: spot },
    );
  }

  /** Locate an element by qualified name, also through inheritance (`Model::vehicle1::engine`). */
  find(qualifiedName: string): Target | undefined {
    return locate(this.index, qualifiedName);
  }

  private resolveType(text: string, from: Element): Element | OpFailure {
    const direct = this.index.findByQualifiedName(text)[0] ?? this.index.resolve(text, from);
    return direct ?? fail(`No element named '${text}' was found to use as a type.`);
  }

  // ---- operations ----------------------------------------------------------------------------

  addElement(owner: Element, spec: AddSpec, opts: Origin & { placement?: Omit<Placement, "diagram"> & { diagram?: string }; context?: Element } = {}): Promise<OpResult> {
    return this.serial(async () => {
      if (opts.context) {
        const refusal = this.inheritedRefusal({ element: owner, context: opts.context }, "extended");
        if (refusal) return refusal;
      }
      let created: Element | undefined;
      const ownerQn = owner.qualifiedName;
      const pre = new Map<string, number>();
      const sig = (m: Element) => `${m.kind}\0${m.name ?? ""}\0${m.ends.join("|")}`;
      let ownerNow: Element | undefined;
      const findOwner = (): Element | undefined => {
        if (ownerQn !== undefined) return this.index.findByQualifiedName(ownerQn).find((x) => x.uri === owner.uri && x.kind === owner.kind) ?? this.index.findByQualifiedName(ownerQn)[0];
        return this.fresh(owner);
      };
      return this.run(
        () => {
          ownerNow = findOwner();
          if (!ownerNow) return fail(gone("The element to add to", owner));
          const kindWrong = kindProblem(ownerNow, spec.kind);
          if (kindWrong) return fail(kindWrong);
          pre.clear();
          for (const m of ownerNow.members) pre.set(sig(m), (pre.get(sig(m)) ?? 0) + 1);
          let type: Element | string | undefined;
          if (spec.type !== undefined && spec.type.trim() !== "") {
            const t = this.resolveType(spec.type.trim(), ownerNow);
            if ("ok" in t) return t;
            type = t;
          }
          const memberSpec = { kind: spec.kind, ...(spec.name !== undefined ? { name: spec.name } : {}), ...(spec.shortName ? { shortName: spec.shortName } : {}), ...(type !== undefined ? { type } : {}), ...(spec.multiplicity ? { multiplicity: spec.multiplicity } : {}) };
          if (!spec.documentation) return planInsertMember(this.index, ownerNow, memberSpec);
          const b = buildDeclaration(this.index, ownerNow, memberSpec);
          if (!b.ok) return b;
          const docText = newCommentDecl("doc", escapeTerminator(spec.documentation.replace(/\r\n/g, "\n").trim()), "\n", "");
          const unit = detectIndentUnit(this.index.getDocument(ownerNow.uri)?.text ?? "");
          const decl = b.text.replace(/;$/, ` {\n${unit}${docText.split("\n").join("\n" + unit)}\n}`);
          return planInsertMember(this.index, ownerNow, decl);
        },
        () => ({
          element: () => {
            const o = findOwner();
            created = o ? o.members.find((m) => !((pre.get(sig(m)) ?? 0) > 0) && sig(m).startsWith(`${spec.kind}\0${spec.name ?? ""}\0`)) : undefined;
            if (!created && o && spec.name !== undefined) created = o.members.find((m) => m.name === spec.name);
            return created;
          },
          ...(opts.placement?.diagram
            ? { change: () => placeElementChange(this.index, () => created ?? findOwner()?.members.find((m) => m.name === spec.name), { diagram: opts.placement!.diagram!, ...(opts.placement!.parentNode !== undefined ? { parentNode: opts.placement!.parentNode } : {}), ...(opts.placement!.x !== undefined ? { x: opts.placement!.x } : {}), ...(opts.placement!.y !== undefined ? { y: opts.placement!.y } : {}) }, `Add ${spec.name ?? spec.kind}`) }
            : {}),
        }),
        opts.diagram ? { diagram: opts.diagram } : undefined,
        () => [owner.uri],
      );
    });
  }

  deleteElement(t: Target, origin?: Origin): Promise<OpResult> {
    return this.serial(async () => {
      const refusal = this.inheritedRefusal(t, "deleted");
      if (refusal) return refusal;
      await this.host.sync();
      const first = this.fresh(t.element);
      const top = first?.qualifiedName !== undefined ? [first.qualifiedName] : [];
      // Unnamed statements (successions, transitions, messages) are found in diagrams by their locators.
      const keys: string[] = [];
      return this.run(
        () => {
          const el = this.fresh(t.element);
          if (!el) return fail(gone("The element", t.element));
          keys.length = 0;
          for (const d of [el, ...dependentStatements(this.index, el)]) {
            const ref = d.qualifiedName === undefined ? referenceFor(d, this.index) : undefined;
            if (ref) keys.push(referenceKeyOf(ref));
          }
          return planDeleteBehavior(this.index, el);
        },
        () => ({ ...(top.length || keys.length ? { change: () => removeEntriesChange(top, `Delete ${t.element.name ?? t.element.kind}`, keys) } : {}) }),
        origin,
        () => [t.element.uri],
      );
    });
  }

  rename(t: Target, newName: string, origin?: Origin): Promise<OpResult> {
    return this.serial(async () => {
      const refusal = this.inheritedRefusal(t, "renamed");
      if (refusal) return refusal;
      let updated = 0;
      return this.run(
        async () => {
          const el = this.fresh(t.element);
          if (!el) return fail(gone("The element", t.element));
          // Read inside the plan, so a re-plan sees the diagram files as they are now.
          const closed = await this.host.closedDiagrams();
          const r = planRename(this.index, el, newName, { diagrams: closed });
          if (r.ok) updated = Math.max(0, r.edits.length - 1);
          return r;
        },
        () => ({ element: () => this.relocateRenamed(t.element, newName), extra: {} }),
        origin,
        () => [t.element.uri],
      ).then((r) => (r.ok ? { ...r, referencesUpdated: updated } : r));
    });
  }

  private relocateRenamed(old: Element, newName: string): Element | undefined {
    if (old.qualifiedName === undefined) return undefined;
    const parts = old.qualifiedName.split("::");
    parts[parts.length - 1] = quoteName(newName);
    return this.index.findByQualifiedName(parts.join("::"))[0];
  }

  setProperties(t: Target, props: Properties, origin?: Origin): Promise<OpResult> {
    return this.serial(async () => {
      const what = props.name !== undefined ? "renamed" : props.type !== undefined ? "retyped" : "changed";
      const refusal = this.inheritedRefusal(t, what);
      if (refusal) return refusal;
      let updated: number | undefined;
      return this.run(
        async () => {
          const el = this.fresh(t.element);
          if (!el) return fail(gone("The element", t.element));
          const plans: PlanResult[] = [];
          if (props.name !== undefined && props.name !== el.name) {
            const closed = await this.host.closedDiagrams();
            const r = planRename(this.index, el, props.name, { diagrams: closed });
            if (r.ok) updated = Math.max(0, r.edits.length - 1);
            plans.push(r);
          }
          if (props.type !== undefined) {
            if (props.type === null || props.type.trim() === "") {
              if (el.types.length) plans.push(planSetType(this.index, el, undefined));
            } else {
              const ty = this.resolveType(props.type.trim(), el);
              if ("ok" in ty) return ty;
              if (!(el.typeNames.length === 1 && this.index.resolve(el.typeNames[0]!, el) === ty)) plans.push(planSetType(this.index, el, ty));
            }
          }
          if (props.multiplicity !== undefined) {
            const m = props.multiplicity === null || props.multiplicity.trim() === "" ? undefined : props.multiplicity;
            const cur = el.multiplicity;
            const norm = m === undefined ? undefined : "[" + m.trim().replace(/^\[|\]$/g, "").replace(/\s+/g, "") + "]";
            if (norm !== cur) plans.push(planSetMultiplicity(this.index, el, m));
          }
          if (props.shortName !== undefined) {
            const s = props.shortName === null || props.shortName === "" ? undefined : props.shortName;
            if (s !== el.shortName) plans.push(planSetShortName(this.index, el, s));
          }
          if (props.documentation !== undefined) {
            const d = props.documentation === null || props.documentation === "" ? undefined : props.documentation;
            if ((d ?? "") !== (el.documentation ?? "")) plans.push(planSetDocumentation(this.index, el, d));
          }
          if (!plans.length) return fail("Nothing to change: the element already has these values.");
          return this.merge(plans);
        },
        () => ({
          element: () => (props.name !== undefined && props.name !== t.element.name ? this.relocateRenamed(t.element, props.name) : this.fresh(t.element)),
          extra: {},
        }),
        origin,
        () => [t.element.uri],
      ).then((r) => (r.ok && updated !== undefined ? { ...r, referencesUpdated: updated } : r));
    });
  }

  /** Several plans for one element as one: their edits must not overlap. */
  private merge(plans: PlanResult[]): PlanResult {
    const edits: TextEdit[] = [];
    const descriptions: string[] = [];
    let diagramUpdates: DiagramUpdate[] | undefined;
    let unjudged: UnjudgedReferences | undefined;
    let skippedDiagrams: string[] | undefined;
    const sources: PlanSource[] = [];
    const reads = new Set<string>();
    for (const p of plans) {
      if (!p.ok) return p;
      edits.push(...p.edits);
      descriptions.push(p.description);
      if (p.diagramUpdates) diagramUpdates = p.diagramUpdates;
      if (p.unjudged) unjudged = p.unjudged;
      if (p.skippedDiagrams) skippedDiagrams = p.skippedDiagrams;
      sources.push(...(p.sources ?? []));
      for (const r of p.reads ?? []) reads.add(r);
    }
    const merged: PlanOk = { ok: true, edits, description: descriptions.join("; "), ...(diagramUpdates ? { diagramUpdates } : {}), ...(unjudged ? { unjudged } : {}), ...(skippedDiagrams ? { skippedDiagrams } : {}), sources, reads: [...reads] };
    return validatePlan(this.index, merged);
  }

  connect(owner: Element, source: Target | string, target: Target | string, opts: Origin & { placement?: Omit<Placement, "diagram"> & { diagram?: string } } = {}): Promise<OpResult> {
    return this.serial(async () => {
      let created: Element | undefined;
      const sig = (m: Element) => `${m.kind}\0${m.name ?? ""}\0${m.ends.join("|")}`;
      const pre = new Map<string, number>();
      const ownerQn = owner.qualifiedName;
      const findOwner = () => (ownerQn !== undefined ? this.index.findByQualifiedName(ownerQn).find((x) => x.uri === owner.uri) : this.fresh(owner));
      return this.run(
        () => {
          const o = findOwner();
          if (!o) return fail(gone("The element to add the connection to", owner));
          pre.clear();
          for (const m of o.members) pre.set(sig(m), (pre.get(sig(m)) ?? 0) + 1);
          const a = typeof source === "string" ? source : this.freshEnd(source, o);
          const b = typeof target === "string" ? target : this.freshEnd(target, o);
          if (typeof a !== "string" && !a) return fail(gone("The source of the connection", source));
          if (typeof b !== "string" && !b) return fail(gone("The target of the connection", target));
          return planConnect(this.index, o, a as Element | string, b as Element | string);
        },
        () => ({
          element: () => {
            created = findOwner()?.members.find((m) => m.kind === "connect" && !((pre.get(sig(m)) ?? 0) > 0));
            return created;
          },
          ...(opts.placement?.diagram
            ? { change: () => placeElementChange(this.index, () => created, { diagram: opts.placement!.diagram!, ...(opts.placement!.parentNode !== undefined ? { parentNode: opts.placement!.parentNode } : {}) }, "Connect") }
            : {}),
        }),
        opts.diagram ? { diagram: opts.diagram } : undefined,
        () => [owner.uri],
      );
    });
  }

  // ---- behaviour: successions, transitions, messages ------------------------------------------

  /** A statement written into `owner` (a succession, transition or message), placed on the diagram it was drawn on. */
  private statementIn(owner: Element, kind: string, plan: (o: Element) => PlanResult | OpFailure, opts: Origin & { placement?: Omit<Placement, "diagram"> & { diagram?: string } }, label: string): Promise<OpResult> {
    return this.serial(async () => {
      let created: Element | undefined;
      const sig = (m: Element) => `${m.kind}\0${m.name ?? ""}\0${m.ends.join("|")}\0${this.index.getDocument(m.uri)?.text.slice(m.range.start.offset, m.range.end.offset) ?? ""}`;
      const pre = new Map<string, number>();
      const ownerQn = owner.qualifiedName;
      const findOwner = () => (ownerQn !== undefined ? this.index.findByQualifiedName(ownerQn).find((x) => x.uri === owner.uri && x.kind === owner.kind) ?? this.index.findByQualifiedName(ownerQn)[0] : this.fresh(owner));
      let named: NonNullable<PlanOk["namedNodes"]> = [];
      return this.run(
        () => {
          const o = findOwner();
          if (!o) return fail(gone("The element to add to", owner));
          pre.clear();
          for (const m of o.members) pre.set(sig(m), (pre.get(sig(m)) ?? 0) + 1);
          const p = plan(o);
          named = p.ok ? p.namedNodes ?? [] : [];
          return p;
        },
        () => ({
          element: () => {
            const seen = new Map<string, number>();
            created = findOwner()?.members.find((m) => {
              if (m.kind !== kind) return false;
              const k = sig(m);
              const n = (seen.get(k) ?? 0) + 1;
              seen.set(k, n);
              return n > (pre.get(k) ?? 0);
            });
            return created;
          },
          change: () => {
            const stmt = addStatementChange(this.index, () => created, opts.placement?.diagram ? placeElementChange(this.index, () => created, { diagram: opts.placement.diagram }, label) : undefined, label);
            // Nodes the statement named follow in the same change, before the statement's edge is placed.
            return named.length ? composeChanges(nameNodesChange(named, label), stmt, label) : stmt;
          },
        }),
        opts.diagram ? { diagram: opts.diagram } : undefined,
        () => [owner.uri],
      );
    });
  }

  /**
   * `first a then b;` in the nearest common owner of the two nodes: `owner` itself, or the action or state between
   * them that holds both. An end nested below that owner is written as a dotted path (`first a then group.b;`).
   */
  addSuccession(owner: Element, source: Element, target: Element, opts: Origin & { guard?: string; context?: Element; placement?: Omit<Placement, "diagram"> & { diagram?: string } } = {}): Promise<OpResult> {
    const o = this.commonOwner(owner, source, target, "succession", opts.context);
    if (typeof o === "string") return Promise.resolve(fail(o));
    return this.statementIn(o, "succession", (o2) => {
      const a = this.resolveNode(o2, source, "source"), b = this.resolveNode(o2, target, "target");
      if (typeof a === "string") return fail(a);
      if (typeof b === "string") return fail(b);
      return planAddSuccession(this.index, o2, a, b, opts.guard);
    }, opts, "Add succession");
  }

  /** `transition first a [accept T] [if g] [do e] then b;` in the nearest common owner of the two states (see `addSuccession`). */
  addTransition(owner: Element, source: Element, target: Element, parts: TransitionParts = {}, opts: Origin & { context?: Element; placement?: Omit<Placement, "diagram"> & { diagram?: string } } = {}): Promise<OpResult> {
    const o = this.commonOwner(owner, source, target, "transition", opts.context);
    if (typeof o === "string") return Promise.resolve(fail(o));
    return this.statementIn(o, "transition", (o2) => {
      const a = this.resolveNode(o2, source, "source"), b = this.resolveNode(o2, target, "target");
      if (typeof a === "string") return fail(a);
      if (typeof b === "string") return fail(b);
      return planAddTransition(this.index, o2, a, b, parts);
    }, opts, "Add transition");
  }

  /** Where a statement between two nodes is written: the nearest element that holds both (at or below `owner`). */
  private commonOwner(owner: Element, source: Element, target: Element, what: string, context?: Element): Element | string {
    // Shown in a usage's diagram, an end it only inherits belongs to the definition: that is not changed from the usage (D18).
    if (context) {
      for (const e of [source, target]) {
        const refusal = this.inheritedRefusal({ element: e, context }, `connected by a ${what}`);
        if (refusal) return refusal.reason;
      }
    }
    const chain = (e: Element): Element[] => {
      const out: Element[] = [];
      // Both a start or done node and any other node are held by the element that owns them.
      for (let x: Element | undefined = e.owner; x; x = x.owner) out.push(x);
      return out;
    };
    const ca = chain(source), cb = chain(target);
    const shared = ca.find((x) => cb.includes(x));
    const label = (e: Element) => e.name ?? e.kind;
    if (!shared) return `The ${what} ends ${label(source)} and ${label(target)} are in different parts of the model (they have no common owner), so no ${what} can connect them.`;
    if (shared !== owner && !chain(shared).includes(owner)) {
      return `The ${what} ends ${label(source)} and ${label(target)} are not both inside ${owner.name ?? owner.kind}; their common owner is ${shared.name ?? shared.kind}.`;
    }
    if (context && shared !== context && !chain(shared).includes(context)) {
      return `The common owner of the ${what} ends (${label(shared)}) is not ${label(context)} or inside it, so the ${what} would change ${label(shared)} from another element's diagram. Change it in ${label(shared)} instead.`;
    }
    return shared;
  }

  /** `message [name] [of T] from a to b;` in the interaction `owner`, after its last message. */
  addMessage(owner: Element, from: string, to: string, spec: { name?: string; itemType?: string } = {}, opts: Origin & { placement?: Omit<Placement, "diagram"> & { diagram?: string } } = {}): Promise<OpResult> {
    return this.statementIn(owner, "message", (o) => {
      const ms: MessageSpec = { ...(spec.name !== undefined && spec.name !== "" ? { name: spec.name } : {}) };
      if (spec.itemType !== undefined && spec.itemType.trim() !== "") {
        const t = this.index.findByQualifiedName(spec.itemType.trim())[0] ?? this.index.resolve(spec.itemType.trim(), o);
        ms.itemType = t ?? spec.itemType.trim();
      }
      return planAddMessage(this.index, o, from, to, ms);
    }, opts, "Add message");
  }

  /** Change trigger, guard or effect of a transition: the whole statement is written again from its parts. */
  setTransition(transition: Element, parts: TransitionParts, origin?: Origin): Promise<OpResult> {
    return this.serial(async () => {
      let oldKey: string | undefined;
      let now: Element | undefined;
      let want: { src: string; tgt: string; trigger?: string; guard?: string; effect?: string } | undefined;
      const ownerQn = transition.owner?.qualifiedName;
      const norm = (x: string | undefined) => (x ?? "").replace(/\s+/g, " ").trim();
      return this.run(
        () => {
          const el = this.fresh(transition);
          if (!el) return fail(gone("The transition", transition));
          const ref = referenceFor(el, this.index);
          oldKey = ref ? referenceKeyOf(ref) : undefined;
          const info = el.owner ? analyze(this.index, el.owner).transitions.find((t) => t.statement === el) : undefined;
          if (info) want = { src: info.source.name ?? info.source.kind, tgt: info.target.name ?? info.target.kind, trigger: parts.trigger ?? info.trigger, guard: parts.guard ?? info.guard, effect: parts.effect ?? info.effect };
          return planSetTransition(this.index, el, parts);
        },
        () => ({
          element: () => {
            // The rewritten statement names its source: find it again by its ends and parts.
            const o = ownerQn !== undefined ? this.index.findByQualifiedName(ownerQn).find((x) => x.uri === transition.uri) : undefined;
            if (!o || !want) return undefined;
            const w = want;
            now = analyze(this.index, o).transitions.find((t) => (t.source.name ?? t.source.kind) === w.src && (t.target.name ?? t.target.kind) === w.tgt && norm(t.trigger) === norm(w.trigger) && norm(t.guard) === norm(w.guard) && norm(t.effect) === norm(w.effect))?.statement;
            return now;
          },
          change: () => retargetChange(oldKey, () => (now ? referenceFor(now, this.index) : undefined), "Change transition"),
        }),
        origin,
        () => [transition.uri],
      );
    });
  }

  /**
   * A new node of `kind` and the succession or transition from `source` to it, as one edit (one undo step). The node gets the
   * next free name of its kind in the source's owner; on a diagram it is placed at the placement, with the line.
   */
  addConnectedNode(source: Element, kind: string, relation: "succession" | "transition", opts: Origin & { context?: Element; placement?: Omit<Placement, "diagram"> & { diagram?: string } } = {}): Promise<OpResult> {
    return this.serial(async () => {
      if (opts.context) {
        const refusal = this.inheritedRefusal({ element: source, context: opts.context }, `connected by a ${relation}`);
        if (refusal) return refusal;
      }
      const owner = source.owner;
      if (!owner) return fail("The source has no owner, so there is nowhere to write the line.");
      let node: Element | undefined;
      let stmt: Element | undefined;
      let name = "";
      let named: NonNullable<PlanOk["namedNodes"]> = [];
      const ownerQn = owner.qualifiedName;
      const sig = (m: Element) => `${m.kind}\0${m.name ?? ""}\0${m.ends.join("|")}\0${this.index.getDocument(m.uri)?.text.slice(m.range.start.offset, m.range.end.offset) ?? ""}`;
      const pre = new Map<string, number>();
      const findOwner = () => (ownerQn !== undefined ? this.index.findByQualifiedName(ownerQn).find((x) => x.uri === owner.uri && x.kind === owner.kind) ?? this.index.findByQualifiedName(ownerQn)[0] : this.fresh(owner));
      const label = `Add ${kind} and ${relation}`;
      // Looked up again on every apply, so a redo does not use elements of an older index.
      const locateNode = () => findOwner()?.members.find((m) => m.name === name);
      const locateStmt = () => (name === "" ? undefined : findOwner()?.members.find((m) => m.kind === relation && m.ends.some((e) => e.trim() === name)));
      return this.run(
        () => {
          const o = findOwner();
          if (!o) return fail(gone("The element to add to", owner));
          const src = this.resolveNode(o, source, "source");
          if (typeof src === "string") return fail(src);
          pre.clear();
          for (const m of o.members) pre.set(sig(m), (pre.get(sig(m)) ?? 0) + 1);
          name = freeNodeName(this.index, o, kind);
          const p = planAddConnectedNode(this.index, o, src, kind, relation, name);
          named = p.ok ? p.namedNodes ?? [] : [];
          return p;
        },
        () => ({
          element: () => {
            node = locateNode();
            const seen = new Map<string, number>();
            stmt = locateStmt() ?? findOwner()?.members.find((m) => {
              if (m.kind !== relation) return false;
              const k = sig(m);
              const n = (seen.get(k) ?? 0) + 1;
              seen.set(k, n);
              return n > (pre.get(k) ?? 0);
            });
            return node;
          },
          change: () => {
            const d = opts.placement?.diagram;
            const place = d
              ? placeNodeAndLineChange(
                  placeElementChange(this.index, locateNode, { diagram: d, ...(opts.placement!.parentNode !== undefined ? { parentNode: opts.placement!.parentNode } : {}), ...(opts.placement!.x !== undefined ? { x: opts.placement!.x } : {}), ...(opts.placement!.y !== undefined ? { y: opts.placement!.y } : {}) }, label),
                  placeElementChange(this.index, () => locateStmt() ?? stmt, { diagram: d }, label),
                  label,
                )
              : undefined;
            const change = addStatementChange(this.index, () => locateStmt() ?? stmt, place, label);
            return named.length ? composeChanges(nameNodesChange(named, label), change, label) : change;
          },
        }),
        opts.diagram ? { diagram: opts.diagram } : undefined,
        () => [owner.uri],
      );
    });
  }

  /** Move one end of a succession, transition or item flow to `node`; the rest of the statement stays as written. */
  reconnect(statement: Element, end: "source" | "target", node: Element, opts: Origin & { context?: Element } = {}): Promise<OpResult> {
    return this.serial(async () => {
      if (opts.context) {
        for (const e of [statement, node]) {
          const refusal = this.inheritedRefusal({ element: e, context: opts.context }, "connected");
          if (refusal) return refusal;
        }
      }
      let oldKey: string | undefined;
      let nowStmt: Element | undefined;
      let endKey: string | undefined;
      let named: NonNullable<PlanOk["namedNodes"]> = [];
      let at = -1;
      const ownerQn = statement.owner?.qualifiedName;
      const findOwner = () => (ownerQn !== undefined ? this.index.findByQualifiedName(ownerQn).find((x) => x.uri === statement.uri) : statement.owner ? this.fresh(statement.owner) : undefined);
      const label = `Move ${end} of line`;
      return this.run(
        () => {
          const el = this.fresh(statement);
          if (!el || !el.owner) return fail(gone("The line", statement));
          const target = this.resolveNode(el.owner, node, end);
          if (typeof target === "string") return fail(target);
          const ref = referenceFor(el, this.index);
          oldKey = ref ? referenceKeyOf(ref) : undefined;
          at = el.owner.members.indexOf(el);
          const p = planReconnect(this.index, el, end, target);
          named = p.ok ? p.namedNodes ?? [] : [];
          const r = referenceFor(target, this.index);
          endKey = named.length ? `ref:${named[0]!.ref}` : r ? referenceKeyOf(r) : undefined;
          return p;
        },
        () => ({
          element: () => {
            nowStmt = at >= 0 ? findOwner()?.members[at] : undefined;
            return nowStmt;
          },
          change: () => {
            // Re-resolved on every apply: a redo runs against a later index than the first apply.
            const change = reconnectChange(oldKey, () => { const st = at >= 0 ? findOwner()?.members[at] : undefined; return st ? referenceFor(st, this.index) : undefined; }, end, () => endKey, label);
            return named.length ? composeChanges(nameNodesChange(named, label), change, label) : change;
          },
        }),
        opts.diagram ? { diagram: opts.diagram } : undefined,
        () => [statement.uri],
      );
    });
  }

  /** The node `el` stands for now, re-read from the current model: a start or done node of `owner`, or a node below it. */
  private resolveNode(owner: Element, el: Element, role: string): Element | string {
    if (isSynthetic(el) && (el.kind === "start" || el.kind === "done")) {
      if (el.owner?.qualifiedName !== undefined && el.owner.qualifiedName !== owner.qualifiedName) return `The ${role} ${el.kind} node belongs to ${el.owner.name ?? el.owner.kind}, not to ${owner.name ?? owner.kind}.`;
      return virtualNode(owner, el.kind);
    }
    const now = el.qualifiedName !== undefined ? this.index.findByQualifiedName(el.qualifiedName).find((x) => x.uri === el.uri && x.kind === el.kind) ?? this.index.findByQualifiedName(el.qualifiedName)[0] : this.fresh(el);
    if (!now) return `The ${role} ${el.name ?? el.kind} no longer exists in the model (it was renamed, moved or deleted since the diagram was drawn); reopen or refresh the diagram.`;
    return now;
  }

  private freshEnd(t: Target, owner: Element): Element | string | undefined {
    if (t.context) return this.pathFrom(owner, t);
    return this.fresh(t.element);
  }

  /** An end reached through inheritance, written as a chain from the owner (`vehicle1.engine.drive`). */
  private pathFrom(owner: Element, t: Target): string {
    const names: string[] = [];
    for (let e: Element | undefined = t.element; e && e !== t.context; e = e.owner) names.unshift(quoteName(e.name ?? ""));
    const ctx: string[] = [];
    for (let e: Element | undefined = t.context; e && e !== owner; e = e.owner) ctx.unshift(quoteName(e.name ?? ""));
    return [...ctx, ...names].join(".");
  }

  satisfy(requirement: Element, by: Element, owner?: Element, origin?: Origin): Promise<OpResult> {
    return this.statementOp(
      ["satisfy"],
      () => {
        const r = this.fresh(requirement);
        const b = this.fresh(by);
        const o = owner ? this.fresh(owner) : undefined;
        if (!r || !b || (owner && !o)) return fail(gone(!r ? "The requirement" : !b ? "The element that satisfies it" : "The element to add to", !r ? requirement : !b ? by : owner));
        return planSatisfy(this.index, r, b, o);
      },
      () => [requirement.uri, ...(owner ? [owner.uri] : []), by.uri],
      origin,
      "Satisfy",
    );
  }

  /**
   * An operation that writes a relationship statement (satisfy, verify, derivation connection). With `origin.diagram` the
   * new statement is also placed on that diagram as an edge (when both ends are shown) and the diagram gets the undo entry.
   */
  private statementOp(kinds: readonly string[], plan: () => PlanResult | OpFailure, touched: () => string[], origin: Origin | undefined, label: string): Promise<OpResult> {
    return this.serial(async () => {
      const sig = (e: Element) => `${e.uri}\0${e.kind}\0${this.index.getDocument(e.uri)?.text.slice(e.range.start.offset, e.range.end.offset)}`;
      const pre = new Map<string, number>();
      const all = (): Element[] => {
        const out: Element[] = [];
        const walk = (e: Element) => {
          if (kinds.includes(e.kind)) out.push(e);
          e.members.forEach(walk);
        };
        for (const u of new Set(touched())) this.index.getDocument(u)?.model.roots.forEach(walk);
        return out;
      };
      let created: Element | undefined;
      return this.run(
        () => {
          pre.clear();
          for (const e of all()) pre.set(sig(e), (pre.get(sig(e)) ?? 0) + 1);
          return plan();
        },
        () => ({
          element: () => {
            const seen = new Map<string, number>();
            created = all().find((e) => {
              const k = sig(e);
              const n = (seen.get(k) ?? 0) + 1;
              seen.set(k, n);
              return n > (pre.get(k) ?? 0);
            });
            return created;
          },
          ...(origin?.diagram ? { change: () => placeElementChange(this.index, () => created, { diagram: origin.diagram! }, label) } : {}),
        }),
        origin,
        touched,
      );
    });
  }

  // ---- requirements and documents ------------------------------------------------------------

  /** Run a plan over fresh elements; `elements` are re-read from the current model right before planning. */
  private plain(elements: readonly (Element | undefined)[], plan: (fresh: Element[]) => PlanResult, touched: () => string[], origin?: Origin): Promise<OpResult> {
    return this.serial(async () =>
      this.run(
        () => {
          const fresh: Element[] = [];
          for (const e of elements) {
            if (!e) continue;
            const f = this.fresh(e);
            if (!f) return fail(gone("An element", e));
            fresh.push(f);
          }
          return plan(fresh);
        },
        () => ({}),
        origin,
        touched,
      ),
    );
  }

  /** `verify <requirement>;` in the objective of a verification case, or in a new case named `{ create }`. */
  verify(requirement: Element, to: Element | { create: string; owner?: Element }, origin?: Origin): Promise<OpResult> {
    const target = "create" in to ? to.owner : to;
    return this.statementOp(
      ["verify"],
      () => {
        const r = this.fresh(requirement);
        const t = target ? this.fresh(target) : undefined;
        if (!r || (target && !t)) return fail(gone(!r ? "The requirement" : "The target", !r ? requirement : target));
        return planVerify(this.index, r, "create" in to ? { create: to.create, ...(t ? { owner: t } : {}) } : t!);
      },
      () => [requirement.uri, ...(target ? [target.uri] : [])],
      origin,
      "Verify",
    );
  }

  /** `#derivation connection { end #original ::> original; end #derive ::> derived; ... }`. */
  derive(original: Element, derived: readonly Element[], owner?: Element, origin?: Origin): Promise<OpResult> {
    return this.statementOp(
      ["connection"],
      () => {
        const f = [original, ...derived, ...(owner ? [owner] : [])].map((e) => this.fresh(e));
        if (f.some((e) => !e)) return fail(gone("An element", [original, ...derived, ...(owner ? [owner] : [])][f.findIndex((e) => !e)]));
        return planDerivation(this.index, f[0]!, f.slice(1, 1 + derived.length) as Element[], owner ? f[f.length - 1]! : undefined);
      },
      () => [derived[0]?.uri ?? original.uri, ...(owner ? [owner.uri] : [])],
      origin,
      "Derivation",
    );
  }

  removeSatisfy(statement: Element, origin?: Origin): Promise<OpResult> {
    return this.plain([statement], ([s]) => planRemoveSatisfy(this.index, s!), () => [statement.uri], origin);
  }

  removeVerify(statement: Element, origin?: Origin): Promise<OpResult> {
    return this.plain([statement], ([s]) => planRemoveVerify(this.index, s!), () => [statement.uri], origin);
  }

  removeDerivation(connection: Element, derived?: Element, origin?: Origin): Promise<OpResult> {
    return this.plain([connection, derived], (f) => planRemoveDerivation(this.index, f[0]!, derived ? f[1] : undefined), () => [connection.uri], origin);
  }

  /** Reorder a declaration within its owner, or move it into another owner (refused when references would change meaning). */
  moveMember(element: Element, to: MoveTarget, origin?: Origin): Promise<OpResult> {
    const slots: (Element | undefined)[] = [element, to.owner, to.after, to.before];
    return this.plain(slots, (f) => {
      const [el, ...rest] = f;
      const it = rest[Symbol.iterator]();
      const mt: MoveTarget = { ...(to.position ? { position: to.position } : {}) };
      if (to.owner) mt.owner = it.next().value as Element;
      if (to.after) mt.after = it.next().value as Element;
      if (to.before) mt.before = it.next().value as Element;
      return planMoveMember(this.index, el!, mt);
    }, () => [...new Set([element.uri, ...(to.owner ? [to.owner.uri] : []), ...(to.after ? [to.after.uri] : []), ...(to.before ? [to.before.uri] : [])])], origin);
  }

  /** Replace the body of a `doc` or `comment` element (an empty text removes it). */
  setParagraph(comment: Element, text: string, origin?: Origin): Promise<OpResult> {
    return this.plain([comment], ([c]) => planSetCommentBody(this.index, c!, text), () => [comment.uri], origin);
  }

  /** A new `doc` (the first paragraph) or `comment` in a package. */
  addParagraph(pkg: Element, text: string, after?: Element, origin?: Origin): Promise<OpResult> {
    return this.plain([pkg, after], (f) => planAddParagraph(this.index, f[0]!, text, after ? f[1] : undefined), () => [pkg.uri], origin);
  }

  /** A new section (package) or appendix (package with `@Appendix;` and the library import when missing). */
  addSection(parent: Element, name: string, opts: { appendix?: boolean; after?: Element } = {}, origin?: Origin): Promise<OpResult> {
    return this.plain([parent, opts.after], (f) => planAddSection(this.index, f[0]!, name, { ...(opts.appendix ? { appendix: true } : {}), ...(opts.after ? { after: f[1]! } : {}) }), () => [parent.uri], origin);
  }

  /** A new requirement (usage or definition) with an optional id (short name) and documentation. */
  createRequirement(owner: Element, spec: { definition?: boolean; id?: string; name: string; documentation?: string }, origin?: Origin): Promise<OpResult> {
    return this.addElement(owner, {
      kind: spec.definition ? "requirement def" : "requirement",
      name: spec.name,
      ...(spec.id ? { shortName: spec.id } : {}),
      ...(spec.documentation ? { documentation: spec.documentation } : {}),
    }, origin?.diagram ? { diagram: origin.diagram } : {});
  }

  // ---- undo and redo -------------------------------------------------------------------------

  /**
   * Reverse an operation: the inverse text edits (validated against the current text), then the diagram part.
   * When the text cannot be reverted because it changed, NOTHING is reverted, a warning is shown and the entry is
   * spent. When the text is already as it was before the edit (Undo in the text editor), only the diagram part is reverted.
   */
  undo(result: OpOk): Promise<{ textReverted: boolean; warning?: string }> {
    return this.serial(async () => {
      await this.host.sync();
      const current = new Map<string, string | undefined>();
      for (const uri of result.record.after.keys()) current.set(uri, await this.host.currentText(uri));
      const plan = planUndo(result.record, current);
      let warning: string | undefined;
      if (!plan.ok) warning = plan.reason;
      else if (plan.edits.length > 0) {
        const o = await this.host.applyAndSave(plan.edits, [...result.record.after].map(([u, t]) => sourceOf(u, t)));
        if (!o.ok) warning = o.stale ? "The text changed while undoing; the edit was not reverted in the text." : o.reason;
        else this.noteUnsaved(o.unsaved ?? []);
      }
      if (warning) {
        this.warn(`Undo: ${warning} Nothing was undone.`);
        return { textReverted: false, warning };
      }
      await this.host.sync();
      if (result.diagramChange) await this.host.forceDiagramChange(result.diagramChange, "revert");
      return { textReverted: true };
    });
  }

  redo(result: OpOk): Promise<{ textApplied: boolean; warning?: string }> {
    return this.serial(async () => {
      await this.host.sync();
      const current = new Map<string, string | undefined>();
      for (const uri of result.record.before.keys()) current.set(uri, await this.host.currentText(uri));
      const plan = planRedo(result.record, current);
      let warning: string | undefined;
      if (!plan.ok) warning = plan.reason;
      else if (plan.edits.length > 0) {
        const o = await this.host.applyAndSave(plan.edits, [...result.record.before].map(([u, t]) => sourceOf(u, t)));
        if (!o.ok) warning = o.stale ? "The text changed while redoing; the edit was not repeated in the text." : o.reason;
        else this.noteUnsaved(o.unsaved ?? []);
      }
      if (warning) {
        this.warn(`Redo: ${warning} Nothing was redone.`);
        return { textApplied: false, warning };
      }
      await this.host.sync();
      if (result.diagramChange) await this.host.forceDiagramChange(result.diagramChange, "apply");
      return { textApplied: true };
    });
  }
}
