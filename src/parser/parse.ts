import { loadSnapshot, type DfaSnapshot } from "./dfa-snapshot.js";
import snapshotData from "./dfa-snapshot.json";
import { fastParse, newSim, twoStage, type FastResult, type ParseResult, type Sim } from "./parse-core.js";

// Pre-seed the shared (static) prediction DFAs so the first parse is not a ~10 s cold start (see
// dfa-snapshot.ts). Set SYSML_DFA_SNAPSHOT=off to measure or regenerate without it. The parse
// worker does not import this module, so its DFAs are built normally.
if (process.env["SYSML_DFA_SNAPSHOT"] !== "off") loadSnapshot(snapshotData as DfaSnapshot);

export type { SyntaxErrorInfo, ParseResult, FastResult, Token } from "./parse-core.js";

/** Counters for tests and the benchmark. */
export const parseStats = { fastPath: 0, fallback: 0 };

/**
 * The fast path: SLL with bail on the snapshot-backed static DFAs; then, if `ll` and the failure
 * was not a lexer error, full LL with bail on the same DFAs (some valid files need full-context
 * prediction, which SLL cannot do; the LL attempt costs about three times the SLL one). Restored snapshot states
 * cannot grow, so a failure here is either a real syntax error or (rarely) a valid construct the
 * snapshot never saw; the precise answer needs a parser with a normally built cache, which in
 * the extension runs in the parse worker (see `src/parse-worker.ts`).
 */
export function tryFastParse(text: string, opts: { ll?: boolean } = {}): FastResult {
  let r = fastParse(text, undefined, false, true);
  if (!r.ok && !r.lexer && opts.ll) r = fastParse(text, undefined, true, true);
  if (r.ok) parseStats.fastPath++;
  return r;
}

let sameThreadSim: Sim | undefined;

/**
 * Parse SysML v2 text synchronously with full error reporting. Tokens (including hidden channel)
 * are all fetched. Tries the fast path first; if it fails, parses again on this thread with a
 * separate, normally built prediction cache that grows with use, so results equal an unseeded
 * parse. That second step can take seconds while the cache is cold, so the extension does not
 * use it (the parse worker does this step instead); it serves tests and scripts.
 */
export function parse(text: string): ParseResult {
  const r = tryFastParse(text, { ll: true });
  if (r.ok) return r.result;
  parseStats.fallback++;
  sameThreadSim ??= newSim();
  return twoStage(text, sameThreadSim);
}
