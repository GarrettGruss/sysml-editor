/**
 * A KerML outline indexer: a tokenizer plus a brace-structure reader that produces the same
 * DocumentModel as the SysML builder. It is NOT a KerML parser. It recovers only the declaration
 * structure (kind, names, nesting, relationships, imports, doc text). Expressions, parameter
 * lists and annotations are skipped; it never reports syntax errors and never throws.
 * No `vscode` and no ANTLR in this file.
 */
import { processDocComment, quoteName, unquoteName } from "./names.js";
import type {
  DocumentModel,
  DocumentParser,
  Element,
  ImportInfo,
  ParsedDocument,
  SourcePosition,
  SourceRange,
  Visibility,
} from "./types.js";

// ---------------------------------------------------------------- tokenizer

type TokType = "ident" | "quoted" | "string" | "number" | "comment" | "sym";
interface Tok {
  type: TokType;
  text: string;
  start: number;
  end: number;
}

const SYMBOLS = [
  "===", "!==", "::>", ":>>", "::", ":>", ":=", "**", "..", "->", "==", "!=", "<=", ">=", "&&", "||",
  "??", "@@",
];
const IDENT = /[\p{L}_$][\p{L}\p{N}_$]*/uy;
const NUMBER = /[0-9][0-9_]*(?:\.[0-9][0-9_]*)?(?:[eE][+-]?[0-9]+)?/y;

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v") {
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      if (text[i + 2] === "*") {
        const e = text.indexOf("*/", i + 3);
        i = e < 0 ? n : e + 2;
      } else {
        const e = text.indexOf("\n", i);
        i = e < 0 ? n : e + 1;
      }
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      out.push({ type: "comment", text: text.slice(i, end), start: i, end });
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      const end = Math.min(text[j] === c ? j + 1 : j, n);
      out.push({ type: c === "'" ? "quoted" : "string", text: text.slice(i, end), start: i, end });
      i = end;
      continue;
    }
    IDENT.lastIndex = i;
    let m = IDENT.exec(text);
    if (m) {
      out.push({ type: "ident", text: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    NUMBER.lastIndex = i;
    m = NUMBER.exec(text);
    if (m) {
      out.push({ type: "number", text: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    let len = 1;
    for (const s of SYMBOLS) {
      if (text.startsWith(s, i)) {
        len = s.length;
        break;
      }
    }
    out.push({ type: "sym", text: text.slice(i, i + len), start: i, end: i + len });
    i += len;
  }
  return out;
}

// ---------------------------------------------------------------- reader

interface MutableElement {
  uri: string;
  kind: string;
  isDefinition: boolean;
  isUsage: boolean;
  name?: string;
  shortName?: string;
  qualifiedName?: string;
  owner?: MutableElement;
  members: MutableElement[];
  types: string[];
  typeNames: string[];
  typeConjugated: boolean[];
  specializes: string[];
  subsets: string[];
  redefines: string[];
  references: string[];
  ends: string[];
  multiplicity?: string;
  documentation?: string;
  visibility?: Visibility;
  importInfo?: ImportInfo;
  aliasFor?: string;
  range: SourceRange;
  nameRange?: SourceRange;
  shortNameRange?: SourceRange;
  bodyRange?: SourceRange;
}

const VISIBILITY = new Set(["public", "private", "protected"]);
/** Keywords that precede the kind keyword (or stand in for it) and are not part of the kind. */
const MODIFIERS = new Set([
  "abstract", "standard", "readonly", "derived", "end", "in", "out", "inout", "composite", "portion",
  "var", "const", "member", "variation", "individual", "ref", "return",
]);
const DEFINITION_KINDS = new Set([
  "classifier", "class", "struct", "datatype", "assoc", "assoc struct", "behavior", "function",
  "predicate", "interaction", "metaclass", "type",
]);
const USAGE_KINDS = new Set([
  "feature", "connector", "binding", "succession", "succession flow", "flow", "step", "expr", "bool",
  "inv", "multiplicity",
]);
const KIND_WORDS = new Set([
  "package", "library", "namespace", "classifier", "class", "struct", "datatype", "assoc", "behavior",
  "function", "predicate", "interaction", "metaclass", "type", "feature", "connector", "binding",
  "succession", "step", "expr", "bool", "inv", "multiplicity", "import", "alias", "comment", "doc",
  "flow", "metadata",
]);
const KIND_PAIRS: Record<string, string> = { library: "package", assoc: "struct", succession: "flow" };
const REL_START = new Set([":>>", ":>", ":", "::>", "redefines", "subsets", "specializes", "references"]);
/** Words that cannot be the name of an element right after its kind keyword. */
const NOT_A_NAME = new Set([
  "specializes", "subsets", "redefines", "references", "typed", "defined", "conjugates", "disjoint",
  "unions", "intersects", "differences", "chains", "inverse", "featured", "from", "to", "first",
  "then", "of", "about", "all", "for", "ordered", "nonunique", "unique", "default", "locale",
]);

class Reader {
  readonly roots: MutableElement[] = [];
  private pos = 0;
  private readonly toks: Tok[];
  private readonly lineStarts: number[] = [0];

  constructor(
    private readonly uri: string,
    private readonly text: string,
  ) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
    this.toks = tokenize(text);
  }

  run(): void {
    const n = this.toks.length;
    while (this.pos < n) {
      const before = this.pos;
      this.members(undefined);
      if (this.pos === before) this.pos++; // stray `}` at top level
    }
  }

  // ---- positions

  private position(offset: number): SourcePosition {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { offset, line: lo, column: offset - this.lineStarts[lo]! };
  }

  private range(start: number, end: number): SourceRange {
    return { start: this.position(start), end: this.position(end) };
  }

  // ---- token helpers

  private tok(i: number): Tok | undefined {
    return this.toks[i];
  }
  private isSym(i: number, s: string): boolean {
    const t = this.toks[i];
    return t !== undefined && t.type === "sym" && t.text === s;
  }
  private isWord(i: number, s?: string): boolean {
    const t = this.toks[i];
    return t !== undefined && t.type === "ident" && (s === undefined || t.text === s);
  }
  private isNameTok(i: number): boolean {
    const t = this.toks[i];
    return t !== undefined && (t.type === "ident" || t.type === "quoted");
  }

  // ---- structure

  /** Read members until an unmatched `}` (not consumed) or the end of the input. */
  private members(owner: MutableElement | undefined): void {
    const n = this.toks.length;
    while (this.pos < n) {
      const t = this.toks[this.pos]!;
      if (t.type === "sym" && t.text === "}") return;
      if (t.type === "comment" || (t.type === "sym" && t.text === ";")) {
        this.pos++;
        continue;
      }
      const before = this.pos;
      try {
        this.statement(owner);
      } catch {
        this.pos = Math.max(this.pos, before + 1);
      }
      if (this.pos === before) this.pos++;
    }
  }

  /** Skip to the end of the current statement: past `;`, past a balanced `{...}`, or before `}`. */
  private skipStatement(): void {
    const n = this.toks.length;
    let depth = 0;
    while (this.pos < n) {
      const t = this.toks[this.pos]!;
      if (t.type === "sym") {
        if (t.text === "(" || t.text === "[") depth++;
        else if (t.text === ")" || t.text === "]") depth = Math.max(0, depth - 1);
        else if (depth === 0 && t.text === ";") {
          this.pos++;
          return;
        } else if (t.text === "{") {
          this.skipBraces();
          return;
        } else if (t.text === "}" && depth === 0) return;
      }
      this.pos++;
    }
  }

  /** At `{`: skip to just after the matching `}`. Returns the offset after it. */
  private skipBraces(): number {
    const n = this.toks.length;
    let depth = 0;
    let last = this.toks[this.pos]?.end ?? this.text.length;
    while (this.pos < n) {
      const t = this.toks[this.pos++]!;
      last = t.end;
      if (t.type !== "sym") continue;
      if (t.text === "{") depth++;
      else if (t.text === "}" && --depth === 0) return t.end;
    }
    return last;
  }

  private statement(owner: MutableElement | undefined): void {
    const startPos = this.pos;
    const first = this.toks[startPos]!;
    let i = startPos;
    let visibility: Visibility | undefined;
    let modifier = false;
    for (;;) {
      const t = this.toks[i];
      if (!t) break;
      if (t.type === "ident" && VISIBILITY.has(t.text)) {
        visibility = t.text as Visibility;
        i++;
      } else if (t.type === "ident" && MODIFIERS.has(t.text)) {
        modifier = true;
        i++;
      } else if (t.type === "ident" && (t.text === "then" || t.text === "not") && this.isKindWord(i + 1)) {
        i++;
      } else if (this.isSym(i, "#") && this.isNameTok(i + 1)) {
        i = this.skipQualified(i + 1);
      } else break;
    }

    const words: string[] = [];
    if (this.isKindWord(i)) {
      words.push(this.toks[i]!.text);
      const pair = KIND_PAIRS[words[0]!];
      if (pair !== undefined && this.isWord(i + 1, pair)) words.push(this.toks[i + 1]!.text);
      i += words.length;
    }
    let kind = words.filter((w) => w !== "library").join(" ");
    if (words.length === 0) {
      const t = this.toks[i];
      const rel = t !== undefined && (t.type === "sym" || t.type === "ident") && REL_START.has(t.text);
      if (!modifier && !rel) {
        this.skipStatement();
        return;
      }
      kind = "feature";
    }

    const el: MutableElement = {
      uri: this.uri,
      kind,
      isDefinition: DEFINITION_KINDS.has(kind),
      isUsage: USAGE_KINDS.has(kind),
      members: [],
      types: [], typeNames: [], typeConjugated: [], specializes: [], subsets: [], redefines: [], references: [], ends: [],
      range: this.range(first.start, first.end),
      owner,
    };
    if (visibility) el.visibility = visibility;

    // identification
    if (this.isSym(i, "<") && this.isNameTok(i + 1) && this.isSym(i + 2, ">")) {
      const t = this.toks[i + 1]!;
      el.shortName = unquoteName(t.text);
      el.shortNameRange = this.range(t.start, t.end);
      i += 3;
    }
    // `assoc all Name`, `struct all Name`: `all` is a modifier, not the name.
    if (kind !== "import" && this.isWord(i, "all") && this.isNameTok(i + 1) && !NOT_A_NAME.has(this.toks[i + 1]!.text)) i++;
    if (kind !== "import" && this.isNameTok(i)) {
      const t = this.toks[i]!;
      if (t.type === "quoted" || !NOT_A_NAME.has(t.text)) {
        el.name = unquoteName(t.text);
        el.nameRange = this.range(t.start, t.end);
        i++;
      }
    }
    if (el.name !== undefined && (!owner || owner.qualifiedName !== undefined)) {
      el.qualifiedName = (owner ? owner.qualifiedName + "::" : "") + quoteName(el.name);
    }

    this.pos = i;
    let endOffset: number;
    if (kind === "doc" || kind === "comment") {
      endOffset = this.docLike(el);
    } else if (kind === "import") {
      el.importInfo = this.importInfo();
      endOffset = this.terminate(el);
    } else {
      this.header(el);
      endOffset = this.terminate(el);
    }
    el.range = this.range(first.start, Math.max(endOffset, first.end));
    for (const t of el.types) {
      el.typeConjugated.push(t.startsWith("~"));
      el.typeNames.push(t.startsWith("~") ? t.slice(1) : t);
    }

    (owner ? owner.members : this.roots).push(el);
    const doc = el.members.find((m) => m.kind === "doc");
    if (doc?.documentation !== undefined && el.kind !== "doc") el.documentation = doc.documentation;
  }

  private isKindWord(i: number): boolean {
    const t = this.toks[i];
    return t !== undefined && t.type === "ident" && KIND_WORDS.has(t.text);
  }

  /** Index after a qualified name starting at `i` (tokens joined by `::` or `.`). */
  private skipQualified(i: number): number {
    if (!this.isNameTok(i)) return i;
    i++;
    while ((this.isSym(i, "::") || this.isSym(i, ".")) && this.isNameTok(i + 1)) i += 2;
    return i;
  }

  private qualifiedAt(i: number): { text: string; next: number } | undefined {
    if (!this.isNameTok(i)) return undefined;
    const next = this.skipQualified(i);
    let s = "";
    for (let k = i; k < next; k++) s += this.toks[k]!.text;
    return { text: s, next };
  }

  /** `doc` / `comment` (after the name): up to the block comment that carries the text. */
  private docLike(el: MutableElement): number {
    const n = this.toks.length;
    let end = this.toks[this.pos - 1]?.end ?? el.range.end.offset;
    while (this.pos < n) {
      const t = this.toks[this.pos]!;
      if (t.type === "comment") {
        el.documentation = processDocComment(t.text);
        this.pos++;
        return t.end;
      }
      if (t.type === "sym" && (t.text === ";" || t.text === "}" || t.text === "{")) {
        if (t.text === ";") {
          end = t.end;
          this.pos++;
        }
        return end;
      }
      if (t.text === "about") {
        this.pos++;
        for (;;) {
          const q = this.qualifiedAt(this.pos);
          if (!q) break;
          el.ends.push(q.text);
          this.pos = q.next;
          if (this.isSym(this.pos, ",")) this.pos++;
          else break;
        }
        continue;
      }
      end = t.end;
      this.pos++;
    }
    return end;
  }

  private importInfo(): ImportInfo | undefined {
    const all = this.isWord(this.pos, "all");
    if (all) this.pos++;
    if (!this.isNameTok(this.pos)) return undefined;
    let target = this.toks[this.pos++]!.text;
    let wildcard = false;
    let recursive = false;
    while (this.isSym(this.pos, "::") || this.isSym(this.pos, ".")) {
      const nx = this.toks[this.pos + 1];
      if (!nx) break;
      if (nx.type === "sym" && nx.text === "*") {
        wildcard = true;
        this.pos += 2;
      } else if (nx.type === "sym" && nx.text === "**") {
        wildcard = true;
        recursive = true;
        this.pos += 2;
      } else if (nx.type === "ident" || nx.type === "quoted") {
        target += this.toks[this.pos]!.text + nx.text;
        this.pos += 2;
      } else break;
    }
    return all ? { target, wildcard, recursive, all } : { target, wildcard, recursive };
  }

  /** Relationships and multiplicity between the identification and the terminator. */
  private header(el: MutableElement): void {
    const n = this.toks.length;
    const feature = el.isUsage || el.kind === "feature";
    type Mode = "none" | "spec" | "subs" | "redef" | "refs" | "types" | "other" | "end" | "value";
    let mode: Mode = "none";
    let depth = 0;
    const list = (m: Mode): string[] | undefined => {
      switch (m) {
        case "spec": return feature ? el.subsets : el.specializes;
        case "subs": return el.subsets;
        case "redef": return el.redefines;
        case "refs": return el.references;
        case "types": return el.types;
        case "end": return el.ends;
        default: return undefined;
      }
    };
    while (this.pos < n) {
      const t = this.toks[this.pos]!;
      if (t.type === "sym") {
        const s = t.text;
        if (depth === 0 && s === "{" && mode === "value" && !this.looksLikeBody(this.pos + 1)) {
          this.skipBraces(); // expression braces after a value
          continue;
        }
        if (depth === 0 && (s === ";" || s === "{" || s === "}")) return;
        if (s === "(") depth++;
        else if (s === ")") depth = Math.max(0, depth - 1);
        else if (depth === 0 && s === "[" && mode !== "value") {
          const m = this.multiplicity();
          if (m !== undefined && el.multiplicity === undefined) el.multiplicity = m;
          continue;
        } else if (s === "[") depth++;
        else if (s === "]") depth = Math.max(0, depth - 1);
        else if (depth === 0) {
          if (s === ":>>") mode = "redef";
          else if (s === ":>") mode = "spec";
          else if (s === "::>") mode = "refs";
          else if (s === ":") mode = "types";
          else if (s === "=" && el.kind === "binding") mode = "end";
          else if (s === "=" || s === ":=") mode = "value";
          else if (s === "~") mode = "other";
          else if (s === ",") {
            this.pos++;
            continue; // list separator keeps the mode
          }
        }
        this.pos++;
        continue;
      }
      if (t.type === "ident" && depth === 0 && mode !== "value") {
        let next: Mode | undefined;
        let skip = 1;
        switch (t.text) {
          case "specializes": next = "spec"; break;
          case "subsets": next = "subs"; break;
          case "redefines": next = "redef"; break;
          case "references": next = "refs"; break;
          case "typed": case "defined": next = this.isWord(this.pos + 1, "by") ? "types" : undefined; skip = 2; break;
          case "default": next = "value"; break;
          case "for":
            if (el.kind === "alias") {
              const q = this.qualifiedAt(this.pos + 1);
              if (q) {
                el.aliasFor = q.text;
                this.pos = q.next;
                continue;
              }
            }
            break;
          case "conjugates": case "unions": case "intersects": case "differences": case "chains":
            next = "other"; break;
          case "disjoint": case "inverse": case "featured":
            next = "other"; skip = 2; break;
          case "from": case "to": case "first": case "then": case "of":
            next = "end"; break;
        }
        if (next !== undefined) {
          mode = next;
          this.pos += skip;
          continue;
        }
        if (t.text === "all" || t.text === "ordered" || t.text === "nonunique" || t.text === "unique") {
          this.pos++;
          continue;
        }
      }
      if (depth === 0 && (mode === "spec" || mode === "subs" || mode === "redef" || mode === "refs" ||
          mode === "types" || mode === "end") && this.isNameTok(this.pos)) {
        const q = this.qualifiedAt(this.pos)!;
        list(mode)?.push(q.text);
        this.pos = q.next;
        continue;
      }
      this.pos++;
    }
  }

  /** After `{` following a value: does it start a member body (as opposed to an expression block)? */
  private looksLikeBody(i: number): boolean {
    const t = this.toks[i];
    if (!t) return false;
    if (t.type === "sym") return t.text === "}" || t.text === "#" || t.text === ":>>";
    return t.type === "ident" && (KIND_WORDS.has(t.text) || MODIFIERS.has(t.text) || VISIBILITY.has(t.text));
  }

  /** At `[`: read to the matching `]` and return the text without whitespace. */
  private multiplicity(): string | undefined {
    const n = this.toks.length;
    let depth = 0;
    let s = "";
    while (this.pos < n) {
      const t = this.toks[this.pos++]!;
      if (t.type === "comment") continue;
      s += t.text;
      if (t.type === "sym" && t.text === "[") depth++;
      else if (t.type === "sym" && t.text === "]" && --depth === 0) return s;
    }
    return undefined;
  }

  /**
   * Consume the end of the declaration: `;`, or a `{ ... }` body whose members are read into
   * `el`. After a value (`=`, `:=`, `default`) braces belong to an expression and are skipped.
   * Returns the end offset of the declaration.
   */
  private terminate(el: MutableElement): number {
    const t = this.toks[this.pos];
    const prevEnd = this.toks[this.pos - 1]?.end ?? el.range.end.offset;
    if (!t) return prevEnd;
    if (t.type === "sym" && t.text === ";") {
      this.pos++;
      return t.end;
    }
    if (t.type === "sym" && t.text === "{") {
      const open = t;
      this.pos++;
      this.members(el);
      const close = this.toks[this.pos];
      if (close && close.type === "sym" && close.text === "}") {
        this.pos++;
        el.bodyRange = this.range(open.start, close.end);
        return close.end;
      }
      el.bodyRange = this.range(open.start, this.text.length);
      return this.text.length;
    }
    return prevEnd; // `}` or end of input: declaration without terminator
  }
}

/** Index the declaration structure of KerML text. Never throws. */
export function buildKermlOutline(uri: string, text: string): DocumentModel {
  const r = new Reader(uri, text);
  try {
    r.run();
  } catch {
    /* keep what was built */
  }
  return { uri, roots: r.roots as unknown as Element[] };
}

/** A DocumentParser for KerML text. It reports no syntax errors. */
export const kermlOutlineParser: DocumentParser = (uri, text): ParsedDocument => ({
  model: buildKermlOutline(uri, text),
  errors: [],
});
