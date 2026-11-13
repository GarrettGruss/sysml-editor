/**
 * The requirements tools: read a package as a specification document (Markdown) and create requirements.
 * Relationships (satisfy, verify, derivation) are part of `sysml_create_relationship`. Transport-free.
 */
import { buildDocumentModel } from "../requirements/document-model.js";
import { documentToMarkdown } from "../requirements/document-markdown.js";
import { buildMatrix, matrixToCsv, matrixToMarkdown, MATRIX_COLUMNS } from "../requirements/matrix.js";
import { ToolError, type ToolDefinition } from "./types.js";
import { summary, editing, locate, ok } from "./edit-tools.js";

const readRequirementsDocument: ToolDefinition = {
  name: "sysml_read_requirements_document",
  description:
    "Read a package as a specification document, the same projection the requirements editor's Document view shows, as Markdown: the title (from a @DocumentRoot annotation, else the package name), a table of contents, numbered sections (1, 1.1, ...; nested packages), their paragraphs (doc and comment text), requirement items (id, name, text, satisfied by / verified by / derived from) and appendices (packages annotated @Appendix, lettered A, B, ...). " +
    "Section numbers are generated from the nesting and source order and are not stored in the model. Each heading and each requirement is followed by a marker such as `<!-- qn: VehicleSpec::Performance::accel -->` with the qualified name to pass to the edit tools (sysml_set_element_properties, sysml_create_requirement, sysml_create_relationship, ...). " +
    "`package` is the qualified name of the root package (a nested package reads just that part). Output is limited to 60000 characters; the end then says it was truncated. Read-only.",
  inputSchema: {
    type: "object",
    properties: { package: { type: "string", minLength: 1, maxLength: 4096, description: "Qualified name of the package, e.g. VehicleSpec." } },
    required: ["package"],
    additionalProperties: false,
  },
  readOnly: true,
  handler(input, ctx) {
    const qn = input.package as string;
    const el = ctx.index.findByQualifiedName(qn).find((e) => e.kind === "package" || e.kind === "library package");
    if (!el) throw new ToolError(`No package with qualified name "${qn}". Use sysml_get_element_tree to find qualified names.`);
    return { text: documentToMarkdown(buildDocumentModel(ctx.index, el)).text };
  },
};

const createRequirement: ToolDefinition = {
  name: "sysml_create_requirement",
  description:
    "Create a requirement in a package: `requirement <'ID'> name;` (or `requirement def` with `definition: true`), with optional documentation as a doc comment, exactly as the requirements editor's Add Requirement does. " +
    "`owner` is the qualified name of the package (or definition) to add it to. Text containing the comment terminator star-slash is stored as star-backslash-slash. Applied directly, saved, one undo step. Refused for files with syntax errors, existing names and in an untrusted workspace. Returns JSON with the new element's qualifiedName and the files changed.",
  inputSchema: {
    type: "object",
    properties: {
      owner: { type: "string", minLength: 1, maxLength: 4096, description: "Qualified name of the package to add the requirement to." },
      name: { type: "string", minLength: 1, maxLength: 1000, description: "Name of the requirement." },
      id: { type: "string", maxLength: 1000, description: "Requirement id, written as the short name <'id'>." },
      documentation: { type: "string", maxLength: 100000, description: "The requirement text, written as a doc comment." },
      definition: { type: "boolean", description: "Create a requirement def instead of a requirement usage." },
    },
    required: ["owner", "name"],
    additionalProperties: false,
  },
  readOnly: false,
  async handler(input, ctx) {
    const ed = editing(ctx);
    const owner = locate(ctx, ed, input.owner as string, "owner element");
    const r = ok(
      await ed.service.createRequirement(owner.element, {
        name: input.name as string,
        ...(typeof input.id === "string" && input.id !== "" ? { id: input.id } : {}),
        ...(typeof input.documentation === "string" && input.documentation !== "" ? { documentation: input.documentation } : {}),
        ...(input.definition === true ? { definition: true } : {}),
      }),
    );
    return summary(ctx, r, { created: { qualifiedName: r.element?.qualifiedName, kind: input.definition === true ? "requirement def" : "requirement", name: input.name } });
  },
};

const MATRIX_ROW_CAP = 1000;

const readVerificationMatrix: ToolDefinition = {
  name: "sysml_read_verification_matrix",
  description:
    "Read the requirements verification matrix of a package, the same rows, columns and status as the requirements editor's Matrix view: one row per requirement, nested and numbered by ownership (1, 1.1, ...; packages are section rows), with satisfied by, verification method, verified by and status. " +
    "The method comes from the standard VerificationMethod metadata on the verification case (@VerificationMethod { kind = VerificationMethodKind::test; }): inspect, analyze, demo or test. " +
    "Status is `not satisfied` (no satisfy statement, own or counted from a parent requirement or from a usage of its definition), `no verification` (satisfied, no verification case verifies it) or `covered`. Satisfaction counted from elsewhere has `via` set. Pass/fail results are not part of the model and not shown. " +
    "`package` is the qualified name of the package. `format` is `json` (default: summary and rows with qualified names, to pass to the edit tools), `markdown` or `csv` (the editor's export text). At most 1000 rows. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      package: { type: "string", minLength: 1, maxLength: 4096, description: "Qualified name of the package, e.g. VehicleSpec." },
      format: { type: "string", enum: ["json", "markdown", "csv"], description: "Result format; default json." },
    },
    required: ["package"],
    additionalProperties: false,
  },
  readOnly: true,
  handler(input, ctx) {
    const qn = input.package as string;
    const el = ctx.index.findByQualifiedName(qn).find((e) => e.kind === "package" || e.kind === "library package");
    if (!el) throw new ToolError(`No package with qualified name "${qn}". Use sysml_get_element_tree to find qualified names.`);
    const m = buildMatrix(ctx.index, el, (uri) => !ctx.index.isReadOnly(uri));
    const rows = m.rows.slice(0, MATRIX_ROW_CAP);
    const format = input.format ?? "json";
    if (format === "markdown") return { text: matrixToMarkdown(rows) };
    if (format === "csv") return { text: matrixToCsv(rows) };
    return { text: JSON.stringify({ package: qn, columns: [...MATRIX_COLUMNS], summary: m.summary, ...(m.rows.length > rows.length ? { truncated: true } : {}), rows }, null, 2) };
  },
};

export const requirementsToolDefinitions: readonly ToolDefinition[] = [readRequirementsDocument, createRequirement, readVerificationMatrix];
