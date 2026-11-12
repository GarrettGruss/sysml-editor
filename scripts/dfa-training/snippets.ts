// Systematic small SysML snippets. Used to train the DFA snapshot (training set) and to measure
// how well the snapshot generalises (held-out set). Pure functions: no parser, no files, fully
// deterministic. Validity is NOT assumed here; `build-snippets.ts` verifies each snippet with the
// exact (unseeded) parser and keeps only valid ones.

export interface Kind {
  kw: string;
  def: boolean;
  /** usages can have typing (`: T`) and multiplicity */
  usage: boolean;
}

const D = (kw: string): Kind => ({ kw: kw + " def", def: true, usage: false });
const U = (kw: string): Kind => ({ kw, def: false, usage: true });

export const KINDS: Kind[] = [
  { kw: "package", def: false, usage: false },
  D("part"), U("part"), D("port"), U("port"), D("attribute"), U("attribute"), D("item"), U("item"),
  D("action"), U("action"), D("state"), U("state"), D("requirement"), U("requirement"),
  D("constraint"), U("constraint"), D("connection"), U("connection"), D("interface"), U("interface"),
  D("enum"), D("verification"), U("verification"), D("use case"), D("view"), D("metadata"),
];

export type Short = "" | "u" | "q";
export type Feat = "" | "typing" | "spec" | "typing+mult" | "typing+spec" | "mult";
export type Body = ";" | "{}" | "doc" | "nested";

export interface DeclOpts {
  short?: Short;
  feat?: Feat;
  body?: Body;
  vis?: "" | "private" | "public" | "protected";
  abstract?: boolean;
  name?: string;
}

const NESTED_BY_KIND = (k: Kind): string => (k.kw === "enum def" ? "enum e1;" : k.kw.startsWith("requirement") ? "subject s;" : "attribute z;");

export function decl(k: Kind, n: number, o: DeclOpts = {}): string {
  const name = o.name ?? `n${n}`;
  const sn = o.short === "u" ? ` <s${n}>` : o.short === "q" ? ` <'S${n}'>` : "";
  let feat = "";
  const f = o.feat ?? "";
  if (k.usage) {
    if (f.startsWith("typing")) feat += " : T" + n;
    if (f.includes("mult")) feat += " [0..*]";
    if (f.endsWith("spec")) feat += " :> b" + n;
    if (f === "mult" && !feat) feat = " [1]";
  } else if (k.def && f === "spec") feat = " :> B" + n;
  else if (k.def && f.startsWith("typing")) feat = " :> B" + n;
  let body = ";";
  if (o.body === "{}") body = " { }";
  else if (o.body === "doc") body = ` { doc /* d${n} */ }`;
  else if (o.body === "nested") body = ` { doc /* d${n} */ ${NESTED_BY_KIND(k)} }`;
  const pre = [o.vis, o.abstract && k.def ? "abstract" : ""].filter(Boolean).join(" ");
  return `${pre ? pre + " " : ""}${k.kw}${sn} ${name}${feat}${body}`;
}

const SHORTS: Short[] = ["", "u", "q"];
const FEATS: Feat[] = ["", "typing", "spec", "typing+mult", "typing+spec", "mult"];
const BODIES: Body[] = [";", "{}", "doc", "nested"];

const wrap = (members: string[], depth: number): string => {
  const ind = "  ".repeat(depth);
  let s = members.map((m) => ind + m).join("\n");
  for (let d = depth - 1; d >= 0; d--) s = `${"  ".repeat(d)}package P${d} {\n${s}\n${"  ".repeat(d)}}`;
  return s + "\n";
};

/** The training set: deterministic, systematic. */
export function trainingSnippets(): string[] {
  const out: string[] = [];
  let n = 0;
  const follower = (i: number, j: number): string => {
    const k = KINDS[(i + j) % KINDS.length]!;
    return decl(k, 90 + j, { short: SHORTS[(i + j) % 3]!, body: BODIES[(i + 2 * j) % 4]!, feat: FEATS[(i + j) % 6]! });
  };
  const VIS_ALL = ["", "private", "public", "protected"] as const;
  KINDS.forEach((k, ki) => {
    let v = 0;
    for (const short of SHORTS) for (const body of BODIES) for (const feat of FEATS) {
      const a = decl(k, ++n, { short, body, feat, vis: VIS_ALL[v % 4]!, abstract: v % 5 === 0 });
      const depth = 1 + (v % 3 === 2 ? 1 : 0);
      out.push(wrap([a, follower(ki, v)], depth)); // followed by another member
      if (v % 3 === 0) out.push(wrap([a], depth)); // last / only member
      if (v % 6 === 0) out.push(wrap([follower(ki, v + 1), a, follower(ki, v + 2)], depth)); // in the middle
      v++;
    }
  });
  // every kind followed by every kind (short-named first member, plain or short-named second)
  KINDS.forEach((a, i) =>
    KINDS.forEach((b, j) => {
      const short = SHORTS[(i + j) % 3]!;
      out.push(wrap([decl(a, 1, { short, body: ";" }), decl(b, 2, { short: short === "q" ? "" : "u", body: j % 2 ? ";" : "doc" })], 1));
    }),
  );
  out.push(...shapeSnippets());
  return [...new Set(out)];
}

/** Typical model shapes (requirements files, satisfy, verification, derivation, ...). */
export function shapeSnippets(): string[] {
  const out: string[] = [];
  const reqs = (extra: string) => `package R {\n  private import ScalarValues::*;\n  requirement def <'R1'> Base { doc /* base */ }\n  requirement <'R2'> a { doc /* text a */ }\n  requirement <'R3'> b { doc /* text b */ }\n${extra}}\n`;
  for (const e of [
    "  part def T;\n", "  part <p1> x;\n  part def T;\n", "  satisfy a by x;\n", "  satisfy R::a by x;\n", "  satisfy requirement a by x;\n",
    "  verification def V { objective { verify a; } }\n", "  verification <'V1'> v { objective { verify a; verify b; } }\n",
    "  verification def V { subject s; objective { verify a; } }\n",
    "  #derivation connection {\n    end #original ::> a;\n    end #derive ::> b;\n  }\n",
    "  #derivation connection { end #original ::> a; end #derive ::> b; end #derive ::> Base; }\n",
    "  package Sub {\n    requirement <'R4'> c { doc /* c */ }\n    requirement <'R5'> d;\n    part def T;\n  }\n",
    "  package Sub {\n    package Subsub {\n      requirement <'R4'> c;\n      requirement <'R5'> d { doc /* d */ }\n    }\n    part def T;\n  }\n",
    "  requirement <'R6'> e : Base;\n  requirement <'R7'> f :> a;\n  requirement <R8> g { doc /* g */ subject s; require constraint { true } }\n",
    "  comment c1 /* a comment */\n  doc /* package doc */\n  part def T;\n",
    "  requirement def <'R9'> h { subject s : T; attribute m : Real; require constraint { m < 5 } doc /* h */ }\n  part def T;\n",
    "  allocate a to x;\n  part def T;\n",
    "  satisfy a by x;\n  satisfy b by x;\n  part def T;\n",
  ]) {
    out.push(reqs(e));
    out.push(reqs(e).replace("package R {", "package Doc {\n  doc /* spec */\n  package R {").replace(/\}\n$/, "}\n}\n"));
  }
  out.push("package Annotated {\n  @DocumentRoot { }\n  requirement <'R1'> a;\n  part def T;\n}\n");
  return out;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Held-out set: random combinations (different names, three members, random nesting) drawn from
 * the same vocabulary. Used to measure how well the snapshot generalises beyond its training set.
 */
export function heldOutSnippets(count: number, seed = 12345): string[] {
  const r = rng(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const members: string[] = [];
    const m = 1 + Math.floor(r() * 3) + 1;
    for (let j = 0; j < m; j++) {
      members.push(decl(pick(KINDS), 200 + i * 5 + j, { short: pick(SHORTS), feat: pick(FEATS), body: pick(BODIES), vis: pick(["", "", "private", "public"] as const), abstract: r() < 0.2, name: `h${i}_${j}` }));
    }
    out.push(wrap(members, 1 + Math.floor(r() * 3)));
  }
  return out;
}
