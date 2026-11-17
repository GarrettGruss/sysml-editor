import { afterEach, describe, expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import { callTool, toolDefinitions, type CommandOutcome, type DiagramGesture, type DiagramObservation, type RequirementsAction, type RequirementsObservation, type RequirementsScopeArg, type ScreenshotTarget, type TreeNodeInfo, type ToolContext, type UiAnswer, type UiDriver, type UiGate, type UiState } from "./index.js";
import { MessageLog, PromptBroker, formatAuditLine, isAllowedCommand, runUntilPromptOrDone } from "./ui-support.js";

const ROOT = "/work/space";

class FakeDriver implements UiDriver {
  gateState: UiGate = { enabled: true, trusted: true };
  lines: string[] = [];
  ran: { id: string; args: unknown[] }[] = [];
  broker = new PromptBroker(1000);
  messages = new MessageLog(3);
  gate() { return this.gateState; }
  workspaceRoots() { return [ROOT]; }
  audit(line: string) { this.lines.push(line); }
  async runCommand(id: string, args: unknown[]): Promise<CommandOutcome> {
    this.ran.push({ id, args });
    if (id === "sysml.createDiagram") void this.broker.ask({ kind: "input", title: "Name", validate: (v) => (/^\w+$/.test(v) ? undefined : "Use letters and digits.") });
    return { ok: true, completed: id !== "sysml.createDiagram", prompts: this.broker.list() };
  }
  prompts() { return this.broker.list(); }
  async answer(id: number | undefined, a: UiAnswer) {
    return this.broker.answer(id, a, (p) => (p.startsWith(ROOT) ? p : undefined));
  }
  async state(): Promise<UiState> {
    return { selection: [], menus: [], undo: [], messages: this.messages.drain(), prompts: this.broker.list(), navigation: [], clipboard: "none" };
  }
  gestures: { path: string; gesture: DiagramGesture }[] = [];
  async diagramGesture(path: string, gesture: DiagramGesture): Promise<DiagramObservation> {
    this.gestures.push({ path, gesture });
    return { path, selected: [], menu: ["Align Left"], nodes: [], edgeCount: 0, descriptions: true, inlineEditor: false, quickBar: [], zoom: 1, clipboard: "none" };
  }
  reqCalls: { scope: RequirementsScopeArg; action: RequirementsAction }[] = [];
  async requirements(scope: RequirementsScopeArg, action: RequirementsAction): Promise<RequirementsObservation> {
    this.reqCalls.push({ scope, action });
    return { view: "document", scopeName: "P", outline: [], items: [], matrixRows: [], pendingEdits: [], errors: [] };
  }
  treeInfos: TreeNodeInfo[] = [
    { id: "pkg", label: "P", contextValue: "sysmlElement", depth: 1, hasChildren: true, selected: false },
    { id: "dir", label: "src", contextValue: "sysmlFolder", depth: 1, hasChildren: true, selected: false },
  ];
  treeRan: { command: string; node: string | undefined }[] = [];
  async treeList() { return this.treeInfos; }
  async treeNode(id: string) { return this.treeInfos.find((n) => n.id === id); }
  async treeSelect(): Promise<{ ok: true }> { return { ok: true }; }
  async treeCollapseAll() {}
  async treeCommand(command: string, node: string | undefined): Promise<CommandOutcome> {
    this.treeRan.push({ command, node });
    return { ok: true, completed: true, prompts: [] };
  }
  shot = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]).toString("base64");
  shots: ScreenshotTarget[] = [];
  async screenshot(t: ScreenshotTarget) { this.shots.push(t); return this.shot; }
}

const ctxOf = (ui?: UiDriver): ToolContext => ({ index: undefined as never, uriToPath: () => undefined, pathToUri: () => undefined, ...(ui ? { ui } : {}) });
const call = async (d: FakeDriver, name: string, input: unknown) => {
  const r = await callTool(name, input, ctxOf(d));
  return { ...r, json: JSON.parse(r.text.startsWith("{") ? r.text : "{}") as Record<string, any> };
};

afterEach(() => vi.useRealTimers());

describe("UI-control gate", () => {
  it("is registered with the shared definitions", () => {
    for (const n of ["sysml_ui_command", "sysml_ui_answer", "sysml_ui_state"]) expect(toolDefinitions.some((t) => t.name === n)).toBe(true);
  });

  it("refuses with the setting off, naming it, and runs nothing", async () => {
    const d = new FakeDriver();
    d.gateState = { enabled: false, trusted: true };
    const r = await call(d, "sysml_ui_command", { command: "sysml.createDiagram" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("sysml.agent.uiControl");
    expect(d.ran).toEqual([]);
    expect((await call(d, "sysml_ui_answer", { cancel: true })).isError).toBe(true);
  });

  it("refuses everything in an untrusted workspace but the state tool answers enabled false", async () => {
    const d = new FakeDriver();
    d.gateState = { enabled: true, trusted: false };
    const r = await call(d, "sysml_ui_command", { command: "undo" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("untrusted");
    expect(d.ran).toEqual([]);
    const s = await call(d, "sysml_ui_state", {});
    expect(s.isError).toBeUndefined();
    expect(s.json.enabled).toBe(false);
  });

  it("answers enabled false for the state tool with the setting off and when no driver exists", async () => {
    const d = new FakeDriver();
    d.gateState = { enabled: false, trusted: true };
    expect((await call(d, "sysml_ui_state", {})).json.enabled).toBe(false);
    expect(JSON.parse((await callTool("sysml_ui_state", {}, ctxOf())).text).enabled).toBe(false);
    expect((await callTool("sysml_ui_command", { command: "undo" }, ctxOf())).isError).toBe(true);
  });

  it("writes one audit line per call, refused or not, before running", async () => {
    const d = new FakeDriver();
    await call(d, "sysml_ui_command", { command: "undo" });
    await call(d, "sysml_ui_command", { command: "workbench.action.terminal.new" });
    d.gateState = { enabled: false, trusted: true };
    await call(d, "sysml_ui_state", {});
    expect(d.lines).toHaveLength(3);
    expect(d.lines[0]).toMatch(/^sysml_ui_command target=undo args=/);
  });
});

describe("audit line", () => {
  it("truncates long text and stays on one line", () => {
    const line = formatAuditLine("sysml_ui_answer", "prompt 1", { text: "x".repeat(500) + "\nsecond" });
    expect(line).not.toMatch(/[\r\n]/);
    expect(line).toContain("(507 chars)");
    expect(line.length).toBeLessThan(300);
    expect(formatAuditLine("t", undefined, undefined)).toBe("t target=- args={}");
  });
});

describe("sysml_ui_command", () => {
  it("allows sysml.* and the core commands only", () => {
    for (const id of ["sysml.createDiagram", "sysml.deleteElement", "undo", "redo", "workbench.action.files.save", "workbench.action.files.saveAll", "workbench.action.navigateBack", "workbench.action.navigateForward"]) expect(isAllowedCommand(id)).toBe(true);
    for (const id of ["workbench.action.terminal.new", "sysml", "sysml.", "xsysml.a", "sysml.a b", "vscode.open", "workbench.action.files.saveAs", "sysml.x;rm"]) expect(isAllowedCommand(id)).toBe(false);
  });

  it("refuses an unlisted command and runs nothing", async () => {
    const d = new FakeDriver();
    const r = await call(d, "sysml_ui_command", { command: "workbench.action.terminal.new" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("allowlist");
    expect(d.ran).toEqual([]);
  });

  it("runs an allowed command and lists the prompt it opened", async () => {
    const d = new FakeDriver();
    const r = await call(d, "sysml_ui_command", { command: "sysml.createDiagram", args: ["Pkg::A", 3, true, { k: "v" }] });
    expect(r.isError).toBeUndefined();
    expect(r.json.completed).toBe(false);
    expect(r.json.prompts[0]).toMatchObject({ id: 1, kind: "input" });
    expect(d.ran[0]).toEqual({ id: "sysml.createDiagram", args: ["Pkg::A", 3, true, { k: "v" }] });
  });

  it("refuses paths outside the workspace and turns inside ones into file URIs", async () => {
    const d = new FakeDriver();
    for (const bad of ["/etc/passwd", "../outside.sysml", `${ROOT}/../x`, "file:///etc/passwd", "~/x", "C:\\Windows\\x", "http://evil/x", `${ROOT}-other/f.sysml`]) {
      const r = await call(d, "sysml_ui_command", { command: "sysml.createDiagram", args: [bad] });
      expect(r.isError, bad).toBe(true);
    }
    expect((await call(d, "sysml_ui_command", { command: "sysml.createDiagram", args: [{ nested: { p: "/etc/hosts" } }] })).isError).toBe(true);
    expect(d.ran).toEqual([]);
    await call(d, "sysml_ui_command", { command: "undo", args: ["models/a.sysml", `${ROOT}/b.sysml`] });
    expect(d.ran[0]!.args).toEqual([pathToFileURL(`${ROOT}/models/a.sysml`).toString(), pathToFileURL(`${ROOT}/b.sysml`).toString()]);
  });

  it("refuses hostile argument shapes", async () => {
    const d = new FakeDriver();
    const deep = { a: { b: { c: { d: 1 } } } };
    for (const args of [new Array(9).fill(1), [deep], [JSON.parse('{"__proto__":{"x":1}}')], ["a\0b"], ["x".repeat(5000)], [null, [[[[1]]]]]]) {
      expect((await call(d, "sysml_ui_command", { command: "undo", args })).isError, JSON.stringify(args).slice(0, 40)).toBe(true);
    }
    expect((await call(d, "sysml_ui_command", { command: "undo", args: "nope" })).isError).toBe(true);
    expect((await call(d, "sysml_ui_command", { command: "undo", extra: 1 })).isError).toBe(true);
    expect(d.ran).toEqual([]);
  });
});

describe("sysml_ui_answer", () => {
  const open = async (d: FakeDriver) => {
    await call(d, "sysml_ui_command", { command: "sysml.createDiagram" });
  };

  it("needs exactly one answer field", async () => {
    const d = new FakeDriver();
    await open(d);
    expect((await call(d, "sysml_ui_answer", {})).isError).toBe(true);
    expect((await call(d, "sysml_ui_answer", { text: "a", cancel: true })).isError).toBe(true);
    expect((await call(d, "sysml_ui_answer", { confirm: false })).isError).toBe(true);
    expect(d.broker.list()).toHaveLength(1);
  });

  it("returns the validation message and keeps the input box open", async () => {
    const d = new FakeDriver();
    await open(d);
    const bad = await call(d, "sysml_ui_answer", { text: "not valid!" });
    expect(bad.isError).toBe(true);
    expect(bad.json.validation).toBe("Use letters and digits.");
    expect(bad.json.prompts[0].validation).toBe("Use letters and digits.");
    const good = await call(d, "sysml_ui_answer", { prompt: 1, text: "Fine1" });
    expect(good.json.answered).toBe(true);
    expect(good.json.prompts).toEqual([]);
  });

  it("picks by label (case-insensitive), rejects unknown labels and wrong answer kinds", async () => {
    const d = new FakeDriver();
    const p = d.broker.ask({ kind: "pick", items: ["Alpha", "Beta"] });
    expect((await call(d, "sysml_ui_answer", { pick: "Gamma" })).isError).toBe(true);
    expect((await call(d, "sysml_ui_answer", { text: "Alpha" })).isError).toBe(true);
    expect((await call(d, "sysml_ui_answer", { pick: "beta" })).json.answered).toBe(true);
    expect(await p).toEqual({ picked: "Beta" });
  });

  it("answers multi-picks, confirmations, choices and cancels", async () => {
    const d = new FakeDriver();
    const m = d.broker.ask({ kind: "multiPick", items: ["A", "B", "C"] });
    expect((await call(d, "sysml_ui_answer", { picks: ["A", "Z"] })).isError).toBe(true);
    await call(d, "sysml_ui_answer", { picks: ["C", "A", "C"] });
    expect(await m).toEqual({ pickedMany: ["C", "A"] });
    const c = d.broker.ask({ kind: "confirm", message: "Delete?" });
    await call(d, "sysml_ui_answer", { confirm: true });
    expect(await c).toEqual({ confirmed: true });
    const x = d.broker.ask({ kind: "choice", message: "m", items: ["Go"] });
    await call(d, "sysml_ui_answer", { cancel: true });
    expect(await x).toEqual({ cancelled: true });
  });

  it("resolves a save path inside the workspace only", async () => {
    const d = new FakeDriver();
    const s = d.broker.ask({ kind: "save", value: "a.png" });
    expect((await call(d, "sysml_ui_answer", { path: "/tmp/out.png" })).isError).toBe(true);
    expect((await call(d, "sysml_ui_answer", { path: "../out.png" })).isError).toBe(true);
    expect(d.broker.list()).toHaveLength(1);
    await call(d, "sysml_ui_answer", { path: "images/out.png" });
    expect(await s).toEqual({ path: `${ROOT}/images/out.png` });
  });

  it("refuses when no prompt is open or the id is unknown", async () => {
    const d = new FakeDriver();
    expect((await call(d, "sysml_ui_answer", { cancel: true })).isError).toBe(true);
    d.broker.ask({ kind: "confirm", message: "m" });
    expect((await call(d, "sysml_ui_answer", { prompt: 99, confirm: true })).isError).toBe(true);
  });
});

describe("prompt broker", () => {
  it("cancels a prompt left open after the timeout", async () => {
    vi.useFakeTimers();
    const timedOut: number[] = [];
    const b = new PromptBroker(500, (p) => timedOut.push(p.id));
    const p = b.ask({ kind: "confirm", message: "m" });
    vi.advanceTimersByTime(499);
    expect(b.list()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(await p).toEqual({ cancelled: true });
    expect(b.list()).toEqual([]);
    expect(timedOut).toEqual([1]);
  });

  it("lets a command return as soon as a prompt opens", async () => {
    const b = new PromptBroker(1000);
    let finish: () => void = () => {};
    const cmd = new Promise<string>((r) => (finish = () => r("done")));
    const run = runUntilPromptOrDone(cmd, b, 10_000);
    void b.ask({ kind: "confirm", message: "m" });
    expect(await run).toEqual({ settled: false });
    finish();
    b.cancelAll();
    expect(await runUntilPromptOrDone(Promise.resolve(5), b, 10)).toEqual({ settled: true, value: 5 });
  });

  it("stops waiting at the limit", async () => {
    vi.useFakeTimers();
    const r = runUntilPromptOrDone(new Promise<number>(() => {}), new PromptBroker(1000), 50);
    vi.advanceTimersByTime(60);
    expect(await r).toEqual({ settled: false });
  });
});

describe("sysml_ui_state", () => {
  it("reports each message once and keeps a bounded queue", async () => {
    const d = new FakeDriver();
    for (const t of ["a", "b", "c", "d"]) d.messages.add("warning", t);
    const first = await call(d, "sysml_ui_state", {});
    expect(first.json.enabled).toBe(true);
    expect(first.json.messages.map((m: { text: string }) => m.text)).toEqual(["b", "c", "d"]);
    expect((await call(d, "sysml_ui_state", {})).json.messages).toEqual([]);
  });
});

describe("sysml_ui_diagram", () => {
  const P = `${ROOT}/a.sysmld`;
  it("passes a valid gesture and returns the observation, with the menu labels", async () => {
    const d = new FakeDriver();
    const r = await call(d, "sysml_ui_diagram", { path: "a.sysmld", gesture: { kind: "contextmenu", id: "n1" } });
    expect(r.isError).toBeFalsy();
    expect(r.json.menu).toEqual(["Align Left"]);
    expect(d.gestures).toEqual([{ path: P, gesture: { kind: "contextmenu", id: "n1" } }]);
    await call(d, "sysml_ui_diagram", { path: "a.sysmld", gesture: { kind: "menuItem", label: "Align Left" } });
    expect(d.gestures[1]!.gesture).toEqual({ kind: "menuItem", label: "Align Left" });
  });
  it("refuses hostile input and runs nothing", async () => {
    const d = new FakeDriver();
    for (const input of [
      { path: "/etc/passwd.sysmld", gesture: { kind: "flush" } },
      { path: "../x.sysmld", gesture: { kind: "flush" } },
      { path: "a.txt", gesture: { kind: "flush" } },
      { path: "a.sysmld", gesture: { kind: "eval", code: "1" } },
      { path: "a.sysmld", gesture: { kind: "select" } },
      { path: "a.sysmld", gesture: { kind: "select", id: "n1", extra: 1 } },
      { path: "a.sysmld", gesture: { kind: "drag", id: "n1", dx: Infinity, dy: 0 } },
      { path: "a.sysmld", gesture: { kind: "drag", id: "n1", dx: 1e12, dy: 0 } },
      { path: "a.sysmld", gesture: { kind: "menu", id: "n1", action: "rm -rf" } },
      { path: "a.sysmld", gesture: { kind: "key", key: "x".repeat(1000) } },
      { path: "a.sysmld", gesture: { kind: "__proto__" } },
      { path: "a.sysmld", gesture: [] },
    ]) {
      const r = await call(d, "sysml_ui_diagram", input);
      expect(r.isError, JSON.stringify(input)).toBe(true);
    }
    expect(d.gestures).toEqual([]);
  });
  it("is gated", async () => {
    const d = new FakeDriver();
    d.gateState = { enabled: false, trusted: true };
    const r = await call(d, "sysml_ui_diagram", { path: "a.sysmld", gesture: { kind: "flush" } });
    expect(r.isError).toBe(true);
    expect(d.gestures).toEqual([]);
  });
});

describe("sysml_ui_requirements", () => {
  it("switches the view and builds gestures", async () => {
    const d = new FakeDriver();
    expect((await call(d, "sysml_ui_requirements", { package: "P", action: "view", view: "matrix" })).isError).toBeFalsy();
    await call(d, "sysml_ui_requirements", { package: "P", action: "dragToc", fromQn: "P::A", ontoQn: "P::B", position: "before" });
    await call(d, "sysml_ui_requirements", { file: "m.sysml", action: "click", selector: "[data-testid=add-root-requirement]" });
    expect(d.reqCalls[0]).toEqual({ scope: { kind: "package", qualifiedName: "P" }, action: { kind: "view", view: "matrix" } });
    expect(d.reqCalls[1]!.action).toEqual({ kind: "gesture", gesture: { kind: "dragToc", fromQn: "P::A", ontoQn: "P::B", position: "before" } });
    expect(d.reqCalls[2]!.scope).toEqual({ kind: "file", path: `${ROOT}/m.sysml` });
  });
  it("refuses a bad scope, selector, path or view", async () => {
    const d = new FakeDriver();
    for (const input of [
      { action: "observe" },
      { package: "P", file: "m.sysml", action: "observe" },
      { file: "/etc/x.sysml", action: "observe" },
      { package: "P", action: "click", selector: "a\u0000b" },
      { package: "P", action: "click" },
      { package: "P", action: "exportMatrix", format: "csv", path: "/tmp/out.csv" },
      { package: "P", action: "view", view: "grid" },
      { package: "P", action: "eval" },
    ]) expect((await call(d, "sysml_ui_requirements", input)).isError, JSON.stringify(input)).toBe(true);
    expect(d.reqCalls).toEqual([]);
    expect((await call(d, "sysml_ui_requirements", { package: "P", action: "exportMatrix", format: "csv", path: "out.csv" })).isError).toBeFalsy();
    expect(d.reqCalls[0]!.action).toEqual({ kind: "exportMatrix", format: "csv", path: `${ROOT}/out.csv` });
  });
});

describe("sysml_ui_tree", () => {
  it("lists nodes and runs offered commands", async () => {
    const d = new FakeDriver();
    expect((await call(d, "sysml_ui_tree", { op: "list" })).json.nodes).toHaveLength(2);
    expect((await call(d, "sysml_ui_tree", { op: "command", command: "sysml.tree.rename", node: "pkg" })).isError).toBeFalsy();
    expect((await call(d, "sysml_ui_tree", { op: "command", command: "sysml.tree.refresh" })).isError).toBeFalsy();
    expect((await call(d, "sysml_ui_tree", { op: "command", command: "sysml.tree.newFile", node: "dir" })).isError).toBeFalsy();
    expect(d.treeRan).toEqual([{ command: "sysml.tree.rename", node: "pkg" }, { command: "sysml.tree.refresh", node: undefined }, { command: "sysml.tree.newFile", node: "dir" }]);
  });
  it("refuses a command not offered for the node, unknown nodes and unlisted commands", async () => {
    const d = new FakeDriver();
    for (const input of [
      { op: "command", command: "sysml.tree.deleteFile", node: "pkg" },
      { op: "command", command: "sysml.tree.rename", node: "dir" },
      { op: "command", command: "sysml.tree.rename" },
      { op: "command", command: "sysml.tree.rename", node: "nope" },
      { op: "command", command: "workbench.action.terminal.new", node: "pkg" },
      { op: "command", command: "sysml.tree.refresh", node: "pkg" },
      { op: "delete" },
      { op: "select", nodes: [] },
    ]) expect((await call(d, "sysml_ui_tree", input)).isError, JSON.stringify(input)).toBe(true);
    expect(d.treeRan).toEqual([]);
  });
});

describe("sysml_ui_screenshot", () => {
  it("returns a PNG image and refuses outside paths", async () => {
    const d = new FakeDriver();
    const r = await callTool("sysml_ui_screenshot", { path: "a.sysmld" }, ctxOf(d));
    expect(r.isError).toBeFalsy();
    expect(r.image?.mimeType).toBe("image/png");
    expect(d.shots).toEqual([{ kind: "diagram", path: `${ROOT}/a.sysmld` }]);
    expect((await call(d, "sysml_ui_screenshot", { path: "/etc/a.sysmld" })).isError).toBe(true);
    expect((await call(d, "sysml_ui_screenshot", {})).isError).toBe(true);
    d.shot = Buffer.from("not a png at all").toString("base64");
    expect((await call(d, "sysml_ui_screenshot", { path: "a.sysmld" })).isError).toBe(true);
  });
});
