import type { ModelNode, TestApi } from "./index.js";

/**
 * The top-level elements of every workspace file, in the Elements view, found the way a user reaches them:
 * from the tree roots through the folder nodes to the file nodes, then the elements below each file.
 * Library documents have no nodes and contribute nothing.
 */
export async function elementRoots(api: TestApi): Promise<ModelNode[]> {
  const out: ModelNode[] = [];
  const walk = async (nodes: ModelNode[]): Promise<void> => {
    for (const n of nodes) {
      if (n.kind === "folder") await walk(await api.provider.getChildren(n));
      else if (n.kind === "file") out.push(...(await api.provider.getChildren(n)));
    }
  };
  await walk(await api.provider.getChildren());
  return out;
}
