import { CharStream } from "antlr4ng";
import { SysMLv2Lexer } from "../parser/generated/SysMLv2Lexer.js";
import type { TextEdit } from "./types.js";

/** A lexer token with UTF-16 offsets (`end` exclusive). */
export interface Tok {
  type: number;
  text: string;
  start: number;
  end: number;
  /** On the hidden channel (whitespace and line comments). Block comments are NOT hidden. */
  hidden: boolean;
}

export const T_IDENT = SysMLv2Lexer.IDENTIFIER;
export const T_QUOTED = SysMLv2Lexer.STRING;
export const T_WS = SysMLv2Lexer.WS;
export const T_BLOCK = SysMLv2Lexer.REGULAR_COMMENT;
export const T_LINE = SysMLv2Lexer.SINGLE_LINE_NOTE;
export const T_BARE_LINE = SysMLv2Lexer.BARE_LINE_COMMENT;

const cache = new Map<string, Tok[]>();

/** Tokenise with the real lexer, hidden tokens included. Errors are ignored (offsets stay right). */
export function tokenize(text: string): Tok[] {
  const hit = cache.get(text);
  if (hit) return hit;
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  let map: number[] | undefined;
  if (/[\ud800-\udfff]/.test(text)) {
    map = [];
    let u = 0;
    for (const ch of text) {
      map.push(u);
      u += ch.length;
    }
    map.push(u);
  }
  const unit = (cp: number) => (map ? (map[cp] ?? text.length) : cp);
  const out: Tok[] = [];
  for (const t of lexer.getAllTokens()) {
    out.push({ type: t.type, text: t.text ?? "", start: unit(t.start), end: unit(t.stop + 1), hidden: t.channel !== 0 });
  }
  cache.set(text, out);
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return out;
}

export const isWs = (t: Tok) => t.type === T_WS;
export const isLineComment = (t: Tok) => t.type === T_LINE || t.type === T_BARE_LINE;
export const isBlockComment = (t: Tok) => t.type === T_BLOCK;
export const isName = (t: Tok) => t.type === T_IDENT || t.type === T_QUOTED;
/** Tokens the parser sees, without block comments. */
export const isCode = (t: Tok) => !t.hidden && t.type !== T_BLOCK;

// ---------------------------------------------------------------------------- applying edits

/**
 * Apply non-overlapping edits (all for one document) to `text`. Edits at the same position keep
 * their given order. Throws on overlapping or out-of-range edits.
 */
export function applyEdits(text: string, edits: readonly Pick<TextEdit, "range" | "newText">[]): string {
  const sorted = edits.map((e, i) => ({ e, i })).sort((a, b) => a.e.range.start - b.e.range.start || a.e.range.end - b.e.range.end || a.i - b.i);
  let out = "";
  let pos = 0;
  for (const { e } of sorted) {
    const { start, end } = e.range;
    if (start < pos) throw new Error(`Overlapping edits at offset ${start}`);
    if (end < start || end > text.length || start < 0) throw new Error(`Edit range ${start}-${end} is outside the text`);
    out += text.slice(pos, start) + e.newText;
    pos = end;
  }
  return out + text.slice(pos);
}

/** Edits grouped by URI. */
export function groupByUri(edits: readonly TextEdit[]): Map<string, TextEdit[]> {
  const m = new Map<string, TextEdit[]>();
  for (const e of edits) {
    const a = m.get(e.uri);
    if (a) a.push(e);
    else m.set(e.uri, [e]);
  }
  return m;
}

// ---------------------------------------------------------------------------- layout helpers

export function lineStart(text: string, off: number): number {
  return off <= 0 ? 0 : text.lastIndexOf("\n", off - 1) + 1;
}

/** Index of the `\n` ending the line containing `off`, or -1 when it is the last line. */
export function lineBreakAt(text: string, off: number): number {
  return text.indexOf("\n", off);
}

/** Whitespace-only between the start of the line and `off`. */
export function startsOwnLine(text: string, off: number): boolean {
  return /^[ \t]*$/.test(text.slice(lineStart(text, off), off));
}

/** The leading whitespace of the line containing `off`. */
export function lineIndent(text: string, off: number): string {
  const ls = lineStart(text, off);
  return /^[ \t]*/.exec(text.slice(ls, ls + 400))![0];
}

export function detectEol(text: string): string {
  const i = text.indexOf("\n");
  return i > 0 && text[i - 1] === "\r" ? "\r\n" : "\n";
}

/** One indentation level: a tab, or the dominant width of indentation steps in spaces (default 4). */
export function detectIndentUnit(text: string): string {
  let tabs = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  for (const line of text.split("\n", 2000)) {
    if (line.trim() === "") continue;
    const m = /^[ \t]*/.exec(line)![0];
    if (m.startsWith("\t")) {
      tabs++;
      continue;
    }
    const w = m.length;
    if (w > prev) steps.set(w - prev, (steps.get(w - prev) ?? 0) + 1);
    prev = w;
  }
  if (tabs > 0 && tabs >= [...steps.values()].reduce((a, b) => a + b, 0)) return "\t";
  let best = 4;
  let bestN = 0;
  for (const [w, n] of steps) if (w <= 8 && (n > bestN || (n === bestN && w < best))) [best, bestN] = [w, n];
  return " ".repeat(best);
}

/** Indent every line of `decl` (which may span lines) and join with `eol`. */
export function indentLines(decl: string, indent: string, eol: string): string {
  return decl
    .split(/\r?\n/)
    .map((l) => (l === "" ? l : indent + l))
    .join(eol);
}

export function positionOf(text: string, off: number): { line: number; column: number } {
  let line = 0;
  let ls = 0;
  for (let i = text.indexOf("\n"); i !== -1 && i < off; i = text.indexOf("\n", i + 1)) {
    line++;
    ls = i + 1;
  }
  return { line, column: off - ls };
}
