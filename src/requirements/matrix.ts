/**
 * The requirements verification matrix (RVM), derived from the model: one row per requirement, nested and numbered by
 * ownership, with satisfied by, verification method, verified by and status. Pass/fail results are not part of it.
 * No `vscode`, no DOM.
 */
import type { Element, ModelIndex } from "../model/index.js";
import { buildRelations, type Relations } from "./queries.js";
import { isRequirement } from "./relations.js";
import { usagesText, VERIFICATION_METHODS, type MatrixLink, type MatrixRow, type MatrixSummary, type MatrixVM, type MatrixStatus, type VerificationMethod } from "./matrix-shape.js";

export * from "./matrix-shape.js";

const isPkg = (e: Element) => e.kind === "package" || e.kind === "library package";
const keyOf = (e: Element): string => `${e.uri}#${e.range.start.offset}`;
const labelOf = (e: Element | undefined, fallback: string): string => (e ? [e.shortName, e.name].filter(Boolean).join(" ") || fallback : fallback);
const textOf = (index: ModelIndex, e: Element): string => index.getDocument(e.uri)?.text.slice(e.range.start.offset, e.range.end.offset) ?? "";

/** Source text without comments and string literals, so a word in a comment never counts. */
const code = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/"(?:[^"\\]|\\.)*"/g, '""');

const METHOD_DEF = "VerificationCases::VerificationMethod";

/** Whether the type written in a metadata annotation is `VerificationMethod` (resolved, through aliases and specializations), or, unresolved, named like it. */
function isMethodType(index: ModelIndex, m: Element, ref: string, seen = new Set<Element>()): boolean {
  const def = index.resolve(ref, m);
  if (!def) return ref.replace(/'/g, "").split("::").pop() === "VerificationMethod";
  const walk = (d: Element): boolean => {
    if (seen.has(d)) return false;
    seen.add(d);
    if (d.qualifiedName === METHOD_DEF) return true;
    if (d.aliasFor !== undefined) {
      const target = index.resolve(d.aliasFor, d.owner ?? d);
      return target ? walk(target) : d.aliasFor.replace(/'/g, "").split("::").pop() === "VerificationMethod";
    }
    return [...d.specializes, ...d.typeNames].some((n) => {
      const next = index.resolve(n, d.owner ?? d);
      return next !== undefined && walk(next);
    });
  };
  return walk(def);
}

/**
 * The methods named by `VerificationMethod` metadata (`@VerificationMethod { kind = VerificationMethodKind::test; }`,
 * `metadata vm : VerificationMethod { ... }`, a qualified or aliased type) on a verification case, on the definitions it
 * is typed by or specializes (each visited once). The model keeps no attribute values, so `kind` is read from the
 * annotation's own text with comments and strings removed.
 */
export function verificationMethodsOf(index: ModelIndex, verifier: Element): VerificationMethod[] {
  const out = new Set<VerificationMethod>();
  const seen = new Set<Element>();
  const read = (e: Element) => {
    if (seen.has(e)) return;
    seen.add(e);
    for (const m of e.members) {
      if (m.kind !== "metadata") continue;
      const t = code(textOf(index, m));
      const head = /^(?:@|metadata\b)\s*([A-Za-z_'][\w':]*)/.exec(t);
      const named = /^(?:@|metadata\b)\s*(?:'(?:[^']|\\.)*'|[A-Za-z_]\w*)\s*:\s*([A-Za-z_'][\w':]*)/.exec(t);
      const ref = named?.[1] ?? head?.[1];
      if (!ref || !isMethodType(index, m, ref)) continue;
      const at = t.search(/\bkind\b/);
      if (at < 0) continue;
      const stmt = t.slice(at).split(";")[0]!;
      for (const x of stmt.matchAll(/\b(?:VerificationMethodKind\s*::\s*)?(inspect|analyze|demo|test)\b/g)) out.add(x[1] as VerificationMethod);
    }
    for (const n of [...e.typeNames, ...e.specializes]) {
      const def = index.resolve(n, e.owner ?? e);
      if (def) read(def);
    }
  };
  read(verifier);
  return VERIFICATION_METHODS.filter((m) => out.has(m));
}

/** Build the matrix of a scope: a package (and everything nested in it) or the documents of a file. */
export function buildMatrix(index: ModelIndex, scope: Element | string, editable: (uri: string) => boolean, rel: Relations = buildRelations(index)): MatrixVM {
  // Usages of a requirement definition: the definition counts as satisfied only when every usage is.
  const usagesOf = new Map<Element, Element[]>();
  const collect = (e: Element) => {
    if (e.kind === "requirement") {
      for (const n of e.typeNames) {
        const def = index.resolve(n, e.owner ?? e);
        if (def && isRequirement(def)) {
          const list = usagesOf.get(def);
          if (list) list.push(e);
          else usagesOf.set(def, [e]);
        }
      }
    }
    e.members.forEach(collect);
  };
  for (const u of index.uris()) if (!index.isReadOnly(u)) index.getDocument(u)?.model.roots.forEach(collect);

  const via = (links: MatrixLink[], by: Element): MatrixLink[] =>
    links.map((l): MatrixLink => ({ label: l.label, ...(l.qn ? { qn: l.qn } : {}), via: l.via ?? labelOf(by, by.name ?? "") }));
  const ownSatisfy = (e: Element): MatrixLink[] =>
    (rel.satisfy.get(e) ?? []).filter((s) => !s.negated).map((s) => ({ label: labelOf(s.byElement, s.by), ...(s.byElement?.qualifiedName ? { qn: s.byElement.qualifiedName } : {}), statementKey: keyOf(s.statement) }));

  interface Sat { links: MatrixLink[]; usages?: { satisfied: number; total: number } }
  const satMemo = new Map<Element, Sat>();
  /** Own `satisfy`; else, for a definition, its usages (all must be satisfied); else the owning requirement's. */
  const satisfyOf = (e: Element, depth = 0): Sat => {
    const hit = satMemo.get(e);
    if (hit) return hit;
    let r: Sat = { links: [] };
    const own = ownSatisfy(e);
    const usages = usagesOf.get(e) ?? [];
    if (own.length) r = { links: own };
    else if (usages.length && depth < 20) {
      const per = usages.map((u) => ({ u, sat: satisfyOf(u, depth + 1) }));
      const ok = per.filter((x) => x.sat.links.length > 0);
      r = { links: ok.flatMap((x) => via(x.sat.links, x.u)), usages: { satisfied: ok.length, total: usages.length } };
    } else if (e.owner && isRequirement(e.owner) && depth < 20) {
      const p = satisfyOf(e.owner, depth + 1);
      r = { links: via(p.links, e.owner), ...(p.usages ? { usages: p.usages } : {}) };
    }
    satMemo.set(e, r);
    return r;
  };

  const verifyOwn = (e: Element): MatrixLink[] => {
    const seen = new Set<Element>();
    const out: MatrixLink[] = [];
    for (const v of rel.verify.get(e) ?? []) {
      if (seen.has(v.verifier)) continue;
      seen.add(v.verifier);
      out.push({ label: v.verifier.name ?? v.verifier.qualifiedName ?? "verification", ...(v.verifier.qualifiedName ? { qn: v.verifier.qualifiedName } : {}), statementKey: keyOf(v.statement) });
    }
    return out;
  };
  /** Own verification; else the owning requirement's (a requirement's constraint includes its nested requirements). */
  const verifyOf = (e: Element, depth = 0): { links: MatrixLink[]; verifiers: Element[] } => {
    const own = rel.verify.get(e) ?? [];
    if (own.length) return { links: verifyOwn(e), verifiers: [...new Set(own.map((v) => v.verifier))] };
    if (e.owner && isRequirement(e.owner) && depth < 20) {
      const p = verifyOf(e.owner, depth + 1);
      return { links: via(p.links, e.owner), verifiers: p.verifiers };
    }
    return { links: [], verifiers: [] };
  };

  const methodCache = new Map<Element, VerificationMethod[]>();
  const methodsOf = (v: Element): VerificationMethod[] => {
    let m = methodCache.get(v);
    if (!m) methodCache.set(v, (m = verificationMethodsOf(index, v)));
    return m;
  };

  const rows: MatrixRow[] = [];
  const addReq = (e: Element, number: string, depth: number) => {
    const sat = satisfyOf(e);
    const ver = verifyOf(e);
    const methods = new Set<VerificationMethod>();
    for (const v of ver.verifiers) methodsOf(v).forEach((m) => methods.add(m));
    const full = sat.links.length > 0 && (!sat.usages || sat.usages.satisfied === sat.usages.total);
    rows.push({
      kind: "requirement",
      number,
      depth,
      qn: e.qualifiedName ?? e.name ?? "",
      id: e.shortName ?? "",
      name: e.name ?? "",
      satisfiedBy: sat.links,
      ...(sat.usages ? { usages: sat.usages } : {}),
      methods: VERIFICATION_METHODS.filter((m) => methods.has(m)),
      verifiedBy: ver.links,
      status: !sat.links.length ? "not satisfied" : !full ? "partly satisfied" : ver.links.length === 0 ? "no verification" : "covered",
      editable: editable(e.uri),
    });
  };
  const walk = (members: readonly Element[], prefix: string, depth: number) => {
    let n = 0;
    for (const m of members) {
      if (!isRequirement(m) && !(isPkg(m) && hasRequirement(m))) continue;
      const number = prefix + String(++n);
      if (isRequirement(m)) {
        addReq(m, number, depth);
        walk(m.members, number + ".", depth + 1);
      } else {
        rows.push({ kind: "section", number, depth, qn: m.qualifiedName ?? m.name ?? "", id: "", name: m.name ?? "", satisfiedBy: [], methods: [], verifiedBy: [], editable: editable(m.uri) });
        walk(m.members, number + ".", depth + 1);
      }
    }
  };
  if (typeof scope === "string") walk(index.getDocument(scope)?.model.roots ?? [], "", 0);
  else {
    const decls = scope.qualifiedName !== undefined ? index.findByQualifiedName(scope.qualifiedName).filter((d) => d === scope || d.kind === scope.kind) : [scope];
    walk((decls.includes(scope) ? decls : [scope, ...decls]).flatMap((d) => d.members), "", 0);
  }
  return { rows, summary: summarize(rows) };
}

function hasRequirement(p: Element): boolean {
  return p.members.some((m) => isRequirement(m) || (isPkg(m) && hasRequirement(m)));
}

export function summarize(rows: readonly MatrixRow[]): MatrixSummary {
  const reqs = rows.filter((r) => r.kind === "requirement");
  const count = (s: MatrixStatus) => reqs.filter((r) => r.status === s).length;
  const covered = count("covered");
  return { total: reqs.length, covered, noVerification: count("no verification"), notSatisfied: count("not satisfied"), partlySatisfied: count("partly satisfied"), percentCovered: reqs.length === 0 ? 0 : Math.round((covered / reqs.length) * 100) };
}

// ------------------------------------------------------------------ export and the trace line

export const MATRIX_COLUMNS = ["Number", "Id", "Name", "Satisfied by", "Verification method", "Verified by", "Status"] as const;

const names = (l: readonly MatrixLink[]) => l.map((x) => (x.via ? `${x.label} (via ${x.via})` : x.label)).join("; ");
const satisfiers = (r: MatrixRow): string => [names(r.satisfiedBy), r.usages ? `[${usagesText(r.usages)}]` : ""].filter(Boolean).join(" ");

/** The cells of a row, as exported. Section rows have a number and a name only. */
export function rowCells(r: MatrixRow): string[] {
  return [r.number, r.id, r.name, satisfiers(r), r.methods.join(", "), names(r.verifiedBy), r.status ?? ""];
}

/** Quote a field; a cell that starts like a spreadsheet formula gets a leading `'` so it is shown, not run. */
const csvField = (raw: string) => {
  const s = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function matrixToCsv(rows: readonly MatrixRow[]): string {
  return [MATRIX_COLUMNS.map(csvField).join(","), ...rows.map((r) => rowCells(r).map(csvField).join(","))].join("\r\n") + "\r\n";
}

const mdCell = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

export function matrixToMarkdown(rows: readonly MatrixRow[]): string {
  const line = (cells: readonly string[]) => `| ${cells.map(mdCell).join(" | ")} |`;
  return [line(MATRIX_COLUMNS), line(MATRIX_COLUMNS.map(() => "---")), ...rows.map((r) => line(rowCells(r)))].join("\n") + "\n";
}

/** "Satisfied by: a, b · Verified by: c" with plain words for gaps, shown under a requirement in the document view. */
export function traceLine(r: MatrixRow): string {
  const partly = r.usages && r.usages.satisfied < r.usages.total && r.satisfiedBy.length > 0;
  const list = (l: readonly MatrixLink[]) => names(l).replace(/; /g, ", ");
  const sat = !r.satisfiedBy.length ? "Not satisfied yet" : partly ? `Partly satisfied (${usagesText(r.usages!)}) by ${list(r.satisfiedBy)}` : `Satisfied by: ${list(r.satisfiedBy)}`;
  const ver = r.verifiedBy.length ? `Verified by: ${list(r.verifiedBy)}` : "Not verified yet";
  return `${sat} · ${ver}`;
}
