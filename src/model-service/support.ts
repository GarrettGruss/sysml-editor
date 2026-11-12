/** Pure helpers for the interactive model edits (inputs, confirmation texts, completion). `vscode`-free. */
import { referencesAfterDelete } from "../edit/delete.js";
import { nameClash } from "../edit/insert.js";
import type { SourceLocation } from "../edit/types.js";
import { isLibraryUri, type Element, type ModelIndex } from "../model/index.js";
import { ALL_KINDS, USAGE_KINDS } from "./kinds.js";

export interface KindChoice {
  kind: string;
  label: string;
}

const LABELS: Record<string, string> = { package: "Package" };
export const kindLabel = (kind: string): string => LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** Why `name` cannot be used for a new or renamed member of `owner`, or undefined when it is fine. */
export function nameProblem(name: string, owner: Element | undefined, renaming?: Element, index?: ModelIndex): string | undefined {
  if (name.trim() === "") return "Enter a name.";
  if (/[\r\n]/.test(name)) return "The name must be a single line.";
  const taken = owner?.members.find((m) => m !== renaming && m.kind !== "import" && (m.name === name || m.shortName === name));
  if (taken) return `${owner!.name ?? "The owner"} already has a member named '${name}'.`;
  // With the index, a name the owner inherits clashes too (the planner refuses it; the user sees why while typing).
  return index && owner ? nameClash(index, owner, [name], renaming) : undefined;
}

export interface DeleteImpact {
  /** Elements owned by the element, at any depth. */
  ownedMembers: number;
  /** References to it (or to what it owns) from outside it. */
  references: number;
  /** References that could not be judged. */
  unjudged: number;
  /** A few of the references, for the confirmation text. */
  locations: SourceLocation[];
}

function count(e: Element): number {
  return e.members.reduce((n, m) => n + 1 + count(m), 0);
}

export function deleteImpact(index: ModelIndex, el: Element): DeleteImpact {
  const own = el.members.filter((m) => m.kind !== "import").length ? count(el) : 0;
  let references = 0;
  let unjudged = 0;
  let locations: SourceLocation[] = [];
  try {
    const r = referencesAfterDelete(index, el);
    references = r.count;
    locations = r.locations;
    unjudged = r.unjudged ?? 0;
  } catch {
    /* the scan is a hint for the confirmation text only */
  }
  return { ownedMembers: own, references, unjudged, locations };
}

/** `file.sysml:12` for a reference location. */
export function spot(l: SourceLocation): string {
  const base = l.uri.split(/[?#]/, 1)[0]!.split("/").pop() ?? l.uri;
  let name = base;
  try {
    name = decodeURIComponent(base);
  } catch {
    /* keep the raw name */
  }
  return `${name}:${l.line + 1}`;
}

export function confirmationText(el: Element, impact: DeleteImpact): { message: string; detail: string } {
  const what = `${el.kind} '${el.name ?? "(unnamed)"}'`;
  const bits: string[] = [];
  if (impact.ownedMembers) bits.push(`It owns ${impact.ownedMembers} element${impact.ownedMembers === 1 ? "" : "s"}, which are deleted with it.`);
  if (impact.references) bits.push(`It is referenced in ${impact.references} place${impact.references === 1 ? "" : "s"} elsewhere${impact.locations.length ? ` (${impact.locations.slice(0, 3).map(spot).join(", ")}${impact.references > 3 ? ", ..." : ""})` : ""}; those references are left as they are and will no longer resolve.`);
  if (impact.unjudged) bits.push(`${impact.unjudged} other mention${impact.unjudged === 1 ? "" : "s"} of ${impact.unjudged === 1 ? "its name or a name inside it" : "these names"} (for example inside expressions) could not be checked, so ${impact.unjudged === 1 ? "it" : "they"} may also stop resolving.`);
  if (!bits.length) bits.push("Nothing else owns or references it.");
  return { message: `Delete ${what} from the model?`, detail: `${bits.join(" ")} The declaration is removed from the .sysml file and saved. Undo restores it.` };
}

/** Whether Delete from Model needs to ask (owned members or references elsewhere). */
export const needsConfirmation = (i: DeleteImpact): boolean => i.ownedMembers > 0 || i.references > 0 || i.unjudged > 0;

/** Declaration kinds of definitions that can type a usage kind (`part` is typed by `part def`). */
export function definitionKindFor(usageKind: string): string | undefined {
  const k = usageKind.replace(/^(abstract|ref|individual)\s+/, "");
  return USAGE_KINDS.includes(k) ? `${k} def` : undefined;
}

/** Qualified names of model elements that can type an element of this kind, filtered by `query`. */
export function typeCandidates(index: ModelIndex, el: Element, query: string, limit = 40): { name: string; qualifiedName: string; library: boolean }[] {
  const want = definitionKindFor(el.kind);
  if (!want) return [];
  const q = query.trim().toLowerCase();
  const out: { name: string; qualifiedName: string; library: boolean }[] = [];
  for (const uri of index.uris()) {
    const doc = index.getDocument(uri);
    if (!doc) continue;
    const walk = (e: Element) => {
      if (e.kind === want && e.qualifiedName !== undefined && e.name !== undefined && (q === "" || e.name.toLowerCase().includes(q) || e.qualifiedName.toLowerCase().includes(q))) {
        out.push({ name: e.name, qualifiedName: e.qualifiedName, library: isLibraryUri(uri) });
      }
      for (const m of e.members) walk(m);
    };
    for (const r of doc.model.roots) walk(r);
  }
  out.sort((a, b) => Number(a.library) - Number(b.library) || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}

export const ADD_KINDS: KindChoice[] = ALL_KINDS.map((kind) => ({ kind, label: kindLabel(kind) }));
