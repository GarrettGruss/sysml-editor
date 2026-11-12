import {
  BailErrorStrategy,
  BaseErrorListener,
  DefaultErrorStrategy,
  ParseCancellationException,
  PredictionMode,
  CharStream,
  CommonTokenStream,
  type ParserRuleContext,
  type RecognitionException,
  type Recognizer,
  type Token,
} from "antlr4ng";
import { SysMLv2Lexer } from "./generated/SysMLv2Lexer.js";
import { SysMLv2Parser } from "./generated/SysMLv2Parser.js";

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

function run(text: string, fast: boolean): ParseResult {
  const errors: SyntaxErrorInfo[] = [];
  const listener = new Collector(errors);
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SysMLv2Parser(tokens);
  parser.removeErrorListeners();
  if (fast) {
    parser.interpreter.predictionMode = PredictionMode.SLL;
    parser.errorHandler = new BailErrorStrategy();
  } else {
    parser.addErrorListener(listener);
    parser.errorHandler = new DefaultErrorStrategy();
  }
  const tree = parser.rootNamespace();
  tokens.fill();
  return { tree, tokens, parser, errors };
}

/**
 * Parse SysML v2 text. Tokens (including hidden channel) are all fetched.
 * Two-stage: fast SLL prediction that bails on the first error, then, only on failure,
 * a full-LL reparse with normal error reporting and recovery.
 */
export function parse(text: string): ParseResult {
  try {
    const r = run(text, true);
    if (r.errors.length === 0) return r;
  } catch (e) {
    if (!(e instanceof ParseCancellationException)) throw e;
  }
  return run(text, false);
}

export type { Token };
