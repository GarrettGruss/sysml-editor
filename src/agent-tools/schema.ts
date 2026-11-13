import type { JsonSchema } from "./types.js";

/** Validate `value` against the schema subset we use; returns error messages (empty when valid). */
export function validateSchema(value: unknown, schema: JsonSchema, path = "input", root: JsonSchema = schema): string[] {
  if (schema.$ref) {
    const target = schema.$ref.startsWith("#/definitions/") ? root.definitions?.[schema.$ref.slice(14)] : undefined;
    return target ? validateSchema(value, target, path, root) : [`${path}: unresolvable schema reference ${schema.$ref}`];
  }
  const errs: string[] = [];
  const t = schema.type;
  if (schema.oneOf) {
    const matching = schema.oneOf.filter((alt) => validateSchema(value, alt, path, root).length === 0).length;
    if (matching !== 1) errs.push(`${path} must match exactly one of ${schema.oneOf.length} alternatives (matched ${matching})`);
  }
  if (t === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${path} must be an object`];
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (obj[r] === undefined) errs.push(`${path}.${r} is required`);
    for (const [k, v] of Object.entries(obj)) {
      const p = schema.properties?.[k];
      if (!p) {
        if (schema.additionalProperties === false)
          errs.push(`${path}.${k} is not a known property (known: ${Object.keys(schema.properties ?? {}).join(", ") || "none"})`);
      } else if (v !== undefined) errs.push(...validateSchema(v, p, `${path}.${k}`, root));
    }
    return errs;
  }
  if (t === "string" && typeof value !== "string") return [`${path} must be a string`];
  if (typeof value === "string" && schema.minLength !== undefined && value.length < schema.minLength)
    errs.push(`${path} must have at least ${schema.minLength} characters`);
  if (typeof value === "string" && schema.maxLength !== undefined && value.length > schema.maxLength)
    errs.push(`${path} must have at most ${schema.maxLength} characters`);
  if (t === "boolean" && typeof value !== "boolean") return [`${path} must be a boolean`];
  if ((t === "integer" || t === "number") && (typeof value !== "number" || !Number.isFinite(value)))
    return [`${path} must be a number`];
  if (t === "integer" && !Number.isInteger(value)) return [`${path} must be an integer`];
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path} must be <= ${schema.maximum}`);
  }
  if (t === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path} must have at least ${schema.minItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validateSchema(v, schema.items!, `${path}[${i}]`, root)));
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  return errs;
}
