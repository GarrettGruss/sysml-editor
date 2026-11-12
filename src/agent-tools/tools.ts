import { isLibraryUri, splitQualified, type Element, type ModelIndex } from "../model/index.js";
import { isVisible, visibleChildren, workspaceUris } from "../tree/tree-model.js";
import { findUnresolvedNames } from "./unresolved.js";
import { ToolError, type ToolContext, type ToolDefinition } from "./types.js";

export const DEFAULT_DEPTH = 2;
export const MAX_DEPTH = 10;
export const NODE_CAP = 500;
export const PROBLEM_CAP = 200;
export const FILE_CAP = 500;
export const MEMBER_CAP = 200;
export const DECLARATION_CAP = 20;

const json = (v: unknown) => ({ text: JSON.stringify(v, null, 2) });

function relPath(ctx: ToolContext, uri: string): string {
  const p = ctx.uriToPath(uri);
  if (p !== undefined) return p;
  return isLibraryUri(uri) ? "library:" + decodeURIComponent(uri.replace(/^[^:]+:\/\//, "")) : uri;
}

/** 1-based inclusive line range of an element's declaration. */
function lines(e: Element): { startLine: number; endLine: number } {
  const { start, end } = e.range;
  const endLine = end.column === 0 && end.line > start.line ? end.line : end.line + 1;
  return { startLine: start.line + 1, endLine };
}

function typeOf(e: Element): string | undefined {
  return e.types.length ? e.types.join(", ") : undefined;
}

// ------------------------------------------------------------------ sysml_list_files

const listFiles: ToolDefinition = {
  name: "sysml_list_files",
  description:
    "List the SysML v2 (.sysml) files of the workspace with their root package names and whether each has syntax errors. " +
    "Standard library files are not listed. Use it first to find out what models exist; then use sysml_get_element_tree or sysml_get_element. " +
    "Returns JSON: { files: [{ path, rootPackages, hasSyntaxErrors }] } with paths relative to the workspace root.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  handler(_input, ctx) {
    const files = workspaceUris(ctx.index).map((uri) => {
      const doc = ctx.index.getDocument(uri)!;
      return {
        path: relPath(ctx, uri),
        rootPackages: doc.model.roots.filter((r) => isVisible(r) && r.name !== undefined).map((r) => r.name),
        hasSyntaxErrors: doc.errors.length > 0,
      };
    });
    files.sort((a, b) => a.path.localeCompare(b.path));
    if (files.length > FILE_CAP)
      return json({
        files: files.slice(0, FILE_CAP),
        note: `Showing the first ${FILE_CAP} of ${files.length} files (sorted by path). Use sysml_get_element_tree to browse packages instead.`,
      });
    return json({ files });
  },
};

// ------------------------------------------------------------------ sysml_get_element_tree

interface TreeNode {
  qualifiedName?: string;
  locator?: { owner?: string; kind: string; ends: readonly string[] };
  kind: string;
  name?: string;
  type?: string;
  children?: TreeNode[];
  childCount?: number;
  truncated?: boolean;
}

function treeNode(e: Element): TreeNode {
  const n: TreeNode = { kind: e.kind };
  if (e.qualifiedName !== undefined) n.qualifiedName = e.qualifiedName;
  else n.locator = { owner: e.owner?.qualifiedName, kind: e.kind, ends: e.ends };
  if (e.name !== undefined) n.name = e.name;
  const t = typeOf(e);
  if (t) n.type = t;
  return n;
}

function closestPrefixMessage(index: ModelIndex, qn: string): string {
  const segs = splitQualified(qn);
  for (let i = segs.length - 1; i >= 1; i--) {
    const prefix = segs.slice(0, i).join("::");
    const hit = index.findByQualifiedName(prefix)[0];
    if (hit) {
      const names = visibleChildren(hit).map((m) => m.name ?? m.shortName).filter(Boolean).slice(0, 20);
      return `Closest existing prefix: "${prefix}"${names.length ? ` (members: ${names.join(", ")})` : ""}.`;
    }
  }
  return "No prefix of that name exists; call sysml_list_files or sysml_get_element_tree without a root to see the top-level packages.";
}

function lookup(index: ModelIndex, qn: string): readonly Element[] {
  const hits = index.findByQualifiedName(qn);
  if (hits.length === 0) throw new ToolError(`No element with qualified name "${qn}". ${closestPrefixMessage(index, qn)}`);
  return hits;
}

const getElementTree: ToolDefinition = {
  name: "sysml_get_element_tree",
  description:
    "Browse the ownership hierarchy of the SysML v2 model. Without `root` it starts at all root packages of the workspace; " +
    "with `root` (a qualified name such as VehicleModel::Vehicle) it returns that subtree, which can also be a standard library element. " +
    `\`depth\` is the number of levels returned (root level counts as 1; default ${DEFAULT_DEPTH}, max ${MAX_DEPTH}). ` +
    "A node cut off by the depth limit has `truncated: true` and `childCount`; request that node's qualifiedName as `root` to go deeper. " +
    `At most ${NODE_CAP} nodes are returned; if that cap is hit the result says so, then request a subtree. ` +
    "Imports, comments and documentation are not shown. Elements without a name have a `locator` (owner, kind, ends) instead of a qualifiedName. " +
    "Returns JSON: { nodes: [{ qualifiedName, kind, name, type?, children? }] }.",
  inputSchema: {
    type: "object",
    properties: {
      root: { type: "string", description: "Qualified name of the element to start from. Default: all workspace root packages." },
      depth: { type: "integer", minimum: 1, maximum: MAX_DEPTH, default: DEFAULT_DEPTH, description: "Levels to return, root level = 1." },
    },
    additionalProperties: false,
  },
  readOnly: true,
  handler(input, ctx) {
    const depth = (input.depth as number | undefined) ?? DEFAULT_DEPTH;
    let roots: Element[];
    if (typeof input.root === "string") roots = [...lookup(ctx.index, input.root)].filter(isVisible);
    else {
      roots = [];
      for (const uri of workspaceUris(ctx.index)) {
        const doc = ctx.index.getDocument(uri)!;
        if (!doc.everParsedCleanly) continue;
        roots.push(...doc.model.roots.filter(isVisible));
      }
    }
    let count = 0;
    let capHit = false;
    const top: TreeNode[] = [];
    const queue: { el: Element; node: TreeNode; level: number }[] = [];
    for (const r of roots) {
      if (count >= NODE_CAP) {
        capHit = true;
        break;
      }
      const node = treeNode(r);
      count++;
      top.push(node);
      queue.push({ el: r, node, level: 1 });
    }
    for (let i = 0; i < queue.length; i++) {
      const { el, node, level } = queue[i]!;
      const kids = visibleChildren(el);
      if (kids.length === 0) continue;
      if (level >= depth) {
        node.truncated = true;
        node.childCount = kids.length;
        continue;
      }
      node.children = [];
      for (const k of kids) {
        if (count >= NODE_CAP) {
          capHit = true;
          node.truncated = true;
          node.childCount = kids.length;
          break;
        }
        const child = treeNode(k);
        count++;
        node.children.push(child);
        queue.push({ el: k, node: child, level: level + 1 });
      }
    }
    const result: Record<string, unknown> = { nodes: top };
    if (capHit)
      result.note = `Node cap of ${NODE_CAP} reached; some elements are omitted. Request a subtree with \`root\` (a qualifiedName from this result) or use a smaller depth.`;
    return json(result);
  },
};

// ------------------------------------------------------------------ sysml_get_element

function describeElement(e: Element, ctx: ToolContext) {
  const members = visibleChildren(e);
  const owned = members.filter((m) => m.ends.length === 0);
  const rels = members.filter((m) => m.ends.length > 0);
  const notes: string[] = [];
  if (owned.length > MEMBER_CAP) notes.push(`ownedMembers shows ${MEMBER_CAP} of ${owned.length}; use sysml_get_element_tree with this element as root and a depth to browse the rest.`);
  if (rels.length > MEMBER_CAP) notes.push(`relationships shows ${MEMBER_CAP} of ${rels.length}.`);
  return {
    kind: e.kind,
    name: e.name,
    shortName: e.shortName,
    qualifiedName: e.qualifiedName,
    types: e.types,
    specializes: e.specializes,
    subsets: e.subsets,
    redefines: e.redefines,
    multiplicity: e.multiplicity,
    documentation: e.documentation,
    visibility: e.visibility,
    owner: e.owner?.qualifiedName,
    ownedMembers: owned.slice(0, MEMBER_CAP).map((m) => ({ name: m.name, kind: m.kind, type: typeOf(m) })),
    ...(owned.length > MEMBER_CAP ? { ownedMembersTotal: owned.length } : {}),
    relationships: rels.slice(0, MEMBER_CAP).map((m) => ({ kind: m.kind, name: m.name, ends: m.ends, ...lines(m) })),
    ...(rels.length > MEMBER_CAP ? { relationshipsTotal: rels.length } : {}),
    ...(notes.length ? { note: notes.join(" ") } : {}),
    file: relPath(ctx, e.uri),
    ...lines(e),
    readOnly: ctx.index.isReadOnly(e),
  };
}

const getElement: ToolDefinition = {
  name: "sysml_get_element",
  description:
    "Get the details of one SysML v2 element by qualified name (for example VehicleModel::Vehicle): kind, name, short name, types, " +
    "specializes/subsets/redefines, multiplicity, documentation, visibility, owner, owned members (name, kind, type), relationship statements it owns " +
    "(connect, bind, satisfy, ... with their ends), the file (workspace-relative) and 1-based line range of its declaration, and whether it is read-only " +
    "standard library content. Use sysml_get_element_tree first to discover qualified names. A package declared in several files returns one entry per declaration. " +
    "Returns JSON: { elements: [...] }. If nothing matches, an error names the closest existing prefix.",
  inputSchema: {
    type: "object",
    properties: { qualifiedName: { type: "string", description: "Qualified name, segments separated by ::, quotes kept for names like 'My Part'." } },
    required: ["qualifiedName"],
    additionalProperties: false,
  },
  readOnly: true,
  handler(input, ctx) {
    const hits = lookup(ctx.index, input.qualifiedName as string);
    const shown = hits.slice(0, DECLARATION_CAP).map((e) => describeElement(e, ctx));
    if (hits.length > DECLARATION_CAP)
      return json({ elements: shown, note: `Showing ${DECLARATION_CAP} of ${hits.length} declarations of this name.` });
    return json({ elements: shown });
  },
};

// ------------------------------------------------------------------ validate

const validate: ToolDefinition = {
  name: "sysml_validate",
  description:
    "Check SysML v2 files for problems and return them as a list; an empty list means clean. Call it after writing or editing a .sysml file. " +
    "Reports (1) syntax errors and (2) unresolved names, limited to what can be judged reliably: the type after ':' of a usage, supertypes (:>) of definitions, " +
    "and import targets. It does NOT check redefinitions, subsetting, feature chains, expressions, or semantic rules. A file with syntax errors is not checked for unresolved names. " +
    "`file` is a workspace-relative path; without it the whole workspace is checked. Reflects unsaved editor content. " +
    "Returns JSON: { problems: [{ file, line, column, severity, message }] } with 1-based line and column. " +
    "If `detailsPending` lists files, their syntax errors are still being computed: the problem shown for them is provisional (\"details pending\"); call again shortly for the precise errors.",
  inputSchema: {
    type: "object",
    properties: { file: { type: "string", description: "Workspace-relative path of one file. Default: whole workspace." } },
    additionalProperties: false,
  },
  readOnly: true,
  handler(input, ctx) {
    let uris: string[];
    if (typeof input.file === "string") {
      const uri = ctx.pathToUri(input.file);
      if (!uri || !ctx.index.getDocument(uri))
        throw new ToolError(`No SysML file "${input.file}" in the workspace. Use sysml_list_files for the available paths (relative to the workspace root).`);
      uris = [uri];
    } else uris = workspaceUris(ctx.index);
    const problems: { file: string; line: number; column: number; severity: string; message: string }[] = [];
    const detailsPending: string[] = [];
    for (const uri of uris) {
      const file = relPath(ctx, uri);
      const doc = ctx.index.getDocument(uri);
      if (!doc) continue;
      if (doc.detailsPending) detailsPending.push(file);
      for (const e of doc.errors) problems.push({ file, line: e.line + 1, column: e.column + 1, severity: "error", message: e.message });
      for (const u of findUnresolvedNames(ctx.index, uri))
        problems.push({ file, line: u.line + 1, column: u.column + 1, severity: "warning", message: u.message });
    }
    const pending = detailsPending.length
      ? { detailsPending, pendingNote: "Syntax error details for these files are still being computed; the problems shown for them are provisional. Call sysml_validate again in a moment." }
      : {};
    if (problems.length > PROBLEM_CAP)
      return json({
        problems: problems.slice(0, PROBLEM_CAP),
        note: `Showing ${PROBLEM_CAP} of ${problems.length} problems. Call sysml_validate with \`file\` for one file at a time to see the rest.`,
        ...pending,
      });
    return json({ problems, ...pending });
  },
};

export const toolDefinitions: readonly ToolDefinition[] = [listFiles, getElementTree, getElement, validate];
