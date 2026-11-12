/**
 * Test and gate support, never imported by the extension: the exact reference parser (generated
 * parser as it is, full LL on a freshly built cache, no shortcuts, default error handling), a tree
 * comparison, the fast-versus-exact check, and seeded invalid variants of a text.
 */
import { CharStream, CommonTokenStream, ParserATNSimulator, ParserRuleContext, TerminalNode, type ParseTree } from "antlr4ng";
import { tryFastParse } from "./parse.js";
import { newSim, type Sim } from "./parse-core.js";
import { SysMLv2Lexer } from "./generated/SysMLv2Lexer.js";
import { SysMLv2Parser } from "./generated/SysMLv2Parser.js";

const exactSim: Sim = newSim();

export function exactParse(text: string): { tree: ParserRuleContext; errors: number } {
  let errors = 0;
  const listener = { syntaxError: () => void errors++, reportAmbiguity() {}, reportAttemptingFullContext() {}, reportContextSensitivity() {} };
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SysMLv2Parser(tokens);
  parser.interpreter = new ParserATNSimulator(parser, SysMLv2Parser._ATN, exactSim.dfas, exactSim.cache);
  parser.removeErrorListeners();
  parser.addErrorListener(listener);
  const tree = parser.rootNamespace();
  tokens.fill();
  return { tree, errors };
}

/** A structural dump of one node: rule name, alternative number, token start and stop index. */
function nodeDump(n: ParseTree): string {
  if (n instanceof TerminalNode) return `token ${n.symbol.type}@${n.symbol.tokenIndex}`;
  const c = n as ParserRuleContext;
  const alt = (c as unknown as { getAltNumber?: () => number }).getAltNumber?.() ?? 0;
  return `${SysMLv2Parser.ruleNames[c.ruleIndex] ?? c.ruleIndex} alt=${alt} tokens ${c.start?.tokenIndex ?? "-"}..${c.stop?.tokenIndex ?? "-"} (line ${c.start?.line ?? "?"})`;
}

/** The first node (in document order) at which two parse trees differ, or undefined when they are the same. */
export function firstDifference(a: ParseTree, b: ParseTree): string | undefined {
  const stack: [ParseTree, ParseTree][] = [[a, b]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const dx = nodeDump(x);
    const dy = nodeDump(y);
    if (dx !== dy) return `fast: ${dx}; exact: ${dy}`;
    const kx = x instanceof ParserRuleContext ? x.children : [];
    const ky = y instanceof ParserRuleContext ? y.children : [];
    if (kx.length !== ky.length) return `${dx}: fast has ${kx.length} children, exact ${ky.length}`;
    for (let i = kx.length - 1; i >= 0; i--) stack.push([kx[i]!, ky[i]!]);
  }
  return undefined;
}

export type Comparison =
  /** the fast path declined; `exactValid` says whether the exact parser accepts the text */
  | { kind: "declined"; exactValid: boolean }
  | { kind: "same" }
  | { kind: "violation"; why: string };

/** Compares the main-thread fast path with the exact parser on `text`. */
export function compareWithExact(text: string): Comparison {
  const f = tryFastParse(text, { ll: true });
  const e = exactParse(text);
  if (!f.ok) return { kind: "declined", exactValid: e.errors === 0 };
  if (e.errors > 0) return { kind: "violation", why: `accepted by the fast path, rejected by the exact parser (${e.errors} errors)` };
  const d = firstDifference(f.result.tree, e.tree);
  return d ? { kind: "violation", why: `trees differ at ${d}` } : { kind: "same" };
}

/** A small seeded generator (LCG); the same seed always gives the same sequence. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** The default-channel tokens of `text` as source spans. */
function spans(text: string): { start: number; end: number; type: number }[] {
  const lexer = new SysMLv2Lexer(CharStream.fromString(text));
  lexer.removeErrorListeners();
  const tokens = new CommonTokenStream(lexer);
  tokens.fill();
  return tokens.getTokens().filter((t) => t.type !== -1 && t.channel === 0).map((t) => ({ start: t.start, end: t.stop + 1, type: t.type }));
}

export type MutationKind = "drop-last" | "delete" | "swap" | "duplicate" | "semi-to-brace";
export const mutationKinds: MutationKind[] = ["drop-last", "delete", "swap", "duplicate", "semi-to-brace"];

/** Deterministic invalid variants of `text`, one per mutation kind (kinds that do not apply are skipped). */
export function mutants(text: string, seed: number): { kind: MutationKind; text: string }[] {
  const sp = spans(text);
  if (sp.length < 2) return [];
  const rnd = seededRandom(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const out: { kind: MutationKind; text: string }[] = [];
  const cut = (i: number) => text.slice(0, sp[i]!.start) + text.slice(sp[i]!.end);
  out.push({ kind: "drop-last", text: cut(sp.length - 1) });
  out.push({ kind: "delete", text: cut(pick(sp.length)) });
  const s = pick(sp.length - 1);
  const a = sp[s]!, b = sp[s + 1]!;
  out.push({ kind: "swap", text: text.slice(0, a.start) + text.slice(b.start, b.end) + text.slice(a.end, b.start) + text.slice(a.start, a.end) + text.slice(b.end) });
  const d = sp[pick(sp.length)]!;
  out.push({ kind: "duplicate", text: text.slice(0, d.end) + " " + text.slice(d.start, d.end) + text.slice(d.end) });
  const semis = sp.filter((t) => t.type === SysMLv2Lexer.SEMI);
  if (semis.length) {
    const m = semis[pick(semis.length)]!;
    out.push({ kind: "semi-to-brace", text: text.slice(0, m.start) + "}" + text.slice(m.end) });
  }
  return out;
}

export interface NegativeStats {
  variants: number;
  invalidPerExact: number;
  declinedOfInvalid: number;
  validPerExact: number;
  acceptedValid: number;
  violations: string[];
}

/** Runs the negative corpus: every invalid variant must be declined, every accepted one must have the exact tree. */
export function negativeCorpus(texts: string[], seed = 1): NegativeStats {
  const st: NegativeStats = { variants: 0, invalidPerExact: 0, declinedOfInvalid: 0, validPerExact: 0, acceptedValid: 0, violations: [] };
  texts.forEach((t, i) => {
    for (const m of mutants(t, seed * 1_000_003 + i)) {
      st.variants++;
      const c = compareWithExact(m.text);
      if (c.kind === "violation") st.violations.push(`text ${i} ${m.kind}: ${c.why}`);
      // a violation is either an invalid text accepted or an accepted tree that differs
      if (c.kind === "declined") {
        if (c.exactValid) st.validPerExact++;
        else {
          st.invalidPerExact++;
          st.declinedOfInvalid++;
        }
      } else if (c.kind === "same") {
        st.validPerExact++;
        st.acceptedValid++;
      } else if (c.why.startsWith("accepted")) st.invalidPerExact++;
      else st.validPerExact++;
    }
  });
  return st;
}
