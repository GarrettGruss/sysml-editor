/** The diagram tools: list, read (JSON and PNG), create, add, remove and lay out. Transport-free; the editor is reached through `ctx.diagrams`. */
import { isLibraryUri, type Element } from "../model/index.js";
import { addElements, createDiagram } from "../diagram/create.js";
import { describeDiagram } from "../diagram/describe.js";
import { removeItems } from "../diagram/edits.js";
import { DIAGRAM_KINDS, type DiagramKind } from "../diagram/format.js";
import { resolveDiagram } from "../diagram/resolve.js";
import { buildViewModel } from "../diagram/view-model.js";
import { ToolError, type DiagramService, type DiagramWriteResult, type ToolContext, type ToolDefinition } from "./types.js";

export const DIAGRAM_FILE_CAP = 500;
export const DIAGRAM_ELEMENT_CAP = 200;
export const DIAGRAM_ID_CAP = 200;
const EXTENSION = ".sysmld";
const KINDS: DiagramKind[] = [...DIAGRAM_KINDS];

const json = (v: unknown) => ({ text: JSON.stringify(v, null, 2) });

/** Why a diagram path is not acceptable (before the workspace is consulted), or undefined when it is. */
export function validateDiagramPath(path: string): string | undefined {
  if (!path.trim()) return "path is empty";
  if (path.includes("\0")) return "path contains a NUL character";
  if (!path.endsWith(EXTENSION) || path.length === EXTENSION.length) return `path must name a ${EXTENSION} file`;
  if (path.includes("\\")) return "path must use forward slashes";
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return "path must be relative to the workspace root";
  if (path.split("/").some((s) => s === ".." || s === "." || s === "")) return "path must not contain empty, . or .. segments";
  return undefined;
}

function service(ctx: ToolContext): DiagramService {
  if (!ctx.diagrams) throw new ToolError("Diagrams are not available in this session.");
  return ctx.diagrams;
}

function checkedPath(input: Record<string, unknown>): string {
  const path = input.path as string;
  const problem = validateDiagramPath(path);
  if (problem) throw new ToolError(`Invalid diagram path "${path}": ${problem}. Use sysml_list_diagrams for the available paths.`);
  return path;
}

/** The service for a tool that changes a diagram; refuses in an untrusted workspace. */
function writable(ctx: ToolContext): DiagramService {
  const svc = service(ctx);
  if (!svc.isTrusted())
    throw new ToolError("This workspace is not trusted, so diagram edits are disabled. Ask the user to trust the workspace (Workspace Trust) to allow them. Reading diagrams with sysml_list_diagrams and sysml_read_diagram still works.");
  return svc;
}

function elementNamed(ctx: ToolContext, qn: string): Element | undefined {
  return ctx.index.findByQualifiedName(qn)[0];
}

function workspaceElement(ctx: ToolContext, qn: string): Element {
  const el = elementNamed(ctx, qn);
  if (!el) throw new ToolError(`No element with qualified name "${qn}". Use sysml_get_element_tree to find qualified names.`);
  if (isLibraryUri(el.uri)) throw new ToolError(`"${qn}" is standard library content, which cannot be a diagram root or be added to a diagram.`);
  return el;
}

/** What every write tool answers: how it was applied and the diagram as it is now. */
function wrote(ctx: ToolContext, r: DiagramWriteResult, extra: Record<string, unknown> = {}) {
  const note =
    r.applied === "editor"
      ? "Applied to the open diagram editor as an unsaved change; the user can undo it (Ctrl+Z) or save it."
      : r.applied === "file"
        ? "Written to the diagram file (it is not open in an editor)."
        : "Nothing changed.";
  return json({ path: r.path, applied: r.applied, note, ...extra, diagram: describeDiagram(r.doc, ctx.index, { sourceOf: r.sourceOf }) });
}

const pathProp = { type: "string" as const, minLength: 1, description: "Workspace-relative path of the .sysmld file, as listed by sysml_list_diagrams." };

// ------------------------------------------------------------------ sysml_list_diagrams

const listDiagrams: ToolDefinition = {
  name: "sysml_list_diagrams",
  description:
    "List the diagram files (.sysmld) of the workspace. A diagram is a view of the SysML model (general, interconnection, requirements, action flow, state transition or sequence view) " +
    "that stores which elements are shown and where, never the model itself. Returns JSON: { diagrams: [{ path, kind, root, nodeCount, parses, open }] } with paths relative to the workspace root; " +
    "`parses: false` marks a file that is not a valid diagram (it then has `problems` instead of kind, root and nodeCount). `open` is true when the diagram is open in an editor, " +
    "in which case its in-memory content is listed. Use sysml_read_diagram to see one diagram's content.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async handler(_input, ctx) {
    const infos = (await service(ctx).list()).sort((a, b) => a.path.localeCompare(b.path));
    const diagrams = infos.slice(0, DIAGRAM_FILE_CAP).map((i) =>
      i.doc
        ? { path: i.path, kind: i.doc.kind, root: i.doc.root, nodeCount: i.doc.nodes.length, parses: true, open: i.open }
        : { path: i.path, parses: false, open: i.open, problems: (i.problems ?? []).slice(0, 5).map((p) => `${p.path} ${p.message}`.trim()) },
    );
    return infos.length > DIAGRAM_FILE_CAP
      ? json({ diagrams, note: `Showing the first ${DIAGRAM_FILE_CAP} of ${infos.length} diagrams (sorted by path).` })
      : json({ diagrams });
  },
};

// ------------------------------------------------------------------ sysml_read_diagram

const readDiagram: ToolDefinition = {
  name: "sysml_read_diagram",
  description:
    "Read one diagram: its kind, root element, and every node and edge with the element it shows (name, qualified name, kind, types, relationship ends), " +
    "containment (`parent`), stored positions (x, y, w, h, relative to the parent node, when known), edge routes and unresolved references (items whose element no longer exists). " +
    "If the diagram is open in an editor, its in-memory content is described, including unsaved changes. Returns JSON { path, open, unsaved, kind, root, sources, nodes, edges, unresolved }. " +
    "With `includeImage: true` the result also carries a PNG of the diagram (light theme, at most 1600 px wide) rendered by the diagram view as a second content item. " +
    "If the diagram is not open, it is rendered in a short-lived editor tab beside the current one that is closed again at once (focus and the active editor stay as they are); " +
    "if rendering fails or times out, the JSON is returned with an `image` note saying the image is unavailable and why. Large diagrams are truncated with a note.",
  inputSchema: {
    type: "object",
    properties: {
      path: pathProp,
      includeImage: { type: "boolean", default: false, description: "Also return a PNG image of the diagram. Default false." },
    },
    required: ["path"],
    additionalProperties: false,
  },
  readOnly: true,
  async handler(input, ctx) {
    const svc = service(ctx);
    const path = checkedPath(input);
    const c = await svc.read(path);
    const out: Record<string, unknown> = { path: c.path, open: c.open, unsaved: c.unsaved, ...describeDiagram(c.doc, ctx.index, { sourceOf: c.sourceOf }) };
    if (input.includeImage !== true) return json(out);
    const img = await svc.renderImage(path);
    if (!img.ok) return json({ ...out, image: { available: false, reason: img.reason } });
    return { ...json(out), image: { data: img.png, mimeType: "image/png" } };
  },
};

// ------------------------------------------------------------------ sysml_create_diagram

const createDiagramTool: ToolDefinition = {
  name: "sysml_create_diagram",
  description:
    "Create a new diagram file for a model element and return its path and description. `root` is the qualified name of the element shown as the diagram's root " +
    "(for example Vehicle::Car); the diagram is pre-populated with the root and its direct members (for a requirements view, the requirements and what the relationships tie them to). " +
    "`kind` is general (definitions and usages with specialization, composition and typing; use cases with their actors and includes), interconnection (parts nested in a part, with ports and connections), requirements, " +
    "actionFlow (root: an action or action def; its actions, start/done, fork/join/decide/merge nodes, successions with guards and flows), stateTransition (root: a state or state def; its states, entry/do/exit actions and transitions with trigger, guard and effect) " +
    "or sequence (root: an occurrence, part or interaction that owns `message` usages; lifelines and the messages between them in time order). A root that does not fit the kind is refused with the reason. " +
    "`elements` optionally restricts the members shown to those qualified names. `path` is workspace-relative and must end in .sysmld; by default the file is created beside the root's source file under the element's name, " +
    "and an existing file is never overwritten (a numbered name is used, or an explicit existing path is rejected). The new diagram has no stored positions; the editor lays it out when it is opened. " +
    "Changes the diagram file only, never the model. Not available in an untrusted workspace.",
  inputSchema: {
    type: "object",
    properties: {
      root: { type: "string", minLength: 1, description: "Qualified name of the root element, e.g. Vehicle::Car." },
      kind: { type: "string", enum: KINDS, description: "general, interconnection, requirements, actionFlow, stateTransition or sequence." },
      elements: { type: "array", items: { type: "string", minLength: 1 }, description: `Qualified names of the members to show (at most ${DIAGRAM_ELEMENT_CAP}). Default: all visible direct members.` },
      path: { type: "string", description: "Workspace-relative path of the new .sysmld file. Default: beside the root's source file." },
    },
    required: ["root", "kind"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const svc = writable(ctx);
    const root = workspaceElement(ctx, input.root as string);
    const kind = input.kind as DiagramKind;
    const elements = (input.elements as string[] | undefined) ?? undefined;
    if (elements && elements.length > DIAGRAM_ELEMENT_CAP) throw new ToolError(`At most ${DIAGRAM_ELEMENT_CAP} elements can be given; use fewer, or add more later with sysml_add_to_diagram.`);
    const path = typeof input.path === "string" ? checkedPath(input) : undefined;
    const notFound = (elements ?? []).filter((q) => !elementNamed(ctx, q));
    const r = await svc.create({
      ...(path !== undefined ? { path } : {}),
      root,
      make: (sourceOf) => {
        try {
          return createDiagram(ctx.index, root.qualifiedName!, kind, { ...(elements ? { elements } : {}), sourceOf });
        } catch (e) {
          throw new ToolError(e instanceof Error ? e.message : String(e));
        }
      },
    });
    return wrote(ctx, r, { created: true, ...(notFound.length ? { notFound } : {}) });
  },
};

// ------------------------------------------------------------------ sysml_add_to_diagram

const addToDiagram: ToolDefinition = {
  name: "sysml_add_to_diagram",
  description:
    "Add model elements to an existing diagram as nodes (relationship statements such as satisfy or connect become edges when both ends are on the diagram). " +
    "`elements` are qualified names. Elements already on the diagram are left alone. Changes the diagram only, never the model, as one edit: if the diagram is open in an editor the change is applied " +
    "to the open document as an undoable, unsaved edit (the tab shows it as modified); if it is not open the file is written. Returns JSON with `applied` (editor, file or none), what was added and the diagram as it is now. " +
    "Not available in an untrusted workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: pathProp,
      elements: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: `Qualified names of the elements to add (at most ${DIAGRAM_ELEMENT_CAP}).` },
    },
    required: ["path", "elements"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const svc = writable(ctx);
    const path = checkedPath(input);
    const names = input.elements as string[];
    if (names.length > DIAGRAM_ELEMENT_CAP) throw new ToolError(`At most ${DIAGRAM_ELEMENT_CAP} elements per call; split the request.`);
    const notFound = names.filter((q) => !elementNamed(ctx, q));
    const els = names.flatMap((q) => (elementNamed(ctx, q) ? [workspaceElement(ctx, q)] : []));
    if (!els.length) throw new ToolError(`None of the elements exist: ${names.slice(0, 10).join(", ")}. Use sysml_get_element_tree to find qualified names.`);
    let added = 0;
    const r = await svc.edit(path, "Add to Diagram", (doc, sourceOf) => {
      const res = addElements(doc, ctx.index, els, { sourceOf });
      added = res.added.length;
      return res.added.length ? res.doc : undefined;
    });
    return wrote(ctx, r, { added, ...(added === 0 ? { alreadyShownOrNotPlaceable: true } : {}), ...(notFound.length ? { notFound } : {}) });
  },
};

// ------------------------------------------------------------------ sysml_remove_from_diagram

const removeFromDiagram: ToolDefinition = {
  name: "sysml_remove_from_diagram",
  description:
    "Remove nodes or edges from a diagram by their ids (from sysml_read_diagram). Removing a node also removes its child nodes and every edge attached to any of them. " +
    "Only the diagram changes: the model and the .sysml files are never touched. One edit: applied as an undoable, unsaved edit when the diagram is open in an editor, written to the file otherwise. " +
    "Returns JSON with `applied` (editor, file or none), `removed` and the diagram as it is now. Not available in an untrusted workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: pathProp,
      ids: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: `Node or edge ids to remove (at most ${DIAGRAM_ID_CAP}).` },
    },
    required: ["path", "ids"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const svc = writable(ctx);
    const path = checkedPath(input);
    const ids = input.ids as string[];
    if (ids.length > DIAGRAM_ID_CAP) throw new ToolError(`At most ${DIAGRAM_ID_CAP} ids per call; split the request.`);
    let unknown: string[] = [];
    let removed = 0;
    const r = await svc.edit(path, "Remove from Diagram", (doc, sourceOf) => {
      const known = new Set([...doc.nodes, ...doc.edges].map((i) => i.id));
      unknown = ids.filter((i) => !known.has(i));
      if (unknown.length === ids.length) throw new ToolError(`No node or edge with id ${unknown.slice(0, 10).join(", ")} in ${path}. Use sysml_read_diagram to see the ids.`);
      const vm = buildViewModel(doc, resolveDiagram(doc, ctx.index, { sourceOf }), ctx.index);
      const next = removeItems(doc, ids, vm);
      removed = doc.nodes.length - next.nodes.length + (doc.edges.length - next.edges.length);
      return next === doc ? undefined : next;
    });
    return wrote(ctx, r, { removed, ...(unknown.length ? { unknownIds: unknown } : {}) });
  },
};

// ------------------------------------------------------------------ sysml_layout_diagram

const layoutDiagram: ToolDefinition = {
  name: "sysml_layout_diagram",
  description:
    "Arrange all nodes and edges of a diagram again (automatic layout), discarding manual positions. If the diagram is open in an editor this runs the editor's Auto-layout command: " +
    "the new layout is shown at once as an undoable, unsaved edit. If it is not open, the stored positions and routes are cleared in the file so that the layout is computed the next time the diagram is opened or rendered " +
    "(the returned description then has no positions). Only the diagram changes. Returns JSON with `applied` (editor, file or none) and the diagram as it is now. Not available in an untrusted workspace.",
  inputSchema: { type: "object", properties: { path: pathProp }, required: ["path"], additionalProperties: false },
  readOnly: false,
  async handler(input, ctx) {
    const svc = writable(ctx);
    return wrote(ctx, await svc.layout(checkedPath(input)));
  },
};

// ------------------------------------------------------------------ sysml_get_editor_context

const getEditorContext: ToolDefinition = {
  name: "sysml_get_editor_context",
  description:
    "Read what the user is looking at in the diagram editor right now: the active diagram, the node or line under the pointer, the selected elements and the other open diagrams. " +
    "Use it to resolve \"this\", \"here\" or \"the selected part\" in the user's request. Returns JSON { activeDiagram: { path, kind, root } | null, hovered: item | null, selected: item[], openDiagrams: string[] }. " +
    "`activeDiagram` is null when no diagram editor is the active tab (then `hovered` is null and `selected` is empty). Each item is { id, type: node | edge, element?, resolved } as in sysml_read_diagram (a line the view derives from the model, such as typing or composition, has `derived: true` with its relationship and end node ids instead of an element): " +
    "`id` is the diagram node or edge id; `element` has the qualified name (or, for an unnamed statement such as a succession, a locator) to use with the other tools. " +
    "`hovered` is cleared when the pointer leaves the diagram or the tab is hidden or inactive. `openDiagrams` lists the other diagrams open in editors. Read-only.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async handler(_input, ctx) {
    const svc = service(ctx);
    const st = svc.editorState();
    const openDiagrams = [...st.open].sort();
    if (!st.active) return json({ activeDiagram: null, hovered: null, selected: [], openDiagrams });
    const c = await svc.read(st.active.path);
    const d = describeDiagram(c.doc, ctx.index, { sourceOf: c.sourceOf });
    const items = new Map<string, Record<string, unknown>>();
    for (const n of d.nodes) items.set(n.id, { id: n.id, type: "node", element: n.element, resolved: n.resolved });
    for (const e of d.edges) items.set(e.id, { id: e.id, type: "edge", element: e.element, resolved: e.resolved });
    const item = (id: string) => {
      const known = items.get(id);
      if (known) return known;
      // A line the view derives from the model (typing, composition, ...) is not stored in the diagram: `d:<relationship>:<source>:<target>`.
      const m = /^d:([^:]+):(.+):([^:]+)$/.exec(id);
      return m ? { id, type: "edge", derived: true, relationship: m[1], source: m[2], target: m[3], resolved: true } : { id, resolved: false };
    };
    return json({
      activeDiagram: { path: c.path, kind: c.doc.kind, root: c.doc.root },
      hovered: st.active.hover !== undefined ? item(st.active.hover) : null,
      selected: st.active.selection.map(item),
      openDiagrams,
    });
  },
};

export const diagramToolDefinitions: readonly ToolDefinition[] = [listDiagrams, readDiagram, createDiagramTool, addToDiagram, removeFromDiagram, layoutDiagram, getEditorContext];
