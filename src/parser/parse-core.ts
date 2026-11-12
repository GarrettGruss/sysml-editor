/**
 * The ANTLR parse itself, without the DFA snapshot. `parse.ts` (main thread) loads the snapshot
 * into the parser's static DFAs before using this module; the parse worker (`src/parse-worker.ts`)
 * imports only this module, so its static DFAs are built normally from the ATN and grow with use.
 */
import {
  BailErrorStrategy,
  BasicBlockStartState,
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
  const identDecision = atn.decisionToState.findIndex((d) => d.ruleIndex === rule && d.transitions.length === 3);
  const nameStart = new Set(atn.nextTokens(atn.ruleToStartState[SysMLv2Parser.ruleNames.indexOf("name")]!).toArray());
  return { globalFollow, optional, identDecision, identStop: atn.ruleToStopState[rule]!.stateNumber, nameStart };
})();

/** In-context follow sets, cached in a trie keyed by exit state and then the invoking-state chain. */
interface FollowNode {
  next: Map<number, FollowNode>;
  follow?: { contains(t: number): boolean };
}
const followCache = new Map<number, FollowNode>();
function followInContext(exit: ATNState, ctx: ParserRuleContext | null): { contains(t: number): boolean } {
  const atn = SysMLv2Parser._ATN;
  let node: FollowNode = followCache.get(exit.stateNumber) ?? { next: new Map() };
  followCache.set(exit.stateNumber, node);
  for (let c: ParserRuleContext | null = ctx; c; c = c.parent as ParserRuleContext | null) {
    const n: FollowNode = node.next.get(c.invokingState) ?? { next: new Map() };
    node.next.set(c.invokingState, n);
    node = n;
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
 * more than the first position.
 */
export function fastParse(text: string, sim?: Sim, ll = false): FastResult {
  const errors: SyntaxErrorInfo[] = [];
  const { tokens, parser } = setUp(text, errors, sim);
  parser.interpreter.predictionMode = ll ? PredictionMode.LL : PredictionMode.SLL;
  parser.errorHandler = new BailErrorStrategy();
  usePredictionShortcuts(parser);
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
 * recovery, both on the same prediction cache (`sim`, or the parser class's static DFAs).
 */
export function twoStage(text: string, sim?: Sim): ParseResult {
  const f = fastParse(text, sim);
  return f.ok ? f.result : full(text, sim);
}

export type { Token };
