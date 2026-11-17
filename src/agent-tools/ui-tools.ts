/**
 * The UI-control tools: run an allowlisted editor command, answer open prompts, and observe the UI state. They reach the
 * window only through `UiDriver` (D55), and are refused unless the setting is on and the workspace is trusted (D53).
 * Every input is hostile: validated here before the driver sees it. Transport-free, no `vscode`.
 */
import { ToolError, type ToolContext, type ToolDefinition, type ToolResult } from "./types.js";
import type { UiAnswer, UiDriver } from "./ui-driver.js";
import { formatAuditLine, isAllowedCommand, resolveInWorkspace, validateCommandArgs } from "./ui-support.js";

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

export const uiToolDefinitions: readonly ToolDefinition[] = [sysmlUiCommand, sysmlUiAnswer, sysmlUiState];
