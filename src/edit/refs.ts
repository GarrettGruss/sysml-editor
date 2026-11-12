import type { Element, ModelIndex } from "../model/index.js";
import { quoteName } from "../model/index.js";
import { insertDecls, type EditsResult } from "./body.js";
import { fail, type PlanFailure, type TextEdit } from "./types.js";
import { checkResolutionPreserved } from "./validate.js";

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

const HIDDEN = new Set(["private", "protected"]);

function isInside(e: Element, ancestor: Element): boolean {
  for (let x: Element | undefined = e; x; x = x.owner) if (x === ancestor) return true;
  return false;
}

/**
 * Whether `target` may be named from `from` through an import or a qualified name: no element on
 * its way up (itself, or a namespace it sits in) is `private` or `protected` to a scope that does
 * not contain `from`.
 */
function accessibleFrom(target: Element, from: Element): boolean {
  for (let e: Element | undefined = target; e?.owner; e = e.owner) {
    if (e.visibility && HIDDEN.has(e.visibility) && !isInside(from, e.owner)) return false;
  }
  return true;
}

function sameImport(imp: Element, qn: string): boolean {
  return imp.kind === "import" && !!imp.importInfo && !imp.importInfo.wildcard && imp.importInfo.target.replace(/\s+/g, "") === qn.replace(/\s+/g, "");
}

/**
 * Design D19: how to write a reference to `target` where an element in `fromOwner` needs it.
 * (1) the short (simple) name when it already resolves to the target from there; (2) otherwise
 * the short name plus a `private import` in the enclosing package, unless the target is not
 * accessible, or the import would change what any existing name in that package resolves to (the
 * resolution-preserved check); (3) otherwise the fully qualified name and no import, when it
 * resolves from there; a reference that cannot be written is refused with a reason. An import that
 * already exists is reused whatever its visibility, and never added twice. Names are quoted when needed.
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
  const accessible = accessibleFrom(target, fromOwner);
  const existing = pkg?.members.some((m) => sameImport(m, qn)) ?? false;
  const viaQualified = (): ReferenceText => {
    if (index.resolve(qn, fromOwner) === target) return { ok: true, text: qn };
    const rooted = "$::" + qn;
    if (index.resolve(rooted, fromOwner) === target) return { ok: true, text: rooted };
    return fail(accessible ? `${qn} cannot be referred to from ${fromOwner.qualifiedName ?? fromOwner.name ?? fromOwner.kind}.` : `${qn} is private or protected, or sits in a private namespace, so it cannot be referred to from ${fromOwner.qualifiedName ?? fromOwner.name ?? fromOwner.kind}.`);
  };
  // Another visible element with this name: the import would clash or be hidden.
  if (found.length === 0 && pkg && accessible && !existing) {
    const need: ImportNeed = { pkg, text: `private import ${qn};` };
    const e = importEdits(index, [need]);
    if (e.ok) {
      const checked = checkResolutionPreserved(index, { ok: true, edits: e.edits, description: "import" }, { within: pkg });
      if (checked.ok) return { ok: true, text: simple, need };
    }
  }
  return viaQualified();
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
