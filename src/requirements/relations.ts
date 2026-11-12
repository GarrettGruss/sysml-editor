/** Reading requirement relationships (satisfy, verify, derivation) from the model. No `vscode`, no DOM. */
import type { Element, ModelIndex } from "../model/index.js";

export const isRequirement = (e: Element): boolean => e.kind === "requirement" || e.kind === "requirement def";
export const isVerificationCase = (e: Element): boolean => e.kind === "verification" || e.kind === "verification def";

const textOf = (index: ModelIndex, e: Element): string => index.getDocument(e.uri)?.text.slice(e.range.start.offset, e.range.end.offset) ?? "";

/** Whether `e` is a `verify <req>;` statement or a `verify requirement [name] : <Req>;` usage (the model's kinds `verify` and `verify requirement`). */
export const isVerifyStatement = (e: Element): boolean => e.kind === "verify" || e.kind === "verify requirement";

/** The requirement a verify statement names: by reference (`verify r;`) or by the type of an anonymous usage (`verify requirement : R;`). */
export function verifiedRequirement(index: ModelIndex, e: Element): Element | undefined {
  const ref = e.kind === "verify requirement" ? e.typeNames[0] : e.ends[0];
  return ref !== undefined && e.owner ? index.resolve(ref, e.owner) : undefined;
}

/** `not satisfy R by x;` and `assert not satisfy ...`: the statement states that the requirement is NOT satisfied. */
export const isNegatedSatisfy = (index: ModelIndex, e: Element): boolean => /^(?:assert\s+)?not\b/.test(textOf(index, e));

/**
 * The parts of a satisfy statement: the requirement (`satisfy R by x;`, or the type of the nested usage in
 * `satisfy requirement r : R by x;`) and the satisfying element (`x`; without `by` the owning element).
 */
export function satisfyParts(index: ModelIndex, e: Element): { requirement?: Element; by: string; byElement?: Element } | undefined {
  if (e.kind !== "satisfy" || !e.owner) return undefined;
  const nested = e.typeNames.length > 0;
  const reqRef = nested ? e.typeNames[0] : e.ends[0];
  if (reqRef === undefined) return undefined;
  const byRef = nested ? e.ends[0] : e.ends[1];
  const requirement = index.resolve(reqRef, e.owner);
  if (byRef === undefined) return { ...(requirement ? { requirement } : {}), by: e.owner.qualifiedName ?? e.owner.name ?? "", byElement: e.owner };
  const byElement = index.resolve(byRef, e.owner);
  return { ...(requirement ? { requirement } : {}), by: byRef, ...(byElement ? { byElement } : {}) };
}

/** How a derivation connection is written: `#derivation connection` (the form this editor writes), or a hand-written form. */
export type DerivationForm = "hash" | "metadata" | "typed";

const DERIVATION_TYPE = "DerivationConnections::Derivation";

/** Whether `e` (or something it specializes, up to a few levels) is the library `Derivation` connection definition. */
function isDerivationType(index: ModelIndex, e: Element, name: string, depth = 0): boolean {
  const def = index.resolve(name, depth === 0 ? (e.owner ?? e) : e);
  if (!def) return /^(?:(?:RequirementDerivation|DerivationConnections)::)?Derivation$/.test(name.replace(/\s+/g, ""));
  if (def.qualifiedName === DERIVATION_TYPE) return true;
  if (depth >= 6) return false;
  return [...def.typeNames, ...def.specializes].some((n) => isDerivationType(index, def, n, depth + 1));
}

/** The form of a derivation connection, or undefined when `e` is not one. */
export function derivationForm(index: ModelIndex, e: Element): DerivationForm | undefined {
  if (e.kind !== "connection") return undefined;
  if (/^#\s*derivation\b/.test(textOf(index, e))) return "hash";
  if (e.members.some((m) => m.kind === "metadata" && /^(?:@|metadata\b)\s*(?:RequirementDerivation\s*::\s*)?DerivationMetadata\b/.test(textOf(index, m)))) return "metadata";
  if ([...e.typeNames, ...e.specializes].some((n) => isDerivationType(index, e, n))) return "typed";
  return undefined;
}

export function isDerivationConnection(index: ModelIndex, e: Element): boolean {
  return derivationForm(index, e) !== undefined;
}

export interface DerivationEnd {
  /** The `end` member. */
  end: Element;
  /** The reference as written (`::> x`). */
  ref: string;
  /** What it resolves to, when it resolves. */
  target?: Element;
}

export interface Derivation {
  connection: Element;
  form: DerivationForm;
  original?: DerivationEnd;
  derived: DerivationEnd[];
}

/** The role of an end: from its own `#original` / `#derive`, else from the same-named end of the connection's definition. */
function roleOf(index: ModelIndex, conn: Element, end: Element): "original" | "derived" | undefined {
  const t = textOf(index, end);
  if (/^end\s+#?\s*original\b/.test(t)) return "original";
  if (/^end\s+#?\s*derive\b/.test(t)) return "derived";
  const name = end.name ?? /^end\s+('(?:[^']|\\.)*'|[A-Za-z_]\w*)\s*(?:::>|:|;)/.exec(t)?.[1]?.replace(/^'|'$/g, "");
  if (name === undefined) return undefined;
  for (const ty of conn.typeNames) {
    const def = index.resolve(ty, conn);
    if (!def) continue;
    const m = def.members.find((x) => x.name === name);
    if (!m) continue;
    const mt = textOf(index, m);
    if (/#\s*original\b/.test(mt)) return "original";
    if (/#\s*derive\b/.test(mt)) return "derived";
  }
  return undefined;
}

/** The original and derived requirements of a `#derivation connection` (a usage, written with `::>` ends). */
export function derivationOf(index: ModelIndex, conn: Element): Derivation | undefined {
  const form = derivationForm(index, conn);
  if (!form) return undefined;
  const out: Derivation = { connection: conn, form, derived: [] };
  const scope = conn.owner ?? conn;
  for (const end of conn.members) {
    if ((end.kind !== "extended" && end.kind !== "end") || end.references.length === 0) continue;
    const role = roleOf(index, conn, end);
    if (!role) continue;
    const ref = end.references[0]!;
    const target = index.resolve(ref, scope);
    const d: DerivationEnd = { end, ref, ...(target ? { target } : {}) };
    if (role === "original") out.original = d;
    else out.derived.push(d);
  }
  return out;
}

/** Every derivation in the loaded, non-library documents. */
export function allDerivations(index: ModelIndex, uris?: readonly string[]): Derivation[] {
  const out: Derivation[] = [];
  const walk = (e: Element) => {
    const d = derivationOf(index, e);
    if (d) out.push(d);
    e.members.forEach(walk);
  };
  for (const u of uris ?? index.uris().filter((x) => !index.isReadOnly(x))) index.getDocument(u)?.model.roots.forEach(walk);
  return out;
}

/** The verification case that owns a `verify` member, if any. */
export function verificationCaseOf(e: Element): Element | undefined {
  for (let o = e.owner; o; o = o.owner) if (isVerificationCase(o)) return o;
  return undefined;
}
