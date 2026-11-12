/**
 * `ModelService`: the one set of model-changing operations used by the tree, the diagram editor and
 * the agent tools. `vscode`-free core; a host applies the plans. It checks the inherited-feature
 * rule, calls the edit planner, applies ALL text edits of an operation as one workspace edit,
 * saves the touched files, and forces the resulting changes onto diagram files (design D6, D11, D18).
 */
import {
  buildDeclaration, planConnect, planDeleteElement, planInsertMember, planRename, planSatisfy, planSetDocumentation,
  planSetMultiplicity, planSetShortName, planSetType, validatePlan,
  type DiagramUpdate, type LoadedDiagram, type PlanOk, type PlanResult, type TextEdit, type UnjudgedReferences,
} from "../edit/index.js";
import { inheritedFrom, locate, quoteName, type Element, type ModelIndex } from "../model/index.js";
import { placeElementChange, removeEntriesChange, type DiagramChange, type Placement } from "./diagram-changes.js";
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
  /** What the operation did to the text, for undo and redo. */
  record: EditRecord;
  /** What it forced on diagram files, if anything. */
  diagramChange?: DiagramChange;
  /** URIs of the diagram files written to disk. */
  diagramFiles: string[];
  /** Set when the first save failed: the documents are left as VS Code has them. */
  saveError?: string;
}

export type OpResult = OpOk | OpFailure;

export type ApplyOutcome = { ok: true } | { ok: false; stale: true } | { ok: false; stale?: false; reason: string };

/** What `ModelService` needs from its environment; the VS Code implementation is in `vscode-host.ts`. */
export interface ModelHost {
  readonly index: ModelIndex;
  /** Make the index reflect the open editors, and wait until syntax details have settled. */
  sync(): Promise<void>;
  /** The text of a document as it is now (the open buffer, else the file). */
  currentText(uri: string): Promise<string | undefined>;
  /** Apply the edits as ONE workspace edit if every document still has the `base` text, then save each touched document. */
  applyAndSave(edits: readonly TextEdit[], base: ReadonlyMap<string, string>): Promise<ApplyOutcome>;
  /** Saved state of the diagram files that are not open in an editor (open ones follow renames themselves). */
  closedDiagrams(): Promise<LoadedDiagram[]>;
  writeDiagramFiles(updates: readonly DiagramUpdate[]): Promise<void>;
  /** Apply or revert a forced change on the matching diagram files; returns the URIs written. */
  forceDiagramChange(change: DiagramChange, mode: "apply" | "revert"): Promise<string[]>;
  /** A model edit was made from a diagram: record one undo entry there. */
  recordUndoEntry?(originDiagram: string, result: OpOk): void;
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

const nameOfUri = (uri: string) => decodeURIComponent(uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? uri);

const fail = (reason: string, extra: Partial<OpFailure> = {}): OpFailure => ({ ok: false, reason, ...extra });
const info = (e: Element): ElementInfo => ({ uri: e.uri, kind: e.kind, ...(e.name !== undefined ? { name: e.name } : {}), ...(e.qualifiedName !== undefined ? { qualifiedName: e.qualifiedName } : {}) });

/** The nearest element that owns both (never one of the two themselves). */
export function commonOwner(a: Element, b: Element): Element | undefined {
  const chain = new Set<Element>();
  for (let o = a.owner; o; o = o.owner) chain.add(o);
  for (let o = b.owner; o; o = o.owner) if (chain.has(o)) return o;
  return undefined;
}

export const DEFINITION_KINDS = ["package", "part def", "port def", "attribute def", "item def", "action def", "requirement def"];
export const USAGE_KINDS = ["part", "port", "attribute", "item", "action", "requirement"];

/** Declaration kinds that may be added under an element. */
export function allowedChildKinds(owner: Element): string[] {
  const isPackage = owner.kind === "package" || owner.kind.endsWith(" package");
  if (isPackage) return [...DEFINITION_KINDS, ...USAGE_KINDS];
  return owner.isDefinition || owner.isUsage ? USAGE_KINDS : [];
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

  /** Plan, apply, save and force diagram changes; re-plans once when the text changed in between. */
  private async run(
    plan: () => PlanResult | OpFailure,
    after: (plan: PlanOk, ctx: { before: ReadonlyMap<string, string> }) => { element?: () => Element | undefined; change?: () => DiagramChange | undefined; extra?: Partial<OpOk> },
    origin: Origin | undefined,
    touched: () => string[],
  ): Promise<OpResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.host.sync();
      const p = plan();
      if (!p.ok) return this.failure(p.reason, touched());
      if (p.edits.length === 0) return fail("Nothing to change.");
      const base = new Map<string, string>();
      for (const uri of new Set(p.edits.map((e) => e.uri))) {
        const t = this.index.getDocument(uri)?.text;
        if (t === undefined) return fail(`${nameOfUri(uri)} is not loaded, so it cannot be edited.`);
        base.set(uri, t);
      }
      const record = makeRecord(p.edits, base);
      const hooks = after(p, { before: base });
      const outcome = await this.host.applyAndSave(p.edits, base);
      if (!outcome.ok && outcome.stale) continue;
      if (!outcome.ok) return fail(outcome.reason);
      await this.host.sync();
      if (p.diagramUpdates?.length) await this.host.writeDiagramFiles(p.diagramUpdates);
      const el = hooks.element?.();
      const change = hooks.change?.();
      const diagramFiles = [...(p.diagramUpdates?.map((u) => u.uri) ?? [])];
      if (change) diagramFiles.push(...(await this.host.forceDiagramChange(change, "apply")));
      const result: OpOk = {
        ok: true,
        description: p.description,
        files: [...base.keys()],
        ...(el ? { element: info(el) } : {}),
        ...(p.unjudged ? { unjudged: p.unjudged } : {}),
        record,
        ...(change ? { diagramChange: change } : {}),
        diagramFiles,
        ...hooks.extra,
      };
      if (origin?.diagram) this.host.recordUndoEntry?.(origin.diagram, result);
      return result;
    }
    return fail("The file changed while the edit was being prepared, twice. Nothing was changed; try again.");
  }

  // ---- inherited rule ------------------------------------------------------------------------

  /** Refuse an edit of a feature that `target.context` only inherits. */
  private inheritedRefusal(t: Target, what: string): OpFailure | undefined {
    if (!t.context) return undefined;
    const from = inheritedFrom(this.index, t.element, t.context);
    if (!from) return undefined;
    const def = from.name ?? from.kind;
    const name = t.element.name ?? t.element.kind;
    const spot = { uri: from.uri, line: (from.nameRange ?? from.range).start.line, column: (from.nameRange ?? from.range).start.column, name: from.qualifiedName ?? def };
    return fail(
      `'${name}' is inherited from ${def}${from.qualifiedName ? ` (${from.qualifiedName})` : ""}, so it cannot be ${what} from ${t.context.qualifiedName ?? t.context.name ?? "this element"}. Change it in ${def} instead (Go to Definition); that changes every usage of ${def}.`,
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

  addElement(owner: Element, spec: AddSpec, opts: Origin & { placement?: Omit<Placement, "diagram"> & { diagram?: string } } = {}): Promise<OpResult> {
    return this.serial(async () => {
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
          if (!ownerNow) return fail("The element to add to is out of date; refresh and try again.");
          if (!allowedChildKinds(ownerNow).includes(spec.kind) && !spec.kind.trim()) return fail("Choose what to add.");
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
          if (spec.documentation.includes("*/")) return fail("The documentation must not contain a comment terminator.");
          const b = buildDeclaration(this.index, ownerNow, memberSpec);
          if (!b.ok) return b;
          const docText = spec.documentation.includes("\n") ? `doc /* ${spec.documentation.split(/\r?\n/).join("\n * ")} */` : `doc /* ${spec.documentation} */`;
          const decl = b.text.replace(/;$/, ` {\n  ${docText.split("\n").join("\n  ")}\n}`);
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
      return this.run(
        () => {
          const el = this.fresh(t.element);
          return el ? planDeleteElement(this.index, el) : fail("The element is out of date; refresh and try again.");
        },
        () => ({ ...(top.length ? { change: () => removeEntriesChange(top, `Delete ${t.element.name ?? t.element.kind}`) } : {}) }),
        origin,
        () => [t.element.uri],
      );
    });
  }

  rename(t: Target, newName: string, origin?: Origin): Promise<OpResult> {
    return this.serial(async () => {
      const refusal = this.inheritedRefusal(t, "renamed");
      if (refusal) return refusal;
      const closed = await this.host.closedDiagrams();
      let updated = 0;
      return this.run(
        () => {
          const el = this.fresh(t.element);
          if (!el) return fail("The element is out of date; refresh and try again.");
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
      const closed = props.name !== undefined ? await this.host.closedDiagrams() : [];
      let updated: number | undefined;
      return this.run(
        () => {
          const el = this.fresh(t.element);
          if (!el) return fail("The element is out of date; refresh and try again.");
          const plans: PlanResult[] = [];
          if (props.name !== undefined && props.name !== el.name) {
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
              if (!(el.types.length === 1 && this.index.resolve(el.types[0]!, el) === ty)) plans.push(planSetType(this.index, el, ty));
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
    for (const p of plans) {
      if (!p.ok) return p;
      edits.push(...p.edits);
      descriptions.push(p.description);
      if (p.diagramUpdates) diagramUpdates = p.diagramUpdates;
      if (p.unjudged) unjudged = p.unjudged;
    }
    const merged: PlanOk = { ok: true, edits, description: descriptions.join("; "), ...(diagramUpdates ? { diagramUpdates } : {}), ...(unjudged ? { unjudged } : {}) };
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
          if (!o) return fail("The element to add the connection to is out of date; refresh and try again.");
          pre.clear();
          for (const m of o.members) pre.set(sig(m), (pre.get(sig(m)) ?? 0) + 1);
          const a = typeof source === "string" ? source : this.freshEnd(source, o);
          const b = typeof target === "string" ? target : this.freshEnd(target, o);
          if (typeof a !== "string" && !a) return fail("The source of the connection is out of date; refresh and try again.");
          if (typeof b !== "string" && !b) return fail("The target of the connection is out of date; refresh and try again.");
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
    return this.serial(async () =>
      this.run(
        () => {
          const r = this.fresh(requirement);
          const b = this.fresh(by);
          const o = owner ? this.fresh(owner) : undefined;
          if (!r || !b || (owner && !o)) return fail("An element is out of date; refresh and try again.");
          return planSatisfy(this.index, r, b, o);
        },
        () => ({}),
        origin,
        () => [requirement.uri],
      ),
    );
  }

  // ---- undo and redo -------------------------------------------------------------------------

  /** Reverse an operation: the inverse text edits (validated against the current text), then the diagram part. */
  undo(result: OpOk): Promise<{ textReverted: boolean; warning?: string }> {
    return this.serial(async () => {
      await this.host.sync();
      let warning: string | undefined;
      let textReverted = false;
      const current = new Map<string, string | undefined>();
      for (const uri of result.record.after.keys()) current.set(uri, await this.host.currentText(uri));
      const plan = planUndo(result.record, current);
      if (plan.ok && plan.edits.length === 0) textReverted = true;
      else if (plan.ok) {
        const base = new Map<string, string>([...result.record.after]);
        const o = await this.host.applyAndSave(plan.edits, base);
        if (o.ok) textReverted = true;
        else warning = o.stale ? "The text changed while undoing; the edit was not reverted in the text." : o.reason;
      } else warning = plan.reason;
      await this.host.sync();
      if (result.diagramChange) await this.host.forceDiagramChange(result.diagramChange, "revert");
      return { textReverted, ...(warning ? { warning } : {}) };
    });
  }

  redo(result: OpOk): Promise<{ textApplied: boolean; warning?: string }> {
    return this.serial(async () => {
      await this.host.sync();
      let warning: string | undefined;
      let textApplied = false;
      const current = new Map<string, string | undefined>();
      for (const uri of result.record.before.keys()) current.set(uri, await this.host.currentText(uri));
      const plan = planRedo(result.record, current);
      if (plan.ok && plan.edits.length === 0) textApplied = true;
      else if (plan.ok) {
        const o = await this.host.applyAndSave(plan.edits, new Map(result.record.before));
        if (o.ok) textApplied = true;
        else warning = o.stale ? "The text changed while redoing; the edit was not repeated in the text." : o.reason;
      } else warning = plan.reason;
      await this.host.sync();
      if (result.diagramChange) await this.host.forceDiagramChange(result.diagramChange, "apply");
      return { textApplied, ...(warning ? { warning } : {}) };
    });
  }
}

