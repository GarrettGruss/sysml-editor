/**
 * The ANTLR parse itself, without the DFA snapshot. `parse.ts` (main thread) loads the snapshot
 * into the parser's static DFAs before using this module; the parse worker (`src/parse-worker.ts`)
 * imports only this module, so its static DFAs are built normally from the ATN and grow with use.
 */
import {
  BailErrorStrategy,
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
  type ParserRuleContext,
  type Recognizer,
  type Token,
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
  | { ok: false; error: SyntaxErrorInfo };

/** SLL prediction that bails on the first problem. Never reports more than the first position. */
export function fastParse(text: string, sim?: Sim): FastResult {
  const errors: SyntaxErrorInfo[] = [];
  const { tokens, parser } = setUp(text, errors, sim);
  parser.interpreter.predictionMode = PredictionMode.SLL;
  parser.errorHandler = new BailErrorStrategy();
  try {
    const tree = parser.rootNamespace();
    tokens.fill();
    if (errors.length === 0) return { ok: true, result: { tree, tokens, parser, errors } };
    return { ok: false, error: errors[0]! };
  } catch (e) {
    if (!(e instanceof ParseCancellationException)) throw e;
    if (errors.length > 0) return { ok: false, error: errors[0]! };
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
