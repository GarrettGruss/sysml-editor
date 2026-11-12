/** Messages between the extension host and the requirements editor webview, and the view models. No `vscode`, no DOM. */
import type { TocEntry } from "./document-model.js";

export type RequirementsScope = { kind: "package"; qualifiedName: string } | { kind: "file"; uri: string };
export type ViewMode = "table" | "document";

export interface RelationVM {
  /** Opaque key of the statement (`uri#offset`), used to remove it. */
  key: string;
  label: string;
  /** For derivations: the key of the connection and the qualified name of the derived requirement to remove. */
  connectionKey?: string;
  derivedQn?: string;
  /** Why removing this relation is not offered (a hand-written derivation that cannot be edited safely). */
  removeBlocked?: string;
}

export interface RequirementRowVM {
  qn: string;
  kind: "requirement" | "requirement def";
  id: string;
  name: string;
  text: string;
  owner: string;
  satisfy: number;
  verify: number;
  satisfiedBy: RelationVM[];
  /** `not satisfy R by x;` statements: shown as "not satisfied by x", not counted. */
  notSatisfiedBy: RelationVM[];
  verifiedBy: RelationVM[];
  derivedFrom: RelationVM[];
  derives: RelationVM[];
  /** False for library content and files the host will not edit. */
  editable: boolean;
}

export interface TableVM {
  rows: RequirementRowVM[];
}

export interface ItemVM {
  kind: "item";
  qn: string;
  defKind: "requirement" | "requirement def";
  id: string;
  name: string;
  text: string;
  summary: { satisfiedBy: string[]; verifiedBy: string[]; derivedFrom: string[]; derives: string[] };
  editable: boolean;
}
export interface ParagraphVM {
  kind: "paragraph";
  key: string;
  source: "doc" | "comment";
  /** The text as shown (`*\/` already unescaped). */
  text: string;
  editable: boolean;
}
export interface ElementsVM {
  kind: "elements";
  items: { kind: string; name: string }[];
}
export type BlockVM = ItemVM | ParagraphVM | ElementsVM;

export interface SectionVM {
  qn: string;
  heading: string;
  level: number;
  number: string;
  appendix: boolean;
  blocks: BlockVM[];
  children: SectionVM[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** What deleting it removes, for the confirmation and for tests. */
  contains: { paragraphs: number; requirements: number; sections: number; elements: number };
  editable: boolean;
}

export interface DocumentVM {
  rootQn: string;
  title: string;
  version?: string;
  annotated: boolean;
  blocks: BlockVM[];
  sections: SectionVM[];
  appendices: SectionVM[];
  toc: TocEntry[];
  editable: boolean;
}

export interface RequirementsState {
  scopeName: string;
  /** The package that new requirements and sections go into. */
  scopeQn?: string;
  table: TableVM;
  document?: DocumentVM;
  /** Why the scope cannot be shown (no such package, file without a package), when it cannot. */
  problem?: string;
}

/** What the webview asks the host to do. */
export type Intent =
  /** `expected` is the text the field was opened with; the host applies the edit only when the element still has it. */
  | { type: "setCell"; qn: string; field: "id" | "name" | "text"; value: string; expected: string }
  | { type: "addRequirement"; kind: "requirement" | "requirement def"; id: string; name: string; ownerQn?: string; afterQn?: string }
  | { type: "deleteRequirement"; qn: string }
  | { type: "addSatisfy"; qn: string }
  | { type: "addVerify"; qn: string }
  | { type: "addDerivedFrom"; qn: string }
  | { type: "addDerives"; qn: string }
  | { type: "removeSatisfy"; key: string }
  | { type: "removeVerify"; key: string }
  | { type: "removeDerivation"; connectionKey: string; derivedQn?: string }
  | { type: "navigate"; qn: string; to: "tree" | "text" | "diagram" }
  | { type: "setHeading"; qn: string; value: string; expected: string }
  | { type: "setParagraph"; key: string; value: string; expected: string }
  | { type: "addSection"; parentQn: string; name: string; appendix?: boolean; afterQn?: string }
  | { type: "addParagraph"; pkgQn: string; text: string }
  | { type: "moveSection"; qn: string; how: "up" | "down" | { beforeQn: string } | { afterQn: string } }
  | { type: "deleteSection"; qn: string };

export type Gesture =
  | { kind: "click"; selector: string }
  | { kind: "input"; selector: string; value: string; event?: "change" | "input" }
  | { kind: "dragToc"; fromQn: string; ontoQn: string; position: "before" | "after" }
  | { kind: "key"; selector: string; key: string };

export type HostToWebview =
  | { type: "render"; state: RequirementsState; scope: RequirementsScope; view?: ViewMode; generation: number }
  | { type: "notice"; level: "info" | "error"; message: string }
  | { type: "getMetrics"; requestId: number }
  | { type: "exportPng"; requestId: number }
  | { type: "testGesture"; requestId: number; gesture: Gesture }
  | { type: "setView"; view: ViewMode }
  /** An edit was not applied because the element changed since the field was opened: show `current` beside the draft. */
  | { type: "conflict"; fieldKey: string; current: string };

export interface RequirementsMetrics {
  view: ViewMode;
  theme: "light" | "dark";
  generation: number;
  scopeName: string;
  table: {
    rows: { qn: string; cells: { id: string; name: string; text: string; owner: string; satisfy: string; verify: string }; selected: boolean; unsatisfied: boolean; unverified: boolean }[];
    selected?: string;
    counts: { total: number; unsatisfied: number; unverified: number };
    detail?: { qn: string; satisfiedBy: string[]; verifiedBy: string[]; derivedFrom: string[]; derives: string[] };
  };
  document: {
    title: string;
    version?: string;
    outline: { number: string; heading: string; level: number; appendix: boolean; paragraphs: number; items: number; elements: number }[];
    toc: { number: string; heading: string; level: number }[];
    appendixLetters: string[];
    paragraphs: { section: string; text: string; lists: number; links: number }[];
    items: { section: string; id: string; name: string; text: string }[];
    rootBlocks: number;
  };
  /** Controls being edited and not yet committed. */
  pendingEdits: string[];
  /** Fields whose edit conflicts with a newer model text (shown with Overwrite and Discard). */
  conflicts: string[];
  /** Elements whose content is wider than their box (text clipped), and whether the page scrolls sideways. */
  overflow: { count: number; horizontalScroll: boolean; samples: string[] };
  notice?: { level: "info" | "error"; message: string };
  errors: string[];
  size: { width: number; height: number };
}

export type WebviewToHost =
  | { type: "ready" }
  | { type: "intent"; intent: Intent }
  | { type: "viewChanged"; view: ViewMode }
  | { type: "error"; message: string }
  | { type: "metricsResult"; requestId: number; metrics: RequirementsMetrics }
  | { type: "pngResult"; requestId: number; base64?: string; error?: string }
  | { type: "gestureResult"; requestId: number; error?: string };

/** The key of a field in the webview: a requirement cell (`qn|id`, `qn|name`, `qn|text`) or a heading (`qn|heading`). */
export const cellFieldKey = (qn: string, field: "id" | "name" | "text" | "heading"): string => `${qn}|${field}`;
