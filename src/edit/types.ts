/**
 * Types of the edit planner. Nothing in `src/edit` imports `vscode`: plans only describe text
 * edits; the VS Code layer applies them later.
 */

/** Offsets are UTF-16 code units; `end` is exclusive. */
export interface TextRange {
  start: number;
  end: number;
}

export interface TextEdit {
  uri: string;
  range: TextRange;
  newText: string;
}

/** New text of a `.sysmld` file whose references changed. */
export interface DiagramUpdate {
  uri: string;
  text: string;
}

export interface SourceLocation {
  uri: string;
  /** 0-based. */
  line: number;
  column: number;
}

/** References a rename could not judge (the caller should warn that they may need a manual look). */
export interface UnjudgedReferences {
  count: number;
  /** A few of them. */
  locations: SourceLocation[];
  /** Documents with syntax errors whose references were not examined. */
  skippedDocuments: string[];
}

/** Identifies the exact text a plan was computed from (a `.sysml` document or a diagram file). */
export interface PlanSource {
  uri: string;
  length: number;
  hash: string;
}

/** References that remain to an element after it is deleted (the caller should warn). */
export interface RemainingReferences {
  count: number;
  /** A few of them. */
  locations: SourceLocation[];
  /** Textual mentions of the names outside the element that could not be judged (they may or may not refer to it). */
  unjudged?: number;
}

export interface PlanOk {
  ok: true;
  edits: TextEdit[];
  diagramUpdates?: DiagramUpdate[];
  /** Unnamed control nodes the plan names (`fork;` to `fork fork1;`): their diagram entries must follow in the same change. */
  namedNodes?: { oldKey: string | undefined; ref: string }[];
  description: string;
  unjudged?: UnjudgedReferences;
  /** Delete: references to the deleted element (or what it owns) that stay behind elsewhere. */
  remainingReferences?: RemainingReferences;
  /** Rename: diagram files that could not be parsed and were therefore not updated. */
  skippedDiagrams?: string[];
  /**
   * Every document (and diagram file) the plan read or changes, with the text it was computed from.
   * Set by `validatePlan`; see `isPlanCurrent`.
   */
  sources?: PlanSource[];
  /** Nesting: the qualified names before and after the move, and the line ends whose text changed (for diagram files). */
  nest?: { oldQn: string; newQn: string | undefined; endsChanges: { ownerQn: string | undefined; kind: string; oldEnds: string[]; newEnds: string[] }[] };
  /** Planner input for `validatePlan`: documents read beyond the ones with edits. */
  reads?: string[];
}

export interface PlanFailure {
  ok: false;
  /** A sentence for the user; includes a location when relevant. */
  reason: string;
}

export type PlanResult = PlanOk | PlanFailure;

export function fail(reason: string): PlanFailure {
  return { ok: false, reason };
}
