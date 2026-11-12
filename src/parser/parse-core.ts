/**
 * The ANTLR parse itself, without the DFA snapshot. `parse.ts` (main thread) loads the snapshot
 * into the parser's static DFAs before using this module; the parse worker (`src/parse-worker.ts`)
 * imports only this module, so its static DFAs are built normally from the ATN and grow with use.
 */
import {
  BailErrorStrategy,
  AtomTransition,
  BasicBlockStartState,
  BlockEndState,
  EpsilonTransition,
  PlusLoopbackState,
  StarLoopEntryState,
  Token,
  BaseErrorListener,
  DefaultErrorStrategy,
  ParseCancellationException,
  PredictionMode,
  CharStream,
  CommonTokenStream,
  DFA,
  ParserATNSimulator,
  PredictionContextCache,
  RecognitionException,
  RuleStopState,
  RuleTransition,
  type ATNState,
  type ParserRuleContext,
  type Recognizer,
} from "antlr4ng";
import { SysMLv2Lexer } from "./generated/SysMLv2Lexer.js";
import { SysMLv2Parser } from "./generated/SysMLv2Parser.js";

/**
 * A syntax error. `line` is 1-based and `column` is 0-based (antlr4ng convention), unlike VS Code
 * positions, which are 0-based for both.
 */
export interface SyntaxErrorInfo {
  line: number;
  column: number;
  message: string;
}

export interface ParseResult {
  tree: ParserRuleContext;
  tokens: CommonTokenStream;
  parser: SysMLv2Parser;
  errors: SyntaxErrorInfo[];
}

class Collector extends BaseErrorListener {
  constructor(private readonly out: SyntaxErrorInfo[]) {
    super();
  }
  override syntaxError(
    _r: Recognizer<any>,
    _t: unknown,
    line: number,
    column: number,
    message: string,
    _e: RecognitionException | null,
  ): void {
    this.out.push({ line, column, message });
  }
}

/** A prediction cache of its own (DFA array plus context cache), built normally from the ATN. */
export interface Sim {
  dfas: DFA[];
  cache: PredictionContextCache;
}
export function newSim(): Sim {
  return {
    dfas: SysMLv2Parser._ATN.decisionToState.map((ds, i) => new DFA(ds, i)),
    cache: new PredictionContextCache(),
  };
}

/**
 * Fast-path prediction shortcuts: exact LL(1) decisions made with the real calling context.
 *
 * Under SLL there is no calling context, so a decision whose exit can again be followed by the
 * same token (an optional part before a member that may start like it) keeps the "exit"
 * alternative viable through phantom callers until the end of the input. The DFA path then
 * depends on the whole rest of the file, which no snapshot can cover: every short-named
 * declaration followed by something the snapshot never saw failed the fast path (and a cold
 * parser needs seconds). With the actual rule stack the same decision is settled by one token.
 *
 * A shortcut is taken only when one token (LA(1), or LA(4) after `< name >`) provably separates
 * the alternatives in the actual context, so it returns exactly what ALL(*) would, never a
 * different parse and never a spurious error. In every other case ordinary prediction runs.
 * Only the decisions listed here, the ones measured to need it, use it.
 *
 * Independence rule: the shortcuts are enabled ONLY on the main-thread fast path (`shortcuts`
 * argument of `fastParse`, set by `tryFastParse`). The parse worker, the same-thread exact
 * fallback, snippet validation (`build-snippets.ts`) and the snapshot generator run without them,
 * so "exact" really is the unmodified generated parser. The soundness argument rests on grammar
 * facts that `checkShortcutFacts` verifies against the generated ATN at load.
 *
 * 1. Optional parts (`x?`) of `usageDeclaration` and `featureSpecializationPart`: enter when LA(1)
 *    can start `x` and cannot follow it in this context.
 * 2. `identification : LT name GT name | LT name GT | name`: after `< name >`, a name token that
 *    cannot follow the identification here is the optional second name (alternative 1).
 */
const SHORTCUT_RULES = ["usageDeclaration", "featureSpecializationPart"];
interface Shortcuts {
  /** tokens that can follow a rule in some calling context (superset of the in-context follow) */
  globalFollow: Set<number>[];
  /** decision -> [tokens that can start the enter alternative, ATN state of the exit alternative] */
  optional: ([Set<number>, number] | undefined)[];
  identDecision: number;
  identStop: number;
  nameStart: Set<number>;
}
const SHORTCUTS: Shortcuts = (() => {
  const atn = SysMLv2Parser._ATN;
  const optional: ([Set<number>, number] | undefined)[] = [];
  atn.decisionToState.forEach((st, d) => {
    if (!SHORTCUT_RULES.includes(SysMLv2Parser.ruleNames[st.ruleIndex]!)) return;
    let isOptional = false;
    if (st instanceof StarLoopEntryState || st instanceof PlusLoopbackState) isOptional = st.transitions.length === 2;
    else if (st instanceof BasicBlockStartState && st.transitions.length === 2) {
      isOptional = st.transitions[1] instanceof EpsilonTransition && st.transitions[1].target === st.endState;
    }
    if (!isOptional) return;
    const first = atn.nextTokens(st.transitions[0]!.target);
    if (first.contains(Token.EPSILON)) return;
    optional[d] = [new Set(first.toArray()), st.transitions[1]!.target.stateNumber];
  });
  const globalFollow = SysMLv2Parser.ruleNames.map(() => new Set<number>());
  for (let changed = true; changed; ) {
    changed = false;
    for (const st of atn.states) {
      if (!st) continue;
      for (const tr of st.transitions) {
        if (!(tr instanceof RuleTransition)) continue;
        const target = globalFollow[tr.target.ruleIndex]!;
        const f = atn.nextTokens(tr.followState);
        const add = (t: number) => { if (!target.has(t)) { target.add(t); changed = true; } };
        for (const t of f.toArray()) if (t !== Token.EPSILON) add(t);
        if (f.contains(Token.EPSILON)) for (const t of globalFollow[st.ruleIndex]!) add(t);
      }
    }
  }
  const rule = SysMLv2Parser.ruleNames.indexOf("identification");
  if (rule < 0) return { globalFollow, optional, identDecision: -1, identStop: -1, nameStart: new Set() };
  const identDecision = atn.decisionToState.findIndex((d) => d.ruleIndex === rule && d.transitions.length === 3);
  const nameRule = SysMLv2Parser.ruleNames.indexOf("name");
  const nameStart = new Set(nameRule < 0 ? [] : atn.nextTokens(atn.ruleToStartState[nameRule]!).toArray());
  return { globalFollow, optional, identDecision, identStop: atn.ruleToStopState[rule]!.stateNumber, nameStart };
})();

/** Minimum and maximum number of tokens a rule consumes; `max` is Infinity when the rule can loop. */
function ruleTokenRange(ruleIndex: number): [number, number] {
  const atn = SysMLv2Parser._ATN;
  const memo = new Map<number, [number, number]>();
  const rules = new Map<number, [number, number]>();
  const visiting = new Set<number>();
  const rule = (r: number): [number, number] => {
    let v = rules.get(r);
    if (!v) rules.set(r, (v = go(atn.ruleToStartState[r]!)));
    return v;
  };
  const go = (st: ATNState): [number, number] => {
    if (st instanceof RuleStopState) return [0, 0];
    const known = memo.get(st.stateNumber);
    if (known) return known;
    if (visiting.has(st.stateNumber)) return [0, Infinity];
    visiting.add(st.stateNumber);
    let min = Infinity, max = -Infinity;
    for (const tr of st.transitions) {
      const [a, b] = tr instanceof RuleTransition ? rule(tr.target.ruleIndex) : tr.isEpsilon ? [0, 0] : [1, 1];
      const [c, d] = go(tr instanceof RuleTransition ? tr.followState : tr.target);
      min = Math.min(min, a + c);
      max = Math.max(max, b + d);
    }
    visiting.delete(st.stateNumber);
    const out: [number, number] = [min, max];
    memo.set(st.stateNumber, out);
    return out;
  };
  return rule(ruleIndex);
}

/** The labels of an alternative that is a plain sequence of tokens and rule calls, or undefined. */
function linearAlternative(start: ATNState): string[] | undefined {
  const out: string[] = [];
  let st = start;
  for (let guard = 0; guard < 50; guard++) {
    if (st instanceof RuleStopState) return out;
    if (st.transitions.length !== 1) return undefined;
    const tr = st.transitions[0]!;
    if (tr instanceof RuleTransition) {
      out.push(`rule ${SysMLv2Parser.ruleNames[tr.target.ruleIndex]}`);
      st = tr.followState;
    } else if (tr instanceof AtomTransition) {
      out.push(`token ${SysMLv2Parser.symbolicNames[tr.labelValue] ?? tr.labelValue}`);
      st = tr.target;
    } else if (tr.isEpsilon || st instanceof BlockEndState) st = tr.target;
    else return undefined;
  }
  return undefined;
}

/**
 * The grammar facts the soundness argument relies on, checked against the generated ATN. Returns
 * the problems found (empty when all hold):
 * - `identification` has one decision with three alternatives `LT name GT name`, `LT name GT`, `name`;
 * - `name` is exactly one token, so the token after `LT name GT` is the fourth token of the
 *   identification and one lookahead token (LA(4)) separates the first two alternatives;
 * - every rule in SHORTCUT_RULES has at least one located optional-part decision.
 */
export function checkShortcutFacts(): string[] {
  const problems: string[] = [];
  const atn = SysMLv2Parser._ATN;
  const { optional, identDecision, nameStart } = SHORTCUTS;
  const rule = (n: string) => SysMLv2Parser.ruleNames.indexOf(n);
  for (const r of ["identification", "name", ...SHORTCUT_RULES]) if (rule(r) < 0) problems.push(`rule ${r} not found in the generated parser`);
  if (problems.length) return problems;
  if (identDecision < 0) problems.push("the identification decision (3 alternatives) was not located in the ATN");
  else {
    const want = [
      ["token LT", "rule name", "token GT", "rule name"],
      ["token LT", "rule name", "token GT"],
      ["rule name"],
    ];
    const st = atn.decisionToState[identDecision]!;
    want.forEach((w, i) => {
      const got = linearAlternative(st.transitions[i]!.target);
      if (!got || got.join(", ") !== w.join(", ")) problems.push(`identification alternative ${i + 1} is [${got?.join(", ") ?? "not a plain sequence"}], expected [${w.join(", ")}]`);
    });
  }
  const [min, max] = ruleTokenRange(rule("name"));
  if (min !== 1 || max !== 1) problems.push(`name consumes ${min}..${max} tokens, expected exactly 1`);
  if (nameStart.size === 0) problems.push("name has an empty first set");
  for (const r of SHORTCUT_RULES) {
    const ri = rule(r);
    if (!atn.decisionToState.some((st, d) => st.ruleIndex === ri && optional[d] !== undefined)) problems.push(`no optional-part decision located in rule ${r}`);
  }
  return problems;
}

const shortcutProblems = (() => {
  try {
    return checkShortcutFacts();
  } catch (e) {
    return [`checking the grammar facts failed: ${String(e)}`];
  }
})();
const strict = typeof process !== "undefined" && !!(process.env?.["VITEST"] || process.env?.["SYSML_STRICT_SHORTCUTS"]);
if (shortcutProblems.length > 0) {
  const msg = `Parser prediction shortcuts disabled, grammar no longer matches their assumptions:\n  ${shortcutProblems.join("\n  ")}`;
  if (strict) throw new Error(msg);
  console.error(msg); // once, at load; parsing continues on the plain fast path (slower, may defer more files to the worker)
}
/** True when the shortcut decisions were located and the grammar facts hold. */
export const shortcutsAvailable = shortcutProblems.length === 0;
/** Throws when the shortcuts cannot be used; called by the gate so `npm run gate:parser` fails loudly. */
export function assertShortcutsAvailable(): void {
  if (!shortcutsAvailable) throw new Error(`Parser prediction shortcuts unavailable:\n  ${shortcutProblems.join("\n  ")}`);
}
/** The located decisions, for tests. */
export function shortcutInfo(): { identDecision: number; optionalDecisions: number[]; problems: string[] } {
  const optionalDecisions: number[] = [];
  SHORTCUTS.optional.forEach((o, d) => { if (o) optionalDecisions.push(d); });
  return { identDecision: SHORTCUTS.identDecision, optionalDecisions, problems: shortcutProblems };
}

/**
 * Test-only: makes one shortcut deliberately wrong, to prove the comparison with the exact parser
 * can fail. "ident-short-only" always picks `LT name GT` (alternative 2).
 */
export type ShortcutFault = "ident-short-only" | undefined;
let shortcutFault: ShortcutFault;
export function setShortcutFault(f: ShortcutFault): void {
  shortcutFault = f;
}

/** In-context follow sets, cached in a trie keyed by exit state and then the invoking-state chain. */
interface FollowNode {
  next: Map<number, FollowNode>;
  follow?: { contains(t: number): boolean };
}
let followCache = new Map<number, FollowNode>();
/** The cache is dropped when it holds more nodes than `limit` (checked per lookup, so it may overshoot by one chain). */
export const followCacheStats = { nodes: 0, limit: 50_000, clears: 0 };
function followInContext(exit: ATNState, ctx: ParserRuleContext | null): { contains(t: number): boolean } {
  const atn = SysMLv2Parser._ATN;
  if (followCacheStats.nodes > followCacheStats.limit) {
    followCache = new Map();
    followCacheStats.nodes = 0;
    followCacheStats.clears++;
  }
  let node: FollowNode;
  const top = followCache.get(exit.stateNumber);
  if (top) node = top;
  else {
    followCacheStats.nodes++;
    followCache.set(exit.stateNumber, (node = { next: new Map() }));
  }
  for (let c: ParserRuleContext | null = ctx; c; c = c.parent as ParserRuleContext | null) {
    const known = node.next.get(c.invokingState);
    if (known) node = known;
    else {
      followCacheStats.nodes++;
      const n: FollowNode = { next: new Map() };
      node.next.set(c.invokingState, n);
      node = n;
    }
  }
  return (node.follow ??= atn.nextTokens(exit, ctx ?? undefined));
}

function usePredictionShortcuts(parser: SysMLv2Parser): void {
  const { globalFollow, optional, identDecision, identStop, nameStart } = SHORTCUTS;
  const identRule = SysMLv2Parser.ruleNames.indexOf("identification");
  const atn = SysMLv2Parser._ATN;
  const sim = parser.interpreter;
  const predict = sim.adaptivePredict.bind(sim);
  sim.adaptivePredict = (input, decision, ctx) => {
    const o = optional[decision];
    if (o !== undefined) {
      const la = input.LA(1);
      if (o[0].has(la)) {
        const exit = atn.states[o[1]]!;
        const local = atn.nextTokens(exit);
        if (!local.contains(la) && (!local.contains(Token.EPSILON) || !globalFollow[exit.ruleIndex]!.has(la))) return 1;
        if (!followInContext(exit, ctx).contains(la)) return 1;
      }
    } else if (decision === identDecision && input.LA(1) === SysMLv2Lexer.LT) {
      if (shortcutFault === "ident-short-only") return 2;
      const la = input.LA(4);
      if (!nameStart.has(la)) return 2;
      if (!globalFollow[identRule]!.has(la) || !followInContext(atn.states[identStop]!, ctx).contains(la)) return 1;
    }
    return predict(input, decision, ctx);
  };
}

function setUp(text: string, errors: SyntaxErrorInfo[], sim?: Sim) {
  const listener = new Collector(errors);
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SysMLv2Parser(tokens);
  if (sim) parser.interpreter = new ParserATNSimulator(parser, SysMLv2Parser._ATN, sim.dfas, sim.cache);
  parser.removeErrorListeners();
  return { listener, tokens, parser };
}

/** Full LL parse with error reporting and recovery. */
function full(text: string, sim?: Sim): ParseResult {
  const errors: SyntaxErrorInfo[] = [];
  const { listener, tokens, parser } = setUp(text, errors, sim);
  parser.addErrorListener(listener);
  parser.errorHandler = new DefaultErrorStrategy();
  const tree = parser.rootNamespace();
  tokens.fill();
  return { tree, tokens, parser, errors };
}

export type FastResult =
  | { ok: true; result: ParseResult }
  /** `error` is the first lexer error or the token where SLL prediction bailed out. */
  | { ok: false; error: SyntaxErrorInfo; lexer?: boolean };

/**
 * A parse that bails on the first problem (SLL prediction, or full LL with `ll`). Never reports
 * more than the first position. `shortcuts` enables the prediction shortcuts (main-thread fast path only).
 */
export function fastParse(text: string, sim?: Sim, ll = false, shortcuts = false): FastResult {
  const errors: SyntaxErrorInfo[] = [];
  const { tokens, parser } = setUp(text, errors, sim);
  parser.interpreter.predictionMode = ll ? PredictionMode.LL : PredictionMode.SLL;
  parser.errorHandler = new BailErrorStrategy();
  if (shortcuts && shortcutsAvailable) usePredictionShortcuts(parser);
  try {
    const tree = parser.rootNamespace();
    tokens.fill();
    if (errors.length === 0) return { ok: true, result: { tree, tokens, parser, errors } };
    return { ok: false, error: errors[0]!, lexer: true };
  } catch (e) {
    if (!(e instanceof ParseCancellationException)) throw e;
    if (errors.length > 0) return { ok: false, error: errors[0]!, lexer: true };
    const cause = e.cause instanceof RecognitionException ? e.cause : undefined;
    const t = cause?.offendingToken ?? parser.getCurrentToken();
    return { ok: false, error: { line: t?.line ?? 1, column: t?.column ?? 0, message: "syntax error" } };
  }
}

/**
 * Fast SLL attempt, then, only on failure, a full-LL parse with normal error reporting and
 * recovery, both on the same prediction cache (`sim`, or the parser class's static DFAs). Never
 * uses the prediction shortcuts: this is the exact parser.
 */
export function twoStage(text: string, sim?: Sim): ParseResult {
  const f = fastParse(text, sim);
  return f.ok ? f.result : full(text, sim);
}

export type { Token };
