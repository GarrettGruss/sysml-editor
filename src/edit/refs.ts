import type { Element, ModelIndex } from "../model/index.js";
import { quoteName } from "../model/index.js";
import { insertDecls, type EditsResult } from "./body.js";
import { fail, type PlanFailure, type TextEdit } from "./types.js";

/** An import that must be added so that a short name resolves. */
export interface ImportNeed {
  /** The package that gets the import. */
  pkg: Element;
  /** The declaration, e.g. `private import Powertrain::Engine;`. */
  text: string;
}

export type ReferenceText = { ok: true; text: string; need?: ImportNeed } | PlanFailure;

export interface WrittenReference {
  ok: true;
  /** The text to write where the reference goes. */
  text: string;
  /** The edit that adds an import (none when the name is already visible or written in full). */
  edits: TextEdit[];
  /** The import declaration that was added, if any. */
  importText?: string;
}

const PACKAGE_KINDS = new Set(["package", "library package"]);

/** The nearest package at or above `from`. */
export function enclosingPackage(from: Element): Element | undefined {
  for (let e: Element | undefined = from; e; e = e.owner) if (PACKAGE_KINDS.has(e.kind)) return e;
  return undefined;
}

/**
 * Design D19: how to write a reference to `target` where an element in `fromOwner` needs it.
 * (1) the short (simple) name when it already resolves to the target from there; (2) otherwise
 * the short name plus a `private import` in the enclosing package; (3) when the import would
 * make a name ambiguous or hide a visible one, the fully qualified name and no import. Names are
 * quoted when needed.
 */
export function referenceText(index: ModelIndex, target: Element, fromOwner: Element): ReferenceText {
  const own = target.name ?? target.shortName;
  if (own === undefined) return fail("The referenced element has no name, so it cannot be referred to by name.");
  const simple = quoteName(own);
  const found = index.resolveAll(simple, fromOwner);
  if (found.length === 1 && found[0] === target) return { ok: true, text: simple };
  const qn = target.qualifiedName;
  if (qn === undefined) return fail(`${own} is declared inside an unnamed element and cannot be referred to from elsewhere.`);
  const pkg = enclosingPackage(fromOwner);
  // Another visible element with this name: the import would clash or be hidden.
  if (found.length === 0 && pkg && !target.visibility?.startsWith("priv")) {
    return { ok: true, text: simple, need: { pkg, text: `private import ${qn};` } };
  }
  if (index.resolve(qn, fromOwner) === target) return { ok: true, text: qn };
  const rooted = "$::" + qn;
  if (index.resolve(rooted, fromOwner) === target) return { ok: true, text: rooted };
  return { ok: true, text: qn };
}

/** The edits that add the needed imports (deduplicated), each after the package's existing imports. */
export function importEdits(index: ModelIndex, needs: readonly ImportNeed[]): EditsResult {
  const groups = new Map<Element, string[]>();
  for (const n of needs) {
    const a = groups.get(n.pkg) ?? [];
    if (!a.includes(n.text)) a.push(n.text);
    groups.set(n.pkg, a);
  }
  const edits: TextEdit[] = [];
  for (const [pkg, texts] of groups) {
    const imports = pkg.members.filter((m) => m.kind === "import");
    const r = insertDecls(index, pkg, texts, imports.length ? { after: imports[imports.length - 1]! } : "start");
    if (!r.ok) return r;
    edits.push(...r.edits);
  }
  return { ok: true, edits };
}

/** `referenceText` plus the import edit (task 1.5a). */
export function writeReference(index: ModelIndex, target: Element, fromOwner: Element): WrittenReference | PlanFailure {
  const r = referenceText(index, target, fromOwner);
  if (!r.ok) return r;
  if (!r.need) return { ok: true, text: r.text, edits: [] };
  const e = importEdits(index, [r.need]);
  if (!e.ok) return e;
  return { ok: true, text: r.text, edits: e.edits, importText: r.need.text };
}
