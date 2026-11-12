import { quoteName, type Element, type ModelIndex } from "../model/index.js";
import { SYSML_KEYWORDS } from "../model/keywords.js";
import { insertDecls, type EditsResult, type InsertPosition } from "./body.js";
import { checkElement, describeElement } from "./guard.js";
import { importEdits, referenceText, type ImportNeed } from "./refs.js";
import { fail, type PlanResult, type TextEdit } from "./types.js";
import { validatePlan } from "./validate.js";

/** A declaration built from parts: `part <s> 'name' : Type[0..1];`. */
export interface MemberSpec {
  /** Kind keywords, e.g. `part`, `part def`, `port`, `attribute`, `requirement`. */
  kind: string;
  name?: string;
  shortName?: string;
  /** An element (written through the reference writer, possibly adding an import) or text written as is. */
  type?: Element | string;
  /** `[0..1]`, `0..1`, `*`. */
  multiplicity?: string;
  visibility?: "public" | "private" | "protected";
}

export function normalizeMultiplicity(m: string): string | undefined {
  const t = m.trim();
  const inner = t.startsWith("[") && t.endsWith("]") ? t.slice(1, -1).trim() : t;
  if (inner === "" || /[\[\];{}]/.test(inner)) return undefined;
  return `[${inner}]`;
}

/** Edits touching the same spot are merged into one declaration list by the caller; this detects it. */
function collide(edits: readonly TextEdit[]): boolean {
  for (let i = 0; i < edits.length; i++)
    for (let j = i + 1; j < edits.length; j++) {
      const a = edits[i]!;
      const b = edits[j]!;
      if (a.uri !== b.uri) continue;
      if (a.range.start === b.range.start || (a.range.start < b.range.end && b.range.start < a.range.end)) return true;
    }
  return false;
}

/**
 * Insert `decls` into `owner`, together with the import edits the declarations need. When an
 * import goes into the same body at the same spot, both are inserted as one block.
 */
export function insertWithImports(
  index: ModelIndex,
  owner: Element,
  decls: readonly string[],
  needs: readonly ImportNeed[],
  position: InsertPosition,
): EditsResult {
  const member = insertDecls(index, owner, decls, position);
  if (!member.ok) return member;
  if (needs.length === 0) return member;
  const imports = importEdits(index, needs);
  if (!imports.ok) return imports;
  const all = [...imports.edits, ...member.edits];
  if (!collide(all)) return { ok: true, edits: all };
  const sameOwner = needs.filter((n) => n.pkg === owner);
  const others = needs.filter((n) => n.pkg !== owner);
  const merged = insertDecls(index, owner, [...new Set(sameOwner.map((n) => n.text)), ...decls], position);
  if (!merged.ok) return merged;
  const rest = importEdits(index, others);
  if (!rest.ok) return rest;
  const edits = [...rest.edits, ...merged.edits];
  return collide(edits) ? fail("The import and the new declaration could not be placed apart; nothing was changed.") : { ok: true, edits };
}

/** Build the declaration text of a spec; the type is resolved through the reference writer. */
export function buildDeclaration(
  index: ModelIndex,
  owner: Element,
  spec: MemberSpec,
): { ok: true; text: string; needs: ImportNeed[] } | { ok: false; reason: string } {
  const words = spec.kind.trim().split(/\s+/);
  if (words.length === 0 || words.some((w) => !SYSML_KEYWORDS.has(w))) return fail(`'${spec.kind}' is not a valid SysML v2 declaration kind.`);
  const isDef = words[words.length - 1] === "def";
  if (spec.type !== undefined && isDef) return fail("A definition has no type; specialization is not supported by this edit.");
  const needs: ImportNeed[] = [];
  let out = (spec.visibility ? spec.visibility + " " : "") + words.join(" ");
  if (spec.shortName !== undefined) out += ` <${quoteName(spec.shortName)}>`;
  if (spec.name !== undefined) {
    if (spec.name === "" || /[\r\n]/.test(spec.name)) return fail("The name must be a single line of text.");
    out += " " + quoteName(spec.name);
  }
  if (spec.type !== undefined) {
    let t: string;
    if (typeof spec.type === "string") t = spec.type.trim();
    else {
      const r = referenceText(index, spec.type, owner);
      if (!r.ok) return r;
      t = r.text;
      if (r.need) needs.push(r.need);
    }
    if (t === "" || /[;{}\n]/.test(t)) return fail("The type is not a valid reference.");
    out += ` : ${t}`;
  }
  if (spec.multiplicity !== undefined) {
    const m = normalizeMultiplicity(spec.multiplicity);
    if (!m) return fail(`'${spec.multiplicity}' is not a valid multiplicity.`);
    out += m;
  }
  return { ok: true, text: out + ";", needs };
}

function clash(owner: Element, names: (string | undefined)[]): string | undefined {
  for (const n of names) {
    if (n === undefined) continue;
    const other = owner.members.find((m) => m.kind !== "import" && (m.name === n || m.shortName === n));
    if (other) return n;
  }
  return undefined;
}

/**
 * Insert a new member into the body of `owner` (creating `{ ... }` when it ends with `;`).
 * `decl` is a declaration text (written as is, indented) or a structured spec.
 */
export function planInsertMember(
  index: ModelIndex,
  owner: Element,
  decl: string | MemberSpec,
  position: InsertPosition = "end",
): PlanResult {
  const c = checkElement(index, owner);
  if (!c.ok) return c;
  let text: string;
  let needs: ImportNeed[] = [];
  let label: string;
  if (typeof decl === "string") {
    text = decl.trim();
    if (text === "") return fail("The declaration is empty.");
    label = text.length > 40 ? text.slice(0, 37) + "..." : text;
  } else {
    const dup = clash(owner, [decl.name, decl.shortName]);
    if (dup !== undefined) return fail(`${describeElement(owner)} already has a member named '${dup}'.`);
    const b = buildDeclaration(index, owner, decl);
    if (!b.ok) return b;
    text = b.text;
    needs = b.needs;
    label = `${decl.kind}${decl.name !== undefined ? " " + decl.name : ""}`;
  }
  const r = insertWithImports(index, owner, [text], needs, position);
  if (!r.ok) return r;
  return validatePlan(index, { ok: true, edits: r.edits, description: `Add ${label} to ${describeElement(owner)}` });
}
