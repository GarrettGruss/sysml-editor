/**
 * The requirements verification matrix (RVM), derived from the model: one row per requirement, nested and numbered by
 * ownership, with satisfied by, verification method, verified by and status. Pass/fail results are not part of it.
 * No `vscode`, no DOM.
 */
import type { Element, ModelIndex } from "../model/index.js";
import { buildRelations, type Relations } from "./queries.js";
import { isRequirement } from "./relations.js";
import { VERIFICATION_METHODS, type MatrixLink, type MatrixRow, type MatrixSummary, type MatrixVM, type MatrixStatus, type VerificationMethod } from "./matrix-shape.js";

export * from "./matrix-shape.js";

const isPkg = (e: Element) => e.kind === "package" || e.kind === "library package";
const keyOf = (e: Element): string => `${e.uri}#${e.range.start.offset}`;
const labelOf = (e: Element | undefined, fallback: string): string => (e ? [e.shortName, e.name].filter(Boolean).join(" ") || fallback : fallback);
const textOf = (index: ModelIndex, e: Element): string => index.getDocument(e.uri)?.text.slice(e.range.start.offset, e.range.end.offset) ?? "";

/**
 * The methods named by the `VerificationMethod` metadata (`@VerificationMethod { kind = VerificationMethodKind::test; }`)
 * on a verification case, or on the definition it is typed by.
 */
export function verificationMethodsOf(index: ModelIndex, verifier: Element): VerificationMethod[] {
  const out = new Set<VerificationMethod>();
  const read = (e: Element) => {
    for (const m of e.members) {
      if (m.kind !== "metadata") continue;
      const t = textOf(index, m);
      if (!/^(?:@|metadata\b)\s*(?:VerificationCases\s*::\s*)?VerificationMethod\b/.test(t)) continue;
      const body = t.slice(t.search(/\bkind\b/) >= 0 ? t.search(/\bkind\b/) : t.length);
      for (const x of body.matchAll(/\b(?:VerificationMethodKind\s*::\s*)?(inspect|analyze|demo|test)\b/g)) out.add(x[1] as VerificationMethod);
    }
  };
  read(verifier);
  for (const n of [...verifier.typeNames, ...verifier.specializes]) {
    const def = index.resolve(n, verifier.owner ?? verifier);
    if (def && def !== verifier) read(def);
  }
  return VERIFICATION_METHODS.filter((m) => out.has(m));
}

/** Build the matrix of a scope: a package (and everything nested in it) or the documents of a file. */
export function buildMatrix(index: ModelIndex, scope: Element | string, editable: (uri: string) => boolean, rel: Relations = buildRelations(index)): MatrixVM {
  // Usages of a requirement definition: satisfying a usage satisfies what the definition owns.
  const usagesOf = new Map<Element, Element[]>();
  const collect = (e: Element) => {
    if (e.kind === "requirement") {
      for (const n of e.typeNames) {
        const def = index.resolve(n, e.owner ?? e);
        if (def && isRequirement(def)) usagesOf.set(def, [...(usagesOf.get(def) ?? []), e]);
      }
    }
    e.members.forEach(collect);
  };
  for (const u of index.uris()) if (!index.isReadOnly(u)) index.getDocument(u)?.model.roots.forEach(collect);

  const ownSatisfy = (e: Element): MatrixLink[] =>
    (rel.satisfy.get(e) ?? []).filter((s) => !s.negated).map((s) => ({ label: labelOf(s.byElement, s.by), ...(s.byElement?.qualifiedName ? { qn: s.byElement.qualifiedName } : {}), statementKey: keyOf(s.statement) }));

  /** Own `satisfy` statements; when there are none, those of the owning requirement (and of usages of the owning definition), up the ownership chain. */
  const satisfyOf = (e: Element): MatrixLink[] => {
    const own = ownSatisfy(e);
    if (own.length) return own;
    const viaUsages = (usagesOf.get(e) ?? []).flatMap((u) => ownSatisfy(u).map((l): MatrixLink => ({ label: l.label, ...(l.qn ? { qn: l.qn } : {}), via: labelOf(u, u.name ?? "") })));
    if (viaUsages.length) return viaUsages;
    if (e.owner && isRequirement(e.owner)) {
      const parent = satisfyOf(e.owner);
      const via = labelOf(e.owner, e.owner.name ?? "");
      return parent.map((l): MatrixLink => ({ label: l.label, ...(l.qn ? { qn: l.qn } : {}), via: l.via ?? via }));
    }
    return [];
  };

  const rows: MatrixRow[] = [];
  const addReq = (e: Element, number: string, depth: number) => {
    const satisfiedBy = satisfyOf(e);
    const verifs = rel.verify.get(e) ?? [];
    const methods = new Set<VerificationMethod>();
    const seen = new Set<Element>();
    const verifiedBy: MatrixLink[] = [];
    for (const v of verifs) {
      verificationMethodsOf(index, v.verifier).forEach((m) => methods.add(m));
      if (seen.has(v.verifier)) continue;
      seen.add(v.verifier);
      verifiedBy.push({ label: v.verifier.name ?? v.verifier.qualifiedName ?? "verification", ...(v.verifier.qualifiedName ? { qn: v.verifier.qualifiedName } : {}), statementKey: keyOf(v.statement) });
    }
    rows.push({
      kind: "requirement",
      number,
      depth,
      qn: e.qualifiedName ?? e.name ?? "",
      id: e.shortName ?? "",
      name: e.name ?? "",
      satisfiedBy,
      methods: VERIFICATION_METHODS.filter((m) => methods.has(m)),
      verifiedBy,
      status: satisfiedBy.length === 0 ? "not satisfied" : verifiedBy.length === 0 ? "no verification" : "covered",
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
  return { total: reqs.length, covered, noVerification: count("no verification"), notSatisfied: count("not satisfied"), percentCovered: reqs.length === 0 ? 0 : Math.round((covered / reqs.length) * 100) };
}

// ------------------------------------------------------------------ export and the trace line

export const MATRIX_COLUMNS = ["Number", "Id", "Name", "Satisfied by", "Verification method", "Verified by", "Status"] as const;

const names = (l: readonly MatrixLink[]) => l.map((x) => (x.via ? `${x.label} (via ${x.via})` : x.label)).join("; ");

/** The cells of a row, as exported. Section rows have a number and a name only. */
export function rowCells(r: MatrixRow): string[] {
  return [r.number, r.id, r.name, names(r.satisfiedBy), r.methods.join(", "), names(r.verifiedBy), r.status ?? ""];
}

const csvField = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

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
  const sat = r.satisfiedBy.length ? `Satisfied by: ${names(r.satisfiedBy).replace(/; /g, ", ")}` : "Not satisfied yet";
  const ver = r.verifiedBy.length ? `Verified by: ${r.verifiedBy.map((x) => x.label).join(", ")}` : "Not verified yet";
  return `${sat} · ${ver}`;
}
