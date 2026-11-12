/**
 * Parser-independent document model. Nothing in this file (or in index.ts / resolve.ts) may
 * import ANTLR types; only the builder (antlr-builder.ts) knows about the parse tree.
 */

/** A position in the source. `line` and `column` are 0-based; `offset` counts UTF-16 code units. */
export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

/** A source range; `end` is exclusive. */
export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export type Visibility = "public" | "private" | "protected";

export interface ImportInfo {
  /** The imported qualified name as written, e.g. `A::B` (without `::*` / `::**`). */
  target: string;
  /** `A::*` (and `A::*::**`): import the members of the target namespace. */
  wildcard: boolean;
  /** `::**`: also all nested members, at any depth. */
  recursive: boolean;
}

export interface Element {
  /** URI of the document this element is declared in. */
  readonly uri: string;
  /** Stable kind string: `package`, `part def`, `part`, `connect`, `import`, `unknown`, ... */
  readonly kind: string;
  readonly isDefinition: boolean;
  readonly isUsage: boolean;
  /** Declared name, unquoted. Undefined for unnamed elements. */
  readonly name?: string;
  /** Short name (`<x>`), unquoted. */
  readonly shortName?: string;
  /**
   * `A::B::c`, segments needing quotes are quoted. Undefined when the element has no name.
   * The prefix is the qualified name of the nearest named ancestor.
   */
  readonly qualifiedName?: string;
  readonly owner?: Element;
  /** Owned members in source order. */
  readonly members: readonly Element[];
  /** Declared types (`: T`, `defined by T`) as written. */
  readonly types: readonly string[];
  /** `:>` on a definition, `specializes`; as written. */
  readonly specializes: readonly string[];
  /** `:>` / `subsets` on a usage; as written. */
  readonly subsets: readonly string[];
  /** `:>>` / `redefines`; as written. */
  readonly redefines: readonly string[];
  /** `::>` / `references`; as written. */
  readonly references: readonly string[];
  /** Endpoint texts of relationship statements (connect, bind, satisfy, succession, ...). */
  readonly ends: readonly string[];
  /** Multiplicity as written without whitespace, e.g. `[0..1]`. */
  readonly multiplicity?: string;
  /**
   * Documentation text from an owned `doc` comment (processed). For `doc` and `comment`
   * elements themselves, their own processed text.
   */
  readonly documentation?: string;
  /** Visibility keyword if one was written. */
  readonly visibility?: Visibility;
  /** For `import` and `expose` elements. */
  readonly importInfo?: ImportInfo;
  /** For `alias` elements: the aliased qualified name as written. */
  readonly aliasFor?: string;
  /** The whole declaration. */
  readonly range: SourceRange;
  /** The name token (including quotes), if named. */
  readonly nameRange?: SourceRange;
  readonly shortNameRange?: SourceRange;
  /** From `{` to `}` inclusive, if the declaration has a body. */
  readonly bodyRange?: SourceRange;
}

export interface DocumentModel {
  readonly uri: string;
  /** Top-level elements in source order (including root-level imports). */
  readonly roots: readonly Element[];
}

/** A syntax error with 0-based line and column. */
export interface ModelSyntaxError {
  line: number;
  column: number;
  message: string;
}

export interface ParsedDocument {
  model: DocumentModel;
  errors: ModelSyntaxError[];
}

/** The seam that lets the parser be replaced. */
export type DocumentParser = (uri: string, text: string) => ParsedDocument;

export interface DocumentState {
  readonly uri: string;
  readonly text: string;
  /** Last good model; empty if the document never parsed cleanly. */
  readonly model: DocumentModel;
  /** Syntax errors of the current text (empty when it parses cleanly). */
  readonly errors: readonly ModelSyntaxError[];
  /** True when `model` does not reflect `text` because the text has syntax errors. */
  readonly stale: boolean;
  /** False when `model` is the empty placeholder because no clean parse has happened. */
  readonly everParsedCleanly: boolean;
}

export function emptyModel(uri: string): DocumentModel {
  return { uri, roots: [] };
}
