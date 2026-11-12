/** Builds the view models of the requirements editor from the model. No `vscode`, no DOM. */
import type { Element, ModelIndex } from "../model/index.js";
import { isLibraryUri } from "../model/index.js";
import { buildDocumentModel, isAppendix, type Section, type SectionBlock } from "./document-model.js";
import type { BlockVM, DocumentVM, RelationVM, RequirementRowVM, RequirementsScope, RequirementsState, SectionVM } from "./protocol.js";
import { buildRelations, listRequirements, type RequirementInfo, type Relations } from "./queries.js";

export const statementKey = (e: Element): string => `${e.uri}#${e.range.start.offset}`;
const isPkg = (e: Element) => e.kind === "package" || e.kind === "library package";
const label = (e: Element | undefined, fallback: string) => (e ? [e.shortName, e.name].filter(Boolean).join(" ") || fallback : fallback);

export type Editable = (uri: string) => boolean;

function rowOf(i: RequirementInfo, editable: Editable): RequirementRowVM {
  const rel = (list: { statement?: Element; connection?: Element; label: string; derivedQn?: string }[]): RelationVM[] =>
    list.map((r) => ({ key: statementKey((r.statement ?? r.connection)!), label: r.label, ...(r.connection ? { connectionKey: statementKey(r.connection) } : {}), ...(r.derivedQn ? { derivedQn: r.derivedQn } : {}) }));
  return {
    qn: i.qualifiedName,
    kind: i.kind,
    id: i.shortName ?? "",
    name: i.name ?? "",
    text: i.text,
    owner: i.owner ?? "",
    satisfy: i.satisfiedBy.length,
    verify: i.verifiedBy.length,
    satisfiedBy: rel(i.satisfiedBy.map((s) => ({ statement: s.statement, label: label(s.byElement, s.by) }))),
    verifiedBy: rel(i.verifiedBy.map((v) => ({ statement: v.statement, label: v.verifier.qualifiedName ?? v.verifier.name ?? "verification" }))),
    derivedFrom: rel(i.derivedFrom.map((d) => ({ connection: d.connection, label: label(d.other, d.otherRef), derivedQn: i.qualifiedName }))),
    derives: rel(i.derives.map((d) => ({ connection: d.connection, label: label(d.other, d.otherRef), ...(d.other?.qualifiedName ? { derivedQn: d.other.qualifiedName } : {}) }))),
    editable: editable(i.uri),
  };
}

function blockVM(b: SectionBlock, editable: Editable, rel: Relations): BlockVM {
  if (b.kind === "paragraph") return { kind: "paragraph", key: statementKey(b.element), source: b.source, text: b.text, editable: editable(b.element.uri) };
  if (b.kind === "elements") return { kind: "elements", items: b.items.map((i) => ({ kind: i.kind, name: i.name })) };
  const i = b.info;
  void rel;
  return {
    kind: "item",
    qn: i.qualifiedName,
    defKind: i.kind,
    id: i.shortName ?? "",
    name: i.name ?? "",
    text: i.text,
    summary: b.summary,
    editable: editable(i.uri),
  };
}

function count(s: Section): SectionVM["contains"] {
  const c = { paragraphs: 0, requirements: 0, sections: 0, elements: 0 };
  const walk = (x: Section) => {
    for (const b of x.blocks) {
      if (b.kind === "paragraph") c.paragraphs++;
      else if (b.kind === "item") c.requirements++;
      else c.elements += b.items.length;
    }
    for (const ch of x.children) {
      c.sections++;
      walk(ch);
    }
  };
  walk(s);
  return c;
}

function sectionVM(s: Section, parent: Element, index: ModelIndex, editable: Editable, rel: Relations): SectionVM {
  // Reordering is among sibling packages of the same kind (sections, or appendices at the top level).
  const group = parent.members.filter((m) => isPkg(m) && (parent.owner === undefined && s.level === 1 ? isAppendix(index, m) === s.appendix : true));
  const at = group.findIndex((m) => m === s.element);
  return {
    qn: s.qualifiedName,
    heading: s.heading,
    level: s.level,
    number: s.number,
    appendix: s.appendix,
    blocks: s.blocks.map((b) => blockVM(b, editable, rel)),
    children: s.children.map((c) => sectionVM(c, s.element, index, editable, rel)),
    canMoveUp: at > 0,
    canMoveDown: at >= 0 && at < group.length - 1,
    contains: count(s),
    editable: editable(s.element.uri),
  };
}

export function documentVM(index: ModelIndex, root: Element, editable: Editable, rel: Relations): DocumentVM {
  const d = buildDocumentModel(index, root, rel);
  return {
    rootQn: d.qualifiedName,
    title: d.title,
    ...(d.version !== undefined ? { version: d.version } : {}),
    annotated: d.annotated,
    blocks: d.blocks.map((b) => blockVM(b, editable, rel)),
    sections: d.sections.map((s) => sectionVM(s, root, index, editable, rel)),
    appendices: d.appendices.map((s) => sectionVM(s, root, index, editable, rel)),
    toc: d.toc,
    editable: editable(root.uri),
  };
}

/** The package that is the root of the scope: the package itself, or the first package of the file. */
export function scopeRoot(index: ModelIndex, scope: RequirementsScope): Element | undefined {
  if (scope.kind === "package") return index.findByQualifiedName(scope.qualifiedName).find(isPkg);
  return index.getDocument(scope.uri)?.model.roots.find(isPkg);
}

export function scopeName(index: ModelIndex, scope: RequirementsScope): string {
  if (scope.kind === "package") return scope.qualifiedName;
  return decodeURIComponent(scope.uri.split("/").pop() ?? scope.uri);
}

export function buildState(index: ModelIndex, scope: RequirementsScope, editable: Editable = (u) => !isLibraryUri(u)): RequirementsState {
  const root = scopeRoot(index, scope);
  const name = scopeName(index, scope);
  if (scope.kind === "package" && !root) return { scopeName: name, table: { rows: [] }, problem: `The package ${name} no longer exists.` };
  const rel = buildRelations(index);
  const infos = scope.kind === "package" ? listRequirements(index, root!, rel) : listRequirements(index, scope.uri, rel);
  return {
    scopeName: name,
    ...(root?.qualifiedName ? { scopeQn: root.qualifiedName } : {}),
    table: { rows: infos.map((i) => rowOf(i, editable)) },
    ...(root ? { document: documentVM(index, root, editable, rel) } : {}),
  };
}
