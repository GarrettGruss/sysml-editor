import { quoteName, type Element, type ModelIndex } from "../model/index.js";
import { serializeDiagram, type DiagramDocument, type ElementLocator } from "../diagram/format.js";
import { checkElement, describeElement } from "./guard.js";
import { scanReferences } from "./refscan.js";
import { fail, type DiagramUpdate, type PlanResult, type TextEdit, type UnjudgedReferences } from "./types.js";
import { validatePlan } from "./validate.js";

/** A loaded diagram document whose references a rename keeps in step. */
export interface LoadedDiagram {
  uri: string;
  doc: DiagramDocument;
}

function norm(s: string): string {
  return s.replace(/\s+/g, "");
}

/** Siblings that would collide with a new name (members of every declaration of the owner, or other roots). */
function collides(index: ModelIndex, el: Element, name: string): Element | undefined {
  const quoted = quoteName(name);
  const sameName = (x: Element) => x !== el && x.kind !== "import" && x.kind !== "expose" && (x.name === name || x.shortName === name);
  if (el.owner) {
    const owners = el.owner.qualifiedName !== undefined ? index.findByQualifiedName(el.owner.qualifiedName) : [el.owner];
    for (const o of owners.includes(el.owner) ? owners : [el.owner]) {
      const hit = o.members.find(sameName);
      if (hit) return hit;
    }
    return undefined;
  }
  const doc = index.getDocument(el.uri);
  const local = doc?.model.roots.find(sameName);
  if (local) return local;
  return index.findByQualifiedName(quoted).find((x) => x !== el && !x.owner);
}

function mapQn(old: string, next: string, s: string): string {
  return s === old ? next : s.startsWith(old + "::") ? next + s.slice(old.length) : s;
}

function namedOwnerQn(e: Element): string | undefined {
  for (let o = e.owner; o; o = o.owner) if (o.qualifiedName !== undefined) return o.qualifiedName;
  return undefined;
}

/**
 * Rewrite `ref`, `locator.owner`, `locator.ends` and `root` that name the renamed element or
 * start with its qualified name. Returns canonical texts, only for diagrams that changed.
 */
function updateDiagrams(
  diagrams: readonly LoadedDiagram[],
  oldQn: string,
  newQn: string,
  endsChanges: { ownerQn: string | undefined; kind: string; oldEnds: string[]; newEnds: string[] }[],
): DiagramUpdate[] {
  const out: DiagramUpdate[] = [];
  for (const { uri, doc } of diagrams) {
    let changed = false;
    const fix = (s: string) => {
      const n = mapQn(oldQn, newQn, s);
      if (n !== s) changed = true;
      return n;
    };
    const fixRef = <T extends { ref?: string; locator?: ElementLocator }>(item: T): T => {
      const copy: T = { ...item };
      if (copy.ref !== undefined) copy.ref = fix(copy.ref);
      if (copy.locator) {
        const l: ElementLocator = { ...copy.locator, ends: [...copy.locator.ends] };
        for (const c of endsChanges) {
          if (c.kind === l.kind && c.ownerQn === l.owner && c.oldEnds.map(norm).join("\0") === l.ends.map(norm).join("\0")) {
            l.ends = [...c.newEnds];
            changed = true;
            break;
          }
        }
        l.owner = fix(l.owner);
        copy.locator = l;
      }
      return copy;
    };
    const next: DiagramDocument = {
      ...doc,
      root: fix(doc.root),
      nodes: doc.nodes.map(fixRef),
      edges: doc.edges.map(fixRef),
    };
    if (changed) out.push({ uri, text: serializeDiagram(next) });
  }
  return out;
}

export interface RenameOptions {
  /** Loaded diagram documents to keep in step (their new texts come back in `diagramUpdates`). */
  diagrams?: readonly LoadedDiagram[];
}

/**
 * Rename an element: its name token and every reference to it that resolves to it in the
 * workspace (qualified references only change the matching segment; short-name references are
 * left alone), with names quoted as needed. The result lists references that could not be
 * judged (`unjudged`) and, with `diagrams`, the new texts of the diagram files.
 */
export function planRename(index: ModelIndex, element: Element, newName: string, opts: RenameOptions = {}): PlanResult {
  const c = checkElement(index, element);
  if (!c.ok) return c;
  if (element.name === undefined || !element.nameRange) return fail(`${describeElement(element)} has no name to change.`);
  if (newName === "" || /[\r\n]/.test(newName)) return fail("The new name must be a single line of text and not empty.");
  if (newName === element.name) return fail(`The element is already named '${newName}'.`);
  const clash = collides(index, element, newName);
  if (clash) return fail(`Cannot rename to '${newName}': ${element.owner ? describeElement(element.owner) : "this scope"} already has a member with that name (${clash.uri.split("/").pop()}:${clash.range.start.line + 1}).`);
  const quoted = quoteName(newName);

  const scan = scanReferences(index, element);
  // A new name that is already visible from a referencing scope would shadow or clash there.
  for (const scope of scan.firstSegScopes) {
    const other = index.resolveAll(quoted, scope).find((x) => x !== element);
    if (other) {
      return fail(`Cannot rename to '${newName}': it would clash with ${describeElement(other)} where ${element.name} is referenced (${scope.uri.split("/").pop()}:${scope.range.start.line + 1}).`);
    }
  }

  const edits = new Map<string, TextEdit>();
  const put = (uri: string, start: number, end: number) => edits.set(`${uri}\0${start}`, { uri, range: { start, end }, newText: quoted });
  put(element.uri, element.nameRange.start.offset, element.nameRange.end.offset);
  for (const r of scan.replacements) put(r.uri, r.tok.start, r.tok.end);

  const unjudged: UnjudgedReferences = { count: scan.unjudged.length, locations: scan.unjudged.slice(0, 5), skippedDocuments: scan.skippedDocuments };
  const plan: PlanResult = {
    ok: true,
    edits: [...edits.values()],
    description: `Rename ${describeElement(element)} to ${quoted} (${scan.replacements.length} reference${scan.replacements.length === 1 ? "" : "s"} updated)`,
  };
  if (unjudged.count > 0 || unjudged.skippedDocuments.length > 0) plan.unjudged = unjudged;

  if (opts.diagrams?.length && element.qualifiedName !== undefined) {
    const oldQn = element.qualifiedName;
    const newQn = (element.owner ? element.owner.qualifiedName + "::" : "") + quoted;
    const endsChanges = scan.endsChanges.map((ch) => ({
      ownerQn: namedOwnerQn(ch.holder),
      kind: ch.holder.kind,
      oldEnds: [...ch.holder.ends],
      newEnds: ch.holder.ends.map((end) => (end === ch.oldText ? ch.tokens.map((t) => (ch.replaced.has(t.start) ? quoted : t.text)).join("") : end)),
    }));
    const updates = updateDiagrams(opts.diagrams, oldQn, newQn, endsChanges);
    if (updates.length) plan.diagramUpdates = updates;
  }
  return validatePlan(index, plan);
}

