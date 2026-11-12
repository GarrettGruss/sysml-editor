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
import { isSnapshotActive, loadSnapshot, purgeSnapshotDfas, type DfaSnapshot } from "./dfa-snapshot.js";
import snapshotData from "./dfa-snapshot.json";

// Pre-seed the shared prediction DFAs so the first parse is not a ~10 s cold start (see
// dfa-snapshot.ts). Set SYSML_DFA_SNAPSHOT=off to measure or regenerate without it.
if (process.env["SYSML_DFA_SNAPSHOT"] !== "off") loadSnapshot(snapshotData as DfaSnapshot);

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

function twoStage(text: string): ParseResult {
  try {
    const r = run(text, true);
    if (r.errors.length === 0) return r;
  } catch (e) {
    if (!(e instanceof ParseCancellationException)) throw e;
  }
  return run(text, false);
}

/**
 * Parse SysML v2 text. Tokens (including hidden channel) are all fetched.
 * Two-stage: fast SLL prediction that bails on the first error, then, only on failure,
 * a full-LL reparse with normal error reporting and recovery. If the DFA snapshot is active
 * and the result has errors, the snapshot may be the cause (it cannot extend itself), so the
 * DFAs are purged once and the text is parsed again from the ATN.
 */
export function parse(text: string): ParseResult {
  const r = twoStage(text);
  if (r.errors.length > 0 && isSnapshotActive()) {
    purgeSnapshotDfas();
    return twoStage(text);
  }
  return r;
}

export type { Token };
