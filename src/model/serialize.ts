import type { DocumentModel, Element } from "./types.js";

/** An element without the `owner` back-reference, so the model is a plain tree. */
export type SerializedElement = Omit<Element, "owner" | "members"> & { members: SerializedElement[] };
export interface SerializedModel {
  uri: string;
  roots: SerializedElement[];
}

/** A copy of `model` without owner links (cheap to send to another thread, no cycles). */
export function serializeModel(model: DocumentModel): SerializedModel {
  const el = (e: Element): SerializedElement => {
    const { owner: _owner, members, ...rest } = e;
    return { ...rest, members: members.map(el) };
  };
  return { uri: model.uri, roots: model.roots.map(el) };
}

/** Rebuilds the owner links of a serialized model; the result equals the original model. */
export function deserializeModel(s: SerializedModel): DocumentModel {
  const el = (x: SerializedElement, owner: Element | undefined): Element => {
    const out = { ...x, owner, members: [] as Element[] };
    for (const m of x.members) out.members.push(el(m, out));
    return out;
  };
  return { uri: s.uri, roots: s.roots.map((r) => el(r, undefined)) };
}
