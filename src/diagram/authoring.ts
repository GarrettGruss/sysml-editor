/** Small pieces of authoring shared by the extension host and the diagram webview. No `vscode` import, no DOM, no model. */

/** The name stem of a palette kind: usages are camelCase (`part` gives `part`), definitions PascalCase with `Def` (`part def` gives `PartDef`). */
export function defaultStem(kind: string): string {
  const words = kind.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "element";
  if (words[words.length - 1] !== "def") return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

/** The first `<stem>N` (N from 1) that is not in `taken`. */
export function nextFreeName(stem: string, taken: ReadonlySet<string>): string {
  let n = 1;
  while (taken.has(`${stem}${n}`)) n++;
  return `${stem}${n}`;
}

/** The node shapes that show a description area (D35); control nodes, pseudostates, pins and lifelines have no room for one. */
export const DOC_SHAPES: ReadonlySet<string> = new Set(["definition", "usage", "package", "requirement", "action", "state", "usecase"]);

/** Palette kinds placed without an inline input: control nodes have no name worth asking for. */
export const UNNAMED_KINDS: ReadonlySet<string> = new Set(["fork", "join", "decide", "merge"]);
