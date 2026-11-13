/** The shape of the verification matrix and its filters: shared with the webview, so no model imports. */
export type VerificationMethod = "inspect" | "analyze" | "demo" | "test";
export const VERIFICATION_METHODS: readonly VerificationMethod[] = ["inspect", "analyze", "demo", "test"];

export type MatrixStatus = "not satisfied" | "partly satisfied" | "no verification" | "covered";

/** An element named in a cell. `qn` navigates to its declaration; `statementKey` removes the statement that links it. */
export interface MatrixLink {
  label: string;
  qn?: string;
  /** The `satisfy` or `verify` statement (`uri#offset`), when it is this row's own. */
  statementKey?: string;
  /** Satisfaction counted from a parent requirement (or a usage of the definition): the parent's label. */
  via?: string;
}

export interface MatrixRow {
  kind: "section" | "requirement";
  /** Generated from ownership and order (1, 1.1, 1.1.2); never stored. */
  number: string;
  depth: number;
  qn: string;
  id: string;
  name: string;
  satisfiedBy: MatrixLink[];
  /** A definition (or a requirement it owns) with usages: how many of them are satisfied. */
  usages?: { satisfied: number; total: number };
  methods: VerificationMethod[];
  verifiedBy: MatrixLink[];
  /** Requirement rows only. */
  status?: MatrixStatus;
  editable: boolean;
}

export interface MatrixSummary {
  total: number;
  covered: number;
  noVerification: number;
  notSatisfied: number;
  partlySatisfied: number;
  /** Whole percent of requirements that are covered (0 when there are none). */
  percentCovered: number;
}

export interface MatrixVM {
  rows: MatrixRow[];
  summary: MatrixSummary;
}

export type MatrixFilter = "all" | "gaps" | MatrixStatus;

/** The rows to show for a filter. A filter other than "all" shows requirement rows only. */
export function filterRows(rows: readonly MatrixRow[], filter: MatrixFilter): MatrixRow[] {
  if (filter === "all") return [...rows];
  return rows.filter((r) => r.kind === "requirement" && (filter === "gaps" ? r.status !== "covered" : r.status === filter));
}


/** "1 of 2 usages": how many usages of a requirement definition are satisfied. */
export const usagesText = (u: { satisfied: number; total: number }): string => `${u.satisfied} of ${u.total} usage${u.total === 1 ? "" : "s"}`;
