/**
 * Requirement queries over the model: requirements within a scope, with documentation and their satisfy,
 * verify and derivation relationships. No `vscode`, no DOM.
 */
import type { Element, ModelIndex } from "../model/index.js";
import { unescapeTerminator } from "../edit/comment.js";
import { allDerivations, isRequirement, verificationCaseOf } from "./relations.js";

export interface SatisfyRel {
  statement: Element;
  /** The satisfying element as written. */
  by: string;
  byElement?: Element;
}
export interface VerifyRel {
  statement: Element;
  /** The verification case that owns the statement. */
  verifier: Element;
}
export interface DerivationRel {
  connection: Element;
  /** The other requirement of the relation (the original for `derivedFrom`, a derived one for `derives`). */
  other: Element | undefined;
  otherRef: string;
}

export interface RequirementInfo {
  element: Element;
  uri: string;
  kind: "requirement" | "requirement def";
  qualifiedName: string;
  shortName?: string;
  name?: string;
  /** Documentation as shown (the `*\/` convention unescaped). */
  text: string;
  /** Qualified name of the owner. */
  owner?: string;
  line: number;
  satisfiedBy: SatisfyRel[];
  verifiedBy: VerifyRel[];
  /** This requirement is derived from these. */
  derivedFrom: DerivationRel[];
  /** These requirements are derived from this one. */
  derives: DerivationRel[];
}

export interface Relations {
  satisfy: Map<Element, SatisfyRel[]>;
  verify: Map<Element, VerifyRel[]>;
  derivedFrom: Map<Element, DerivationRel[]>;
  derives: Map<Element, DerivationRel[]>;
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

/** Resolve every satisfy, verify and derivation statement of the workspace once. Keys are the requirement elements. */
export function buildRelations(index: ModelIndex): Relations {
  const rel: Relations = { satisfy: new Map(), verify: new Map(), derivedFrom: new Map(), derives: new Map() };
  const walk = (e: Element) => {
    if (e.kind === "satisfy" && e.ends.length >= 2) {
      const r = e.owner ? index.resolve(e.ends[0]!, e.owner) : undefined;
      if (r && isRequirement(r)) {
        const by = e.owner ? index.resolve(e.ends[1]!, e.owner) : undefined;
        push(rel.satisfy, r, { statement: e, by: e.ends[1]!, ...(by ? { byElement: by } : {}) });
      }
    } else if (e.kind === "verify" && e.ends.length >= 1) {
      const r = e.owner ? index.resolve(e.ends[0]!, e.owner) : undefined;
      const v = verificationCaseOf(e);
      if (r && isRequirement(r) && v) push(rel.verify, r, { statement: e, verifier: v });
    }
    e.members.forEach(walk);
  };
  for (const u of index.uris()) if (!index.isReadOnly(u)) index.getDocument(u)?.model.roots.forEach(walk);
  for (const d of allDerivations(index)) {
    const o = d.original?.target;
    for (const x of d.derived) {
      if (x.target && isRequirement(x.target)) push(rel.derivedFrom, x.target, { connection: d.connection, other: o, otherRef: d.original?.ref ?? "" });
      if (o && isRequirement(o)) push(rel.derives, o, { connection: d.connection, other: x.target, otherRef: x.ref });
    }
  }
  return rel;
}

export function describeRequirement(e: Element, rel: Relations): RequirementInfo {
  return {
    element: e,
    uri: e.uri,
    kind: e.kind as RequirementInfo["kind"],
    qualifiedName: e.qualifiedName ?? e.name ?? "",
    ...(e.shortName !== undefined ? { shortName: e.shortName } : {}),
    ...(e.name !== undefined ? { name: e.name } : {}),
    text: unescapeTerminator(e.documentation ?? ""),
    ...(e.owner?.qualifiedName !== undefined ? { owner: e.owner.qualifiedName } : {}),
    line: e.range.start.line,
    satisfiedBy: rel.satisfy.get(e) ?? [],
    verifiedBy: rel.verify.get(e) ?? [],
    derivedFrom: rel.derivedFrom.get(e) ?? [],
    derives: rel.derives.get(e) ?? [],
  };
}

/** The requirements declared in `scope` (a package and everything nested in it, or the documents of a file URI), in source order. */
export function listRequirements(index: ModelIndex, scope: Element | string, rel: Relations = buildRelations(index)): RequirementInfo[] {
  const out: RequirementInfo[] = [];
  const walk = (e: Element) => {
    if (isRequirement(e)) {
      out.push(describeRequirement(e, rel));
      return; // nested requirements are not listed (deferred)
    }
    e.members.forEach(walk);
  };
  if (typeof scope === "string") index.getDocument(scope)?.model.roots.forEach(walk);
  else {
    // A package declared in several files lists the requirements of every declaration.
    const decls = scope.qualifiedName !== undefined ? index.findByQualifiedName(scope.qualifiedName).filter((d) => d === scope || d.kind === scope.kind) : [scope];
    (decls.includes(scope) ? decls : [scope, ...decls]).forEach((d) => d.members.forEach(walk));
  }
  return out;
}
