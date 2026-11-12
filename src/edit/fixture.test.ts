import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelIndex, type DocumentModel, type Element } from "../model/index.js";
import { defaultDocumentParser } from "../model/index.js";
import {
  applyEdits, planConnect, planDeleteElement, planInsertMember, planRename, planSetDocumentation, planSetType, type PlanResult, type TextEdit,
} from "./index.js";
import { isBlockComment, isCode, tokenize } from "./text.js";

const FILE = new URL("../../fixtures/sysml-v2-release/sysml/src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml", import.meta.url);
const present = existsSync(FILE);
const URI = "file:///fixture/SimpleVehicleModel.sysml";

function all(model: DocumentModel): Element[] {
  const out: Element[] = [];
  const walk = (e: Element) => {
    out.push(e);
    e.members.forEach(walk);
  };
  model.roots.forEach(walk);
  return out;
}

function pathOf(e: Element): number[] {
  const p: number[] = [];
  for (let c: Element = e; ; ) {
    const sibs = c.owner ? c.owner.members : undefined;
    if (!sibs) {
      p.unshift(-1);
      return p;
    }
    p.unshift(sibs.indexOf(c));
    c = c.owner!;
  }
}

function byPath(model: DocumentModel, path: number[]): Element | undefined {
  let cur: Element | undefined;
  for (const i of path) {
    if (i === -1) continue;
    cur = cur ? cur.members[i] : model.roots[i];
  }
  return cur;
}

/** Root index for a path made by `pathOf`: the walk above lost it, so compute roots separately. */
function rootPath(model: DocumentModel, e: Element): number[] {
  let top = e;
  const chain: number[] = [];
  while (top.owner) {
    chain.unshift(top.owner.members.indexOf(top));
    top = top.owner;
  }
  return [model.roots.indexOf(top), ...chain];
}
function at(model: DocumentModel, p: number[]): Element {
  let cur = model.roots[p[0]!]!;
  for (const i of p.slice(1)) cur = cur.members[i]!;
  return cur;
}

function refTexts(e: Element): string[] {
  return [...e.types, ...e.specializes, ...e.subsets, ...e.redefines, ...e.references, ...e.ends, ...(e.aliasFor ? [e.aliasFor] : []), ...(e.importInfo ? [e.importInfo.target] : [])];
}

/** Text outside every edit range is byte-identical, checked piece by piece around each edit. */
function expectUntouchedOutside(oldText: string, edits: TextEdit[], newText: string): void {
  const sorted = [...edits].sort((a, b) => a.range.start - b.range.start);
  let o = 0;
  let n = 0;
  for (const e of sorted) {
    const gap = oldText.slice(o, e.range.start);
    expect(newText.slice(n, n + gap.length) === gap).toBe(true);
    n += gap.length;
    expect(newText.slice(n, n + e.newText.length) === e.newText).toBe(true);
    n += e.newText.length;
    o = e.range.end;
  }
  expect(newText.slice(n) === oldText.slice(o)).toBe(true);
}

const stats = { plans: 0, valid: 0, refused: [] as string[], renames: [] as string[] };

describe.skipIf(!present)("edit plans on the Annex A fixture (1,581 lines)", { timeout: 600_000 }, () => {
  const text = present ? readFileSync(FILE, "utf8") : "";
  const ix = new ModelIndex();
  ix.setDocument(URI, text);
  const state = ix.getDocument(URI)!;
  const els = all(state.model);

  const check = (plan: PlanResult, what: string): Extract<PlanResult, { ok: true }> | undefined => {
    stats.plans++;
    if (!plan.ok) {
      stats.refused.push(`${what}: ${plan.reason}`);
      return undefined;
    }
    const edits = plan.edits.filter((e) => e.uri === URI);
    const out = applyEdits(text, edits);
    expect(defaultDocumentParser(URI, out).errors, what).toEqual([]);
    expectUntouchedOutside(text, edits, out);
    stats.valid++;
    return plan;
  };
  const spread = <T,>(xs: T[], n: number): T[] => (xs.length <= n ? xs : Array.from({ length: n }, (_v, i) => xs[Math.floor((i * xs.length) / n)]!));
  const out = (plan: PlanResult) => applyEdits(text, (plan as Extract<PlanResult, { ok: true }>).edits);

  it("the fixture parses cleanly and is the expected size", () => {
    expect(state.errors).toEqual([]);
    expect(text.split("\n").length).toBeGreaterThan(1500);
  });

  it("inserts into 10 different owners, including owners that end in `;`", () => {
    const withBody = els.filter((e) => e.bodyRange && e.kind !== "doc" && e.kind !== "comment" && e.name !== undefined);
    const noBody = els.filter((e) => !e.bodyRange && /;\s*$/.test(text.slice(e.range.start.offset, e.range.end.offset)) && e.isUsage && e.name !== undefined);
    const owners = [...spread(withBody, 6), ...spread(noBody, 4)];
    expect(owners).toHaveLength(10);
    expect(new Set(owners).size).toBe(10);
    for (const o of owners) {
      const p = check(planInsertMember(ix, o, { kind: "part", name: "zzInserted" }), `insert into ${o.qualifiedName}`);
      expect(p, `insert into ${o.qualifiedName}`).toBeDefined();
    }
  });

  it("round trip: insert then delete restores the text byte for byte (owners with a body)", () => {
    const owners = spread(els.filter((e) => e.bodyRange && e.members.length > 0 && e.kind !== "doc" && e.kind !== "comment" && e.qualifiedName !== undefined), 12);
    for (const o of owners) {
      for (const pos of ["end", "start"] as const) {
        const ins = planInsertMember(ix, o, { kind: "part", name: "zzInserted" }, pos);
        stats.plans++;
        expect(ins.ok, o.qualifiedName).toBe(true);
        const mid = out(ins);
        const ix2 = new ModelIndex();
        ix2.setDocument(URI, mid);
        const added = ix2.findByQualifiedName(`${o.qualifiedName}::zzInserted`)[0];
        expect(added, `${o.qualifiedName} ${o.kind} ${pos}`).toBeDefined();
        const del = planDeleteElement(ix2, added!);
        stats.plans++;
        expect(del.ok, o.qualifiedName).toBe(true);
        expect(applyEdits(mid, (del as Extract<PlanResult, { ok: true }>).edits) === text, `${o.qualifiedName} ${pos}`).toBe(true);
        stats.valid += 2;
      }
    }
  });

  it("deletes 10 different elements, nested ones with bodies and docs among them", () => {
    const deletable = els.filter((e) => e.kind !== "import" && !!e.owner);
    const withBodyAndDoc = deletable.filter((e) => e.bodyRange && e.members.some((m) => m.kind === "doc"));
    const nested = deletable.filter((e) => e.bodyRange && e.members.length > 0 && e.owner?.owner !== undefined);
    const plain = deletable.filter((e) => !e.bodyRange);
    const picks = [...new Set([...spread(withBodyAndDoc, 3), ...spread(nested, 4), ...spread(plain, 3)])];
    expect(picks.length).toBeGreaterThanOrEqual(10);
    for (const e of picks) {
      const p = check(planDeleteElement(ix, e), `delete ${e.qualifiedName ?? e.kind}`);
      expect(p, `delete ${e.qualifiedName ?? e.kind}`).toBeDefined();
      const edit = p!.edits[0]!;
      const removed = text.slice(edit.range.start, edit.range.end);
      const own = text.slice(e.range.start.offset, e.range.end.offset);
      expect(removed.includes(own)).toBe(true);
      // Besides the declaration, only whitespace, comments and a visibility keyword are removed.
      const rest = removed.replace(own, "");
      for (const t of tokenize(rest)) expect(!isCode(t) || isBlockComment(t) || ["public", "private", "protected"].includes(t.text)).toBe(true);
    }
  });

  it("renames 5 elements that have references; every former reference resolves to the renamed element", () => {
    const counts = new Map<Element, number>();
    for (const e of els) for (const t of refTexts(e)) {
      const r = ix.resolve(t, e.owner ?? e);
      if (r && r.name) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    const candidates = [...counts].filter(([e]) => e.nameRange && !e.owner?.kind.startsWith("import")).sort((a, b) => b[1] - a[1]);
    expect(candidates.length).toBeGreaterThanOrEqual(5);
    // a spread of well-referenced elements: definitions and features
    const chosen = [...new Set([...candidates.slice(0, 3).map((c) => c[0]), ...spread(candidates.map((c) => c[0]), 4)])];
    let renamed = 0;
    for (const target of chosen) {
      if (renamed >= 5) break;
      const newName = target.name!.includes(" ") ? "Renamed One" : target.name + "Renamed";
      const plan = planRename(ix, target, newName);
      stats.plans++;
      if (!plan.ok) {
        stats.refused.push(`rename ${target.qualifiedName}: ${plan.reason}`);
        continue;
      }
      renamed++;
      stats.renames.push(`${target.qualifiedName}: ${plan.edits.length - 1} references, ${plan.unjudged?.count ?? 0} not judged`);
      const edits = plan.edits;
      expect(edits.length).toBeGreaterThan(1);
      const newText = applyEdits(text, edits);
      expect(defaultDocumentParser(URI, newText).errors).toEqual([]);
      expectUntouchedOutside(text, edits, newText);
      stats.valid++;
      const ix2 = new ModelIndex();
      ix2.setDocument(URI, newText);
      const m2 = ix2.getDocument(URI)!.model;
      const tPath = rootPath(state.model, target);
      const target2 = at(m2, tPath);
      expect(target2.name).toBe(newName);
      let checked = 0;
      for (const e of els) {
        const texts = refTexts(e);
        if (!texts.length) continue;
        const e2 = at(m2, rootPath(state.model, e));
        const texts2 = refTexts(e2);
        expect(texts2.length).toBe(texts.length);
        texts.forEach((t, i) => {
          if (ix.resolve(t, e.owner ?? e) === target) {
            checked++;
            expect(ix2.resolve(texts2[i]!, e2.owner ?? e2), `${e.qualifiedName ?? e.kind}: ${t} -> ${texts2[i]}`).toBe(target2);
          }
        });
      }
      expect(checked).toBeGreaterThan(0);
    }
    expect(renamed).toBe(5);
  });

  it("sets a type, sets and removes documentation, and connects", () => {
    // retype
    const defs = els.filter((e) => e.kind === "part def" && e.name);
    const usages = els.filter((e) => e.kind === "part" && e.name && e.types.length === 1 && e.owner);
    let n = 0;
    for (const u of spread(usages, 3)) {
      const other = defs.find((d) => d.name !== u.types[0] && ix.resolve(d.name!, u.owner!) === d)!;
      const p = check(planSetType(ix, u, other), `set type ${u.qualifiedName}`);
      expect(p).toBeDefined();
      n++;
    }
    // documentation: replace an existing doc, create one, remove one
    const documented = els.find((e) => e.bodyRange && e.members.some((m) => m.kind === "doc") && e.name)!;
    expect(check(planSetDocumentation(ix, documented, "Replaced documentation."), "set doc (replace)")).toBeDefined();
    expect(check(planSetDocumentation(ix, documented, "Line one.\nLine two."), "set doc (multi)")).toBeDefined();
    expect(check(planSetDocumentation(ix, documented, undefined), "set doc (remove)")).toBeDefined();
    const undocumented = els.filter((e) => e.name && e.isDefinition && !e.members.some((m) => m.kind === "doc"));
    for (const e of spread(undocumented, 3)) expect(check(planSetDocumentation(ix, e, "Created."), `set doc (create) ${e.qualifiedName}`)).toBeDefined();
    // connect two members of an owner
    let connected = 0;
    for (const o of els.filter((e) => e.bodyRange && e.members.filter((m) => m.isUsage && m.name).length >= 2 && e.name)) {
      if (connected >= 3) break;
      const [a, b] = o.members.filter((m) => m.isUsage && m.name);
      const p = check(planConnect(ix, o, a!, b!), `connect in ${o.qualifiedName}`);
      if (!p) continue;
      connected++;
      const ix2 = new ModelIndex();
      ix2.setDocument(URI, out(p));
      const o2 = ix2.findByQualifiedName(o.qualifiedName!)[0]!;
      const c = o2.members.filter((m) => m.kind === "connect").find((m) => m.ends.join() === [a!.name, b!.name].join());
      expect(c, o.qualifiedName).toBeDefined();
      expect(ix2.resolve(c!.ends[0]!, o2)?.qualifiedName).toBe(a!.qualifiedName);
      expect(ix2.resolve(c!.ends[1]!, o2)?.qualifiedName).toBe(b!.qualifiedName);
    }
    expect(connected).toBe(3);
    expect(n).toBe(3);
  });

  it("summary", () => {
    console.log(`fixture plans: ${stats.plans}, valid: ${stats.valid}, refused: ${stats.refused.length}`, stats.refused, stats.renames);
    expect(stats.valid).toBeGreaterThan(40);
  });
});
