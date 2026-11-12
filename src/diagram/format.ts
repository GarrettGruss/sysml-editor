/**
 * The `.sysmld` diagram file format (design D5): types, a validating parser and a canonical
 * serializer. No `vscode` import. A diagram holds presentation state only; model elements are
 * referenced by qualified name (`ref`) or, when unnamed, by a structural `locator` (design D3).
 */

export const DIAGRAM_VERSION = 1;
export const DIAGRAM_KINDS = ["general", "interconnection", "requirements"] as const;
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];

export interface ElementLocator {
  /** Qualified name of the (nearest named) owner. */
  owner: string;
  /** Element kind, e.g. `connect`. */
  kind: string;
  /** Endpoint texts as written in the source. */
  ends: string[];
  /** Position among otherwise identical siblings; only present when needed. */
  index?: number;
  [extra: string]: unknown;
}

export interface Point {
  x: number;
  y: number;
}

/** Exactly one of `ref` or `locator` is set. */
export interface ElementReference {
  ref?: string;
  locator?: ElementLocator;
}

export interface DiagramNode extends ElementReference {
  id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  collapsed?: boolean;
  /** Id of the containing node. */
  parent?: string;
  style?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface DiagramEdge extends ElementReference {
  id: string;
  /** Node ids (a port is a node). */
  source: string;
  target: string;
  points?: Point[];
  style?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface DiagramDocument {
  version: 1;
  kind: DiagramKind;
  root: string;
  sources: string[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  style?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface DiagramProblem {
  /** JSON path, e.g. `$.nodes[2].parent`. */
  path: string;
  message: string;
}

export type ParseResult = { ok: true; doc: DiagramDocument } | { ok: false; problems: DiagramProblem[] };

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseDiagram(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    return { ok: false, problems: [{ path: "$", message: `Not valid JSON: ${(e as Error).message}` }] };
  }
  const problems: DiagramProblem[] = [];
  const bad = (path: string, message: string) => void problems.push({ path, message });
  if (!isObj(raw)) return { ok: false, problems: [{ path: "$", message: "A diagram must be a JSON object" }] };

  if (raw.version === undefined) bad("$.version", "Missing required field");
  else if (raw.version !== DIAGRAM_VERSION) bad("$.version", `Unsupported version ${JSON.stringify(raw.version)} (expected ${DIAGRAM_VERSION})`);
  if (raw.kind === undefined) bad("$.kind", "Missing required field");
  else if (!(DIAGRAM_KINDS as readonly unknown[]).includes(raw.kind)) bad("$.kind", `Unknown kind ${JSON.stringify(raw.kind)} (expected ${DIAGRAM_KINDS.join(", ")})`);
  if (raw.root === undefined) bad("$.root", "Missing required field");
  else if (typeof raw.root !== "string" || raw.root === "") bad("$.root", "Must be a non-empty qualified name");
  if (raw.sources === undefined) bad("$.sources", "Missing required field");
  else if (!Array.isArray(raw.sources) || raw.sources.some((s) => typeof s !== "string")) bad("$.sources", "Must be an array of strings");
  if (raw.style !== undefined && !isObj(raw.style)) bad("$.style", "Must be an object");

  const nodeIds = new Set<string>();
  const allIds = new Set<string>();
  const parents: [number, string][] = [];

  const checkId = (o: Obj, path: string) => {
    if (typeof o.id !== "string" || o.id === "") return bad(`${path}.id`, "Missing or empty id");
    if (allIds.has(o.id)) bad(`${path}.id`, `Duplicate id ${JSON.stringify(o.id)}`);
    allIds.add(o.id);
  };
  const checkRef = (o: Obj, path: string) => {
    const hasRef = o.ref !== undefined;
    const hasLoc = o.locator !== undefined;
    if (hasRef === hasLoc) return bad(path, hasRef ? "Has both ref and locator; exactly one is allowed" : "Needs exactly one of ref or locator");
    if (hasRef && (typeof o.ref !== "string" || o.ref === "")) bad(`${path}.ref`, "Must be a non-empty qualified name");
    if (hasLoc) {
      const l = o.locator;
      const lp = `${path}.locator`;
      if (!isObj(l)) return bad(lp, "Must be an object");
      if (typeof l.owner !== "string" || l.owner === "") bad(`${lp}.owner`, "Missing or empty owner");
      if (typeof l.kind !== "string" || l.kind === "") bad(`${lp}.kind`, "Missing or empty kind");
      if (!Array.isArray(l.ends) || l.ends.some((e) => typeof e !== "string")) bad(`${lp}.ends`, "Must be an array of strings");
      if (l.index !== undefined && !(Number.isInteger(l.index) && (l.index as number) >= 0)) bad(`${lp}.index`, "Must be a non-negative integer");
    }
  };
  const checkNum = (o: Obj, k: string, path: string, min?: number) => {
    const v = o[k];
    if (v === undefined) return;
    if (typeof v !== "number" || !Number.isFinite(v)) bad(`${path}.${k}`, "Must be a number");
    else if (min !== undefined && v < min) bad(`${path}.${k}`, `Must be >= ${min}`);
  };

  const nodes = Array.isArray(raw.nodes) ? raw.nodes : undefined;
  const edges = Array.isArray(raw.edges) ? raw.edges : undefined;
  if (raw.nodes === undefined) bad("$.nodes", "Missing required field");
  else if (!nodes) bad("$.nodes", "Must be an array");
  if (raw.edges === undefined) bad("$.edges", "Missing required field");
  else if (!edges) bad("$.edges", "Must be an array");

  nodes?.forEach((n, i) => {
    const p = `$.nodes[${i}]`;
    if (!isObj(n)) return bad(p, "Must be an object");
    checkId(n, p);
    if (typeof n.id === "string") nodeIds.add(n.id);
    checkRef(n, p);
    for (const k of ["x", "y"]) checkNum(n, k, p);
    for (const k of ["w", "h"]) checkNum(n, k, p, 0);
    if (n.collapsed !== undefined && typeof n.collapsed !== "boolean") bad(`${p}.collapsed`, "Must be a boolean");
    if (n.style !== undefined && !isObj(n.style)) bad(`${p}.style`, "Must be an object");
    if (n.parent !== undefined) {
      if (typeof n.parent !== "string") bad(`${p}.parent`, "Must be a node id");
      else parents.push([i, n.parent]);
    }
  });
  edges?.forEach((e, i) => {
    const p = `$.edges[${i}]`;
    if (!isObj(e)) return bad(p, "Must be an object");
    checkId(e, p);
    checkRef(e, p);
    for (const k of ["source", "target"]) {
      if (typeof e[k] !== "string" || e[k] === "") bad(`${p}.${k}`, "Missing node id");
    }
    if (e.points !== undefined) {
      if (!Array.isArray(e.points)) bad(`${p}.points`, "Must be an array");
      else e.points.forEach((pt, j) => {
        if (!isObj(pt) || typeof pt.x !== "number" || typeof pt.y !== "number" || !Number.isFinite(pt.x) || !Number.isFinite(pt.y))
          bad(`${p}.points[${j}]`, "Must be an object with numeric x and y");
      });
    }
    if (e.style !== undefined && !isObj(e.style)) bad(`${p}.style`, "Must be an object");
  });

  // Dangling references (only meaningful when the ids themselves were readable).
  for (const [i, parent] of parents) {
    if (!nodeIds.has(parent)) bad(`$.nodes[${i}].parent`, `Refers to unknown node ${JSON.stringify(parent)}`);
  }
  edges?.forEach((e, i) => {
    if (!isObj(e)) return;
    for (const k of ["source", "target"]) {
      const v = e[k];
      if (typeof v === "string" && v !== "" && !nodeIds.has(v)) bad(`$.edges[${i}].${k}`, `Refers to unknown node ${JSON.stringify(v)}`);
    }
  });
  // Parent cycles.
  if (nodes) {
    const parentOf = new Map<string, string>();
    for (const n of nodes) if (isObj(n) && typeof n.id === "string" && typeof n.parent === "string") parentOf.set(n.id, n.parent);
    nodes.forEach((n, i) => {
      if (!isObj(n) || typeof n.id !== "string") return;
      const seen = new Set<string>([n.id]);
      for (let c = parentOf.get(n.id); c !== undefined; c = parentOf.get(c)) {
        if (seen.has(c)) return void bad(`$.nodes[${i}].parent`, "Containment cycle");
        seen.add(c);
      }
    });
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, doc: raw as unknown as DiagramDocument };
}

// ---- Canonical serialization -------------------------------------------------------------

function num(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function sortedKeys(o: Obj, first: readonly string[]): string[] {
  const rest = Object.keys(o).filter((k) => !first.includes(k)).sort();
  return [...first.filter((k) => o[k] !== undefined), ...rest];
}

/** Plain JSON values (style objects, unknown extras) with keys sorted recursively. */
function canonicalValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalValue);
  if (isObj(v)) {
    const out: Obj = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = canonicalValue(v[k]);
    return out;
  }
  return typeof v === "number" ? num(v) : v;
}

function ordered(o: Obj, first: readonly string[], special: (k: string, v: unknown) => unknown = (_k, v) => canonicalValue(v)): Obj {
  const out: Obj = {};
  for (const k of sortedKeys(o, first)) {
    if (o[k] !== undefined) out[k] = special(k, o[k]);
  }
  return out;
}

const GEOM = new Set(["x", "y", "w", "h"]);

function canonicalLocator(l: ElementLocator): Obj {
  return ordered(l, ["owner", "kind", "ends", "index"]);
}

function canonicalItem(o: Obj, first: readonly string[]): Obj {
  return ordered(o, first, (k, v) => {
    if (k === "locator" && isObj(v)) return canonicalLocator(v as ElementLocator);
    if (GEOM.has(k) && typeof v === "number") return num(v);
    if (k === "points" && Array.isArray(v)) return v.map((p) => ordered(p as Obj, ["x", "y"], (_k, x) => (typeof x === "number" ? num(x) : x)));
    return canonicalValue(v);
  });
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Canonical text: UTF-8, 2-space indent, fixed key order, items sorted by id, trailing newline. */
export function serializeDiagram(doc: DiagramDocument): string {
  const out = ordered(doc, ["version", "kind", "root", "sources", "nodes", "edges", "style"], (k, v) => {
    if (k === "sources") return [...new Set(v as string[])].sort();
    if (k === "nodes") return [...(v as DiagramNode[])].sort(byId).map((n) => canonicalItem(n, ["id", "ref", "locator", "x", "y", "w", "h"]));
    if (k === "edges") return [...(v as DiagramEdge[])].sort(byId).map((e) => canonicalItem(e, ["id", "ref", "locator", "source", "target", "points"]));
    return canonicalValue(v);
  });
  return JSON.stringify(out, null, 2) + "\n";
}
