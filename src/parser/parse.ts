import {
  BaseErrorListener,
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

/** Parse SysML v2 / KerML text. Tokens (including hidden channel) are all fetched. */
export function parse(text: string): ParseResult {
  const errors: SyntaxErrorInfo[] = [];
  const listener = new Collector(errors);
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SysMLv2Parser(tokens);
  parser.removeErrorListeners();
  parser.addErrorListener(listener);
  const tree = parser.rootNamespace();
  tokens.fill();
  return { tree, tokens, parser, errors };
}

export type { Token };
