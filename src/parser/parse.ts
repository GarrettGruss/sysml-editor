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
  type ParserRuleContext,
  type RecognitionException,
  type Recognizer,
  type Token,
} from "antlr4ng";
import { SysMLv2Lexer } from "./generated/SysMLv2Lexer.js";
import { SysMLv2Parser } from "./generated/SysMLv2Parser.js";
import { loadSnapshot, type DfaSnapshot } from "./dfa-snapshot.js";
import snapshotData from "./dfa-snapshot.json";

// Pre-seed the shared prediction DFAs so the first parse is not a ~10 s cold start (see
// dfa-snapshot.ts). Set SYSML_DFA_SNAPSHOT=off to measure or regenerate without it.
if (process.env["SYSML_DFA_SNAPSHOT"] !== "off") loadSnapshot(snapshotData as DfaSnapshot);

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

/**
 * Second prediction cache, built normally from the ATN (not from the snapshot) and owned by this
 * module, so it can grow with use. Parses that fail on the snapshot-backed fast path run here.
 */
interface Sim {
  dfas: DFA[];
  cache: PredictionContextCache;
}
let fallbackSim: Sim | undefined;
function fallback(): Sim {
  if (!fallbackSim) {
    void SysMLv2Parser._ATN;
    fallbackSim = {
      dfas: SysMLv2Parser._ATN.decisionToState.map((ds, i) => new DFA(ds, i)),
      cache: new PredictionContextCache(),
    };
  }
  return fallbackSim;
}

/** Counters for tests and the benchmark. */
export const parseStats = { fastPath: 0, fallback: 0 };

function run(text: string, fast: boolean, sim?: Sim): ParseResult {
  const errors: SyntaxErrorInfo[] = [];
  const listener = new Collector(errors);
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SysMLv2Parser(tokens);
  if (sim) parser.interpreter = new ParserATNSimulator(parser, SysMLv2Parser._ATN, sim.dfas, sim.cache);
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

function twoStage(text: string, sim?: Sim): ParseResult {
  try {
    const r = run(text, true, sim);
    if (r.errors.length === 0) return r;
  } catch (e) {
    if (!(e instanceof ParseCancellationException)) throw e;
  }
  return run(text, false, sim);
}

/**
 * Parse SysML v2 text. Tokens (including hidden channel) are all fetched.
 * Two-stage: fast SLL prediction that bails on the first error, then, only on failure,
 * a full-LL reparse with normal error reporting and recovery. The first attempt uses the
 * snapshot-backed DFAs, which cannot grow and are never purged. If it has errors (possibly
 * spurious, because the snapshot lacks a path), the text is parsed again with a separate,
 * normally built prediction cache that grows with use, so results equal an unseeded parse.
 */
export function parse(text: string): ParseResult {
  const r = twoStage(text);
  if (r.errors.length === 0) {
    parseStats.fastPath++;
    return r;
  }
  parseStats.fallback++;
  return twoStage(text, fallback());
}

/**
 * Cut `text` into small, roughly self-contained pieces for warm-up: runs of whole members of the
 * outermost package (found by naive brace counting, which ignores strings and comments), each
 * wrapped in a package so it parses on its own. Small steps keep the event loop responsive; a
 * piece that does not parse cleanly is harmless because warm-up results are discarded.
 */
export function warmupPieces(text: string, targetLines = 12): string[] {
  const lines = text.split("\n");
  const pieces: string[] = [];
  let depth = 0;
  let cur: string[] = [];
  for (const line of lines) {
    const before = depth;
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (before >= 1 && !(before === 1 && depth === 0)) cur.push(line);
    if (depth === 1 && cur.length >= targetLines) {
      pieces.push(`package W {\n${cur.join("\n")}\n}`);
      cur = [];
    }
  }
  if (cur.length > 0) pieces.push(`package W {\n${cur.join("\n")}\n}`);
  return pieces.length > 0 ? pieces : [text];
}

/**
 * Warm the fallback cache by parsing `texts` through the fallback path in small steps (a piece
 * of a text per step, see `warmupPieces`), calling `yieldFn` after each step. Optional: results
 * never depend on it. The longest step is the cost of the most cold-cache decisions one piece
 * touches for the first time, so it is large only at the start.
 */
export async function warmFallbackParser(
  texts: readonly string[],
  yieldFn: () => Promise<void> = () => new Promise((r) => setTimeout(r, 0)),
  opts: { cancelled?: () => boolean; onStep?: (ms: number) => void } = {},
): Promise<void> {
  const sim = fallback();
  for (const text of texts) {
    for (const piece of warmupPieces(text)) {
      if (opts.cancelled?.()) return;
      const t0 = performance.now();
      twoStage(piece, sim);
      opts.onStep?.(performance.now() - t0);
      await yieldFn();
    }
  }
}

export type { Token };
