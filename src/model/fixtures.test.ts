import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocumentModel } from "./antlr-builder.js";
import { antlrDocumentParser } from "./antlr-parser.js";
import { unquoteName } from "./names.js";
import { parse } from "../parser/parse.js";
import type { Element } from "./types.js";

const root = resolve(__dirname, "../../fixtures/sysml-v2-release/sysml");
const vehicle = join(root, "src/examples/Vehicle Example/SysML v2 Spec Annex A SimpleVehicleModel.sysml");
const have = existsSync(vehicle);
if (!have) console.warn("fixtures/sysml-v2-release is missing (git submodule not initialised): fixture model tests are skipped");

function walk(roots: readonly Element[], f: (e: Element) => void): void {
  for (const r of roots) {
    f(r);
    walk(r.members, f);
  }
}
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (n.endsWith(".sysml")) out.push(p);
  }
  return out;
}

describe.skipIf(!have)("Simple Vehicle Model", () => {
  const text = have ? readFileSync(vehicle, "utf8") : "";
  const m = have ? antlrDocumentParser("file:///vehicle.sysml", text) : undefined;
  const byQn = new Map<string, Element>();
  if (m) walk(m.model.roots, (e) => e.qualifiedName && !byQn.has(e.qualifiedName) && byQn.set(e.qualifiedName, e));
  const D = "SimpleVehicleModel::Definitions::";

  it("parses without errors into one root package", () => {
    expect(m!.errors).toEqual([]);
    expect(m!.model.roots.map((r) => [r.kind, r.name])).toEqual([["package", "SimpleVehicleModel"]]);
  });
  it("has the expected definitions with kinds", () => {
    expect(byQn.get(D + "PartDefinitions::Vehicle")?.kind).toBe("part def");
    expect(byQn.get(D + "PartDefinitions::Engine")?.kind).toBe("part def");
    expect(byQn.get(D + "PortDefinitions::IgnitionCmdPort")?.kind).toBe("port def");
    expect(byQn.get(D + "StateDefinitions::VehicleStates")?.kind).toBe("state def");
    expect(byQn.get(D + "RequirementDefinitions::MassRequirement")?.kind).toBe("requirement def");
    expect(byQn.get(D + "PartDefinitions::Vehicle")?.isDefinition).toBe(true);
  });
  it("has typed and specialised members", () => {
    const v = D + "PartDefinitions::Vehicle::";
    expect(byQn.get(v + "mass")?.subsets).toEqual(["ISQ::mass"]);
    expect(byQn.get(v + "brakePedalDepressed")?.types).toEqual(["Boolean"]);
    expect(byQn.get(v + "maintenanceTime")?.types).toEqual(["Time::DateTime"]);
    expect(byQn.get(v + "ignitionCmdPort")?.kind).toBe("port");
    expect(byQn.get(v + "ignitionCmdPort")?.types).toEqual(["IgnitionCmdPort"]);
    expect(byQn.get(D + "PortDefinitions::FuelCmdPort")?.specializes).toEqual(["PwrCmdPort"]);
  });
  it("has imports with visibility, aliases, docs, connections", () => {
    const sv = m!.model.roots[0]!;
    const imp = sv.members.filter((e) => e.kind === "import");
    expect(imp.map((e) => e.importInfo?.target)).toEqual(["Definitions", "ISQ"]);
    expect(imp.every((e) => e.visibility === "public" && e.importInfo?.wildcard)).toBe(true);
    const defs = byQn.get("SimpleVehicleModel::Definitions")!;
    expect(defs.members.find((e) => e.importInfo?.target === "MetadataDefinitions")?.importInfo?.recursive).toBe(true);
    const mr = byQn.get(D + "RequirementDefinitions::MassRequirement")!;
    expect(mr.documentation).toBe("The actual mass shall be less than the required mass");
    let alias: Element | undefined;
    walk(m!.model.roots, (e) => e.kind === "alias" && e.name === "Torque" && (alias = e));
    expect(alias?.aliasFor).toBe("ISQ::TorqueValue");
    let conn: Element | undefined;
    walk(m!.model.roots, (e) => e.kind === "connect" && e.ends[0] === "differential.leftDiffPort" && (conn = e));
    expect(conn?.ends).toEqual(["differential.leftDiffPort", "rearAxle.leftHalfAxle.leftAxleToDiffPort"]);
    expect(conn?.qualifiedName).toBeUndefined();
  });
});

describe.skipIf(!have)("all .sysml fixtures", () => {
  it("build models without throwing and every name range matches its name", () => {
    const list = files(root);
    expect(list.length).toBeGreaterThan(100);
    let elements = 0;
    const bad: string[] = [];
    const started = performance.now();
    for (const f of list) {
      const text = readFileSync(f, "utf8");
      const r = parse(text); // build even from trees with syntax errors: the builder must not throw
      const model = buildDocumentModel("file://" + f, text, r.tree);
      walk(model.roots, (e) => {
        elements++;
        if (e.nameRange) {
          const t = unquoteName(text.slice(e.nameRange.start.offset, e.nameRange.end.offset));
          if (t !== e.name) bad.push(`${f}: ${e.qualifiedName} name '${e.name}' != range text '${t}'`);
          const line = text.split("\n")[e.nameRange.start.line]!;
          if (!line.slice(e.nameRange.start.column).startsWith(text.slice(e.nameRange.start.offset, e.nameRange.end.offset)))
            bad.push(`${f}: ${e.qualifiedName} line/column mismatch`);
        }
        if (e.shortNameRange && unquoteName(text.slice(e.shortNameRange.start.offset, e.shortNameRange.end.offset)) !== e.shortName)
          bad.push(`${f}: ${e.qualifiedName} short name range mismatch`);
        if (e.range.end.offset < e.range.start.offset) bad.push(`${f}: negative range`);
      });
    }
    console.log(`built ${list.length} files, ${elements} elements in ${Math.round(performance.now() - started)} ms`);
    expect(bad.slice(0, 20)).toEqual([]);
  }, 300_000);
});
