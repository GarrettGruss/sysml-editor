import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { createDiagram } from "./create.js";
import type { DiagramKind } from "./format.js";
import { resolveDiagram } from "./resolve.js";
import { buildViewModel } from "./view-model.js";
import { absoluteBoxes, type Measure } from "../webview/diagram/geometry.js";
import { layoutDiagram, type ElkLike } from "../webview/diagram/layout.js";
import { checkEdges } from "../webview/diagram/metrics.js";
import { LIGHT_PALETTE, buildSvg } from "../webview/diagram/svg.js";

const measure: Measure = (t, s) => t.length * (s === "small" ? 5.5 : 6.5);
const elk = new ELK() as unknown as ElkLike;

async function build(src: string, root: string, kind: DiagramKind) {
  const index = new ModelIndex();
  index.setDocument("file:///w/m.sysml", src);
  const doc = createDiagram(index, root, kind);
  const vm = buildViewModel(doc, resolveDiagram(doc, index), index);
  const layout = await layoutDiagram(vm, elk, measure);
  const abs = absoluteBoxes(vm, layout.boxes);
  const svg = buildSvg(vm, layout.boxes, measure, { palette: LIGHT_PALETTE }, { routes: layout.routes });
  return { vm, svg, edges: checkEdges(vm, abs, svg.routes, svg.labels) };
}

const IFACES = "package P { part def Sys { part client { port output; } part server { port input; } interface statusApi connect client.output to server.input; interface dataApi connect client.output to server.input; } }";
const SEQ = "package P { part def RequestSequence { part a; part b; message req from a to b; message ok from b to a; message error from b to a; first req then ok; first req then error; } }";

describe("interface edges (D74)", () => {
  it("interfaces use the connection style and parallel ones get different routes and no overlapping labels", async () => {
    const r = await build(IFACES, "P::Sys", "interconnection");
    const ifs = r.vm.edges.filter((e) => e.elementKind === "interface");
    expect(ifs.map((e) => e.style)).toEqual(["connection", "connection"]);
    expect(ifs.map((e) => e.label).sort()).toEqual(["dataApi", "statusApi"]);
    const [a, b] = ifs.map((e) => JSON.stringify(r.svg.routes.get(e.id)));
    expect(a).not.toBe(b);
    expect(r.edges.labelsOverLabels).toBe(0);
  });
});

describe("sequence alternatives and replies (D75)", () => {
  it("draws replies dashed and the ok/error alternatives as one alt frame with two guards", async () => {
    const r = await build(SEQ, "P::RequestSequence", "sequence");
    expect(r.vm.fragments).toHaveLength(1);
    expect(r.vm.fragments![0]!.branches.map((b) => b.guard)).toEqual(["[ok]", "[else]"]);
    expect(r.vm.edges.filter((e) => e.reply).length).toBe(2);
    expect(r.svg.content).toContain('data-fragment="alt"');
    expect(r.svg.content.match(/data-fragment-divider/g)).toHaveLength(1);
    expect(r.svg.content.match(/data-reply="true"/g)).toHaveLength(2);
    expect(r.svg.content).toMatch(/data-reply="true"[^]*?stroke-dasharray="6 4"/);
  });
  it("a model without alternatives has no frame", async () => {
    const r = await build("package P { part def S { part a; part b; message m1 from a to b; message m2 from b to a; first m1 then m2; } }", "P::S", "sequence");
    expect(r.vm.fragments).toBeUndefined();
    expect(r.svg.content).not.toContain("data-fragment");
  });
});
