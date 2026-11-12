/**
 * Edit plans for behaviour (design D20): successions, transitions (with trigger, guard and effect as text),
 * messages, and deleting a node together with the statements that connect it. No `vscode`, no DOM.
 *
 * The one canonical text per statement, never rewriting existing statements:
 *   succession  `first a then b;`  (guarded: `first a if g then b;`)
 *   transition  `transition first a [accept T] [if g] [do e] then b;`
 *   message     `message [name] [of T] from a to b;`, written as `then message ...;` directly after the last
 *               message in time order when there is one, which orders it after that message
 */
import { analyze, interactionOf, isActionNode, isControlNode, isStateNode, isSynthetic, parseTransition, quoteName, type Element, type ModelIndex } from "../model/index.js";
import { insertDecls } from "./body.js";
import { deleteEdit, referencesAfterDelete } from "./delete.js";
import { checkElement, describeElement } from "./guard.js";
import { referenceText, type ImportNeed } from "./refs.js";
import { insertWithImports } from "./insert.js";
import { applyEdits, tokenize, isCode } from "./text.js";
import { fail, type PlanFailure, type PlanOk, type PlanResult, type TextEdit } from "./types.js";
import { checkResolutionPreserved, validatePlan } from "./validate.js";

/** The parts of a transition, as source text; absent or empty parts are not written. */
export interface TransitionParts {
  trigger?: string;
  guard?: string;
  effect?: string;
}

const same = (a: string | undefined, b: string | undefined): boolean => (a ?? "").replace(/\s+/g, " ").trim() === (b ?? "").replace(/\s+/g, " ").trim();

/** Why a piece of text cannot be a trigger, guard or effect, or undefined. It is parsed with the whole plan; this stops text that would end the statement. */
export function partProblem(what: string, text: string): string | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  if (/[\r\n]/.test(t)) return `The ${what} must be on one line.`;
  const toks = tokenize(t).filter(isCode);
  const bad = toks.find((k) => k.text === ";" || k.text === "{" || k.text === "}");
  if (bad) return `The ${what} must be a single expression: '${bad.text}' is not allowed in it.`;
  if (/\/\*|\*\//.test(t)) return `The ${what} must not contain a comment.`;
  return undefined;
}

const nodeName = (e: Element, what: string): string | PlanFailure => {
  if (isSynthetic(e) && (e.kind === "start" || e.kind === "done")) return e.kind;
  if (e.name === undefined) return fail(`The ${what} is an unnamed ${e.kind}; give it a name before connecting it.`);
  return quoteName(e.name);
};

const flowOwner = (index: ModelIndex, owner: Element, el: Element): boolean => isSynthetic(el) ? el.owner === owner : el.owner === owner && (isActionNode(el) || isStateNode(el) || isControlNode(el));

type Position = Parameters<typeof insertDecls>[3];

/**
 * Positions to try for a statement: right after the later of the two declarations, then the end of the body. The grammar
 * does not accept `then done;` straight after some statements (`first a then b;`, `flow ...;`), so the first position can
 * be refused by the parse check, in which case the end of the body is used.
 */
function positionsAfter(anchors: readonly Element[]): Position[] {
  const real = anchors.filter((a) => !isSynthetic(a)).sort((a, b) => b.range.end.offset - a.range.end.offset);
  return real[0] ? [{ after: real[0] }, "end"] : ["end"];
}

function insertAt(index: ModelIndex, owner: Element, decl: string, positions: readonly Position[], build: (edits: TextEdit[]) => PlanResult): PlanResult {
  let first: PlanResult | undefined;
  for (const pos of positions) {
    const r = insertDecls(index, owner, [decl], pos);
    if (!r.ok) return r;
    const p = build(r.edits);
    if (p.ok) return p;
    first ??= p;
  }
  return first ?? fail("Nothing to insert.");
}

function checked(index: ModelIndex, owner: Element, plan: PlanOk): PlanResult {
  return checkResolutionPreserved(index, validatePlan(index, plan), { within: owner });
}

/** Rebuild the analysis of `owner` as it would be after `edits`; undefined when it cannot be found. */
function after(index: ModelIndex, owner: Element, edits: readonly TextEdit[]): { index: ModelIndex; owner: Element } | undefined {
  const texts = new Map<string, string>();
  const state = index.getDocument(owner.uri);
  if (!state) return undefined;
  texts.set(owner.uri, applyEdits(state.text, edits.filter((e) => e.uri === owner.uri)));
  const scratch = index.withTexts(texts);
  const o = owner.qualifiedName !== undefined ? scratch.findByQualifiedName(owner.qualifiedName).find((x) => x.uri === owner.uri && x.kind === owner.kind) : undefined;
  return o ? { index: scratch, owner: o } : undefined;
}

// ------------------------------------------------------------------------------ succession

/** `first a then b;` in `owner`, after the two declarations; refused when the succession already exists. */
export function planAddSuccession(index: ModelIndex, owner: Element, source: Element, target: Element, guard?: string): PlanResult {
  const c = checkElement(index, owner);
  if (!c.ok) return c;
  if (!flowOwner(index, owner, source)) return fail(`${describeElement(source)} is not a node of ${describeElement(owner)}, so it cannot be the source of a succession there.`);
  if (!flowOwner(index, owner, target)) return fail(`${describeElement(target)} is not a node of ${describeElement(owner)}, so it cannot be the target of a succession there.`);
  if (source === target) return fail("A succession needs two different nodes.");
  const a = nodeName(source, "source");
  if (typeof a !== "string") return a;
  const b = nodeName(target, "target");
  if (typeof b !== "string") return b;
  if (source.kind === "done") return fail("Nothing can follow the done node.");
  if (target.kind === "start") return fail("Nothing can lead to the start node.");
  const g = guard?.trim() ?? "";
  if (g !== "") {
    const p = partProblem("guard", g);
    if (p) return fail(p);
  }
  const dup = analyze(index, owner).successions.find((s) => s.source === source && s.target === target && same(s.guard, g));
  if (dup) return fail(`There is already a succession from ${a} to ${b}${g ? ` with the guard [${g}]` : ""} in ${describeElement(owner)}.`);
  const decl = `first ${a}${g !== "" ? ` if ${g}` : ""} then ${b};`;
  return insertAt(index, owner, decl, positionsAfter([source, target]), (edits) => {
    const v = checked(index, owner, { ok: true, edits, description: `Add succession ${a} then ${b} to ${describeElement(owner)}` });
    if (!v.ok) return v;
    const now = after(index, owner, edits);
    const found = now && analyze(now.index, now.owner).successions.some((s) => !s.implied && nodeLabel(s.source) === a && nodeLabel(s.target) === b && same(s.guard, g));
    return found ? v : fail("The succession would not be read back as written (it conflicts with what is already in the action); nothing was changed.");
  });
}

const nodeLabel = (e: Element): string => (e.name !== undefined ? quoteName(e.name) : e.kind);

// ------------------------------------------------------------------------------ transitions

/** The text of a transition: `transition [name] first a [accept T] [if g] [do e] then b;`. */
export function transitionText(source: string, target: string, parts: TransitionParts, name?: string): string {
  const t = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return [
    "transition", ...(name !== undefined ? [quoteName(name)] : []), "first", source,
    ...(t(parts.trigger) ? ["accept", t(parts.trigger)] : []),
    ...(t(parts.guard) ? ["if", t(parts.guard)] : []),
    ...(t(parts.effect) ? ["do", t(parts.effect)] : []),
    "then", target + ";",
  ].join(" ");
}

function checkParts(parts: TransitionParts): string | undefined {
  return partProblem("trigger", parts.trigger ?? "") ?? partProblem("guard", parts.guard ?? "") ?? partProblem("effect", parts.effect ?? "");
}

/** Does the transition read back with these ends and parts? */
function readsBack(index: ModelIndex, owner: Element, source: string, target: string, parts: TransitionParts, name?: string): boolean {
  return analyze(index, owner).transitions.some(
    (t) => nodeLabel(t.source) === source && nodeLabel(t.target) === target && same(t.trigger, parts.trigger) && same(t.guard, parts.guard) && same(t.effect, parts.effect) && (name === undefined || t.statement.name === name),
  );
}

/** `transition first a [accept T] [if g] [do e] then b;` in `owner`, after the two states. */
export function planAddTransition(index: ModelIndex, owner: Element, source: Element, target: Element, parts: TransitionParts = {}): PlanResult {
  const c = checkElement(index, owner);
  if (!c.ok) return c;
  if (!flowOwner(index, owner, source) || !(isStateNode(source) || source.kind === "start")) return fail(`${describeElement(source)} is not a state of ${describeElement(owner)}, so a transition cannot start there.`);
  if (!flowOwner(index, owner, target) || !(isStateNode(target) || target.kind === "done")) return fail(`${describeElement(target)} is not a state of ${describeElement(owner)}, so a transition cannot end there.`);
  const bad = checkParts(parts);
  if (bad) return fail(bad);
  const a = nodeName(source, "source");
  if (typeof a !== "string") return a;
  const b = nodeName(target, "target");
  if (typeof b !== "string") return b;
  if (analyze(index, owner).transitions.some((t) => t.source === source && t.target === target && same(t.trigger, parts.trigger) && same(t.guard, parts.guard) && same(t.effect, parts.effect)))
    return fail(`There is already a transition from ${a} to ${b} with the same trigger, guard and effect in ${describeElement(owner)}.`);
  return insertAt(index, owner, transitionText(a, b, parts), positionsAfter([source, target]), (edits) => {
    const v = checked(index, owner, { ok: true, edits, description: `Add transition ${a} to ${b} in ${describeElement(owner)}` });
    if (!v.ok) return v;
    const now = after(index, owner, edits);
    return now && readsBack(now.index, now.owner, a, b, parts) ? v : fail("The transition would not be read back as written (the trigger, guard or effect text is read as something else); nothing was changed.");
  });
}

/**
 * Re-plan a whole transition statement from its parts: the name and the source and target are kept, the
 * statement is written in the explicit `first ... then ...` form. The text is parsed with the plan (and read
 * back) before anything is applied.
 */
export function planSetTransition(index: ModelIndex, transition: Element, parts: TransitionParts): PlanResult {
  const c = checkElement(index, transition);
  if (!c.ok) return c;
  const owner = transition.owner;
  if (transition.kind !== "transition" || !owner) return fail(`${describeElement(transition)} is not a transition.`);
  if (transition.bodyRange) return fail("This transition has a body; edit its text directly.");
  const bad = checkParts(parts);
  if (bad) return fail(bad);
  const info = analyze(index, owner).transitions.find((t) => t.statement === transition);
  if (!info) return fail("This transition's source or target is not a state of its owner, so it cannot be edited here.");
  const a = nodeName(info.source, "source");
  if (typeof a !== "string") return a;
  const b = nodeName(info.target, "target");
  if (typeof b !== "string") return b;
  const now = { trigger: parts.trigger ?? info.trigger, guard: parts.guard ?? info.guard, effect: parts.effect ?? info.effect };
  const text = transitionText(a, b, now, transition.name);
  const state = index.getDocument(transition.uri)!;
  const oldText = state.text.slice(transition.range.start.offset, transition.range.end.offset);
  if (same(oldText, text)) return fail("Nothing to change: the transition already has these values.");
  const edits: TextEdit[] = [{ uri: transition.uri, range: { start: transition.range.start.offset, end: transition.range.end.offset }, newText: text }];
  const v = checked(index, owner, { ok: true, edits, description: `Change the transition ${a} to ${b} in ${describeElement(owner)}` });
  if (!v.ok) return v;
  const scratch = after(index, owner, edits);
  return scratch && readsBack(scratch.index, scratch.owner, a, b, now, transition.name) ? v : fail("The text would be read back as something else than a trigger, guard and effect (for example a keyword such as then or do inside it); nothing was changed.");
}

/** The parts of a transition as they are written now (for the properties panel and for tests). */
export function transitionParts(index: ModelIndex, transition: Element): TransitionParts {
  const text = index.getDocument(transition.uri)?.text ?? "";
  const p = parseTransition(text, transition);
  return { trigger: p.accept ?? "", guard: p.if ?? "", effect: p.do ?? "" };
}

// ------------------------------------------------------------------------------ messages

export interface MessageSpec {
  name?: string;
  /** The item type: an element (written through the reference writer) or text. */
  itemType?: Element | string;
}

/**
 * `message [name] [of T] from a to b;` in the interaction `owner`. With existing messages the new one is written as
 * `then message ...;` directly after the last message in time order, which orders it after that message; the plan is
 * refused when the result would not read back as the last message.
 */
export function planAddMessage(index: ModelIndex, owner: Element, from: string, to: string, spec: MessageSpec = {}): PlanResult {
  const c = checkElement(index, owner);
  if (!c.ok) return c;
  const inter = interactionOf(index, owner);
  const known = new Set(inter.participants.map((p) => p.name));
  for (const [what, name] of [["sender", from], ["receiver", to]] as const) {
    if (!known.has(name)) return fail(`'${name}' is not a participant of ${describeElement(owner)} (${[...known].join(", ") || "it has no parts"}); the ${what} of a message must be one of its parts.`);
  }
  if (spec.name !== undefined && (spec.name === "" || /[\r\n]/.test(spec.name))) return fail("The name must be a single line of text.");
  if (spec.name !== undefined && owner.members.some((m) => m.name === spec.name)) return fail(`${describeElement(owner)} already has a member named '${spec.name}'.`);
  let type: string | undefined;
  const needs: ImportNeed[] = [];
  if (spec.itemType !== undefined) {
    if (typeof spec.itemType === "string") type = spec.itemType.trim();
    else {
      const r = referenceText(index, spec.itemType, owner);
      if (!r.ok) return r;
      type = r.text;
      if (r.need) needs.push(r.need);
    }
    if (type === "" || /[;{}\n]/.test(type)) return fail("The item type is not a valid reference.");
  }
  const last = inter.messages[inter.messages.length - 1];
  const decl = [last ? "then" : "", "message", ...(spec.name !== undefined ? [quoteName(spec.name)] : []), ...(type !== undefined ? ["of", type] : []), "from", quoteName(from), "to", quoteName(to) + ";"].filter(Boolean).join(" ");
  // `then` binds to the member before it: put it right after the last message, and refuse when the next statement also starts with `then`.
  if (last) {
    const text = index.getDocument(owner.uri)!.text;
    const next = owner.members.find((m) => m.range.start.offset >= last.statement.range.end.offset);
    if (next) {
      const gap = text.slice(last.statement.range.end.offset, next.range.start.offset);
      if (/\bthen\s*$/.test(gap)) return fail(`The statement after '${last.name ?? "the last message"}' starts with then, so a new message cannot be put there without changing what it follows; add it by hand.`);
    }
  }
  const ins = insertWithImports(index, owner, [decl], needs, last ? { after: last.statement } : "end");
  if (!ins.ok) return ins;
  const edits = [...ins.edits];
  const v = checked(index, owner, { ok: true, edits, description: `Add message ${spec.name ?? ""} from ${from} to ${to} in ${describeElement(owner)}`.replace(/\s+/g, " ") });
  if (!v.ok) return v;
  if (!last) return v;
  const now = after(index, owner, edits);
  const i2 = now ? interactionOf(now.index, now.owner) : undefined;
  const lastNow = i2?.messages[i2.messages.length - 1];
  const ok = !!i2 && i2.messages.length === inter.messages.length + 1 && lastNow?.fromParticipant === from && lastNow?.toParticipant === to && !i2.messages.slice(0, -1).some((m, k) => m.unordered !== inter.messages[k]!.unordered);
  return ok ? v : fail("The new message would not be read back as the last message in time order; nothing was changed.");
}

// ------------------------------------------------------------------------------ delete

/** The statements that connect `el` to other nodes: they are deleted with it. */
export function dependentsOf(index: ModelIndex, el: Element): Element[] {
  const owner = el.owner;
  if (!owner) return [];
  const out: Element[] = [];
  const a = analyze(index, owner);
  for (const s of a.successions) if (!s.implied && (s.source === el || s.target === el)) out.push(s.statement);
  for (const t of a.transitions) if (t.source === el || t.target === el) out.push(t.statement);
  for (const f of a.flows) if (f.source === el || f.target === el) out.push(f.statement);
  if (el.kind === "message" && el.name !== undefined) {
    for (const m of owner.members) if (m.kind === "succession" && m.ends.some((e) => e.trim() === el.name)) out.push(m);
  }
  return [...new Set(out)].filter((d) => d !== el);
}

const isNodeKind = (e: Element) => isActionNode(e) || isStateNode(e) || isControlNode(e) || e.kind === "message";

/** What `planDeleteBehavior` removes besides the element itself, for the confirmation text. */
export function describeDependents(index: ModelIndex, el: Element): string[] {
  if (!isNodeKind(el)) return [];
  const text = (d: Element) => index.getDocument(d.uri)?.text.slice(d.range.start.offset, d.range.end.offset).replace(/\s+/g, " ").trim() ?? d.kind;
  return dependentsOf(index, el).map((d) => (text(d).length > 70 ? text(d).slice(0, 67) + "..." : text(d)));
}

/** Delete a node (or message) and, in the same plan, the successions, transitions, flows and message orderings that reference it. */
export function planDeleteBehavior(index: ModelIndex, el: Element): PlanResult {
  if (isSynthetic(el)) return fail(`The ${el.kind} ${el.kind === "succession" ? "" : "node "}is implied by the language (a \`then\` or the start and done nodes) and has no declaration of its own to delete.`.replace("  ", " "));
  const c = checkElement(index, el);
  if (!c.ok) return c;
  if (el.kind === "succession" && el.owner && analyze(index, el.owner).successions.some((s) => s.statement === el && s.implied)) return fail("This succession is written as part of a node declaration (`then ...`); delete the node, or edit the text.");
  const deps = isNodeKind(el) ? dependentsOf(index, el) : [];
  const targets = [el, ...deps];
  const raw: TextEdit[] = [];
  for (const t of targets) {
    const e = deleteEdit(index, t);
    if (!e.ok) return e;
    const edit = e.edit;
    // A `then` written in front of the declaration (`then action b;`) goes with it.
    const text = index.getDocument(t.uri)!.text;
    const toks = tokenize(text).filter((k) => isCode(k) && k.end <= t.range.start.offset);
    const prev = toks[toks.length - 1];
    if (t === el && prev?.text === "then" && !/\n/.test(text.slice(prev.end, t.range.start.offset))) raw.push({ ...edit, range: { start: Math.min(edit.range.start, prev.start), end: edit.range.end } });
    else raw.push(edit);
  }
  // Merge edits that touch or overlap into one.
  raw.sort((a, b) => a.range.start - b.range.start);
  const edits: TextEdit[] = [];
  for (const e of raw) {
    const last = edits[edits.length - 1];
    if (last && e.range.start <= last.range.end) last.range = { start: last.range.start, end: Math.max(last.range.end, e.range.end) };
    else edits.push({ ...e });
  }
  const plan: PlanOk = {
    ok: true, edits, description: deps.length ? `Delete ${describeElement(el)} and ${deps.length} statement${deps.length === 1 ? "" : "s"} that connected it` : `Delete ${describeElement(el)}`,
    reads: index.uris().filter((u) => !index.isReadOnly(u)),
  };
  const remaining = referencesAfterDelete(index, el);
  const gone = new Set(deps);
  if (remaining.count > 0 || (remaining.unjudged ?? 0) > 0) {
    // References from the statements that are deleted too do not remain.
    const locs = remaining.locations.filter((l) => !([...gone].some((d) => l.uri === d.uri && (l.line > d.range.start.line || (l.line === d.range.start.line && l.column >= d.range.start.column)) && (l.line < d.range.end.line || (l.line === d.range.end.line && l.column <= d.range.end.column)))));
    const count = Math.max(0, remaining.count - (remaining.locations.length - locs.length));
    if (count > 0 || (remaining.unjudged ?? 0) > 0) plan.remainingReferences = { ...remaining, count, locations: locs };
  }
  return validatePlan(index, plan);
}


