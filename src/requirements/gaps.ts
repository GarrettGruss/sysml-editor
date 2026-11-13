/**
 * The gaps of the document view: the places a new or moved requirement or section can land. Pure functions over the
 * view model (no `vscode`, no DOM), shared by the webview (which draws and opens them) and the unit tests.
 * Order is document order: a requirement's gaps for its own children come before the gap that follows it.
 */
import type { BlockVM, DocumentVM, ItemVM, SectionVM } from "./protocol.js";

export interface Gap {
  /** Unique and stable for a given model: `<target>|<owner>|<before or end>`. */
  key: string;
  /** What can land here: a requirement (in a package, section or requirement), or a section (in a package). */
  target: "requirement" | "section";
  ownerQn: string;
  ownerKind: "package" | "requirement";
  /** Insert above this member of the owner; undefined: at the end. */
  beforeQn?: string;
  /** Nesting level of the owner (0 is the document root); gaps at a deeper level are indented. */
  level: number;
}

const gapKey = (target: Gap["target"], owner: string, before?: string): string => `${target}|${owner}|${before ?? "end"}`;

const itemsOf = (blocks: BlockVM[]): ItemVM[] => blocks.filter((b): b is ItemVM => b.kind === "item");

/** All gaps of a document, in document order. */
export function gapsOf(doc: DocumentVM): Gap[] {
  const out: Gap[] = [];
  const reqGaps = (items: ItemVM[], ownerQn: string, ownerKind: Gap["ownerKind"], level: number) => {
    for (const it of items) {
      out.push({ key: gapKey("requirement", ownerQn, it.qn), target: "requirement", ownerQn, ownerKind, beforeQn: it.qn, level });
      reqGaps(it.children, it.qn, "requirement", level + 1);
    }
    out.push({ key: gapKey("requirement", ownerQn, undefined), target: "requirement", ownerQn, ownerKind, level });
  };
  const secGaps = (sections: SectionVM[], ownerQn: string, level: number) => {
    for (const s of sections) {
      out.push({ key: gapKey("section", ownerQn, s.qn), target: "section", ownerQn, ownerKind: "package", beforeQn: s.qn, level });
      reqGaps(itemsOf(s.blocks), s.qn, "package", s.level);
      secGaps(s.children, s.qn, s.level);
    }
    out.push({ key: gapKey("section", ownerQn, undefined), target: "section", ownerQn, ownerKind: "package", level });
  };
  reqGaps(itemsOf(doc.blocks), doc.rootQn, doc.rootKind, 0);
  if (doc.rootKind === "package") secGaps(doc.sections, doc.rootQn, 0);
  return out;
}

export type GhostMode = "requirement" | "child" | "package";

/** The qualified names of a requirement and everything it owns. */
export function subtreeOf(doc: DocumentVM, qn: string): Set<string> {
  const out = new Set<string>();
  const find = (items: ItemVM[]): ItemVM | undefined => {
    for (const it of items) {
      if (it.qn === qn) return it;
      const f = find(it.children);
      if (f) return f;
    }
    return undefined;
  };
  const all = (sections: SectionVM[]): ItemVM | undefined => {
    for (const s of sections) {
      const f = find(itemsOf(s.blocks)) ?? all(s.children);
      if (f) return f;
    }
    return undefined;
  };
  const it = find(itemsOf(doc.blocks)) ?? all(doc.sections);
  const walk = (x: ItemVM) => {
    out.add(x.qn);
    x.children.forEach(walk);
  };
  if (it) walk(it);
  return out;
}

/** The gaps a new item of this kind may use: a package only between sections, a child requirement only inside a requirement. */
export function allowedForNew(gaps: Gap[], mode: GhostMode): Gap[] {
  if (mode === "package") return gaps.filter((g) => g.target === "section");
  return gaps.filter((g) => g.target === "requirement" && (mode === "requirement" || g.ownerKind === "requirement"));
}

/** The gaps a dragged requirement may drop into: not inside itself, and not where it already is. */
export function allowedForMove(doc: DocumentVM, gaps: Gap[], qn: string): Gap[] {
  const inside = subtreeOf(doc, qn);
  const reqGaps = gaps.filter((g) => g.target === "requirement");
  const at = reqGaps.findIndex((g) => g.beforeQn === qn);
  const nextSibling = at < 0 ? undefined : reqGaps.slice(at + 1).find((g) => g.ownerQn === reqGaps[at]!.ownerQn);
  return reqGaps.filter((g) => !inside.has(g.ownerQn) && g.beforeQn !== qn && g !== nextSibling);
}
