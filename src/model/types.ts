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
  /** `import all`: also private members and private imports of the target are imported. */
  all?: boolean;
}

export type FeatureDirection = "in" | "out" | "inout";

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
  /** `types` without a leading `~` (conjugated port typing `~P`), parallel to `types`; use for name resolution. */
  readonly typeNames: readonly string[];
  /** Whether the type at the same index of `types` is conjugated (`port p : ~P;`). */
  readonly typeConjugated: readonly boolean[];
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
  /** Direction keyword of a feature (`in`, `out`, `inout`), when one was written. */
  readonly direction?: FeatureDirection;
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
  /**
   * Only with `fastOnly`: the fast path failed, `errors` holds one provisional error and `model`
   * is meaningless; the precise result must come from a `DetailsProvider`.
   */
  detailsPending?: boolean;
}

export interface DocumentParserOptions {
  /** Do only the cheap attempt; may answer `detailsPending` instead of a precise result. */
  fastOnly?: boolean;
  /** With `fastOnly`: also try full-LL prediction on the fast path regardless of text length. */
  fullContextRetry?: boolean;
}

/** The seam that lets the parser be replaced. */
export type DocumentParser = (uri: string, text: string, opts?: DocumentParserOptions) => ParsedDocument;

export interface DetailsRequest {
  uri: string;
  /** Monotonically increasing per URI; replies for older versions are ignored. */
  version: number;
  text: string;
}

export interface DetailsReply {
  uri: string;
  version: number;
  /** Precise syntax errors (0-based); empty when the text is valid. */
  errors: ModelSyntaxError[];
  /** The document model, present when the text turned out to be valid. */
  model?: DocumentModel;
}

/**
 * Produces precise parse results for texts that failed the fast path, typically off the main
 * thread. `request` resolves with the reply, or `undefined` when the request was superseded by a
 * newer version of the same URI or the provider is unavailable.
 */
export interface DetailsProvider {
  request(req: DetailsRequest): Promise<DetailsReply | undefined>;
}

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
  /** True while `errors` is a provisional fast-path error and precise details are being computed. */
  readonly detailsPending: boolean;
}

export function emptyModel(uri: string): DocumentModel {
  return { uri, roots: [] };
}
