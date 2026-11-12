import { quoteName, splitQualified, type Element, type ModelIndex } from "../model/index.js";
import { parseDiagram, serializeDiagram, type DiagramDocument, type ElementLocator } from "../diagram/format.js";
import { sourceOf } from "./hash.js";
import { checkElement, describeElement } from "./guard.js";
import { scanReferences, type Snapshot } from "./refscan.js";
import { fail, type DiagramUpdate, type PlanFailure, type PlanOk, type PlanResult, type PlanSource, type TextEdit, type UnjudgedReferences } from "./types.js";
import { checkResolutionPreserved, validatePlan } from "./validate.js";

/** A diagram file whose references a rename keeps in step. */
export interface LoadedDiagram {
  uri: string;
  /** The parsed document; undefined when the file could not be parsed (it is reported as skipped). */
  doc?: DiagramDocument;
  /** The file text `doc` was read from (recorded in the plan's sources so a changed file makes it stale). */
  text?: string;
}

/** Qualified names compare by their unquoted segments: `'A'::x` equals `A::x`. */
function segKey(s: string): string {
  return splitQualified(s).join("\0");
}

const joinQn = (segs: readonly string[]) => segs.map(quoteName).join("::");

/** Siblings that would collide with a new name (members of every declaration of the owner, or other roots). */
function collides(index: ModelIndex, el: Element, decls: readonly Element[], name: string): Element | undefined {
  const quoted = quoteName(name);
  const sameName = (x: Element) => !decls.includes(x) && x.kind !== "import" && x.kind !== "expose" && (x.name === name || x.shortName === name);
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
  return index.findByQualifiedName(quoted).find((x) => !decls.includes(x) && !x.owner);
}

/** `s` with the prefix `old` (unquoted segments) replaced by `next`; undefined when `s` does not start with it. */
function mapQn(old: readonly string[], next: readonly string[], s: string): string | undefined {
  const segs = splitQualified(s);
  if (segs.length < old.length || !old.every((o, i) => segs[i] === o)) return undefined;
  return joinQn([...next, ...segs.slice(old.length)]);
}

function namedOwnerQn(e: Element): string | undefined {
  for (let o = e.owner; o; o = o.owner) if (o.qualifiedName !== undefined) return o.qualifiedName;
  return undefined;
}

/**
 * Rewrite `ref`, `locator.owner`, `locator.ends` and `root` that name the renamed element or
 * start with its qualified name (compared by unquoted segments). Returns canonical texts, only
 * for diagrams that changed; every returned text is parsed back as validation.
 */
function updateDiagrams(
  diagrams: readonly LoadedDiagram[],
  oldSegs: readonly string[],
  newSegs: readonly string[],
  endsChanges: { ownerQn: string | undefined; kind: string; oldEnds: string[]; newEnds: string[] }[],
): { updates: DiagramUpdate[]; sources: PlanSource[] } | PlanFailure {
  const updates: DiagramUpdate[] = [];
  const sources: PlanSource[] = [];
  for (const { uri, doc, text: original } of diagrams) {
    if (!doc) continue;
    let changed = false;
    const fix = (s: string) => {
      const n = mapQn(oldSegs, newSegs, s);
      if (n === undefined) return s;
      changed = true;
      return n;
    };
    const fixRef = <T extends { ref?: string; locator?: ElementLocator }>(item: T): T => {
      const copy: T = { ...item };
      if (copy.ref !== undefined) copy.ref = fix(copy.ref);
      if (copy.locator) {
        const l: ElementLocator = { ...copy.locator, ends: [...copy.locator.ends] };
        for (const c of endsChanges) {
          if (c.kind === l.kind && c.ownerQn !== undefined && segKey(c.ownerQn) === segKey(l.owner) && c.oldEnds.map(segKey).join("\u0001") === l.ends.map(segKey).join("\u0001")) {
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
    if (!changed) continue;
    const text = serializeDiagram(next);
    const check = parseDiagram(text);
    if (!check.ok) return fail(`The updated diagram ${uri.split("/").pop()} would not be valid (${check.problems[0]?.message ?? "unknown problem"}); nothing was changed.`);
    updates.push({ uri, text });
    if (original !== undefined) sources.push(sourceOf(uri, original));
  }
  return { updates, sources };
}

export interface RenameOptions {
  /** Diagram files to keep in step (their new texts come back in `diagramUpdates`); ones without a parsed `doc` are listed in `skippedDiagrams`. */
  diagrams?: readonly LoadedDiagram[];
}

/**
 * Rename an element: its name token and every reference to it that resolves to it in the
 * workspace (qualified references only change the matching segment; short-name references are
 * left alone), with names quoted as needed. A namespace declared in several files is renamed in
 * all of them. The plan is checked against the model: refused when any other reference would
 * resolve to something else afterwards (for example by being captured by the new name). The result
 * lists references that could not be judged (`unjudged`) and, with `diagrams`, the new texts of
 * the diagram files.
 */
export function planRename(index: ModelIndex, element: Element, newName: string, opts: RenameOptions = {}): PlanResult {
  const c = checkElement(index, element);
  if (!c.ok) return c;
  if (element.name === undefined || !element.nameRange) return fail(`${describeElement(element)} has no name to change.`);
  if (newName === "" || /[\r\n]/.test(newName)) return fail("The new name must be a single line of text and not empty.");
  if (newName === element.name) return fail(`The element is already named '${newName}'.`);
  const all = element.qualifiedName !== undefined ? index.findByQualifiedName(element.qualifiedName) : [];
  const decls = all.length > 1 && all.includes(element) ? [...all] : [element];
  for (const d of decls) {
    if (d === element) continue;
    const dc = checkElement(index, d);
    if (!dc.ok) return dc;
    if (!d.nameRange) return fail(`${describeElement(d)} has no name to change.`);
  }
  const clash = collides(index, element, decls, newName);
  if (clash) return fail(`Cannot rename to '${newName}': ${element.owner ? describeElement(element.owner) : "this scope"} already has a member with that name (${clash.uri.split("/").pop()}:${clash.range.start.line + 1}).`);
  const quoted = quoteName(newName);

  const snapshot: Snapshot = new Map();
  const scan = scanReferences(index, decls, { snapshot });
  const edits = new Map<string, TextEdit>();
  const put = (uri: string, start: number, end: number) => edits.set(`${uri}\0${start}`, { uri, range: { start, end }, newText: quoted });
  for (const d of decls) put(d.uri, d.nameRange!.start.offset, d.nameRange!.end.offset);
  for (const r of scan.replacements) put(r.uri, r.tok.start, r.tok.end);

  const unjudged: UnjudgedReferences = { count: scan.unjudged.length, locations: scan.unjudged.slice(0, 5), skippedDocuments: scan.skippedDocuments };
  const nDecl = decls.length > 1 ? ` in ${decls.length} declarations` : "";
  const plan: PlanOk = {
    ok: true,
    edits: [...edits.values()],
    description: `Rename ${describeElement(element)} to ${quoted}${nDecl} (${scan.replacements.length} reference${scan.replacements.length === 1 ? "" : "s"} updated)`,
    reads: index.uris().filter((u) => !index.isReadOnly(u)),
  };
  if (unjudged.count > 0 || unjudged.skippedDocuments.length > 0) plan.unjudged = unjudged;

  if (opts.diagrams?.length) {
    const skipped = opts.diagrams.filter((d) => !d.doc).map((d) => d.uri);
    if (skipped.length) plan.skippedDiagrams = skipped;
    if (element.qualifiedName !== undefined) {
      const oldSegs = splitQualified(element.qualifiedName);
      const newSegs = [...oldSegs.slice(0, -1), newName];
      const endsChanges = scan.endsChanges.map((ch) => ({
        ownerQn: namedOwnerQn(ch.holder),
        kind: ch.holder.kind,
        oldEnds: [...ch.holder.ends],
        newEnds: ch.holder.ends.map((end) => (end === ch.oldText ? ch.tokens.map((t) => (ch.replaced.has(t.start) ? quoted : t.text)).join("") : end)),
      }));
      const upd = updateDiagrams(opts.diagrams, oldSegs, newSegs, endsChanges);
      if ("ok" in upd) return upd;
      if (upd.updates.length) {
        plan.diagramUpdates = upd.updates;
        plan.sources = upd.sources;
      }
    }
  }
  const valid = validatePlan(index, plan);
  return checkResolutionPreserved(index, valid, { before: snapshot });
}
