/** Reading requirement relationships (satisfy, verify, derivation) from the model. No `vscode`, no DOM. */
import type { Element, ModelIndex } from "../model/index.js";

export const isRequirement = (e: Element): boolean => e.kind === "requirement" || e.kind === "requirement def";
export const isVerificationCase = (e: Element): boolean => e.kind === "verification" || e.kind === "verification def";

const textOf = (index: ModelIndex, e: Element): string => index.getDocument(e.uri)?.text.slice(e.range.start.offset, e.range.end.offset) ?? "";

export function isDerivationConnection(index: ModelIndex, e: Element): boolean {
  return e.kind === "connection" && /^#\s*derivation\b/.test(textOf(index, e));
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
  original?: DerivationEnd;
  derived: DerivationEnd[];
}

/** The role of an end: from its own `#original` / `#derive`, else from the same-named end of the connection's definition. */
function roleOf(index: ModelIndex, conn: Element, end: Element): "original" | "derived" | undefined {
  const t = textOf(index, end);
  if (/^end\s+#\s*original\b/.test(t)) return "original";
  if (/^end\s+#\s*derive\b/.test(t)) return "derived";
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
  if (!isDerivationConnection(index, conn)) return undefined;
  const out: Derivation = { connection: conn, derived: [] };
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
