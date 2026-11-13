/**
 * The model-editing tools: create, delete, rename and change elements, create connections and
 * satisfy relationships. Transport-free. They call the same `ModelService` operations as the tree
 * and the diagram editor, so an agent and a person making the same edit produce the same text.
 */
import { isLibraryUri, virtualNode, type Element } from "../model/index.js";
import { resolveReference, statementFingerprint } from "../diagram/resolve.js";
import type { OpFailure, OpOk, OpResult, Properties, Target } from "../model-service/service.js";
import { CREATABLE_KINDS } from "../model-service/kinds.js";
import { ToolError, type EditContext, type ToolContext, type ToolDefinition } from "./types.js";

function staleCheck(ctx: ToolContext, el: Element, index: number | undefined, fingerprint: string | undefined): void {
  if (fingerprint !== undefined && fingerprint !== statementFingerprint(ctx.index, el, index ?? 0))
    throw new ToolError("That statement is no longer the one that was read (the model changed since the locator was listed). Read the diagram again with sysml_read_diagram and use the new locator and fingerprint. Nothing was changed.");
}

const json = (v: unknown) => ({ text: JSON.stringify(v, null, 2) });

/** The kinds `sysml_create_relationship` accepts (also the palette kinds that are not creatable elements). */
export const RELATIONSHIP_KINDS = ["connection", "satisfy", "verify", "derivation", "succession", "transition", "message"] as readonly string[];

export function editing(ctx: ToolContext): EditContext {
  if (!ctx.edits) throw new ToolError("Model editing is not available in this session.");
  if (!ctx.edits.isTrusted())
    throw new ToolError("This workspace is not trusted, so model edits are disabled. Ask the user to trust the workspace (Workspace Trust) to allow them. Reading with sysml_get_element and sysml_get_element_tree still works.");
  return ctx.edits;
}

function pathOf(ctx: ToolContext, uri: string): string {
  return ctx.uriToPath(uri) ?? uri;
}

export function locate(ctx: ToolContext, ed: EditContext, qn: string, what: string): Target {
  const t = ed.service.find(qn);
  if (!t) throw new ToolError(`No ${what} with qualified name "${qn}". Use sysml_get_element_tree to find qualified names.`);
  if (isLibraryUri(t.element.uri)) throw new ToolError(`"${qn}" is standard library content, which is read-only.`);
  return t;
}

/** An actionable error for a refused or failed operation. */
function refused(r: OpFailure): ToolError {
  return new ToolError(r.reason + (r.goToDefinition ? ` (The declaring element is ${r.goToDefinition.name}.)` : "") + " No files were changed.");
}

export function ok(r: OpResult): OpOk {
  if (!r.ok) throw refused(r);
  return r;
}

async function diagramTarget(ctx: ToolContext, ed: EditContext, input: Record<string, unknown>): Promise<{ uri: string; path: string } | undefined> {
  if (typeof input.diagram !== "string") return undefined;
  return { uri: await ed.diagramUri(input.diagram), path: input.diagram };
}

export function summary(ctx: ToolContext, r: OpOk, extra: Record<string, unknown> = {}) {
  const unsaved = r.saveError?.unsaved ?? [];
  const saved = r.files.filter((u) => !unsaved.includes(u));
  const problems = r.diagramProblems;
  const notUpdated = [...(problems?.failed ?? []), ...(problems?.skipped ?? []), ...(r.diagramsChangedMeanwhile ?? [])];
  const paths = (us: readonly string[]) => us.map((u) => pathOf(ctx, u));
  return json({
    description: r.description,
    filesChanged: paths(r.files),
    ...(unsaved.length ? { filesSaved: paths(saved), filesNotSaved: paths(unsaved) } : {}),
    ...(r.diagramFiles.length ? { diagramFilesChanged: paths(r.diagramFiles) } : {}),
    ...(notUpdated.length ? { diagramFilesNotUpdated: paths(notUpdated) } : {}),
    ...extra,
    note: unsaved.length
      ? `The edit WAS applied to ${paths(r.files).join(", ")}, but ${paths(unsaved).join(", ")} could not be saved and still ${unsaved.length === 1 ? "has" : "have"} the change as unsaved edits in VS Code${saved.length ? `; ${paths(saved).join(", ")} ${saved.length === 1 ? "was" : "were"} saved` : ""}. The file${unsaved.length === 1 ? "" : "s"} on disk ${unsaved.length === 1 ? "does" : "do"} not contain the change yet. The user was told and can save with Save All; do not repeat the edit. The user can undo it with Ctrl+Z.`
      : "The .sysml files were changed and saved. The user can undo the edit in one step with Ctrl+Z.",
  });
}

function placementNote(ctx: ToolContext, r: OpOk, target: { path: string } | undefined) {
  return target ? { diagram: { path: target.path, placed: r.diagramFiles.some((u) => pathOf(ctx, u) === target.path) || r.diagramChange !== undefined } } : {};
}

/** Every kind that can be added somewhere; the service checks the kind against the owner (`allowedChildKinds`). */
const KINDS = [...CREATABLE_KINDS];

const diagramProp = { type: "string" as const, description: "Optional workspace-relative path of a .sysmld diagram to place the new element on (as a node, or an edge for a relationship). The diagram file is updated on top of its last saved state; pending layout in an open diagram stays unsaved." };

// ------------------------------------------------------------------ sysml_create_element

const createElement: ToolDefinition = {
  name: "sysml_create_element",
  description:
    "Create a new element in the model by inserting its declaration into the owner's .sysml source, exactly as the diagram palette and the tree's Add Child do (minimal text edit, indentation copied, a body created when the owner ends in `;`). " +
    "`owner` is the qualified name of the package, definition or usage to add it to (a feature a usage only inherits cannot be the owner; add to the usage itself). `kind` is one of: " + KINDS.join(", ") + ". " +
    "`state` and `state def` add states (inside a state or state definition they are nested states); `fork`, `join`, `decide` and `merge` add control nodes and are only allowed inside an action or action definition: give them a name, because successions refer to nodes by name. " +
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
    "`element` is the qualified name; an unnamed succession, transition or message (they have no qualified name) is given as `statement`, the `locator` that sysml_read_diagram lists for it ({ owner, kind, ends, index? }). " +
    "Deleting an action, state, control node or message also deletes the successions, transitions and flows that connect it, in the same edit (listed in `alsoDeleted`). A succession written as `then x;` inside a node declaration cannot be deleted on its own. " +
    "A feature that a usage only inherits from its definition (for example Model::vehicle1::engine, declared in Vehicle) cannot be deleted from the usage: the error names the declaring definition. " +
    "Applied directly; the user can undo it in one step. Refused for files with syntax errors and in an untrusted workspace.",
  inputSchema: {
    type: "object",
    properties: {
      element: { type: "string", minLength: 1, description: "Qualified name of the element to delete." },
      statement: {
        type: "object",
        description: "An unnamed succession, transition or message: its locator.",
        properties: { owner: { type: "string", minLength: 1 }, kind: { type: "string", minLength: 1 }, ends: { type: "array", items: { type: "string" } }, index: { type: "integer", minimum: 0 }, fingerprint: { type: "string", description: "The `fingerprint` that sysml_read_diagram lists with the locator; the call is refused when the statement is no longer the one that was read." } },
        required: ["owner", "kind", "ends"],
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    let t: Target;
    let label: string;
    if (input.statement !== undefined && input.element !== undefined) throw new ToolError("Give either `element` or `statement`, not both.");
    if (input.statement !== undefined && typeof input.statement === "object") {
      const { fingerprint, ...loc } = input.statement as { owner: string; kind: string; ends: string[]; index?: number; fingerprint?: string };
      const el = resolveReference({ locator: loc }, { sources: [] }, ctx.index);
      if (el) staleCheck(ctx, el, loc.index, fingerprint);
      if (!el) throw new ToolError(`No ${loc.kind} with ends [${(loc.ends ?? []).join(", ")}] in "${loc.owner}". Use the locator from sysml_read_diagram exactly as listed (add \`index\` when several are alike).`);
      if (isLibraryUri(el.uri)) throw new ToolError("That statement is standard library content, which is read-only.");
      t = { element: el };
      label = `${loc.kind} ${loc.ends.join(" to ")} in ${loc.owner}`;
    } else if (typeof input.element === "string" && input.element !== "") {
      t = locate(ctx, ed, input.element, "element");
      label = input.element;
    } else throw new ToolError("Give `element` (a qualified name) or `statement` (the locator of an unnamed succession, transition or message).");
    const r = ok(await ed.service.deleteElement(t));
    return summary(ctx, r, {
      deleted: label,
      ...(r.description.includes(" and ") && /statement/.test(r.description) ? { alsoDeleted: r.description } : {}),
      ...(r.remainingReferences && (r.remainingReferences.unjudged ?? 0) > 0 ? { remainingMentionsNotChecked: r.remainingReferences.unjudged } : {}),
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
    "`kind: \"verify\"` adds `verify <requirement>;` to the objective of a verification case (SysML v2 allows verify only there): give `verificationCase` (qualified name of an existing verification case; its objective is created when missing) or `newVerificationCase` (a name; a new `verification` containing the objective is created in `owner`, default the package of the requirement). " +
    "`kind: \"derivation\"` adds `#derivation connection { end #original ::> <original>; end #derive ::> <derived>; ... }` (derivation is not a keyword) to `owner` (default: the package of the first derived requirement) and `private import RequirementDerivation::*;` when missing; `original` and `derived` (a list) are qualified names of requirements. " +
    "`kind: \"succession\"` adds `first <source> then <target>;` (with `guard`: `first <source> if <guard> then <target>;`) to `owner`, an action or action definition, after the two nodes; `source` and `target` are member names or qualified names of its actions or control nodes, or `start` and `done`; a succession that already exists is refused. " +
    "`kind: \"transition\"` adds `transition first <source> [accept <trigger>] [if <guard>] [do <effect>] then <target>;` to `owner`, a state or state definition; `source` and `target` are its states (`trigger`, `guard` and `effect` are source text, parsed before anything is changed and refused with the syntax error when invalid). " +
    "`kind: \"message\"` adds `message [name] [of <itemType>] from <from> to <to>;` to `owner`, an occurrence, part or interaction, written as `then message ...;` right after its last message so it comes last in time order; `from` and `to` are names of the parts taking part. " +
    "With `diagram`, the new edge is also placed on that diagram when both ends are shown. Applied directly, saved, one undo step. Refused for files with syntax errors and in an untrusted workspace. Returns JSON with the files changed.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: [...RELATIONSHIP_KINDS], description: "connection, satisfy, verify, derivation, succession, transition or message." },
      owner: { type: "string", description: "Qualified name of the element that receives the statement. Required for a connection." },
      source: { type: "string", description: "connection: qualified name of the first end." },
      target: { type: "string", description: "connection: qualified name of the second end." },
      requirement: { type: "string", description: "satisfy: qualified name of the requirement." },
      by: { type: "string", description: "satisfy: qualified name of the satisfying element." },
      verificationCase: { type: "string", description: "verify: qualified name of an existing verification case (def or usage)." },
      newVerificationCase: { type: "string", description: "verify: name of a new verification case to create." },
      original: { type: "string", description: "derivation: qualified name of the original requirement." },
      derived: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, description: "derivation: qualified names of the derived requirements." },
      guard: { type: "string", description: "succession or transition: the guard as source text, e.g. level > 3." },
      trigger: { type: "string", description: "transition: the trigger as source text, e.g. TurnOn (written after accept)." },
      effect: { type: "string", description: "transition: the effect as source text, e.g. action logEvent (written after do)." },
      from: { type: "string", description: "message: name of the sending part." },
      to: { type: "string", description: "message: name of the receiving part." },
      name: { type: "string", description: "message: optional name of the message." },
      itemType: { type: "string", description: "message: optional item type (qualified name or name of a definition)." },
      diagram: diagramProp,
    },
    required: ["kind"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    const need = (k: string) => {
      if (typeof input[k] !== "string" || input[k] === "") throw new ToolError(`A ${String(input.kind)} relationship needs \`${k}\`.`);
      return input[k] as string;
    };
    const target = await diagramTarget(ctx, ed, input);
    const origin = target ? { diagram: target.uri, placement: { diagram: target.uri } } : {};
    if (input.kind === "succession" || input.kind === "transition") {
      const owner = locate(ctx, ed, need("owner"), "owner element");
      const refusal = owner.context ? ed.service.refuseIfInherited(owner, "extended") : undefined;
      if (refusal) throw refused(refusal);
      const endOf = (key: string): Element => {
        const text = need(key);
        if (text === "start" || text === "done") return virtualNode(owner.element, text);
        // A name of a member of the owner, or a dotted path to a node nested below it (`operating.high`).
        let own: Element | undefined = owner.element;
        for (const seg of text.includes("::") ? [] : text.split(".")) own = own?.members.find((m) => m.name === seg);
        if (own === owner.element) own = undefined;
        return own ?? locate(ctx, ed, text, key).element;
      };
      const a = endOf("source"), b = endOf("target");
      const sel = { ...(typeof input.guard === "string" && input.guard !== "" ? { guard: input.guard } : {}) };
      const r = input.kind === "succession"
        ? ok(await ed.service.addSuccession(owner.element, a, b, { ...sel, ...origin }))
        : ok(await ed.service.addTransition(owner.element, a, b, { ...sel, ...(typeof input.trigger === "string" ? { trigger: input.trigger } : {}), ...(typeof input.effect === "string" ? { effect: input.effect } : {}) }, origin));
      return summary(ctx, r, { created: { kind: input.kind, owner: input.owner, source: input.source, target: input.target, ...sel }, ...placementNote(ctx, r, target) });
    }
    if (input.kind === "message") {
      const owner = locate(ctx, ed, need("owner"), "owner element");
      const refusal = owner.context ? ed.service.refuseIfInherited(owner, "extended") : undefined;
      if (refusal) throw refused(refusal);
      const spec = { ...(typeof input.name === "string" && input.name !== "" ? { name: input.name } : {}), ...(typeof input.itemType === "string" && input.itemType !== "" ? { itemType: input.itemType } : {}) };
      const r = ok(await ed.service.addMessage(owner.element, need("from"), need("to"), spec, origin));
      return summary(ctx, r, { created: { kind: "message", owner: input.owner, from: input.from, to: input.to, ...spec }, ...placementNote(ctx, r, target) });
    }
    if (input.kind === "connection") {
      const owner = locate(ctx, ed, need("owner"), "owner element");
      const a = relationshipEnd(ctx, ed, need("source"), "source");
      const b = relationshipEnd(ctx, ed, need("target"), "target");
      const r = ok(await ed.service.connect(owner.element, a, b, origin));
      return summary(ctx, r, { created: { kind: "connection", owner: input.owner, source: input.source, target: input.target }, ...placementNote(ctx, r, target) });
    }
    if (input.kind === "verify") {
      const req = relationshipEnd(ctx, ed, need("requirement"), "requirement");
      const hasCase = typeof input.verificationCase === "string" && input.verificationCase !== "";
      const hasNew = typeof input.newVerificationCase === "string" && input.newVerificationCase !== "";
      if (hasCase === hasNew) throw new ToolError("A verify relationship needs exactly one of `verificationCase` (an existing case) or `newVerificationCase` (a name for a new one).");
      const ownerEl = typeof input.owner === "string" && input.owner !== "" ? locate(ctx, ed, input.owner, "owner element").element : undefined;
      const to = hasCase ? locate(ctx, ed, input.verificationCase as string, "verification case").element : { create: input.newVerificationCase as string, ...(ownerEl ? { owner: ownerEl } : {}) };
      const r = ok(await ed.service.verify(req.element, to));
      return summary(ctx, r, { created: { kind: "verify", requirement: input.requirement, verificationCase: hasCase ? input.verificationCase : input.newVerificationCase } });
    }
    if (input.kind === "derivation") {
      const orig = relationshipEnd(ctx, ed, need("original"), "original requirement");
      const list = Array.isArray(input.derived) ? (input.derived as unknown[]).filter((x): x is string => typeof x === "string" && x !== "") : [];
      if (list.length === 0) throw new ToolError("A derivation needs `derived` with at least one requirement.");
      const derived = list.map((qn) => relationshipEnd(ctx, ed, qn, "derived requirement").element);
      const ownerEl = typeof input.owner === "string" && input.owner !== "" ? locate(ctx, ed, input.owner, "owner element").element : undefined;
      const r = ok(await ed.service.derive(orig.element, derived, ownerEl));
      return summary(ctx, r, { created: { kind: "derivation", original: input.original, derived: list } });
    }
    const req = relationshipEnd(ctx, ed, need("requirement"), "requirement");
    const by = relationshipEnd(ctx, ed, need("by"), "satisfying element");
    const owner = typeof input.owner === "string" && input.owner !== "" ? locate(ctx, ed, input.owner, "owner element").element : undefined;
    const r = ok(await ed.service.satisfy(req.element, by.element, owner, target ? { diagram: target.uri } : undefined));
    return summary(ctx, r, { created: { kind: "satisfy", requirement: input.requirement, by: input.by } });
  },
};

// ------------------------------------------------------------------ sysml_set_transition

const setTransition: ToolDefinition = {
  name: "sysml_set_transition",
  description:
    "Change the trigger, guard and effect of an existing transition. The whole transition statement is written again from its parts as `transition [name] first <source> [accept <trigger>] [if <guard>] [do <effect>] then <target>;`, exactly as the State Transition View's properties panel does (a shorthand transition inside a state is rewritten in this explicit form). " +
    "Identify the transition by `element` (qualified name, when it is named) or by `statement` (the locator sysml_read_diagram lists: { owner, kind: \"transition\", ends, index? }). Give only the parts to change; an empty string removes a part. " +
    "The text is parsed before anything is applied; invalid text is refused with the syntax error and nothing changes. Applied directly, saved, one undo step. Refused in an untrusted workspace.",
  inputSchema: {
    type: "object",
    properties: {
      element: { type: "string", minLength: 1, description: "Qualified name of a named transition." },
      statement: {
        type: "object",
        description: "Locator of an unnamed transition.",
        properties: { owner: { type: "string", minLength: 1 }, kind: { type: "string", enum: ["transition"] }, ends: { type: "array", items: { type: "string" } }, index: { type: "integer", minimum: 0 }, fingerprint: { type: "string", description: "The `fingerprint` that sysml_read_diagram lists with the locator; the call is refused when the statement is no longer the one that was read." } },
        required: ["owner", "kind", "ends"],
        additionalProperties: false,
      },
      trigger: { type: "string", description: "Trigger text (after accept); empty removes it." },
      guard: { type: "string", description: "Guard text (after if); empty removes it." },
      effect: { type: "string", description: "Effect text (after do); empty removes it." },
    },
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    let el: Element | undefined;
    if (typeof input.element === "string" && input.element !== "") el = locate(ctx, ed, input.element, "transition").element;
    else if (input.statement && typeof input.statement === "object") {
      const { fingerprint, ...loc } = input.statement as { index?: number; fingerprint?: string };
      el = resolveReference({ locator: loc as never }, { sources: [] }, ctx.index);
      if (el) staleCheck(ctx, el, loc.index, fingerprint);
    }
    if (!el || el.kind !== "transition") throw new ToolError("Give `element` (qualified name) or `statement` (locator) of an existing transition.");
    const parts: { trigger?: string; guard?: string; effect?: string } = {};
    for (const k of ["trigger", "guard", "effect"] as const) if (typeof input[k] === "string") parts[k] = input[k] as string;
    if (Object.keys(parts).length === 0) throw new ToolError("Give at least one of trigger, guard or effect.");
    const r = ok(await ed.service.setTransition(el, parts));
    return summary(ctx, r, { changed: parts });
  },
};

export const editToolDefinitions: readonly ToolDefinition[] = [createElement, deleteElement, renameElement, setProperties, createRelationship, setTransition];

export type { Element };
