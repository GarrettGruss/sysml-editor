import type { PlanOk, PlanSource } from "./types.js";

/** A fast, well-mixed 53-bit string hash (cyrb53); not cryptographic, only for detecting changed text. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function sourceOf(uri: string, text: string): PlanSource {
  return { uri, length: text.length, hash: hashText(text) };
}

export function sourceMatches(source: PlanSource, text: string | undefined): boolean {
  return text !== undefined && text.length === source.length && hashText(text) === source.hash;
}

/** Where `isPlanCurrent` reads the present text of a document from (a model index or any lookup). */
export type TextReader = { getDocument(uri: string): { text: string } | undefined } | ((uri: string) => string | undefined);

function read(reader: TextReader, uri: string): string | undefined {
  return typeof reader === "function" ? reader(uri) : reader.getDocument(uri)?.text;
}

/** The URIs among the plan's sources whose text is no longer the one the plan was computed from. */
export function staleSources(reader: TextReader, plan: Pick<PlanOk, "sources">): string[] {
  if (!plan.sources) return [];
  return plan.sources.filter((s) => !sourceMatches(s, read(reader, s.uri))).map((s) => s.uri);
}

/**
 * Whether every document the plan read or edits still has the text the plan was computed from.
 * A plan without `sources` is never current (it cannot be verified).
 */
export function isPlanCurrent(reader: TextReader, plan: Pick<PlanOk, "sources">): boolean {
  return plan.sources !== undefined && staleSources(reader, plan).length === 0;
}
