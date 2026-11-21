import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ModelIndex } from "../model/index.js";
import { callTool, toolDefinitions, validateSchema, type DodafFiles, type ToolContext } from "./index.js";
import { FakeDiagrams } from "./test-support.js";
import { lmToolManifest } from "./manifest.js";
import { runGenerateCommand, rootCandidates } from "../dodaf/command-flow.js";

const LIB = readFileSync(join(__dirname, "../../resources/dodaf/DoDAF.sysml"), "utf8");
const MODEL = `package M {
  private import DoDAF::*;
  doc /* The mission. */
  #OperationalPerformer part p;
  #OperationalActivity action a1;
  #System part s;
  #OV1Graphic part pic { attribute path = "art/ov1.png"; }
}`;

function setup(over: { trusted?: boolean; model?: string } = {}) {
  const index = new ModelIndex();
  index.setDocument("file:///w/DoDAF.sysml", LIB);
  index.setDocument("file:///w/m.sysml", over.model ?? MODEL);
  const diagrams = new FakeDiagrams();
  const out = new Map<string, string | Uint8Array>();
  const existing = new Map<string, string>();
  const files: DodafFiles = {
    isTrusted: () => over.trusted ?? true,
    exists: async (p) => out.has(p) || existing.has(p),
    writeText: async (p, t) => void out.set(p, t),
    writeBytes: async (p, b) => void out.set(p, b),
    readBytes: async (p) => {
      if (existing.has(p)) return new TextEncoder().encode(existing.get(p)!);
      if (out.has(p) && typeof out.get(p) === "string") return new TextEncoder().encode(out.get(p) as string);
      if (p === "art/ov1.png") return new Uint8Array([1, 2, 3]);
      throw new Error("missing");
    },
  };
  const ctx: ToolContext = { index, uriToPath: (u) => (u.startsWith("file:///w/") ? u.slice(10) : undefined), pathToUri: () => undefined, diagrams, dodaf: files };
  return { ctx, diagrams, out, index, existing };
}
const call = async (ctx: ToolContext, input: unknown) => {
  const r = await callTool("sysml_dodaf_generate", input, ctx);
  return { r, json: r.isError ? undefined : JSON.parse(r.text) };
};

describe("sysml_dodaf_generate", () => {
  it("has a schema that rejects hostile input and is in the manifest", () => {
    const tool = toolDefinitions.find((t) => t.name === "sysml_dodaf_generate")!;
    expect(validateSchema({ root: "M", views: ["nope"] }, tool.inputSchema)).not.toEqual([]);
    expect(validateSchema({ root: "M", extra: 1 }, tool.inputSchema)).not.toEqual([]);
    expect(validateSchema({ root: "M", format: "png", plan: true, views: ["OV-1"], folder: "a/b" }, tool.inputSchema)).toEqual([]);
    expect(lmToolManifest().some((e) => e.name === "sysml_dodaf_generate" && !e.tags.includes("read-only"))).toBe(true);
  });

  it("plan: true writes nothing and creates no diagram", async () => {
    const { ctx, diagrams, out } = setup();
    const { json } = await call(ctx, { root: "M", plan: true });
    expect(out.size).toBe(0);
    expect(diagrams.files.size).toBe(0);
    expect(json.planOnly).toBe(true);
    expect(json.views.find((v: { id: string }) => v.id === "OV-2").status).toBe("planned");
    expect(json.missing["SV-1"]).toBeUndefined();
    expect(json.missing["CV-1"]).toContain("Capability");
  });

  it("creates diagrams, writes images and the document in docs/dodaf, linking only what exists", async () => {
    const { ctx, diagrams, out } = setup();
    const { json } = await call(ctx, { root: "M" });
    expect(json.document).toBe("docs/dodaf/M.md");
    expect(diagrams.files.has("M-OV-2.sysmld")).toBe(true);
    expect(out.get("docs/dodaf/images/OV-2.svg")).toContain("<svg");
    const md = out.get("docs/dodaf/M.md") as string;
    expect(md).toContain("![OV-2");
    expect(md).toContain("(images/OV-2.svg)");
  });

  it("copies the author's OV-1 graphic into images/", async () => {
    const { ctx, out } = setup();
    const { json } = await call(ctx, { root: "M", views: ["OV-1"] });
    expect(out.get("docs/dodaf/images/OV-1.png")).toEqual(new Uint8Array([1, 2, 3]));
    expect(out.get("docs/dodaf/M.md")).toContain("(images/OV-1.png)");
    expect(json.views[0].note).toContain("copied");
  });

  it("does not rewrite an existing diagram and skips sections without a diagram view", async () => {
    const { ctx, diagrams, index, out } = setup();
    await call(ctx, { root: "M", views: ["OV-2"] });
    const first = diagrams.files.get("M-OV-2.sysmld");
    const { json } = await call(ctx, { root: "M", views: ["OV-2"] });
    expect(diagrams.files.get("M-OV-2.sysmld")).toBe(first);
    expect(json.views[0].diagramCreated).toBe(false);
    const bare: ToolContext = { ...ctx, index };
    delete bare.diagrams;
    const r = await call(bare, { root: "M", views: ["OV-2"] });
    expect(r.json.views[0].status).toBe("skipped");
    expect(out.get("docs/dodaf/M.md")).toContain("_Skipped:");
  });

  it("still writes tables when image export fails", async () => {
    const { ctx, diagrams, out } = setup();
    diagrams.image = { ok: false, reason: "no webview" };
    const { json } = await call(ctx, { root: "M", views: ["AV-2", "OV-2"] });
    expect(json.views.find((v: { id: string }) => v.id === "OV-2").note).toContain("no webview");
    expect(out.get("docs/dodaf/M.md")).toContain("No webview".toLowerCase() === "" ? "" : "no webview");
    expect(out.has("docs/dodaf/images/OV-2.svg")).toBe(false);
  });

  it("refuses untrusted workspaces (plan still works), bad folders, unknown roots", async () => {
    const { ctx, out: out0, diagrams: d0 } = setup({ trusted: false });
    expect((await call(ctx, { root: "M" })).r.isError).toBe(true);
    expect((await call(ctx, { root: "M", plan: true })).r.isError).toBeUndefined();
    expect(out0.size).toBe(0);
    expect(d0.files.size).toBe(0);
    const t = setup().ctx;
    for (const folder of ["../x", "/abs", "a/../b", "C:/x", "a\\b", "a\0b"]) expect((await call(t, { root: "M", folder })).r.isError, folder).toBe(true);
    expect((await call(t, { root: "Nope" })).r.isError).toBe(true);
  });

  it("rejects an OV-1 graphic path that escapes the workspace", async () => {
    const { ctx, out } = setup({ model: MODEL.replace("art/ov1.png", "../secret.png") });
    const { json } = await call(ctx, { root: "M", views: ["OV-1"] });
    expect(json.gaps.some((g: { message: string }) => g.message.includes("@OV1Graphic"))).toBe(true);
    expect([...out.keys()].some((k) => k.includes("secret"))).toBe(false);
  });
});

describe("sysml_dodaf_generate safety", () => {
  it("refuses to replace files it did not write unless overwrite is given", async () => {
    const { ctx, out, existing } = setup();
    existing.set("docs/dodaf/M.md", "my own notes");
    const r = await call(ctx, { root: "M", views: ["AV-2"] });
    expect(r.r.isError).toBe(true);
    expect(out.size).toBe(0);
    expect((await call(ctx, { root: "M", views: ["AV-2"], plan: true })).json.overwriteRefused).toEqual(["docs/dodaf/M.md"]);
    expect((await call(ctx, { root: "M", views: ["AV-2"], overwrite: true })).r.isError).toBeUndefined();
    expect(out.get("docs/dodaf/M.md")).toContain("<!-- generated by sysml_dodaf_generate -->");
  });

  it("replaces its own document and images on a rerun", async () => {
    const { ctx, out } = setup();
    await call(ctx, { root: "M", views: ["OV-2"] });
    expect((await call(ctx, { root: "M", views: ["OV-2"] })).r.isError).toBeUndefined();
  });

  it("refuses a foreign image even when no document exists", async () => {
    const { ctx, existing } = setup();
    existing.set("docs/dodaf/images/OV-2.svg", "mine");
    expect((await call(ctx, { root: "M", views: ["OV-2"] })).r.isError).toBe(true);
  });

  it("escapes HTML, links and the title in the document", async () => {
    const m = MODEL.replace("doc /* The mission. */", "doc /* <script>x</script> [a](http://e) ![i](u) */").replace("package M", "package M");
    const { ctx, out } = setup({ model: m });
    await call(ctx, { root: "M", views: ["OV-1"] });
    const md = out.get("docs/dodaf/M.md") as string;
    expect(md).not.toContain("<script>");
    expect(md).toContain("&lt;script&gt;");
    expect(md).not.toContain("[a](");
  });

  it("gives same-named OV-5b activities distinct files", async () => {
    const m = `package M { private import DoDAF::*; #OperationalActivity action a { action x; } #OperationalActivity action b { action a2; } }`;
    const { ctx } = setup({ model: m.replace("action b", "action a") });
    const { json } = await call(ctx, { root: "M", plan: true, views: ["OV-5b"] });
    const files = json.views.map((v: { diagram?: string }) => v.diagram);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe("Generate DoDAF Document command flow", () => {
  it("asks for root and folder, then runs the tool", async () => {
    const { ctx, index } = setup();
    expect(rootCandidates(index)).toContain("M");
    const calls: unknown[] = [];
    const msgs: string[] = [];
    await runGenerateCommand(index, {
      pickRoot: async (items) => items.find((i) => i.label === "M")?.label,
      inputFolder: async (initial) => (expect(initial).toBe("docs/dodaf"), "out/d"),
      run: async (input) => (calls.push(input), callTool("sysml_dodaf_generate", input, ctx)),
      info: (m) => msgs.push(m),
      warn: (m) => msgs.push("W " + m),
      offerAddLibrary: async () => false,
    });
    expect(calls).toEqual([{ root: "M", folder: "out/d" }]);
    expect(msgs[0]).toContain("out/d/M.md");
  });

  it("does nothing when a picker is cancelled", async () => {
    const { index } = setup();
    let ran = false;
    await runGenerateCommand(index, { pickRoot: async () => undefined, inputFolder: async () => "x", run: async () => ((ran = true), { text: "{}" }), info: () => {}, warn: () => {}, offerAddLibrary: async () => false });
    expect(ran).toBe(false);
  });

  it("fails before writing when the DoDAF library is not in the model (tool and plan)", async () => {
    const { ctx, index, out } = setup();
    index.removeDocument("file:///w/DoDAF.sysml");
    for (const plan of [false, true]) {
      const { r } = await call(ctx, { root: "M", plan });
      expect(r.isError).toBe(true);
      expect(r.text).toContain("sysml.dodaf.addLibrary");
    }
    expect(out.size).toBe(0);
  });

  it("offers to add the library from the command and generates again", async () => {
    const { ctx, index } = setup();
    index.removeDocument("file:///w/DoDAF.sysml");
    let offered = 0;
    const msgs: string[] = [];
    await runGenerateCommand(index, {
      pickRoot: async () => "M",
      inputFolder: async () => "out",
      run: (input) => callTool("sysml_dodaf_generate", input, ctx),
      info: (m) => msgs.push(m),
      warn: (m) => msgs.push("W " + m),
      offerAddLibrary: async () => (offered++, index.setDocument("file:///w/DoDAF.sysml", LIB), true),
    });
    expect(offered).toBe(1);
    expect(msgs[0]).toContain("out/M.md");
  });

  it("reports an unresolved tag in gaps", async () => {
    const { ctx } = setup({ model: MODEL.replace("#System part s;", "#Sytem part s;") });
    const { json } = await call(ctx, { root: "M", plan: true });
    expect(json.gaps.some((g: { message: string }) => g.message.includes('"Sytem"'))).toBe(true);
  });
});
