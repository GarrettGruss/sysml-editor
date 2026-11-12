import type { ModelNode, TestApi } from "./index.js";

/**
 * The top-level elements of every workspace file, in the Elements view. The element nodes sit below their file nodes;
 * a file node is fully described by its URI, so the roots are found without walking the (asynchronous) folder levels.
 * Library documents have no nodes and contribute nothing.
 */
export function elementRoots(api: TestApi): ModelNode[] {
  return api.model.index.uris().sort().flatMap((uri) => api.provider.getChildren({ id: uri, uri, kind: "file" }));
}
