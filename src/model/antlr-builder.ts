/**
 * Builds the parser-independent document model (types.ts) from the ANTLR parse tree.
 * This is the only file in src/model that knows about ANTLR.
 *
 * Elements are recognised by rule name: every rule ending in `Definition` or `Usage` (minus a
 * short exclusion list) plus a list of other element rules. Kinds are derived from the keyword
 * tokens that are direct children of the rule (`part` `def` -> `part def`), with a small override
 * table where the keyword is not a direct child or several spellings share one kind.
 */
import { ErrorNode, ParserRuleContext, TerminalNode, Token } from "antlr4ng";
import { parse } from "../parser/parse.js";
import { SysMLv2Parser } from "../parser/generated/SysMLv2Parser.js";
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

const RULE_NAMES = SysMLv2Parser.ruleNames;
const EOF = Token.EOF;

function ruleName(ctx: ParserRuleContext): string {
  return RULE_NAMES[ctx.ruleIndex] ?? "";
}

// ---------------------------------------------------------------- rule classification

const EXTRA_ELEMENT_RULES = new Set([
  "package", "libraryPackage", "namespace", "dependency", "importRule", "aliasMember",
  "comment", "documentation", "textualRepresentation", "metadataFeature", "expose",
  "elementFilterMember", "defaultInterfaceEnd", "enumeratedValue", "message",
  // KerML constructs reachable from SysML packages
  "type", "classifier", "dataType", "class", "structure", "metaclass", "association",
  "associationStructure", "interaction", "behavior", "function", "predicate", "multiplicity",
  "feature", "step", "expression", "booleanExpression", "invariant", "connector",
  "bindingConnector", "succession", "flow", "successionFlow",
  // behavioural nodes and statements
  "sendNode", "acceptNode", "assignmentNode", "terminateNode", "ifNode", "whileLoopNode",
  "forLoopNode", "mergeNode", "decisionNode", "joinNode", "forkNode", "actionTargetSuccession",
  "guardedSuccession", "initialNodeMember", "entryActionMember", "doActionMember",
  "exitActionMember", "variantReference",
]);

// Rules ending in Definition/Usage that are not elements of their own.
const NOT_ELEMENT_RULES = new Set([
  "conjugatedPortDefinition", "prefixMetadataUsage", "stateActionUsage", "statePerformActionUsage",
  "stateAcceptActionUsage", "stateSendActionUsage", "stateAssignmentActionUsage",
  "effectBehaviorUsage", "transitionPerformActionUsage", "transitionAcceptActionUsage",
  "transitionSendActionUsage", "transitionAssignmentActionUsage",
]);

const KERML_CLASSIFIERS = new Set([
  "type", "classifier", "dataType", "class", "structure", "metaclass", "association",
  "associationStructure", "interaction", "behavior", "function", "predicate",
]);
const EXTRA_USAGE_RULES = new Set([
  "enumeratedValue", "message", "feature", "step", "expression", "booleanExpression", "invariant",
  "connector", "bindingConnector", "succession", "flow", "successionFlow", "defaultInterfaceEnd",
  "sendNode", "acceptNode", "assignmentNode", "terminateNode", "ifNode", "whileLoopNode",
  "forLoopNode", "mergeNode", "decisionNode", "joinNode", "forkNode", "variantReference",
]);

const elementRuleCache = new Map<string, boolean>();
function isElementRule(rn: string): boolean {
  let r = elementRuleCache.get(rn);
  if (r === undefined) {
    r =
      EXTRA_ELEMENT_RULES.has(rn) ||
      ((rn.endsWith("Definition") || rn.endsWith("Usage")) && !NOT_ELEMENT_RULES.has(rn));
    elementRuleCache.set(rn, r);
  }
  return r;
}

function isDefinitionRule(rn: string): boolean {
  return rn.endsWith("Definition") || KERML_CLASSIFIERS.has(rn);
}
function isUsageRule(rn: string): boolean {
  return rn.endsWith("Usage") || EXTRA_USAGE_RULES.has(rn);
}

/** Pass-through rules whose children are element rules; anything else there becomes `unknown`. */
const WRAPPER_RULES = new Set([
  "nonFeatureElement", "featureElement", "definitionElement", "usageElement",
  "nonOccurrenceUsageElement", "occurrenceUsageElement", "structureUsageElement",
  "behaviorUsageElement", "variantUsageElement", "interfaceOccurrenceUsageElement",
  "memberElement", "annotatingElement", "interfaceNonOccurrenceUsageElement",
  "actionNode", "controlNode",
]);

/** Subtrees that cannot contain elements (expressions); not walked. */
const SKIP_RULES = new Set(["ownedExpression", "valuePart", "featureValue", "bodyExpression"]);

const KIND_OVERRIDES: Record<string, string> = {
  package: "package",
  libraryPackage: "library package",
  namespace: "namespace",
  importRule: "import",
  aliasMember: "alias",
  elementFilterMember: "filter",
  defaultInterfaceEnd: "end",
  endFeatureUsage: "end",
  comment: "comment",
  documentation: "doc",
  textualRepresentation: "rep",
  metadataFeature: "metadata",
  feature: "feature",
  defaultReferenceUsage: "ref",
  enumeratedValue: "enum",
  bindingConnectorAsUsage: "bind",
  successionAsUsage: "succession",
  actionTargetSuccession: "succession",
  guardedSuccession: "succession",
  targetTransitionUsage: "transition",
  satisfyRequirementUsage: "satisfy",
  acceptNode: "accept",
  assignmentNode: "assign",
  entryActionMember: "entry",
  doActionMember: "do",
  exitActionMember: "exit",
  variantReference: "variant",
  subjectUsage: "subject",
  actorUsage: "actor",
  stakeholderUsage: "stakeholder",
  dependency: "dependency",
  transitionUsage: "transition",
  assertConstraintUsage: "assert",
};

/** Members whose keyword (`require`, `assume`, `verify`, ...) belongs to the kind of the inner usage. */
const KIND_PREFIX_MEMBERS = new Set([
  "requirementConstraintMember", "framedConcernMember", "requirementVerificationMember",
  "viewRenderingMember", "objectiveMember",
]);

const MODIFIER_KEYWORDS = new Set(["abstract", "variation"]);

/** Rules searched, in order, for the identification that names an element. */
const NAME_DESCEND = new Set([
  "definition", "usage", "usageDeclaration", "definitionDeclaration", "classifierDeclaration",
  "typeDeclaration", "featureDeclaration", "packageDeclaration", "namespaceDeclaration",
  "actionUsageDeclaration", "constraintUsageDeclaration", "interfaceUsageDeclaration",
  "allocationUsageDeclaration", "messageDeclaration", "flowDeclaration",
  "bindingConnectorDeclaration", "successionDeclaration", "actionNodeUsageDeclaration",
  "acceptNodeDeclaration", "assignmentNodeDeclaration", "actionNodePrefix",
  "performActionUsageDeclaration", "connectorDeclaration", "binaryConnectorDeclaration",
  "naryConnectorDeclaration", "dependencyDeclaration",
]);

/** Rules not entered when collecting the declaration parts of an element. */
const STOP_RULES = new Set([
  "valuePart", "featureValue", "ownedExpression", "ownedCrossFeatureMember",
  "ownedCrossMultiplicityMember", "payloadFeatureMember", "flowPayloadFeatureMember",
  "conjugatedPortDefinitionMember", "guardExpressionMember", "effectBehaviorMember",
  "triggerActionMember", "nodeParameterMember", "emptyParameterMember", "sourceEndMember",
  "forVariableDeclarationMember", "expressionParameterMember", "actionBodyParameterMember",
]);
const END_RULES = new Set([
  "connectorEndMember", "interfaceEndMember", "flowEndMember", "messageEventMember",
  "satisfactionSubjectMember", "transitionSuccessionMember", "featureChainMember",
]);

// ---------------------------------------------------------------- source positions

class SourceMap {
  private readonly lineStarts: number[] = [0];
  /** code point index -> UTF-16 offset; only when the text has astral characters. */
  private readonly cpToUnit?: number[];

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
    if (/[\ud800-\udfff]/.test(text)) {
      const m: number[] = [];
      let u = 0;
      for (const ch of text) {
        m.push(u);
        u += ch.length;
      }
      m.push(u);
      this.cpToUnit = m;
    }
  }

  /** `cp` is an ANTLR (code point) index. */
  pos(cp: number): SourcePosition {
    const offset = this.cpToUnit ? (this.cpToUnit[Math.min(Math.max(cp, 0), this.cpToUnit.length - 1)] ?? 0) : cp;
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { offset, line: lo, column: offset - this.lineStarts[lo]! };
  }

  /** Convert an ANTLR error position (1-based line, code point column) to a 0-based line and UTF-16 column. */
  errorPos(text: string, line: number, cpColumn: number): { line: number; column: number } {
    const l = Math.min(Math.max(line - 1, 0), this.lineStarts.length - 1);
    const start = this.lineStarts[l]!;
    if (!this.cpToUnit) return { line: l, column: cpColumn };
    let u = 0;
    let n = 0;
    for (const ch of text.slice(start)) {
      if (n >= cpColumn || ch === "\n") break;
      u += ch.length;
      n++;
    }
    return { line: l, column: u };
  }

  range(start: Token | null, stop: Token | null): SourceRange | undefined {
    if (!start || start.tokenIndex < 0 || start.type === EOF) return undefined;
    const s = this.pos(start.start);
    if (!stop || stop.tokenIndex < start.tokenIndex || stop.type === EOF) return { start: s, end: s };
    const e = this.pos(stop.stop + 1);
    return { start: s, end: e.offset < s.offset ? s : e };
  }
}

// ---------------------------------------------------------------- tree helpers

function childCtxs(ctx: ParserRuleContext): ParserRuleContext[] {
  const out: ParserRuleContext[] = [];
  for (const c of ctx.children) if (c instanceof ParserRuleContext) out.push(c);
  return out;
}

function ctxText(ctx: ParserRuleContext): string {
  let s = "";
  for (const c of ctx.children) {
    if (c instanceof ErrorNode) continue;
    if (c instanceof TerminalNode) s += c.symbol.text ?? "";
    else if (c instanceof ParserRuleContext) s += ctxText(c);
  }
  return s;
}

function isKeyword(t: Token): boolean {
  return t.type !== SysMLv2Parser.IDENTIFIER && /^[a-z]+$/.test(t.text ?? "");
}

// ---------------------------------------------------------------- builder

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

class Builder {
  readonly roots: MutableElement[] = [];
  private readonly map: SourceMap;

  constructor(
    private readonly uri: string,
    text: string,
  ) {
    this.map = new SourceMap(text);
  }

  build(root: ParserRuleContext): void {
    this.visit(root, undefined);
  }

  private add(el: MutableElement, owner: MutableElement | undefined): void {
    el.owner = owner;
    (owner ? owner.members : this.roots).push(el);
  }

  private visit(ctx: ParserRuleContext, owner: MutableElement | undefined): void {
    const rn = ruleName(ctx);
    if (SKIP_RULES.has(rn)) return;
    if (isElementRule(rn)) {
      let el: MutableElement;
      try {
        el = this.makeElement(ctx, rn, owner);
      } catch {
        el = this.unknown(ctx, owner);
      }
      this.add(el, owner);
      for (const c of childCtxs(ctx)) this.visit(c, el);
      try {
        const doc = el.members.find((m) => m.kind === "doc");
        if (doc?.documentation !== undefined && el.kind !== "doc") el.documentation = doc.documentation;
      } catch {
        /* ignore */
      }
      return;
    }
    if (WRAPPER_RULES.has(rn)) {
      for (const c of childCtxs(ctx)) {
        const crn = ruleName(c);
        if (isElementRule(crn) || WRAPPER_RULES.has(crn) || SKIP_RULES.has(crn)) this.visit(c, owner);
        else this.add(this.unknown(c, owner), owner);
      }
      return;
    }
    for (const c of childCtxs(ctx)) this.visit(c, owner);
  }

  private unknown(ctx: ParserRuleContext, owner: MutableElement | undefined): MutableElement {
    const r = this.map.range(ctx.start, ctx.stop) ?? { start: this.map.pos(0), end: this.map.pos(0) };
    return {
      uri: this.uri, kind: "unknown", isDefinition: false, isUsage: false, members: [], types: [],
      specializes: [], subsets: [], redefines: [], references: [], ends: [], range: r, owner,
    };
  }

  private makeElement(ctx: ParserRuleContext, rn: string, owner: MutableElement | undefined): MutableElement {
    const range = this.map.range(ctx.start, ctx.stop);
    if (!range) return this.unknown(ctx, owner);
    const el: MutableElement = {
      uri: this.uri,
      kind: this.kindOf(ctx, rn),
      isDefinition: isDefinitionRule(rn),
      isUsage: isUsageRule(rn),
      members: [], types: [], specializes: [], subsets: [], redefines: [], references: [], ends: [],
      range,
    };
    this.applyName(ctx, rn, el);
    this.scanOwn(ctx, el);
    const vis = this.visibilityOf(ctx);
    if (vis) el.visibility = vis;
    if (rn === "importRule" || rn === "expose") el.importInfo = this.importInfo(ctx);
    if (rn === "documentation" || rn === "comment") {
      const t = ctx.children.find(
        (c): c is TerminalNode => c instanceof TerminalNode && c.symbol.type === SysMLv2Parser.REGULAR_COMMENT,
      );
      if (t?.symbol.text) el.documentation = processDocComment(t.symbol.text);
    }
    // Qualified name: undefined when any ancestor is unnamed.
    if (el.name !== undefined && (!owner || owner.qualifiedName !== undefined)) {
      el.qualifiedName = (owner ? owner.qualifiedName + "::" : "") + quoteName(el.name);
    }
    return el;
  }

  // ---- kinds

  private kindOf(ctx: ParserRuleContext, rn: string): string {
    const parent = ctx.parent;
    let prefix = "";
    if (parent && KIND_PREFIX_MEMBERS.has(ruleName(parent))) {
      const words: string[] = [];
      for (const c of parent.children) {
        if (c instanceof TerminalNode && isKeyword(c.symbol)) words.push(c.symbol.text!);
        else if (c instanceof ParserRuleContext && ruleName(c) === "requirementKind") words.push(ctxText(c));
      }
      prefix = words.join(" ");
    }
    const own = this.ownKind(ctx, rn, prefix !== "");
    return [prefix, own].filter((s) => s).join(" ");
  }

  private ownKind(ctx: ParserRuleContext, rn: string, hasPrefix: boolean): string {
    const o = KIND_OVERRIDES[rn];
    if (o !== undefined) return o;
    if (rn === "portionUsage") {
      const pk = childCtxs(ctx).find((c) => ruleName(c) === "portionKind");
      if (pk) return ctxText(pk);
    }
    const isDef = rn.endsWith("Definition");
    const words: string[] = [];
    for (const c of ctx.children) {
      if (c instanceof TerminalNode) {
        const t = c.symbol;
        if (!isKeyword(t) || c instanceof ErrorNode) continue;
        if (MODIFIER_KEYWORDS.has(t.text!)) continue;
        words.push(t.text!);
        if (t.text === "def") break;
      } else if (words.length > 0 && !isDef) {
        break;
      }
    }
    if (words.length > 0) return words.join(" ");
    if (hasPrefix) return "";
    // Fall back to the rule name: `extendedUsage` -> `extended`, `multiplicity` -> `multiplicity`.
    const spaced = rn.replace(/Usage$/, "").replace(/Definition$/, " def").replace(/([A-Z])/g, " $1");
    return spaced.trim().toLowerCase() || "unknown";
  }

  // ---- names

  private findIdentification(ctx: ParserRuleContext): ParserRuleContext | undefined {
    for (const c of childCtxs(ctx)) {
      const rn = ruleName(c);
      if (rn === "identification" || rn === "featureIdentification") return c;
      if (NAME_DESCEND.has(rn)) {
        const r = this.findIdentification(c);
        if (r) return r;
      }
    }
    return undefined;
  }

  private nameOf(nameCtx: ParserRuleContext | undefined): { text: string; range: SourceRange } | undefined {
    if (!nameCtx || !nameCtx.start || nameCtx.start.tokenIndex < 0) return undefined;
    const tok = nameCtx.start;
    const text = tok.text ?? "";
    if (!text || text.startsWith("<missing")) return undefined;
    const range = this.map.range(tok, tok);
    return range ? { text: unquoteName(text), range } : undefined;
  }

  private applyIdentification(ident: ParserRuleContext, el: MutableElement): void {
    const kids = ident.children;
    const first = kids[0];
    let shortCtx: ParserRuleContext | undefined;
    let nameCtx: ParserRuleContext | undefined;
    if (first instanceof TerminalNode && first.symbol.text === "<") {
      shortCtx = kids[1] instanceof ParserRuleContext ? kids[1] : undefined;
      nameCtx = kids[3] instanceof ParserRuleContext ? kids[3] : undefined;
    } else if (first instanceof ParserRuleContext) {
      nameCtx = first;
    }
    const s = this.nameOf(shortCtx);
    if (s) {
      el.shortName = s.text;
      el.shortNameRange = s.range;
    }
    const n = this.nameOf(nameCtx);
    if (n) {
      el.name = n.text;
      el.nameRange = n.range;
    }
  }

  private applyName(ctx: ParserRuleContext, rn: string, el: MutableElement): void {
    if (rn === "aliasMember") {
      // memberPrefix ALIAS ( LT name GT )? name? FOR qualifiedName relationshipBody
      let sawLt = false;
      let beforeFor = true;
      for (const c of ctx.children) {
        if (c instanceof TerminalNode) {
          const t = c.symbol.text;
          if (t === "<") sawLt = true;
          else if (t === "for") beforeFor = false;
        } else if (c instanceof ParserRuleContext) {
          const crn = ruleName(c);
          if (crn === "name" && beforeFor) {
            const n = this.nameOf(c);
            if (!n) continue;
            if (sawLt && el.shortName === undefined) {
              el.shortName = n.text;
              el.shortNameRange = n.range;
            } else {
              el.name = n.text;
              el.nameRange = n.range;
            }
          } else if (crn === "qualifiedName") {
            el.aliasFor = ctxText(c);
          }
        }
      }
      return;
    }
    const ident = this.findIdentification(ctx);
    if (ident) this.applyIdentification(ident, el);
  }

  // ---- declaration parts

  /**
   * Walks the declaration parts of an element (not its body, nested elements, or expressions),
   * collecting typings, specializations, multiplicity, endpoints and the body range.
   */
  private scanOwn(ctx: ParserRuleContext, el: MutableElement): void {
    for (const c of childCtxs(ctx)) {
      const rn = ruleName(c);
      if (STOP_RULES.has(rn)) continue;
      if (isElementRule(rn)) continue;
      if (rn.endsWith("Body")) {
        if (!el.bodyRange) el.bodyRange = this.bodyRangeOf(c);
        continue;
      }
      switch (rn) {
        case "typings": this.collect(c, ["ownedFeatureTyping", "conjugatedPortTyping"], el.types); continue;
        case "subsettings": this.collect(c, ["ownedSubsetting"], el.subsets); continue;
        case "redefinitions": this.collect(c, ["ownedRedefinition"], el.redefines); continue;
        case "references": this.collect(c, ["ownedReferenceSubsetting"], el.references); continue;
        case "crosses": continue;
        case "subclassificationPart":
        case "superclassingPart":
        case "specializationPart":
          this.collect(c, ["ownedSubclassification", "ownedSpecialization"], el.specializes);
          continue;
        case "conjugationPart": continue;
        case "ownedMultiplicity":
          if (el.multiplicity === undefined) el.multiplicity = ctxText(c);
          continue;
        case "ownedReferenceSubsetting":
          el.ends.push(ctxText(c));
          continue;
      }
      if (END_RULES.has(rn)) {
        el.ends.push(ctxText(c));
        continue;
      }
      if ((el.kind === "dependency" || el.kind === "first") && rn === "qualifiedName") {
        el.ends.push(ctxText(c));
        continue;
      }
      this.scanOwn(c, el);
    }
  }

  private collect(ctx: ParserRuleContext, rules: string[], out: string[]): void {
    for (const c of childCtxs(ctx)) {
      if (rules.includes(ruleName(c))) out.push(ctxText(c));
      else this.collect(c, rules, out);
    }
  }

  private bodyRangeOf(body: ParserRuleContext): SourceRange | undefined {
    let open: Token | undefined;
    for (const c of body.children) {
      if (c instanceof TerminalNode && c.symbol.text === "{") {
        open = c.symbol;
        break;
      }
    }
    return open ? this.map.range(open, body.stop) : undefined;
  }

  // ---- visibility and imports

  private visibilityOf(ctx: ParserRuleContext): Visibility | undefined {
    let cur: ParserRuleContext | null = ctx;
    for (let depth = 0; cur && depth < 5; depth++) {
      const here: ParserRuleContext = cur;
      for (const c of childCtxs(here)) {
        const rn = ruleName(c);
        if (rn === "visibilityIndicator") return ctxText(c) as Visibility;
        if (rn === "memberPrefix") {
          const t = ctxText(c);
          return t ? (t as Visibility) : undefined;
        }
      }
      cur = here.parent;
      if (cur && isElementRule(ruleName(cur))) break;
    }
    return undefined;
  }

  private importInfo(ctx: ParserRuleContext): ImportInfo | undefined {
    const find = (c: ParserRuleContext): ParserRuleContext | undefined => {
      for (const k of childCtxs(c)) {
        const rn = ruleName(k);
        if (
          (rn === "membershipImport" || rn === "namespaceImport" || rn === "namespaceImportDirect") &&
          childCtxs(k).some((q) => ruleName(q) === "qualifiedName")
        )
          return k;
        const r = find(k);
        if (r) return r;
      }
      return undefined;
    };
    const decl = find(ctx);
    if (!decl) return undefined;
    const qn = childCtxs(decl).find((q) => ruleName(q) === "qualifiedName")!;
    const recursive = decl.children.some((c) => c instanceof TerminalNode && c.symbol.text === "**");
    return { target: ctxText(qn), wildcard: ruleName(decl) !== "membershipImport", recursive };
  }
}

/** Build a document model from a parse result. Never throws. */
export function buildDocumentModel(uri: string, text: string, tree: ParserRuleContext): DocumentModel {
  const b = new Builder(uri, text);
  try {
    b.build(tree);
  } catch {
    /* keep what was built */
  }
  return { uri, roots: b.roots as unknown as Element[] };
}

/** The default DocumentParser, backed by the ANTLR parser. */
export const antlrDocumentParser: DocumentParser = (uri, text): ParsedDocument => {
  const r = parse(text);
  const map = new SourceMap(text);
  const errors = r.errors.map((e) => ({ ...map.errorPos(text, e.line, e.column), message: e.message }));
  return { model: buildDocumentModel(uri, text, r.tree), errors };
};
