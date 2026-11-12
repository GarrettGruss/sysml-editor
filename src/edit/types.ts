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

export interface PlanOk {
  ok: true;
  edits: TextEdit[];
  diagramUpdates?: DiagramUpdate[];
  description: string;
  unjudged?: UnjudgedReferences;
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
