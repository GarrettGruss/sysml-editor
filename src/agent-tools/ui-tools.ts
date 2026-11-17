/**
 * The UI-control tools: run an allowlisted editor command, answer open prompts, and observe the UI state. They reach the
 * window only through `UiDriver` (D55), and are refused unless the setting is on and the workspace is trusted (D53).
 * Every input is hostile: validated here before the driver sees it. Transport-free, no `vscode`.
 */
import { ToolError, type ToolContext, type ToolDefinition, type ToolResult } from "./types.js";
import type { DiagramGesture, RequirementsAction, RequirementsGesture, RequirementsScopeArg, ScreenshotTarget, UiAnswer, UiDriver } from "./ui-driver.js";
import { formatAuditLine, isAllowedCommand, resolveInWorkspace, treeCommandOffered, validSelector, validateCommandArgs } from "./ui-support.js";

const json = (v: unknown): ToolResult => ({ text: JSON.stringify(v, null, 2) });
const refused = (reason: string): ToolResult => ({ isError: true, text: reason });

export const SETTING_OFF = 'UI control is off. The user must turn on the user setting "sysml.agent.uiControl" (it is ignored in workspace settings).';
export const UNTRUSTED = "UI control is not available in an untrusted workspace. Trust the workspace first.";

/** Why the tools are refused, or undefined when they may run. */
export function gateReason(driver: UiDriver): string | undefined {
  const g = driver.gate();
  if (!g.trusted) return UNTRUSTED;
  if (!g.enabled) return SETTING_OFF;
  return undefined;
}

/** Log the call, then check the gate. Returns the driver to use, or the refusal. */
function enter(ctx: ToolContext, tool: string, target: string | undefined, args: unknown): UiDriver | ToolResult {
  const driver = ctx.ui;
  if (!driver) return refused("UI control is not available in this host.");
  try {
    driver.audit(formatAuditLine(tool, target, args));
  } catch {
    // A failing log must not decide whether the action may run; the gate below still does.
  }
  const why = gateReason(driver);
  return why ? refused(why) : driver;
}
const isDriver = (x: UiDriver | ToolResult): x is UiDriver => "runCommand" in x;

const sysmlUiCommand: ToolDefinition = {
  name: "sysml_ui_command",
  description:
    "Run an editor command as the user would from the command palette or a menu: any `sysml.*` command, or core undo, redo, save, save all, back and forward (ids: undo, redo, workbench.action.files.save, workbench.action.files.saveAll, workbench.action.navigateBack, workbench.action.navigateForward). Other ids are refused. " +
    "`args` are the command's arguments (JSON values; strings that are file paths must lie inside the workspace). The call returns when the command finishes or as soon as it opens a prompt (a quick pick, input box, confirmation or dialog); the result lists the open prompts, which you answer with sysml_ui_answer. " +
    "Delete commands ask for confirmation, which you must answer explicitly. Works only when the user has turned on the setting sysml.agent.uiControl in a trusted workspace; every call is logged.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", minLength: 1, maxLength: 200, description: "The command id, e.g. sysml.createDiagram or undo." },
      args: { type: "array", items: {}, description: "Arguments passed to the command, at most 8." },
    },
    required: ["command"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const id = input.command as string;
    const d = enter(ctx, "sysml_ui_command", id, input.args);
    if (!isDriver(d)) return d;
    if (!isAllowedCommand(id)) return refused(`The command "${id}" is not on the allowlist. Allowed: sysml.* commands, undo, redo, workbench.action.files.save, workbench.action.files.saveAll, workbench.action.navigateBack, workbench.action.navigateForward.`);
    const a = validateCommandArgs(input.args, d.workspaceRoots());
    if (!a.ok) return refused(`Refused: ${a.reason}.`);
    const r = await d.runCommand(id, a.args);
    return r.ok ? json({ command: id, completed: r.completed, ...(r.result !== undefined ? { result: r.result } : {}), prompts: r.prompts }) : { isError: true, text: JSON.stringify({ command: id, error: r.reason, prompts: r.prompts }, null, 2) };
  },
};

const ANSWER_FIELDS = ["pick", "picks", "text", "confirm", "path", "cancel"] as const;

const sysmlUiAnswer: ToolDefinition = {
  name: "sysml_ui_answer",
  description:
    "Answer an open prompt (a quick pick, multi-pick, input box, confirmation, choice dialog or save dialog), as listed by sysml_ui_command or sysml_ui_state. Give exactly one of: `pick` (an item label), `picks` (item labels, for a multi-pick), `text` (for an input box; a validation message comes back and the box stays open), `confirm: true`, `path` (for a save dialog; must be inside the workspace), or `cancel: true`. " +
    "`prompt` is the prompt id; omitted it is the oldest open prompt. A prompt left open times out as cancelled. Needs sysml.agent.uiControl on, in a trusted workspace; every call is logged.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "integer", minimum: 1, description: "Id of the prompt; default the oldest open one." },
      pick: { type: "string", maxLength: 1000, description: "The label of the item to choose." },
      picks: { type: "array", items: { type: "string", maxLength: 1000 }, description: "Labels of the items to tick." },
      text: { type: "string", maxLength: 10000, description: "The text for an input box." },
      confirm: { type: "boolean", description: "true confirms; to decline use cancel." },
      path: { type: "string", maxLength: 4096, description: "File path for a save dialog, inside the workspace." },
      cancel: { type: "boolean", description: "true cancels the prompt." },
    },
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const d = enter(ctx, "sysml_ui_answer", input.prompt === undefined ? "oldest" : `prompt ${String(input.prompt)}`, input);
    if (!isDriver(d)) return d;
    const given = ANSWER_FIELDS.filter((f) => input[f] !== undefined);
    if (given.length !== 1) throw new ToolError(`Give exactly one of ${ANSWER_FIELDS.join(", ")} (got ${given.length === 0 ? "none" : given.join(", ")}).`);
    const f = given[0]!;
    let answer: UiAnswer;
    switch (f) {
      case "pick": answer = { kind: "pick", label: input.pick as string }; break;
      case "picks": answer = { kind: "picks", labels: input.picks as string[] }; break;
      case "text": answer = { kind: "text", text: input.text as string }; break;
      case "confirm":
        if (input.confirm !== true) throw new ToolError("confirm must be true; to decline a prompt use cancel: true.");
        answer = { kind: "confirm" };
        break;
      case "cancel":
        if (input.cancel !== true) throw new ToolError("cancel must be true.");
        answer = { kind: "cancel" };
        break;
      case "path": {
        const abs = resolveInWorkspace(input.path as string, d.workspaceRoots());
        if (abs === undefined) return refused("Refused: the path is outside the workspace.");
        answer = { kind: "path", path: abs };
        break;
      }
    }
    const r = await d.answer(input.prompt as number | undefined, answer);
    return r.ok ? json({ answered: true, prompts: r.remaining }) : { isError: true, text: JSON.stringify({ answered: false, error: r.reason, ...(r.validation !== undefined ? { validation: r.validation } : {}), prompts: r.remaining }, null, 2) };
  },
};

const sysmlUiState: ToolDefinition = {
  name: "sysml_ui_state",
  description:
    "Observe the editor window: whether UI control is enabled, the active editor and its dirty flag, the selection in open diagrams, open context menus and their items, the undo and redo labels of each diagram, the messages shown to the user (information, warning, error) since the last read (each is reported once), open prompts, navigation history, and what the clipboard holds (none, text, image or elements; never its content). " +
    "When UI control is off or the workspace is untrusted it answers `enabled: false` with the reason instead of failing. Read-only; every call is logged.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async handler(_input, ctx) {
    const d = ctx.ui;
    if (!d) return json({ enabled: false, reason: "UI control is not available in this host." });
    try {
      d.audit(formatAuditLine("sysml_ui_state", undefined, {}));
    } catch {
      // see enter()
    }
    const why = gateReason(d);
    if (why) return json({ enabled: false, reason: why });
    return json({ enabled: true, ...(await d.state()) });
  },
};



// ---- diagram gestures (2.3) ------------------------------------------------------------------------

type FieldType = "s" | "n" | "b" | "ss" | readonly string[];
interface Field { type: FieldType; required?: boolean }
const req = (type: FieldType): Field => ({ type, required: true });
const opt = (type: FieldType): Field => ({ type });
const CONNECT = ["specialization", "dependency", "satisfy", "verify", "derivation", "succession", "transition", "message", "flow"] as const;
const SIDES = ["L", "R", "U", "D"] as const;

/** The gesture kinds an agent may replay, with their fields; anything else is refused. */
const DIAGRAM_GESTURES: Record<string, Record<string, Field>> = {
  select: { id: req("s"), shift: opt("b") },
  drag: { id: req("s"), dx: req("n"), dy: req("n"), steps: opt("n"), hold: opt("n") },
  resize: { id: req("s"), handle: req("s"), dx: req("n"), dy: req("n") },
  key: { key: req("s"), shift: opt("b"), ctrl: opt("b"), meta: opt("b") },
  rubber: { x0: req("n"), y0: req("n"), x1: req("n"), y1: req("n") },
  menu: { id: req("s"), action: req("s") },
  contextmenu: { id: req("s") },
  menuItem: { label: req("s") },
  drop: { names: req("ss"), x: opt("n"), y: opt("n") },
  palette: { item: req("s"), id: opt("s"), x: opt("n"), y: opt("n"), name: opt("s"), hold: opt("b") },
  ghostMove: { x: req("n"), y: req("n") },
  inline: { text: opt("s"), end: opt(["enter", "shiftEnter", "escape", "blur"]) },
  dblclick: { id: req("s"), area: opt(["name", "doc"]) },
  descriptions: { show: req("b") },
  legend: { show: req("b") },
  connect: { source: req("s"), target: req("s"), relation: opt(CONNECT) },
  connectDrag: { source: req("s"), side: opt(SIDES), relation: opt(CONNECT), target: opt("s"), x: opt("n"), y: opt("n"), hold: opt("b") },
  connectRelease: {},
  quickBar: { item: opt("s") },
  reconnectDrag: { id: req("s"), end: req(["source", "target"]), target: opt("s"), x: opt("n"), y: opt("n"), hold: opt("b") },
  hoverNode: { id: req("s") },
  selectEdge: { id: req("s") },
  dragSegment: { id: req("s"), index: req("n"), d: req("n") },
  dragBend: { id: req("s"), index: req("n"), dx: req("n"), dy: req("n") },
  dblclickEdge: { id: req("s") },
  labelDrag: { id: req("s"), dx: req("n"), dy: req("n") },
  labelResize: { id: req("s"), dw: req("n"), dh: req("n") },
  labelMenu: { id: req("s"), action: req(["reset", "wrap"]) },
  inlineRename: { id: req("s"), text: req("s"), commit: req("b") },
  hover: { id: opt("s") },
  labelClick: { id: req("s") },
  wheel: { deltaY: req("n"), ctrl: opt("b") },
  focusCanvas: { mouse: req("b") },
  flush: {},
};

const MAX_TEXT = 500;
const MAX_COORD = 1_000_000;
const MENU_ACTION = /^(?:remove|relink|deleteModel|rename|goto|description|showHideMembers|displayRelated|copy|paste|compartment:[A-Za-z0-9_.:-]{1,100}|align(?:Left|Right|Top|Bottom|Center|Middle)|distribute(?:Horizontal|Vertical))$/;

const text = (v: unknown, where: string, max = MAX_TEXT): string => {
  if (typeof v !== "string" || v.includes("\0")) throw new ToolError(`${where} must be a string.`);
  if (v.length > max) throw new ToolError(`${where} is longer than ${max} characters.`);
  return v;
};

/** Check an agent's gesture against the table and build the typed gesture the webview replays. Hostile input throws `ToolError`. */
export function parseDiagramGesture(raw: unknown): DiagramGesture {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ToolError("gesture must be an object with a `kind`.");
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(DIAGRAM_GESTURES, kind)) throw new ToolError(`Unknown gesture kind "${String(kind).slice(0, 40)}". Kinds: ${Object.keys(DIAGRAM_GESTURES).join(", ")}.`);
  const fields = DIAGRAM_GESTURES[kind]!;
  const out: Record<string, unknown> = { kind };
  for (const k of Object.keys(o)) if (k !== "kind" && !Object.prototype.hasOwnProperty.call(fields, k)) throw new ToolError(`gesture ${kind}: unknown field "${k.slice(0, 40)}". Fields: ${Object.keys(fields).join(", ") || "none"}.`);
  for (const [name, f] of Object.entries(fields)) {
    const v = o[name];
    const where = `gesture ${kind}.${name}`;
    if (v === undefined) {
      if (f.required) throw new ToolError(`${where} is required.`);
      continue;
    }
    if (f.type === "s") out[name] = text(v, where);
    else if (f.type === "n") {
      if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > MAX_COORD) throw new ToolError(`${where} must be a finite number.`);
      out[name] = v;
    } else if (f.type === "b") {
      if (typeof v !== "boolean") throw new ToolError(`${where} must be true or false.`);
      out[name] = v;
    } else if (f.type === "ss") {
      if (!Array.isArray(v) || v.length > 50) throw new ToolError(`${where} must be an array of at most 50 strings.`);
      out[name] = v.map((x, i) => text(x, `${where}[${i}]`));
    } else {
      if (typeof v !== "string" || !f.type.includes(v)) throw new ToolError(`${where} must be one of ${f.type.join(", ")}.`);
      out[name] = v;
    }
  }
  if (kind === "menu" && !MENU_ACTION.test(out.action as string)) throw new ToolError(`gesture menu.action "${String(out.action).slice(0, 40)}" is not a known menu action.`);
  if (kind === "drag" && out.hold !== undefined && (out.hold as number) > 10_000) throw new ToolError("gesture drag.hold must be at most 10000 ms.");
  return out as unknown as DiagramGesture;
}

/** A diagram path: workspace-relative or absolute, inside the workspace, a `.sysmld` file. */
function diagramPath(raw: unknown, d: UiDriver): string {
  const p = text(raw, "path", 4096);
  const abs = resolveInWorkspace(p, d.workspaceRoots());
  if (abs === undefined) throw new ToolError("Refused: the path is outside the workspace.");
  if (!/\.sysmld$/i.test(abs)) throw new ToolError("path must be a .sysmld diagram file.");
  return abs;
}

const sysmlUiDiagram: ToolDefinition = {
  name: "sysml_ui_diagram",
  description:
    "Act in an open diagram as a user does, and observe what it shows once the gesture has settled (the diagram is opened when it is not open). `path` is the .sysmld file. `gesture` has a `kind` and its fields: select {id, shift?}, drag {id, dx, dy, steps?, hold?}, resize {id, handle, dx, dy}, key {key, shift?, ctrl?, meta?} (Ctrl+C and Ctrl+V copy and paste elements, Delete removes), rubber {x0, y0, x1, y1}, " +
    "contextmenu {id} (opens the context menu; the result's `menu` lists its item labels), menuItem {label} (clicks an item of the open menu by label, e.g. \"Align Left\"), menu {id, action}, drop {names, x?, y?}, palette {item, id?, x?, y?, name?, hold?}, inline {text?, end?}, dblclick {id, area?}, descriptions {show}, legend {show} (toggles), connect {source, target, relation?}, connectDrag, reconnectDrag, selectEdge {id}, dragSegment, dragBend, dblclickEdge, labelDrag, labelResize, labelMenu, inlineRename {id, text, commit}, hover {id?}, hoverNode {id}, wheel {deltaY, ctrl?}, quickBar {item?}, and flush (no change, only observe). " +
    "The result: the selected ids, the open menu's labels, node boxes (id, x, y, w, h), legend labels, the inline editor, and what the clipboard holds. Questions the gesture opens (a picker, a name box) are listed by sysml_ui_state and answered with sysml_ui_answer. Needs sysml.agent.uiControl on in a trusted workspace; every call is logged.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", minLength: 1, maxLength: 4096, description: "The .sysmld diagram file, inside the workspace." },
      gesture: { type: "object", description: "The gesture: `kind` and its fields." },
    },
    required: ["path", "gesture"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const d = enter(ctx, "sysml_ui_diagram", typeof input.path === "string" ? input.path : undefined, input.gesture);
    if (!isDriver(d)) return d;
    const abs = diagramPath(input.path, d);
    const g = parseDiagramGesture(input.gesture);
    try {
      return json(await d.diagramGesture(abs, g));
    } catch (e) {
      return refused(`The gesture failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ---- requirements editor (2.4) ---------------------------------------------------------------------

const REQ_ACTIONS = ["open", "view", "click", "input", "key", "dragToc", "mouse", "exportMatrix", "observe"] as const;
const REQ_VIEWS = ["table", "matrix", "document"] as const;
const REQ_MOUSE = ["contextmenu", "pointermove", "pointerdown", "pointerup", "click"] as const;

function oneOf<T extends string>(v: unknown, list: readonly T[], where: string): T {
  if (typeof v !== "string" || !(list as readonly string[]).includes(v)) throw new ToolError(`${where} must be one of ${list.join(", ")}.`);
  return v as T;
}

function selectorOf(v: unknown): string {
  if (!validSelector(v)) throw new ToolError("selector must be a printable CSS selector of at most 300 characters.");
  return v;
}

const sysmlUiRequirements: ToolDefinition = {
  name: "sysml_ui_requirements",
  description:
    "Act in the requirements editor of a package (`package`: qualified name) or a .sysml file (`file`), opening it when needed, and observe it. `action`: open {view?}, view {view: table|matrix|document}, click {selector}, input {selector, value, event?: change|input} (add a requirement inline, edit its text), key {selector, key, alt?}, dragToc {fromQn, ontoQn, position: before|after} (reorder or nest a section in the table of contents), mouse {type, selector, at?, dy?}, exportMatrix {format: csv|markdown, path} (written inside the workspace), observe. " +
    "Selectors are the editor's data-testid or data-qn attributes, e.g. [data-testid=add-root-requirement], tr[data-qn=\"P::R1\"], [data-testid=toc-entry][data-qn=\"P::Sec\"]; expand and collapse are clicks on the section head. The result: the view, outline, requirement items, matrix rows, pending edits, and the notice shown. Needs sysml.agent.uiControl on in a trusted workspace; every call is logged.",
  inputSchema: {
    type: "object",
    properties: {
      package: { type: "string", minLength: 1, maxLength: 500, description: "Qualified name of the package scope." },
      file: { type: "string", minLength: 1, maxLength: 4096, description: "Path of a .sysml file scope, inside the workspace." },
      action: { type: "string", enum: [...REQ_ACTIONS] },
      view: { type: "string", enum: [...REQ_VIEWS] },
      selector: { type: "string", maxLength: 300 },
      value: { type: "string", maxLength: 10000 },
      event: { type: "string", enum: ["change", "input"] },
      key: { type: "string", maxLength: 40 },
      alt: { type: "boolean" },
      fromQn: { type: "string", maxLength: 500 },
      ontoQn: { type: "string", maxLength: 500 },
      position: { type: "string", enum: ["before", "after"] },
      type: { type: "string", enum: [...REQ_MOUSE], description: "Mouse event type for action mouse." },
      at: { type: "string", enum: ["center", "top", "bottom", "left"] },
      dy: { type: "number", minimum: -100000, maximum: 100000 },
      format: { type: "string", enum: ["csv", "markdown"] },
      path: { type: "string", maxLength: 4096, description: "Output file for exportMatrix, inside the workspace." },
    },
    required: ["action"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const d = enter(ctx, "sysml_ui_requirements", typeof input.package === "string" ? input.package : typeof input.file === "string" ? input.file : undefined, input);
    if (!isDriver(d)) return d;
    if ((input.package === undefined) === (input.file === undefined)) throw new ToolError("Give exactly one of `package` and `file`.");
    let scope: RequirementsScopeArg;
    if (input.package !== undefined) scope = { kind: "package", qualifiedName: text(input.package, "package", 500) };
    else {
      const abs = resolveInWorkspace(text(input.file, "file", 4096), d.workspaceRoots());
      if (abs === undefined) return refused("Refused: the file is outside the workspace.");
      scope = { kind: "file", path: abs };
    }
    const kind = oneOf(input.action, REQ_ACTIONS, "action");
    let action: RequirementsAction;
    switch (kind) {
      case "open": action = { kind, ...(input.view !== undefined ? { view: oneOf(input.view, REQ_VIEWS, "view") } : {}) }; break;
      case "view": action = { kind, view: oneOf(input.view, REQ_VIEWS, "view") }; break;
      case "observe": action = { kind }; break;
      case "exportMatrix": {
        const abs = resolveInWorkspace(text(input.path, "path", 4096), d.workspaceRoots());
        if (abs === undefined) return refused("Refused: the path is outside the workspace.");
        action = { kind, format: oneOf(input.format, ["csv", "markdown"] as const, "format"), path: abs };
        break;
      }
      default: {
        let gesture: RequirementsGesture;
        if (kind === "click") gesture = { kind, selector: selectorOf(input.selector) };
        else if (kind === "input") gesture = { kind, selector: selectorOf(input.selector), value: text(input.value ?? "", "value", 10000), ...(input.event !== undefined ? { event: oneOf(input.event, ["change", "input"] as const, "event") } : {}) };
        else if (kind === "key") gesture = { kind, selector: selectorOf(input.selector), key: text(input.key, "key", 40), ...(input.alt === true ? { alt: true } : {}) };
        else if (kind === "dragToc") gesture = { kind, fromQn: text(input.fromQn, "fromQn", 500), ontoQn: text(input.ontoQn, "ontoQn", 500), position: oneOf(input.position, ["before", "after"] as const, "position") };
        else gesture = { kind: "mouse", type: oneOf(input.type, REQ_MOUSE, "type"), selector: selectorOf(input.selector), ...(input.at !== undefined ? { at: oneOf(input.at, ["center", "top", "bottom", "left"] as const, "at") } : {}), ...(typeof input.dy === "number" ? { dy: input.dy } : {}) };
        action = { kind: "gesture", gesture };
      }
    }
    try {
      return json(await d.requirements(scope, action));
    } catch (e) {
      return refused(`The action failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ---- the model tree (2.4) --------------------------------------------------------------------------

const TREE_OPS = ["list", "select", "command", "collapseAll"] as const;

const sysmlUiTree: ToolDefinition = {
  name: "sysml_ui_tree",
  description:
    "Use the SysML Model tree. `op`: list {parent?, depth? (1 to 4, default 1), limit?} lists the visible nodes with id, label, context value, depth and selection; select {nodes: [ids]} selects and reveals nodes (ids from list); " +
    "command {command, node?} runs a command the tree offers: the view title commands (sysml.tree.newFile, sysml.tree.newFolder, sysml.tree.refresh, sysml.tree.changeView, sysml.tree.clearSearch; no node) or a node's context commands (sysml.tree.rename, sysml.tree.delete, sysml.tree.deleteFile, sysml.tree.addChild, sysml.newDiagram, sysml.showInDiagram, sysml.openRequirementsEditor, sysml.goToDefinition, sysml.addToActiveDiagram, sysml.tree.newFile and newFolder on folders). A command not offered for that node is refused. " +
    "The result lists the prompts the command opened, which sysml_ui_answer answers. collapseAll collapses the tree. Needs sysml.agent.uiControl on in a trusted workspace; every call is logged.",
  inputSchema: {
    type: "object",
    properties: {
      op: { type: "string", enum: [...TREE_OPS] },
      parent: { type: "string", maxLength: 4096, description: "Node id to list below; default the roots." },
      depth: { type: "integer", minimum: 1, maximum: 4 },
      limit: { type: "integer", minimum: 1, maximum: 500 },
      nodes: { type: "array", items: { type: "string", maxLength: 4096 }, description: "Node ids to select, at most 50." },
      node: { type: "string", maxLength: 4096, description: "The node a command acts on." },
      command: { type: "string", maxLength: 200 },
    },
    required: ["op"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const op = oneOf(input.op, TREE_OPS, "op");
    const d = enter(ctx, "sysml_ui_tree", op, input);
    if (!isDriver(d)) return d;
    try {
      switch (op) {
        case "list": {
          const parent = input.parent === undefined ? undefined : text(input.parent, "parent", 4096);
          const depth = typeof input.depth === "number" ? Math.min(4, Math.max(1, Math.floor(input.depth))) : 1;
          const limit = typeof input.limit === "number" ? Math.min(500, Math.max(1, Math.floor(input.limit))) : 200;
          return json({ nodes: await d.treeList(parent, depth, limit) });
        }
        case "select": {
          if (!Array.isArray(input.nodes) || input.nodes.length === 0 || input.nodes.length > 50) throw new ToolError("nodes must be 1 to 50 node ids.");
          const r = await d.treeSelect(input.nodes.map((n, i) => text(n, `nodes[${i}]`, 4096)));
          return r.ok ? json({ selected: true }) : refused(r.reason);
        }
        case "collapseAll":
          await d.treeCollapseAll();
          return json({ collapsed: true });
        case "command": {
          const command = text(input.command, "command", 200);
          let contextValue: string | undefined;
          let nodeId: string | undefined;
          if (input.node !== undefined) {
            nodeId = text(input.node, "node", 4096);
            const n = await d.treeNode(nodeId);
            if (!n) return refused("Unknown node: list the tree first and use an id from the result.");
            contextValue = n.contextValue;
          }
          if (!isAllowedCommand(command)) return refused(`The command "${command.slice(0, 60)}" is not on the allowlist.`);
          if (!treeCommandOffered(command, contextValue)) return refused(`The command "${command}" is not offered ${nodeId === undefined ? "in the tree's title bar" : `for a node with context value ${String(contextValue)}`}.`);
          const r = await d.treeCommand(command, nodeId);
          return r.ok ? json({ command, completed: r.completed, ...(r.result !== undefined ? { result: r.result } : {}), prompts: r.prompts }) : { isError: true, text: JSON.stringify({ command, error: r.reason, prompts: r.prompts }, null, 2) };
        }
      }
    } catch (e) {
      if (e instanceof ToolError) throw e;
      return refused(`The tree action failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ---- screenshot (2.5) ------------------------------------------------------------------------------

const sysmlUiScreenshot: ToolDefinition = {
  name: "sysml_ui_screenshot",
  description:
    "A PNG of what a webview shows right now, as the user sees it, in the active theme: the selection, open context menu, legend, compartments, palette and properties panel of a diagram (`path`), or the requirements editor of a `package` or `file` (open it first with sysml_ui_requirements). Only that webview is captured, never the screen. " +
    "Unlike sysml_read_diagram this is the live editor, not the export. Needs sysml.agent.uiControl on in a trusted workspace; every call is logged.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", maxLength: 4096, description: "A .sysmld diagram file, inside the workspace." },
      package: { type: "string", maxLength: 500, description: "Qualified name of a requirements editor package scope." },
      file: { type: "string", maxLength: 4096, description: "A .sysml file of a requirements editor scope." },
    },
    additionalProperties: false,
  },
  readOnly: true,
  async handler(input, ctx) {
    const d = enter(ctx, "sysml_ui_screenshot", [input.path, input.package, input.file].find((x) => typeof x === "string") as string | undefined, input);
    if (!isDriver(d)) return d;
    if ([input.path, input.package, input.file].filter((x) => x !== undefined).length !== 1) throw new ToolError("Give exactly one of `path`, `package` and `file`.");
    let target: ScreenshotTarget;
    if (input.path !== undefined) target = { kind: "diagram", path: diagramPath(input.path, d) };
    else if (input.package !== undefined) target = { kind: "requirements", scope: { kind: "package", qualifiedName: text(input.package, "package", 500) } };
    else {
      const abs = resolveInWorkspace(text(input.file, "file", 4096), d.workspaceRoots());
      if (abs === undefined) return refused("Refused: the file is outside the workspace.");
      target = { kind: "requirements", scope: { kind: "file", path: abs } };
    }
    try {
      const b64 = await d.screenshot(target);
      const data = Uint8Array.from(Buffer.from(b64, "base64"));
      if (data.length < 8 || data[0] !== 0x89 || data[1] !== 0x50) return refused("The webview returned no PNG image.");
      return { text: JSON.stringify({ screenshot: true, bytes: data.length }), image: { data, mimeType: "image/png" } };
    } catch (e) {
      return refused(`The screenshot failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const uiToolDefinitions: readonly ToolDefinition[] = [sysmlUiCommand, sysmlUiAnswer, sysmlUiState, sysmlUiDiagram, sysmlUiRequirements, sysmlUiTree, sysmlUiScreenshot];
