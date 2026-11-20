/** Helpers shared by the table builders. No `vscode` import. */
import type { Element, ModelIndex } from "../../model/index.js";
import { annotationNames, DODAF_PACKAGE } from "../library.js";
import { UAF_TO_DODAF } from "../mapping.js";

/** `root` and everything it owns, depth first in source order. */
export function descendants(root: Element): Element[] {
  const out: Element[] = [];
  const seen = new Set<Element>();
  const visit = (e: Element): void => {
    if (seen.has(e)) return;
    seen.add(e);
    out.push(e);
    for (const m of e.members) visit(m);
  };
  visit(root);
  return out;
}

export function isElementLike(e: Element): boolean {
  return e.kind !== "metadata" && e.kind !== "doc" && e.kind !== "comment" && e.kind !== "import" && (e.isUsage || e.isDefinition || e.kind === "package");
}

function libraryName(index: ModelIndex, name: string, from: Element): string | undefined {
  const r = index.resolve(name, from);
  return r && r.name && r.qualifiedName === `${DODAF_PACKAGE}::${r.name}` ? r.name : undefined;
}

/** The DoDAF library names (`Capability`, ...) `el` is annotated with, in written order, without duplicates. */
export function dodafNames(index: ModelIndex, el: Element): string[] {
  const out: string[] = [];
  for (const n of annotationNames(index, el)) {
    const r = libraryName(index, n, el);
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function label(e: Element): string {
  return e.qualifiedName ?? e.name ?? e.kind;
}

export function sortByName(els: Element[]): Element[] {
  return [...els].sort((a, b) => cmp(label(a), label(b)));
}

/** Elements under `root` (including it) annotated with the DoDAF definition `name`, sorted by qualified name. */
export function annotated(index: ModelIndex, root: Element, name: string): Element[] {
  return sortByName(descendants(root).filter((e) => isElementLike(e) && dodafNames(index, e).includes(name)));
}

/** The DoDAF 2.02 term for the first DoDAF annotation of `el`, or empty. */
export function dodafKind(index: ModelIndex, el: Element): string {
  const n = dodafNames(index, el)[0];
  return n ? (UAF_TO_DODAF.find((u) => u.uaf === n)?.dodaf ?? n) : "";
}

function textOf(index: ModelIndex, e: Element): string {
  return index.getDocument(e.uri)?.text.slice(e.range.start.offset, e.range.end.offset) ?? "";
}

function unquote(v: string): string {
  const t = v.trim();
  return t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0] ? t.slice(1, -1) : t;
}

/**
 * The value of attribute `attr` written in `el`'s source (`attr = "v";` in a metadata body, or
 * `attribute attr = v;`). Values are not in the model, so this reads the text. Undefined when absent.
 */
export function attributeValue(index: ModelIndex, el: Element, attr: string): string | undefined {
  const m = new RegExp(`(?:^|[\\s{;])${attr}\\s*(?::[^=;{}]*)?=\\s*("(?:[^"\\\\]|\\\\.)*"|'[^']*'|[^;}]+)`).exec(textOf(index, el));
  return m ? unquote(m[1]!) : undefined;
}

/** The owned `@Name { ... }` metadata member of `el` for DoDAF definition `name`. */
export function metadataMember(index: ModelIndex, el: Element, name: string): Element | undefined {
  for (const m of el.members) {
    if (m.kind !== "metadata" || m.uri !== el.uri) continue;
    const t = /^(?:@|metadata\b)\s*(?:[^\s;{}:]+\s*(?::|typed\s+by)\s*)?((?:[^\s;{}:]|::)+)/.exec(textOf(index, m));
    if (t && libraryName(index, t[1]!, el) === name) return m;
  }
  return undefined;
}

export function doc(el: Element): string {
  return (el.documentation ?? "").trim();
}
