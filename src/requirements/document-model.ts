/**
 * The document view of a package: a projection computed from the model, never stored. No `vscode`, no DOM.
 * Mapping (design D14): root package -> document; nested package -> section; `doc` / `comment` -> paragraphs;
 * requirements -> items; other elements -> a compact model-elements listing; `@DocumentRoot` gives title and version;
 * packages annotated `@Appendix` render after all sections. Numbers and the table of contents are computed here.
 */
import type { Element, ModelIndex } from "../model/index.js";
import { unescapeTerminator } from "../edit/comment.js";
import { buildRelations, describeRequirement, type Relations, type RequirementInfo } from "./queries.js";
import { derivationOf, isRequirement } from "./relations.js";

const isPackage = (e: Element) => e.kind === "package" || e.kind === "library package";

export interface Paragraph {
  kind: "paragraph";
  /** `doc` or `comment`. */
  source: "doc" | "comment";
  text: string;
  element: Element;
}
export interface RequirementItem {
  kind: "item";
  info: RequirementInfo;
  /** Computed from nesting and order (`2`, `2.1`), never stored. */
  number: string;
  /** The requirements this one owns, in order (any depth). */
  children: RequirementItem[];
  /** Short relationship summary: names as written. */
  summary: { satisfiedBy: string[]; verifiedBy: string[]; derivedFrom: string[]; derives: string[] };
}
export interface ModelElementsListing {
  kind: "elements";
  items: { kind: string; name: string; qualifiedName?: string; element: Element }[];
}
export type SectionBlock = Paragraph | RequirementItem | ModelElementsListing;

export interface Section {
  qualifiedName: string;
  heading: string;
  /** 1 for the sections directly under the root. */
  level: number;
  /** `1`, `1.2`, or `A` / `A.1` for appendices. */
  number: string;
  appendix: boolean;
  element: Element;
  blocks: SectionBlock[];
  children: Section[];
}

export interface TocEntry {
  /** A section (package) or a requirement heading. */
  kind: "section" | "requirement";
  qualifiedName: string;
  number: string;
  heading: string;
  level: number;
  appendix: boolean;
}

export interface DocumentModel {
  qualifiedName: string;
  uri: string;
  title: string;
  version?: string;
  /** True when a `@DocumentRoot` annotation supplied the title. */
  annotated: boolean;
  root: Element;
  /** Paragraphs, items and model elements of the root package itself (before the first section). */
  blocks: SectionBlock[];
  sections: Section[];
  appendices: Section[];
  toc: TocEntry[];
}

const unquoteString = (s: string): string => s.replace(/\\(.)/g, (_m, c: string) => (c === "n" ? "\n" : c));

/** The metadata annotations of a package as written: `@Name { attr = "value"; }`. */
export function annotationsOf(index: ModelIndex, pkg: Element): { name: string; values: Map<string, string> }[] {
  const text = index.getDocument(pkg.uri)?.text ?? "";
  const out: { name: string; values: Map<string, string> }[] = [];
  for (const m of pkg.members) {
    if (m.kind !== "metadata") continue;
    const src = text.slice(m.range.start.offset, m.range.end.offset);
    const nm = /^@\s*([A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*)/.exec(src);
    if (!nm) continue;
    const values = new Map<string, string>();
    for (const v of src.matchAll(/([A-Za-z_]\w*)\s*=\s*"((?:[^"\\]|\\.)*)"/g)) values.set(v[1]!, unquoteString(v[2]!));
    out.push({ name: nm[1]!.replace(/\s+/g, "").split("::").pop()!, values });
  }
  return out;
}

export const isAppendix = (index: ModelIndex, pkg: Element): boolean => annotationsOf(index, pkg).some((a) => a.name === "Appendix");

const EXCLUDED_FROM_LISTING = new Set(["import", "expose", "metadata", "comment", "doc", "satisfy", "verify"]);

/** The requirement items owned by `owner`, numbered from `prefix` (`2` gives `2.1`, `2.2`) or, with no prefix, from `first`. */
function itemsOf(owner: Element, rel: Relations, prefix: string, first: number): RequirementItem[] {
  const out: RequirementItem[] = [];
  for (const m of owner.members) {
    if (!isRequirement(m)) continue;
    const number = prefix === "" ? String(first + out.length) : `${prefix}.${first + out.length}`;
    const info = describeRequirement(m, rel);
    const label = (e: Element | undefined, fallback: string) => (e ? [e.shortName, e.name].filter(Boolean).join(" ") || fallback : fallback);
    out.push({
      kind: "item",
      info,
      number,
      children: itemsOf(m, rel, number, 1),
      summary: {
        satisfiedBy: info.satisfiedBy.map((x) => label(x.byElement, x.by)),
        verifiedBy: info.verifiedBy.map((v) => v.verifier.name ?? "verification"),
        derivedFrom: info.derivedFrom.map((d) => label(d.other, d.otherRef)),
        derives: info.derives.map((d) => label(d.other, d.otherRef)),
      },
    });
  }
  return out;
}

function blocksOf(index: ModelIndex, pkg: Element, rel: Relations, prefix: string, offset: number): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  const listing: ModelElementsListing = { kind: "elements", items: [] };
  let items: RequirementItem[] | undefined;
  let queue: RequirementItem[] = [];
  for (const m of pkg.members) {
    if (m.kind === "doc" || m.kind === "comment") {
      blocks.push({ kind: "paragraph", source: m.kind, text: unescapeTerminator(m.documentation ?? ""), element: m });
    } else if (isRequirement(m)) {
      if (!items) {
        items = itemsOf(pkg, rel, prefix, offset + 1);
        queue = items.slice();
      }
      blocks.push(queue.shift()!);
    } else if (isPackage(m) || EXCLUDED_FROM_LISTING.has(m.kind) || derivationOf(index, m)) continue;
    else listing.items.push({ kind: m.kind, name: m.name ?? m.shortName ?? "(unnamed)", ...(m.qualifiedName !== undefined ? { qualifiedName: m.qualifiedName } : {}), element: m });
  }
  if (listing.items.length) blocks.push(listing);
  return blocks;
}

function sectionOf(index: ModelIndex, pkg: Element, level: number, number: string, appendix: boolean, rel: Relations): Section {
  const children = pkg.members.filter((m) => isPackage(m) && !(level === 0 && isAppendix(index, m)));
  return {
    qualifiedName: pkg.qualifiedName ?? pkg.name ?? "",
    heading: pkg.name ?? pkg.shortName ?? "(unnamed)",
    level,
    number,
    appendix,
    element: pkg,
    blocks: blocksOf(index, pkg, rel, number, children.length),
    children: children.map((c, i) => sectionOf(index, c, level + 1, `${number}.${i + 1}`, appendix, rel)),
  };
}

const letter = (i: number): string => {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
};

export function buildDocumentModel(index: ModelIndex, root: Element, rel: Relations = buildRelations(index)): DocumentModel {
  const ann = annotationsOf(index, root).find((a) => a.name === "DocumentRoot");
  const title = ann?.values.get("title") ?? root.name ?? "Untitled";
  const version = ann?.values.get("version");
  const nested = root.members.filter(isPackage);
  const sections = nested.filter((p) => !isAppendix(index, p)).map((p, i) => sectionOf(index, p, 1, String(i + 1), false, rel));
  const appendices = nested.filter((p) => isAppendix(index, p)).map((p, i) => sectionOf(index, p, 1, letter(i), true, rel));
  const toc: TocEntry[] = [];
  const addItems = (list: SectionBlock[], level: number) => {
    const walk = (it: RequirementItem, l: number) => {
      toc.push({ kind: "requirement", qualifiedName: it.info.qualifiedName, number: it.number, heading: [it.info.shortName, it.info.name].filter(Boolean).join(" : ") || it.info.qualifiedName, level: l, appendix: false });
      it.children.forEach((c) => walk(c, l + 1));
    };
    for (const b of list) if (b.kind === "item") walk(b, level);
  };
  const add = (s: Section) => {
    toc.push({ kind: "section", qualifiedName: s.qualifiedName, number: s.number, heading: s.heading, level: s.level, appendix: s.appendix });
    addItems(s.blocks, s.level + 1);
    s.children.forEach(add);
  };
  const rootBlocks = blocksOf(index, root, rel, "", nested.filter((p) => !isAppendix(index, p)).length);
  addItems(rootBlocks, 1);
  [...sections, ...appendices].forEach(add);
  return {
    qualifiedName: root.qualifiedName ?? root.name ?? "",
    uri: root.uri,
    title,
    ...(version !== undefined ? { version } : {}),
    annotated: !!ann?.values.has("title"),
    root,
    blocks: rootBlocks,
    sections,
    appendices,
    toc,
  };
}

/** The label of a section in the table of contents and in headings: `3.1 Heading`, `Appendix A Glossary`. */
export const sectionLabel = (s: Pick<Section, "number" | "heading" | "appendix" | "level">): string =>
  s.appendix && !s.number.includes(".") ? `Appendix ${s.number} ${s.heading}` : `${s.number} ${s.heading}`;
