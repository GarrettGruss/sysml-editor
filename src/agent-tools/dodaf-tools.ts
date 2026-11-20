/** The DoDAF generator tool. Transport-free; files and diagrams are reached through the context. */
import { isLibraryUri } from "../model/index.js";
import { DEFAULT_FOLDER, generateDocument, validateFolder } from "../dodaf/generate.js";
import { VIEW_IDS } from "../dodaf/mapping.js";
import { ToolError, type ToolDefinition } from "./types.js";

const GAP_CAP = 200;

const generate: ToolDefinition = {
  name: "sysml_dodaf_generate",
  description:
    "Generate a DoDAF 2.02 architecture description document from the model under `root` (a package or element, by qualified name). Views are selected from DoDAF metadata annotations (see the DoDAF library, SysML: Add DoDAF Library). " +
    "Table views (AV-1, AV-2, CV-1, OV-4, OV-5a, SV-5a, StdV-1, DIV-2) are written as Markdown tables; diagram views (CV-2, OV-1, OV-2, OV-5b, OV-6c, SV-1, SV-2, SV-4, SV-10c) get a diagram beside the root's source file, named <Name>-<VIEW>.sysmld, created if missing and reused if present (an existing .sysmld is never rewritten), " +
    "and an image rendered by the diagram view into <folder>/images/. OV-1 uses the picture named by @OV1Graphic { path } (workspace-relative) instead of a drawing when present. If the diagram view cannot draw, the tables are still written and the diagram sections say so. " +
    "The document is <folder>/<RootName>.md (default folder docs/dodaf; a document this tool wrote, and its images, are replaced; any other existing file there is refused unless `overwrite: true`; diagrams are never overwritten). With `plan: true` nothing is created or written: the result lists what would be produced. " +
    "Returns JSON: document path, per-view status (written, empty, skipped, planned) with diagram and image paths, `gaps` (model problems found in the tables) and `missing` (annotation definitions no element uses, per view): fix these and run again. Not available in an untrusted workspace.",
  inputSchema: {
    type: "object",
    properties: {
      root: { type: "string", minLength: 1, maxLength: 4096, description: "Qualified name of the architecture root, e.g. Mission." },
      folder: { type: "string", minLength: 1, maxLength: 1000, description: `Workspace-relative output folder. Default ${DEFAULT_FOLDER}.` },
      views: { type: "array", items: { type: "string", enum: [...VIEW_IDS] }, description: "View ids to produce. Default: all 17." },
      format: { type: "string", enum: ["svg", "png"], description: "Image format for diagram views. Default svg." },
      overwrite: { type: "boolean", description: "Replace <folder>/<RootName>.md and images that were not written by this tool. Default false: such files make the call fail." },
      plan: { type: "boolean", description: "Only report what would be produced and the gaps; write nothing." },
    },
    required: ["root"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const files = ctx.dodaf;
    if (!files) throw new ToolError("DoDAF generation is not available in this session.");
    const plan = input.plan === true;
    if (!plan && !files.isTrusted())
      throw new ToolError("This workspace is not trusted, so the DoDAF generator is disabled. Ask the user to trust the workspace (Workspace Trust) to allow it. `plan: true` still works.");
    const folder = typeof input.folder === "string" ? input.folder.replace(/\/+$/, "") : DEFAULT_FOLDER;
    const bad = validateFolder(folder);
    if (bad) throw new ToolError(`Invalid folder "${folder.slice(0, 100)}": ${bad}.`);
    const qn = input.root as string;
    const root = ctx.index.findByQualifiedName(qn)[0];
    if (!root) throw new ToolError(`No element with qualified name "${qn}". Use sysml_get_element_tree to find qualified names.`);
    if (isLibraryUri(root.uri)) throw new ToolError(`"${qn}" is standard library content and cannot be the architecture root.`);
    const views = input.views as string[] | undefined;
    const report = await generateDocument({
      index: ctx.index,
      root,
      folder,
      ...(views ? { views } : {}),
      imageFormat: input.format === "png" ? "png" : "svg",
      plan,
      ...(input.overwrite === true ? { overwrite: true } : {}),
      uriToPath: ctx.uriToPath,
      files,
      ...(ctx.diagrams ? { diagrams: ctx.diagrams } : {}),
    });
    const gaps = report.gaps.slice(0, GAP_CAP);
    return { text: JSON.stringify({ ...report, gaps, ...(report.gaps.length > gaps.length ? { gapsTruncated: report.gaps.length } : {}) }, null, 2) };
  },
};

export const dodafToolDefinitions: readonly ToolDefinition[] = [generate];
