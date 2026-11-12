import { ATNConfigSet, ATNSimulator, DFAState } from "antlr4ng";
import { SysMLv2Parser } from "./generated/SysMLv2Parser.js";

/**
 * DFA snapshot: a serialized copy of ANTLR's lazily built prediction DFAs. Building them from
 * scratch costs about 10 s on the first parse of a process (the grammar's `usageDeclaration`
 * decision alone is about two thirds of it); with a snapshot loaded the first parse is warm.
 *
 * Restored states carry an empty ATN config set, so they can answer only the lookahead paths
 * they have already seen. A path the snapshot lacks yields a spurious syntax error instead of
 * a new DFA edge. `parse()` therefore treats any failure while the snapshot is active as
 * suspect: it calls `purgeSnapshotDfas()` (drop everything, rebuild lazily from the ATN) and
 * parses again. Clean results from seeded DFAs are identical to unseeded ones.
 */
export interface DecisionSnapshot {
  /** decision number */
  d: number;
  /** start state index (non-precedence DFAs) */
  s0: number;
  /** [precedence, stateIndex, ...] for precedence DFAs */
  pe?: number[];
  /** per state: [flags(1=accept,2=fullctx), prediction, tokenIndex, target(-1=error), ...] */
  s: number[][];
}
export interface DfaSnapshot {
  atnHash: number;
  decisions: DecisionSnapshot[];
}

const ERROR_STATE_NUMBER = 0x7fffffff;

type Dfa = { s0?: DFAState; isPrecedenceDfa: boolean; length: number; getStates(): DFAState[] } & Record<string, any>;

function dfas(): Dfa[] {
  void SysMLv2Parser._ATN;
  return (SysMLv2Parser as any).decisionsToDFA as Dfa[];
}

/** Identifies the generated ATN so a stale snapshot is ignored after the grammar changes. */
export function atnHash(): number {
  const ser = (SysMLv2Parser as any)._serializedATN as number[];
  let h = 2166136261;
  for (const n of ser) h = Math.imul(h ^ n, 16777619) >>> 0;
  return h;
}

export function extractSnapshot(): DfaSnapshot {
  const out: DecisionSnapshot[] = [];
  dfas().forEach((dfa, d) => {
    if (!dfa.s0) return;
    const index = new Map<DFAState, number>();
    const list: DFAState[] = [];
    const add = (s: DFAState | undefined): void => {
      if (!s || s.stateNumber === ERROR_STATE_NUMBER || index.has(s)) return;
      index.set(s, list.length);
      list.push(s);
    };
    add(dfa.s0);
    if (dfa.isPrecedenceDfa) dfa.s0.edges.forEach(add);
    for (let i = 0; i < list.length; i++) list[i]!.edges.forEach(add);
    if (list.length < 2) return;
    // Semantic predicates cannot be serialized; leave those decisions to the ATN.
    if (list.some((s) => s.predicates && s.predicates.length > 0)) return;
    const states = list.map((s) => {
      const row = [(s.isAcceptState ? 1 : 0) | (s.requiresFullContext ? 2 : 0), s.prediction];
      s.edges.forEach((t, i) => {
        if (!t) return;
        if (t.stateNumber === ERROR_STATE_NUMBER) row.push(i, -1);
        else if (index.has(t)) row.push(i, index.get(t)!);
      });
      return row;
    });
    const snap: DecisionSnapshot = { d, s0: index.get(dfa.s0)!, s: states };
    if (dfa.isPrecedenceDfa) {
      snap.pe = [];
      dfa.s0.edges.forEach((t, i) => {
        if (t && index.has(t)) snap.pe!.push(i, index.get(t)!);
      });
    }
    out.push(snap);
  });
  return { atnHash: atnHash(), decisions: out };
}

let seeded = false;

export function isSnapshotActive(): boolean {
  return seeded;
}

/** Returns the number of DFA states restored, or 0 if the snapshot does not match this grammar. */
export function loadSnapshot(snap: DfaSnapshot): number {
  if (seeded || snap.atnHash !== atnHash()) return 0;
  const all = dfas();
  const empty = new ATNConfigSet();
  const error = (ATNSimulator as any).ERROR as DFAState;
  let total = 0;
  for (const ds of snap.decisions) {
    const dfa = all[ds.d];
    if (!dfa) continue;
    const states = ds.s.map((row, i) => {
      const st = DFAState.fromState(i);
      (st as any).configs = empty;
      st.isAcceptState = (row[0]! & 1) !== 0;
      st.requiresFullContext = (row[0]! & 2) !== 0;
      st.prediction = row[1]!;
      return st;
    });
    ds.s.forEach((row, i) => {
      for (let j = 2; j < row.length; j += 2) states[i]!.edges[row[j]!] = row[j + 1]! === -1 ? error : states[row[j + 1]!]!;
    });
    if (ds.pe) {
      if (!dfa.s0) dfa.s0 = DFAState.fromState(-1);
      for (let j = 0; j < ds.pe.length; j += 2) dfa.s0.edges[ds.pe[j]!] = states[ds.pe[j + 1]!]!;
    } else {
      dfa.s0 = states[ds.s0];
    }
    total += states.length;
  }
  seeded = total > 0;
  return total;
}

/** Drops every DFA state (seeded or not); they are rebuilt lazily from the ATN. */
export function purgeSnapshotDfas(): void {
  for (const dfa of dfas()) {
    if (!dfa.s0) continue;
    dfa.s0 = dfa.isPrecedenceDfa ? DFAState.fromState(-1) : undefined;
    dfa.states?.clear?.();
  }
  seeded = false;
}
