/**
 * The model-editing tools: create, delete, rename and change elements, create connections and
 * satisfy relationships. Transport-free. They call the same `ModelService` operations as the tree
 * and the diagram editor, so an agent and a person making the same edit produce the same text.
 */
import { isLibraryUri, type Element } from "../model/index.js";
import type { OpFailure, OpOk, OpResult, Properties, Target } from "../model-service/service.js";
import { USAGE_KINDS, DEFINITION_KINDS } from "../model-service/service.js";
import { ToolError, type EditContext, type ToolContext, type ToolDefinition } from "./types.js";

const json = (v: unknown) => ({ text: JSON.stringify(v, null, 2) });

function editing(ctx: ToolContext): EditContext {
  if (!ctx.edits) throw new ToolError("Model editing is not available in this session.");
  if (!ctx.edits.isTrusted())
    throw new ToolError("This workspace is not trusted, so model edits are disabled. Ask the user to trust the workspace (Workspace Trust) to allow them. Reading with sysml_get_element and sysml_get_element_tree still works.");
  return ctx.edits;
}

function pathOf(ctx: ToolContext, uri: string): string {
  return ctx.uriToPath(uri) ?? uri;
}

function locate(ctx: ToolContext, ed: EditContext, qn: string, what: string): Target {
  const t = ed.service.find(qn);
  if (!t) throw new ToolError(`No ${what} with qualified name "${qn}". Use sysml_get_element_tree to find qualified names.`);
  if (isLibraryUri(t.element.uri)) throw new ToolError(`"${qn}" is standard library content, which is read-only.`);
  return t;
}

/** An actionable error for a refused or failed operation. */
function refused(r: OpFailure): ToolError {
  return new ToolError(r.reason + (r.goToDefinition ? ` (The declaring element is ${r.goToDefinition.name}.)` : "") + " No files were changed.");
}

function ok(r: OpResult): OpOk {
  if (!r.ok) throw refused(r);
  return r;
}

async function diagramTarget(ctx: ToolContext, ed: EditContext, input: Record<string, unknown>): Promise<{ uri: string; path: string } | undefined> {
  if (typeof input.diagram !== "string") return undefined;
  return { uri: await ed.diagramUri(input.diagram), path: input.diagram };
}

function summary(ctx: ToolContext, r: OpOk, extra: Record<string, unknown> = {}) {
  return json({
    description: r.description,
    filesChanged: r.files.map((u) => pathOf(ctx, u)),
    ...(r.diagramFiles.length ? { diagramFilesChanged: r.diagramFiles.map((u) => pathOf(ctx, u)) } : {}),
    ...extra,
    note: "The .sysml files were changed and saved. The user can undo the edit in one step with Ctrl+Z.",
  });
}

function placementNote(ctx: ToolContext, r: OpOk, target: { path: string } | undefined) {
  return target ? { diagram: { path: target.path, placed: r.diagramFiles.some((u) => pathOf(ctx, u) === target.path) || r.diagramChange !== undefined } } : {};
}

const KINDS = [...DEFINITION_KINDS, ...USAGE_KINDS];

const diagramProp = { type: "string" as const, description: "Optional workspace-relative path of a .sysmld diagram to place the new element on (as a node, or an edge for a relationship). The diagram file is updated on top of its last saved state; pending layout in an open diagram stays unsaved." };

// ------------------------------------------------------------------ sysml_create_element

const createElement: ToolDefinition = {
  name: "sysml_create_element",
  description:
    "Create a new element in the model by inserting its declaration into the owner's .sysml source, exactly as the diagram palette and the tree's Add Child do (minimal text edit, indentation copied, a body created when the owner ends in `;`). " +
    "`owner` is the qualified name of the package, definition or usage to add it to (a feature a usage only inherits cannot be the owner; add to the usage itself). `kind` is one of: " + KINDS.join(", ") + ". " +
    "Optional `type` (qualified name or name of a definition of the matching kind; an import is added when needed), `multiplicity` (e.g. 0..1 or *), `shortName` and `documentation`. " +
    "With `diagram`, a node for the new element is also placed on that diagram. The edit is applied directly, the file is saved, and the user can undo it in one step. " +
    "Returns JSON with the new element's qualifiedName, the files changed and (with `diagram`) the placement. Refused for files with syntax errors, in an untrusted workspace and for names that already exist in the owner. Not for deleting (sysml_delete_element) or changing (sysml_set_element_properties).",
  inputSchema: {
    type: "object",
    properties: {
      owner: { type: "string", minLength: 1, description: "Qualified name of the element to add to, e.g. VehicleModel::Vehicle." },
      kind: { type: "string", enum: KINDS, description: "What to create." },
      name: { type: "string", minLength: 1, description: "Name of the new element (quoted automatically when it needs quotes)." },
      type: { type: "string", description: "Type of a usage: qualified name or name of a definition, e.g. Engine or Powertrain::Engine." },
      multiplicity: { type: "string", description: "Multiplicity of a usage, e.g. 4, 0..1 or *." },
      shortName: { type: "string", description: "Short name, written as <shortName>." },
      documentation: { type: "string", description: "Documentation text, written as a doc comment." },
      diagram: diagramProp,
    },
    required: ["owner", "kind", "name"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    const owner = locate(ctx, ed, input.owner as string, "owner element");
    const refusal = owner.context ? ed.service.refuseIfInherited(owner, "extended") : undefined;
    if (refusal) throw refused(refusal);
    const target = await diagramTarget(ctx, ed, input);
    const spec = {
      kind: input.kind as string,
      name: input.name as string,
      ...(typeof input.type === "string" && input.type !== "" ? { type: input.type } : {}),
      ...(typeof input.multiplicity === "string" && input.multiplicity !== "" ? { multiplicity: input.multiplicity } : {}),
      ...(typeof input.shortName === "string" && input.shortName !== "" ? { shortName: input.shortName } : {}),
      ...(typeof input.documentation === "string" && input.documentation !== "" ? { documentation: input.documentation } : {}),
    };
    const r = ok(await ed.service.addElement(owner.element, spec, { ...(owner.context ? { context: owner.context } : {}), ...(target ? { diagram: target.uri, placement: { diagram: target.uri } } : {}) }));
    return summary(ctx, r, { created: { qualifiedName: r.element?.qualifiedName, kind: spec.kind, name: spec.name }, ...placementNote(ctx, r, target) });
  },
};

// ------------------------------------------------------------------ sysml_delete_element

const deleteElement: ToolDefinition = {
  name: "sysml_delete_element",
  description:
    "Delete an element from the MODEL: its whole declaration (with its body, owned members and attached documentation) is removed from the .sysml source and saved, and nodes for it are removed from every diagram file. " +
    "This is different from sysml_remove_from_diagram, which only removes a node from a diagram and leaves the model untouched. References to the deleted element elsewhere are not rewritten and will no longer resolve (check with sysml_validate); the result reports how many remain (`remainingReferences`) and where. " +
    "`element` is the qualified name. A feature that a usage only inherits from its definition (for example Model::vehicle1::engine, declared in Vehicle) cannot be deleted from the usage: the error names the declaring definition. " +
    "Applied directly; the user can undo it in one step. Refused for files with syntax errors and in an untrusted workspace.",
  inputSchema: {
    type: "object",
    properties: { element: { type: "string", minLength: 1, description: "Qualified name of the element to delete." } },
    required: ["element"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    const t = locate(ctx, ed, input.element as string, "element");
    const r = ok(await ed.service.deleteElement(t));
    return summary(ctx, r, {
      deleted: input.element,
      ...(r.remainingReferences && r.remainingReferences.count > 0
        ? {
            remainingReferences: r.remainingReferences.count,
            remainingReferenceLocations: r.remainingReferences.locations.map((l) => `${pathOf(ctx, l.uri)}:${l.line + 1}:${l.column + 1}`),
            warning: "References to the deleted element (or to elements it owned) remain and no longer resolve; fix or remove them (see sysml_validate).",
          }
        : {}),
    });
  },
};

// ------------------------------------------------------------------ sysml_rename_element

const renameElement: ToolDefinition = {
  name: "sysml_rename_element",
  description:
    "Rename an element: its declaration and every reference to it that resolves in the workspace (qualified references change only the matching segment; names are quoted when needed), and every diagram file that refers to it. " +
    "`element` is the qualified name, `newName` the new name. Returns JSON with the new qualifiedName, `referencesUpdated`, and `couldNotJudge` (mentions of the old name that the tool could not decide about, with a few locations: check them). " +
    "Refused when the new name clashes with another member, for inherited features (rename them in their definition), for files with syntax errors and in an untrusted workspace. Applied directly; one undo step for the user.",
  inputSchema: {
    type: "object",
    properties: {
      element: { type: "string", minLength: 1, description: "Qualified name of the element to rename." },
      newName: { type: "string", minLength: 1, description: "The new name." },
    },
    required: ["element", "newName"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    const t = locate(ctx, ed, input.element as string, "element");
    const r = ok(await ed.service.rename(t, input.newName as string));
    return summary(ctx, r, {
      oldQualifiedName: input.element,
      qualifiedName: r.element?.qualifiedName,
      referencesUpdated: r.referencesUpdated ?? 0,
      couldNotJudge: r.unjudged?.count ?? 0,
      ...(r.skippedDiagrams?.length ? { diagramFilesNotUpdated: r.skippedDiagrams.map((u) => pathOf(ctx, u)) } : {}),
      ...(r.unjudged && (r.unjudged.count > 0 || r.unjudged.skippedDocuments.length > 0)
        ? { couldNotJudgeLocations: r.unjudged.locations.map((l) => `${pathOf(ctx, l.uri)}:${l.line + 1}:${l.column + 1}`), filesNotExamined: r.unjudged.skippedDocuments.map((u) => pathOf(ctx, u)) }
        : {}),
    });
  },
};

// ------------------------------------------------------------------ sysml_set_element_properties

const setProperties: ToolDefinition = {
  name: "sysml_set_element_properties",
  description:
    "Change properties of an element in its .sysml source: `name`, `shortName`, `type` (of a usage: qualified name or name of a definition; an import is added when needed), `multiplicity` and `documentation`. " +
    "Give only the properties to change; an empty string removes shortName, type, multiplicity or documentation. All changes are one edit. " +
    "A feature that a usage only inherits cannot be changed from the usage (the error names the declaring definition). Refused for files with syntax errors and in an untrusted workspace. Returns JSON with the files changed and the qualifiedName after the edit.",
  inputSchema: {
    type: "object",
    properties: {
      element: { type: "string", minLength: 1, description: "Qualified name of the element." },
      name: { type: "string", minLength: 1, description: "New name (same as sysml_rename_element)." },
      shortName: { type: "string", description: "Short name; empty removes it." },
      type: { type: "string", description: "Type of a usage; empty removes it." },
      multiplicity: { type: "string", description: "Multiplicity, e.g. 4, 0..1 or *; empty removes it." },
      documentation: { type: "string", description: "Documentation text; empty removes it." },
    },
    required: ["element"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    const t = locate(ctx, ed, input.element as string, "element");
    const props: Properties = {};
    if (typeof input.name === "string") props.name = input.name;
    for (const k of ["shortName", "type", "multiplicity", "documentation"] as const) if (typeof input[k] === "string") props[k] = input[k] === "" ? null : (input[k] as string);
    if (Object.keys(props).length === 0) throw new ToolError("Give at least one property to change: name, shortName, type, multiplicity or documentation.");
    const r = ok(await ed.service.setProperties(t, props));
    return summary(ctx, r, {
      qualifiedName: r.element?.qualifiedName,
      ...(props.name !== undefined ? { referencesUpdated: r.referencesUpdated ?? 0, couldNotJudge: r.unjudged?.count ?? 0 } : {}),
    });
  },
};

// ------------------------------------------------------------------ sysml_create_relationship

function relationshipEnd(ctx: ToolContext, ed: EditContext, qn: string, what: string): Target {
  return locate(ctx, ed, qn, what);
}

const createRelationship: ToolDefinition = {
  name: "sysml_create_relationship",
  description:
    "Create a relationship statement in the model. `kind: \"connection\"` adds `connect <source> to <target>;` to `owner` (the element that contains both ends, e.g. the part def or usage that owns the two parts); `source` and `target` are qualified names of the connected parts or ports, written as feature chains relative to the owner. " +
    "`kind: \"satisfy\"` adds `satisfy <requirement> by <by>;` to `owner` (default: the package that holds `by`); `requirement` and `by` are qualified names. Names are written so they resolve from the owner; an import is added when needed. " +
    "With `diagram`, the new edge is also placed on that diagram when both ends are shown. Applied directly, saved, one undo step. Refused for files with syntax errors and in an untrusted workspace. Returns JSON with the files changed.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["connection", "satisfy"], description: "connection or satisfy." },
      owner: { type: "string", description: "Qualified name of the element that receives the statement. Required for a connection." },
      source: { type: "string", description: "connection: qualified name of the first end." },
      target: { type: "string", description: "connection: qualified name of the second end." },
      requirement: { type: "string", description: "satisfy: qualified name of the requirement." },
      by: { type: "string", description: "satisfy: qualified name of the satisfying element." },
      diagram: diagramProp,
    },
    required: ["kind"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    const need = (k: string) => {
      if (typeof input[k] !== "string" || input[k] === "") throw new ToolError(`${input.kind === "connection" ? "A connection" : "A satisfy relationship"} needs \`${k}\`.`);
      return input[k] as string;
    };
    const target = await diagramTarget(ctx, ed, input);
    const origin = target ? { diagram: target.uri, placement: { diagram: target.uri } } : {};
    if (input.kind === "connection") {
      const owner = locate(ctx, ed, need("owner"), "owner element");
      const a = relationshipEnd(ctx, ed, need("source"), "source");
      const b = relationshipEnd(ctx, ed, need("target"), "target");
      const r = ok(await ed.service.connect(owner.element, a, b, origin));
      return summary(ctx, r, { created: { kind: "connection", owner: input.owner, source: input.source, target: input.target }, ...placementNote(ctx, r, target) });
    }
    const req = relationshipEnd(ctx, ed, need("requirement"), "requirement");
    const by = relationshipEnd(ctx, ed, need("by"), "satisfying element");
    const owner = typeof input.owner === "string" && input.owner !== "" ? locate(ctx, ed, input.owner, "owner element").element : undefined;
    const r = ok(await ed.service.satisfy(req.element, by.element, owner, target ? { diagram: target.uri } : undefined));
    return summary(ctx, r, { created: { kind: "satisfy", requirement: input.requirement, by: input.by } });
  },
};

export const editToolDefinitions: readonly ToolDefinition[] = [createElement, deleteElement, renameElement, setProperties, createRelationship];

export type { Element };
