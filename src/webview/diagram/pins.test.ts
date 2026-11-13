import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { ModelIndex } from "../../model/index.js";
import { parseDiagram } from "../../diagram/format.js";
import { resolveDiagram } from "../../diagram/resolve.js";
import { buildViewModel } from "../../diagram/view-model.js";
import { absoluteBoxes, type Measure } from "./geometry.js";
import { layoutDiagram, type ElkLike } from "./layout.js";
import { buildSvg } from "./svg.js";

const measure: Measure = (t, s) => t.length * (s === "small" ? 5.5 : 6.5);
const elk = new ELK() as unknown as ElkLike;

const MODEL = `package P {
    item def Report;
    action def Detect {
        out item scanReport : Report;
    }
    action def Engage {
        in item report : Report;
        out item done : Report;
    }
    action def Main {
        action detectThreat : Detect;
        action engageDefenses : Engage;
        flow from detectThreat.scanReport to engageDefenses.report;
    }
}
`;

function setup(nodes: object[] = []) {
  const ix = new ModelIndex();
  ix.setDocument("file:///ws/m.sysml", MODEL);
  const doc = parseDiagram(JSON.stringify({
    version: 1, kind: "actionFlow", root: "P::Main", sources: ["m.sysml"],
    nodes: [{ id: "n1", ref: "P::Main::detectThreat", parent: "n0" }, { id: "n2", ref: "P::Main::engageDefenses", parent: "n0" }, { id: "n0", ref: "P::Main" }, ...nodes],
    edges: [{ id: "e1", locator: { owner: "P::Main", kind: "flow", ends: ["detectThreat.scanReport", "engageDefenses.report"] }, source: "n1", target: "n2" }],
  }));
  if (!doc.ok) throw new Error(JSON.stringify(doc.problems));
  return { ix, vm: buildViewModel(doc.doc, resolveDiagram(doc.doc, ix), ix) };
}

describe("parameter pins", () => {
  it("draws inherited directed features of an action as pins, labelled with the name and the type in the tooltip", () => {
    const { vm } = setup();
    const pins = vm.nodes.filter((n) => n.pin);
    expect(pins.map((p) => `${p.label}:${p.pin!.direction}`).sort()).toEqual(["done:out", "report:in", "scanReport:out"]);
    const scan = pins.find((p) => p.label === "scanReport")!;
    expect(scan.shape).toBe("port");
    expect(scan.tooltip).toContain("Report");
    expect(scan.inherited).toBeDefined();
  });

  it("connects the flow from pin to pin", () => {
    const { vm } = setup();
    const e = vm.edges.find((x) => x.id === "e1")!;
    expect(vm.nodes.find((n) => n.id === e.source)?.label).toBe("scanReport");
    expect(vm.nodes.find((n) => n.id === e.target)?.label).toBe("report");
  });

  it("places inputs on the left and outputs on the right of the action, on its border", async () => {
    const { vm } = setup();
    const l = await layoutDiagram(vm, elk, measure);
    const abs = absoluteBoxes(vm, l.boxes);
    for (const n of vm.nodes.filter((x) => x.pin)) {
      const o = abs.get(n.attachedTo!)!;
      const b = abs.get(n.id)!;
      const cx = b.x + b.w / 2;
      expect(Math.abs(cx - (n.pin!.direction === "in" ? o.x : o.x + o.w))).toBeLessThan(2);
    }
    expect(buildSvg(vm, l.boxes, measure).content).toContain('data-pin="out"');
  });

  it("uses a stored pin node for the position (sliding a pin is a layout edit)", async () => {
    const { vm } = setup([{ id: "n9", ref: "P::Detect::scanReport", parent: "n1", x: 100, y: 52 }]);
    expect(vm.nodes.filter((n) => n.label === "scanReport")).toHaveLength(1);
    expect(vm.nodes.find((n) => n.id === "n9")?.attachedTo).toBe("n1");
  });
});
