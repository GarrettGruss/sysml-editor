/**
 * Copy and paste of diagram nodes (D47). The clipboard holds references to elements and lines, never model text, and is
 * shared by all open diagrams. Pasting is a layout edit. No `vscode` import.
 */
import type { Element, ModelIndex } from "../model/index.js";
import type { DiagramDocument, ElementReference } from "./format.js";
import { addElement, addElements } from "./create.js";
import { canShow } from "./related.js";
import { referenceKey, resolveReference, type ResolveOptions } from "./resolve.js";

export interface ClipNode { ref: ElementReference; x?: number; y?: number }

export interface DiagramClip {
  /** The `sources` of the diagram copied from, to resolve the references (unnamed ones in particular). */
  sources: string[];
  nodes: ClipNode[];
  lines: ElementReference[];
}

const refOf = (i: ElementReference): ElementReference => (i.ref !== undefined ? { ref: i.ref } : { locator: i.locator! });

/** The clip for the selected node ids: their elements and the lines whose two ends are among them. Undefined when nothing can be copied. */
export function copyNodes(doc: DiagramDocument, ids: readonly string[]): DiagramClip | undefined {
  const chosen = doc.nodes.filter((n) => ids.includes(n.id));
  if (!chosen.length) return undefined;
  const set = new Set(chosen.map((n) => n.id));
  return {
    sources: [...doc.sources],
    nodes: chosen.map((n) => ({ ref: refOf(n), ...(n.x !== undefined && n.y !== undefined && n.parent === undefined ? { x: n.x, y: n.y } : {}) })),
    lines: doc.edges.filter((e) => set.has(e.source) && set.has(e.target)).map(refOf),
  };
}

export interface PasteResult {
  doc: DiagramDocument;
  added: number;
  /** Elements the diagram already shows. */
  already: number;
  /** Elements and lines this kind of diagram cannot show. */
  skipped: number;
  /** Elements (and lines) that no longer resolve: renamed or deleted since they were copied. */
  missing: number;
}

export const PASTE_OFFSET = 40;
const DEFAULT_W = 160, DEFAULT_H = 100;
interface Rect { x: number; y: number; w: number; h: number }
const rectOf = (n: { x?: number; y?: number; w?: number; h?: number }): Rect => ({ x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? DEFAULT_W, h: n.h ?? DEFAULT_H });
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Add nodes for the clip's elements (offset from where they were copied), skipping those drawn already, then the lines among them. */
export function pasteNodes(doc: DiagramDocument, index: ModelIndex, clip: DiagramClip, opts: ResolveOptions = {}): PasteResult {
  const drawn = new Set(doc.nodes.map((n) => referenceKey(n)));
  let already = 0;
  let skipped = 0;
  let missing = 0;
  const fresh: { el: Element; clip: ClipNode }[] = [];
  for (const c of clip.nodes) {
    const el = resolveReference(c.ref, { sources: clip.sources }, index, opts);
    if (!el) { missing++; continue; }
    if (!canShow(doc.kind, el)) { skipped++; continue; }
    if (drawn.has(referenceKey(c.ref))) { already++; continue; }
    fresh.push({ el, clip: c });
  }
  if (!fresh.length) return { doc, added: 0, already, skipped, missing };
  const r = addElements(doc, index, fresh.map((f) => f.el), opts);
  let next = r.doc;
  const placed = new Map<string, ClipNode>();
  for (const f of fresh) {
    const n = next.nodes.find((x) => referenceKey(x) === referenceKey(f.clip.ref));
    if (n && r.added.includes(n.id)) placed.set(n.id, f.clip);
  }
  // Pasted nodes go offset from their source and are pushed further until they are clear of every positioned top-level node.
  const taken: Rect[] = next.nodes.filter((n) => !placed.has(n.id) && n.parent === undefined && n.x !== undefined && n.y !== undefined).map(rectOf);
  next = {
    ...next,
    nodes: next.nodes.map((n) => {
      const c = placed.get(n.id);
      if (!(c && c.x !== undefined && c.y !== undefined && n.parent === undefined)) return n;
      const moved = { ...n, x: c.x + PASTE_OFFSET, y: c.y + PASTE_OFFSET };
      for (let i = 0; i < 100 && taken.some((t) => overlaps(rectOf(moved), t)); i++) { moved.x += PASTE_OFFSET; moved.y += PASTE_OFFSET; }
      taken.push(rectOf(moved));
      return moved;
    }),
  };
  for (const l of clip.lines) {
    const el = resolveReference(l, { sources: clip.sources }, index, opts);
    if (!el) { missing++; continue; }
    if (!canShow(next.kind, el)) { skipped++; continue; }
    // addElement draws a line only when both its ends are drawn; a line it refuses for that reason is skipped.
    const r2 = addElement(next, index, el, undefined, opts);
    if (r2.id === undefined) skipped++;
    else next = r2.doc;
  }
  const added = r.added.filter((i) => i.startsWith("n")).length;
  return { doc: next, added, already, skipped, missing };
}

