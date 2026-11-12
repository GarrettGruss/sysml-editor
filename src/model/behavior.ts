/**
 * Behaviour in the model (design D16): successions and control nodes, parameter flows, state machines
 * (entry/do/exit actions, transitions with trigger, guard and effect as source text), and
 * interactions (messages, participants, time order). `vscode`-free and DOM-free.
 *
 * The language writes the same thing in several forms. Read here:
 *  - successions: `first a then b;`, `succession s first a then b;`, the guarded forms `first a if g then b;`,
 *    `if g then b;` and `else b;` after a node, the shorthand `then b;`, `then action b ...;`, `then fork;` and
 *    friends (the source is the previous node), `first start;` (names the source of the next `then`), `then done;`,
 *    and `entry; then s;` in a state;
 *  - parameter flows: `flow from a.x to b.y;`, `flow of T from a.x to b.y;`, named or not;
 *  - transitions: `transition t first a accept T if g do e then b;` (every part optional) and the shorthand in a
 *    state body (`accept T if g do e then b;`, whose source is the preceding state);
 *  - messages: `message [name] [of [n :] T] from a to b;` and their order, by `first m1 then m2;`, by
 *    `then message ...;`, and by `then event m.sourceEvent;` chains inside participants.
 * Not read: successions that bind to nested features by a path (`then a.b;`) beyond the first segment, `perform`
 * actions' own bodies, `send`/`accept` actions as message ends, messages without `from`/`to`, and flows between
 * ports. Anything else a view cannot place is simply not drawn.
 *
 * `start`, `done` and the implied successions (`then x;` written as part of a node declaration) are not elements in
 * the parse tree. They are given synthetic `Element`s (cached per owner) so diagrams can reference them with
 * structural locators like any other unnamed element.
 */
import { isCode, tokenize, type Tok } from "../edit/text.js";
import type { ModelIndex } from "./index.js";
import type { Element } from "./types.js";

const ACTION_NODE_KINDS = new Set(["action", "perform", "send", "accept", "assign", "terminate", "if", "while", "loop", "for", "fork", "join", "decide", "merge", "perform action", "ref action"]);
export const CONTROL_KINDS = ["fork", "join", "decide", "merge"] as const;
const OCCURRENCE_PART_KINDS = new Set(["part", "ref part", "item", "ref item", "individual", "event occurrence"]);

export const isActionNode = (e: Element): boolean => ACTION_NODE_KINDS.has(e.kind) && e.isUsage;
export const isControlNode = (e: Element): boolean => (CONTROL_KINDS as readonly string[]).includes(e.kind);
export const isStateKind = (kind: string): boolean => kind === "state" || kind === "state def" || kind.endsWith(" state");
export const isStateNode = (e: Element): boolean => e.isUsage && isStateKind(e.kind);
export const isVirtualKind = (kind: string): boolean => kind === "start" || kind === "done";
export const isActionLike = (e: Element): boolean => e.kind === "action" || e.kind === "action def" || e.kind === "perform" || e.kind === "perform action";

// ------------------------------------------------------------------------------ synthetic elements

const synthetic = new WeakMap<Element, Element[]>();

function makeSynthetic(owner: Element, kind: string, ends: string[], at?: Element): Element {
  return {
    uri: owner.uri, kind, isDefinition: false, isUsage: false, members: [], types: [], typeNames: [], typeConjugated: [],
    specializes: [], subsets: [], redefines: [], references: [], ends, range: at?.range ?? owner.nameRange ?? owner.range, owner,
  };
}

/** The synthetic members of an owner already computed, without computing them. */
export function cachedSynthetic(owner: Element): readonly Element[] {
  return synthetic.get(owner) ?? [];
}

/** `start`/`done` nodes and implied successions of an owner, as unnamed elements (stable per owner). */
export function syntheticMembers(index: ModelIndex, owner: Element): readonly Element[] {
  if (!owner.members.length) return [];
  const hit = synthetic.get(owner);
  if (hit) return hit;
  const a = analyze(index, owner);
  return a.synthetic;
}

const virtuals = new WeakMap<Element, { start: Element; done: Element }>();

/** The `start` or `done` node of an owner, whether or not a statement uses it yet (one object per owner). */
export function virtualNode(owner: Element, kind: "start" | "done"): Element {
  let v = virtuals.get(owner);
  if (!v) virtuals.set(owner, (v = { start: makeSynthetic(owner, "start", []), done: makeSynthetic(owner, "done", []) }));
  return v[kind];
}

export function isSynthetic(e: Element): boolean {
  if (!e.owner) return false;
  const v = virtuals.get(e.owner);
  return (v !== undefined && (v.start === e || v.done === e)) || cachedSynthetic(e.owner).includes(e);
}

// ------------------------------------------------------------------------------ text helpers

const SECTION = new Set(["accept", "if", "do", "then", "else", "first"]);

interface Part { kw: string; text: string }

/** Code tokens of a declaration up to its body or terminator. */
function declTokens(text: string, el: Element): Tok[] {
  const from = el.range.start.offset;
  const to = el.bodyRange ? el.bodyRange.start.offset : el.range.end.offset;
  return tokenize(text).filter((t) => t.start >= from && t.end <= to && isCode(t));
}

/** Split tokens into `keyword text` parts at section keywords (depth zero only). */
function sections(text: string, toks: Tok[], keywords: ReadonlySet<string>): { head: Tok[]; parts: Part[] } {
  const head: Tok[] = [];
  const parts: Part[] = [];
  let depth = 0;
  let cur: { kw: string; toks: Tok[] } | undefined;
  const flush = () => {
    if (cur) parts.push({ kw: cur.kw, text: cur.toks.length ? text.slice(cur.toks[0]!.start, cur.toks[cur.toks.length - 1]!.end) : "" });
  };
  for (const t of toks) {
    if (t.text === ";") break;
    if (depth === 0 && keywords.has(t.text)) {
      flush();
      cur = { kw: t.text, toks: [] };
      continue;
    }
    if (t.text === "(" || t.text === "[" || t.text === "{") depth++;
    else if (t.text === ")" || t.text === "]" || t.text === "}") depth--;
    (cur ? cur.toks : head).push(t);
  }
  flush();
  return { head, parts };
}

const lastSegment = (s: string): string => s.replace(/\s+/g, "").split(/::|\./).pop() ?? s;
const firstSegment = (s: string): string => s.replace(/\s+/g, "").split(/::|\./)[0] ?? s;
const unq = (s: string): string => (s.startsWith("'") && s.endsWith("'") ? s.slice(1, -1) : s);

/** Whether the keyword `then` ends right before the declaration (comments and blanks between are skipped). */
function precededByThen(text: string, el: Element): boolean {
  const toks = tokenize(text);
  let i = toks.length - 1;
  // binary search the last token starting before the element
  let lo = 0, hi = toks.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (toks[mid]!.start < el.range.start.offset) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  i = found;
  while (i >= 0 && !isCode(toks[i]!)) i--;
  // a visibility keyword may sit between `then` and the declaration
  while (i >= 0 && ["public", "private", "protected"].includes(toks[i]!.text)) { i--; while (i >= 0 && !isCode(toks[i]!)) i--; }
  return i >= 0 && toks[i]!.text === "then";
}

// ------------------------------------------------------------------------------ analysis

export interface SuccessionInfo {
  /** The statement (a real element, or a synthetic one when the succession is implied by `then`). */
  statement: Element;
  source: Element;
  target: Element;
  /** Guard source text; `else` for an else branch. */
  guard?: string;
  /** Written as part of a node declaration or as `then x;`: there is no statement of its own to delete. */
  implied: boolean;
}

export interface FlowInfo {
  statement: Element;
  source?: Element;
  target?: Element;
  sourceText: string;
  targetText: string;
  /** The item type of `flow of T`. */
  item?: string;
}

export interface TransitionInfo {
  statement: Element;
  source: Element;
  target: Element;
  trigger?: string;
  guard?: string;
  effect?: string;
}

export interface StateAction {
  kind: "entry" | "do" | "exit";
  text: string;
}

export interface Analysis {
  owner: Element;
  /** Action nodes, control nodes or states that are direct members, plus the `start`/`done` nodes the statements use. */
  nodes: Element[];
  successions: SuccessionInfo[];
  flows: FlowInfo[];
  transitions: TransitionInfo[];
  /** Start and done nodes, and implied successions. */
  synthetic: Element[];
}

const EMPTY = (owner: Element): Analysis => ({ owner, nodes: [], successions: [], flows: [], transitions: [], synthetic: [] });

/** Per-owner results; elements are immutable per parse, and everything read here is text of the owner's own document. */
const analyses = new WeakMap<Element, Analysis>();

/** The behaviour statements of an element, in source order. */
export function analyze(index: ModelIndex, owner: Element): Analysis {
  const known = analyses.get(owner);
  if (known) return known;
  const state = index.getDocument(owner.uri);
  const text = state && !state.stale ? state.text : undefined;
  const out = EMPTY(owner);
  if (text === undefined) return out;
  const start = virtualNode(owner, "start");
  const done = virtualNode(owner, "done");
  const usedStart = { v: false }, usedDone = { v: false };
  const synth: Element[] = [];
  const byName = (name: string): Element | undefined => {
    const n = unq(name);
    return owner.members.find((m) => m.name === n && m.kind !== "import") ?? owner.members.find((m) => m.shortName === n);
  };
  const endEl = (txt: string | undefined): Element | undefined => {
    if (!txt) return undefined;
    const seg = unq(firstSegment(txt.trim()));
    const m = byName(seg);
    if (m) return m;
    if (seg === "start") { usedStart.v = true; return start; }
    if (seg === "done") { usedDone.v = true; return done; }
    return undefined;
  };
  const nameOf = (e: Element): string => (e === start ? "start" : e === done ? "done" : (e.name ?? e.kind));
  const impliedSuccession = (source: Element, target: Element, at: Element): void => {
    const s = makeSynthetic(owner, "succession", [nameOf(source), nameOf(target)], at);
    synth.push(s);
    out.successions.push({ statement: s, source, target, implied: true });
  };
  const slice = (e: Element) => text.slice(e.range.start.offset, e.range.end.offset);

  let last: Element | undefined;
  const members = owner.members;
  for (let mi = 0; mi < members.length; mi++) {
    const m = members[mi]!;
    if (m.kind === "first" && m.ends[0] !== undefined) {
      last = endEl(m.ends[0]);
      continue;
    }
    if (m.kind === "entry" && m.ends.length === 0 && /^entry\s*;/.test(slice(m))) {
      // `entry; then s;`: the transition from the initial pseudostate is written after the bare entry.
      const rest = /^\s*then\s+([^;{}\s][^;{}]*);/.exec(text.slice(m.range.end.offset, m.range.end.offset + 400));
      const target = rest ? endEl(rest[1]) : undefined;
      last = start;
      if (target) {
        usedStart.v = true;
        impliedSuccession(start, target, target);
        last = target;
      }
      continue;
    }
    if (m.kind === "succession" || m.kind === "transition") {
      const toks = declTokens(text, m);
      if (m.kind === "succession") {
        // [succession name] [first X] [if G] then Y;  |  else Y;
        let i = 0;
        if (toks[0]?.text === "succession") { i = 1; if (toks[i] && !SECTION.has(toks[i]!.text)) i++; }
        const { parts } = sections(text, toks.slice(i), SECTION);
        const get = (kw: string) => parts.find((p) => p.kw === kw)?.text;
        const elseTarget = parts.find((p) => p.kw === "else")?.text;
        const target = endEl(get("then") ?? elseTarget);
        const source = get("first") !== undefined ? endEl(get("first")) : last;
        if (source && target) {
          const guard = elseTarget !== undefined ? "else" : get("if");
          out.successions.push({ statement: m, source, target, ...(guard !== undefined ? { guard } : {}), implied: false });
        }
      } else {
        const info = parseTransition(text, m);
        const source = info.first !== undefined ? endEl(info.first) : last;
        const target = endEl(info.then);
        if (source && target) {
          out.transitions.push({
            statement: m, source, target,
            ...(info.accept !== undefined ? { trigger: info.accept } : {}),
            ...(info.if !== undefined ? { guard: info.if } : {}),
            ...(info.do !== undefined ? { effect: info.do } : {}),
          });
        }
      }
      continue;
    }
    if (m.kind === "flow") {
      const ends = m.ends;
      if (ends.length >= 2) {
        const f: FlowInfo = { statement: m, sourceText: ends[0]!, targetText: ends[ends.length - 1]! };
        const s = endEl(f.sourceText), t = endEl(f.targetText);
        if (s) f.source = s;
        if (t) f.target = t;
        const ofm = /\bflow\s+(?:[\w']+\s+)?of\s+(?:[\w']+\s*:\s*)?([\w':.]+)/.exec(slice(m));
        if (ofm) f.item = ofm[1]!;
        out.flows.push(f);
      }
      continue;
    }
    if (isActionNode(m) || isStateNode(m)) {
      if (last && precededByThen(text, m)) impliedSuccession(last, m, m);
      last = m;
    }
  }
  out.nodes = owner.members.filter((m) => isActionNode(m) || isStateNode(m));
  if (usedStart.v) out.nodes.push(start);
  if (usedDone.v) out.nodes.push(done);
  out.synthetic = [...(usedStart.v ? [start] : []), ...(usedDone.v ? [done] : []), ...synth];
  analyses.set(owner, out);
  synthetic.set(owner, out.synthetic);
  return out;
}

interface TransitionParts { first?: string; accept?: string; if?: string; do?: string; then?: string }

/** The parts of a transition statement, as source text. Also used to re-plan a transition from its parts. */
export function parseTransition(text: string, el: Element): TransitionParts {
  const toks = declTokens(text, el);
  let i = 0;
  if (toks[0]?.text === "transition") { i = 1; if (toks[i] && !SECTION.has(toks[i]!.text)) i++; }
  const { parts } = sections(text, toks.slice(i), SECTION);
  const out: TransitionParts = {};
  for (const p of parts) if (p.kw === "first" || p.kw === "accept" || p.kw === "if" || p.kw === "do" || p.kw === "then") out[p.kw] = p.text;
  return out;
}

/** The entry, do and exit actions a state lists (the text after the keyword; bare `entry;` is not listed). */
export function stateActions(index: ModelIndex, state: Element): StateAction[] {
  const text = index.getDocument(state.uri)?.text;
  if (text === undefined || index.getDocument(state.uri)?.stale) return [];
  const out: StateAction[] = [];
  for (const m of state.members) {
    if (m.kind !== "entry" && m.kind !== "do" && m.kind !== "exit") continue;
    let s = text.slice(m.range.start.offset, m.range.end.offset).replace(/^(entry|do|exit)\b/, "").trim();
    s = s.replace(/^action\b/, "").trim();
    const cut = s.search(/[{;]/);
    if (cut >= 0) s = s.slice(0, cut);
    s = s.replace(/\s+/g, " ").trim();
    if (s) out.push({ kind: m.kind, text: s });
  }
  return out;
}

/** The statement element of a succession or transition as an edge: its ends as elements, or undefined. */
export function behaviorEnds(index: ModelIndex, statement: Element): { source: Element; target: Element } | undefined {
  const owner = statement.owner;
  if (!owner) return undefined;
  const a = analyze(index, owner);
  const s = a.successions.find((x) => x.statement === statement) ?? a.transitions.find((x) => x.statement === statement);
  if (s) return { source: s.source, target: s.target };
  const f = a.flows.find((x) => x.statement === statement);
  return f?.source && f.target ? { source: f.source, target: f.target } : undefined;
}

// ------------------------------------------------------------------------------ interactions

export interface Participant {
  /** The name messages use for it (`driver`). */
  name: string;
  /** The part (own member of the owner, or the element the name resolves to). */
  element?: Element;
}

export interface MessageInfo {
  statement: Element;
  name?: string;
  /** Item type of `of T`. */
  itemType?: string;
  from: string;
  to: string;
  fromParticipant?: string;
  toParticipant?: string;
  /** Position in time order, from 0. */
  order: number;
  /** No ordering relation to at least one other message: it keeps its source position. */
  unordered: boolean;
  /** Names or indices of the messages it is not ordered against. */
  unorderedWith: number[];
}

export interface Interaction {
  owner: Element;
  participants: Participant[];
  /** In time order (source order where unordered). */
  messages: MessageInfo[];
}

function participantName(m: Element): string | undefined {
  if (m.name !== undefined) return m.name;
  const r = m.redefines[0] ?? m.subsets[0];
  return r !== undefined ? lastSegment(r) : undefined;
}

/** Messages and participants of an owner. Empty when the owner has no message with both ends. */
export function interactionOf(index: ModelIndex, owner: Element): Interaction {
  const state = index.getDocument(owner.uri);
  const text = state && !state.stale ? state.text : undefined;
  const msgs = owner.members.filter((m) => m.kind === "message" && m.ends.length >= 2);
  const out: Interaction = { owner, participants: [], messages: [] };
  if (text === undefined || msgs.length === 0) {
    // Still list the parts, so a lifeline can be drawn before the first message.
    out.participants = owner.members.filter((m) => OCCURRENCE_PART_KINDS.has(m.kind) && participantName(m) !== undefined).map((m) => ({ name: participantName(m)!, element: m }));
    return out;
  }
  const parts = new Map<string, Participant>();
  const addPart = (name: string, element?: Element): void => {
    if (!parts.has(name)) parts.set(name, { name, ...(element ? { element } : {}) });
  };
  for (const m of owner.members) if (OCCURRENCE_PART_KINDS.has(m.kind) && participantName(m) !== undefined && m.kind !== "event occurrence") addPart(participantName(m)!, m);
  const resolve = (seg: string): Element | undefined => parts.get(seg)?.element ?? index.resolve(seg, owner);
  // Ordering relations between message indices: a < b.
  const idx = new Map<string, number>();
  msgs.forEach((m, i) => { if (m.name !== undefined) idx.set(m.name, i); });
  const before: [number, number][] = [];
  let lastMsg: number | undefined;
  for (const m of owner.members) {
    if (m.kind === "message" && m.ends.length >= 2) {
      const i = msgs.indexOf(m);
      if (lastMsg !== undefined && precededByThen(text, m)) before.push([lastMsg, i]);
      lastMsg = i;
    } else if (m.kind === "succession" && m.ends.length === 2) {
      const a = idx.get(unq(m.ends[0]!)), b = idx.get(unq(m.ends[1]!));
      if (a !== undefined && b !== undefined) before.push([a, b]);
    }
  }
  // `then event x.sourceEvent;` chains inside the participants.
  const eventMsg = (e: Element): number | undefined => {
    const t = e.ends[0];
    if (!t) return undefined;
    const segs = t.replace(/\s+/g, "").split(".");
    return idx.get(unq(segs[0]!));
  };
  const walkEvents = (p: Element): void => {
    let prev: number | undefined;
    for (const e of p.members) {
      if (e.kind === "event") {
        const mi = eventMsg(e);
        if (mi !== undefined) {
          if (prev !== undefined && prev !== mi && precededByThen(text, e)) before.push([prev, mi]);
          prev = mi;
        }
      } else if (OCCURRENCE_PART_KINDS.has(e.kind)) walkEvents(e);
    }
  };
  for (const m of owner.members) if (OCCURRENCE_PART_KINDS.has(m.kind)) walkEvents(m);

  const n = msgs.length;
  const succ: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  const reach: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (const [a, b] of before) {
    if (a === b || succ[a]!.includes(b)) continue;
    succ[a]!.push(b);
    indeg[b]!++;
    reach[a]![b] = true;
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (reach[i]![k]) for (let j = 0; j < n; j++) if (reach[k]![j]) reach[i]![j] = true;
  // Kahn's algorithm, the earliest source position first; a cycle leaves the rest in source order.
  const placed: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  const deg = [...indeg];
  while (placed.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && deg[i] === 0) { pick = i; break; }
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i]) { pick = i; break; }
    done[pick] = true;
    placed.push(pick);
    for (const s of succ[pick]!) deg[s]!--;
  }
  const orderOf = new Map(placed.map((mi, o) => [mi, o] as const));
  for (const mi of placed) {
    const m = msgs[mi]!;
    const toks = declTokens(text, m);
    const { head } = sections(text, toks, new Set(["from"]));
    // head: `message [name] [of [n :] T]`
    const headText = head.map((t) => t.text);
    let itemType: string | undefined;
    const ofAt = headText.indexOf("of");
    if (ofAt >= 0) {
      let rest = head.slice(ofAt + 1);
      const colon = rest.findIndex((t) => t.text === ":");
      if (colon >= 0) rest = rest.slice(colon + 1);
      const eq = rest.findIndex((t) => t.text === "=");
      if (eq >= 0) rest = rest.slice(0, eq);
      if (rest.length) itemType = text.slice(rest[0]!.start, rest[rest.length - 1]!.end).replace(/\s+/g, "");
    }
    const unorderedWith = msgs.map((_x, j) => j).filter((j) => j !== mi && !reach[mi]![j] && !reach[j]![mi]).map((j) => orderOf.get(j)!);
    const fromSeg = unq(firstSegment(m.ends[0]!)), toSeg = unq(firstSegment(m.ends[m.ends.length - 1]!));
    const info: MessageInfo = {
      statement: m, from: m.ends[0]!, to: m.ends[m.ends.length - 1]!, fromParticipant: fromSeg, toParticipant: toSeg,
      order: orderOf.get(mi)!, unordered: unorderedWith.length > 0, unorderedWith,
      ...(m.name !== undefined ? { name: m.name } : {}),
      ...(itemType !== undefined ? { itemType } : {}),
    };
    out.messages.push(info);
    addPart(fromSeg, resolve(fromSeg));
    addPart(toSeg, resolve(toSeg));
  }
  out.messages.sort((a, b) => a.order - b.order);
  out.participants = [...parts.values()];
  return out;
}

/** Whether the element can be the root of a sequence view: it owns messages (or parts that could exchange them). */
export function ownsMessages(owner: Element): boolean {
  return owner.members.some((m) => m.kind === "message");
}

/** The element a participant name stands for among the owner's members. */
export function participantElement(index: ModelIndex, owner: Element, name: string): Element | undefined {
  return interactionOf(index, owner).participants.find((p) => p.name === name)?.element;
}

export { participantName };
