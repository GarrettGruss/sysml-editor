import { describe, expect, it } from "vitest";
import { ModelIndex } from "../model/index.js";
import { addElement } from "./create.js";
import { copyNodes, pasteNodes } from "./clipboard.js";
import type { DiagramDocument } from "./format.js";
import { displayRelated, memberChoices, missingRelated, relatedElements, setMembers } from "./related.js";
import { referenceKey, resolveDiagram } from "./resolve.js";
import { buildViewModel } from "./view-model.js";

const URI = "file:///ws/fleet.sysml";
const TEXT = `package Fleet {
  port def Radar;
  part def Engine;
  part def Ship { port beacon : Radar; }
  part def Frigate :> Ship {
    part engine : Engine;
    port radarPort : Radar;
  }
  part def Destroyer :> Frigate;
}`;
const ix = new ModelIndex();
ix.setDocument(URI, TEXT);
const el = (qn: string) => ix.findByQualifiedName(qn)[0]!;
const empty = (kind: DiagramDocument["kind"] = "general"): DiagramDocument => ({ version: 1, kind, root: "Fleet", sources: ["fleet.sysml"], nodes: [], edges: [] });
const draw = (d: DiagramDocument, ...qns: string[]) => qns.reduce((acc, q) => addElement(acc, ix, el(q)).doc, d);
const has = (d: DiagramDocument, qn: string) => d.nodes.some((n) => referenceKey(n) === referenceKey({ ref: qn }));

describe("show and hide parts and ports", () => {
  it("lists own and inherited parts and ports with the drawn ones ticked", () => {
    const d = draw(empty(), "Fleet::Frigate", "Fleet::Frigate::engine");
    const c = memberChoices(d, ix, "n1");
    expect(c.map((x) => [x.label, x.kind, x.drawn, x.inheritedFrom])).toEqual([
      ["engine", "part", true, undefined],
      ["radarPort", "port", false, undefined],
      ["beacon", "port", false, "Ship"],
    ]);
  });

  it("ticking a port draws it on the border of the node", () => {
    const d = draw(empty("interconnection"), "Fleet::Frigate");
    const r = setMembers(d, ix, "n1", new Set([referenceKey({ ref: "Fleet::Frigate::radarPort" })]));
    expect(r.added).toBe(1);
    const port = r.doc.nodes.find((n) => n.ref === "Fleet::Frigate::radarPort")!;
    expect(port.parent).toBe("n1");
    const vm = buildViewModel(r.doc, resolveDiagram(r.doc, ix), ix);
    expect(vm.nodes.find((n) => n.id === port.id)).toMatchObject({ shape: "port", attachedTo: "n1" });
  });

  it("unticking a part removes only its node and lines", () => {
    let d = draw(empty(), "Fleet::Frigate", "Fleet::Frigate::engine", "Fleet::Engine");
    const r = setMembers(d, ix, "n1", new Set());
    expect(r.removed).toBe(1);
    expect(has(r.doc, "Fleet::Frigate::engine")).toBe(false);
    expect(has(r.doc, "Fleet::Engine")).toBe(true);
    expect(has(r.doc, "Fleet::Frigate")).toBe(true);
    d = r.doc;
    expect(ix.findByQualifiedName("Fleet::Frigate::engine")).toHaveLength(1);
  });

  it("an inherited feature is added as the declared one", () => {
    const d = draw(empty("interconnection"), "Fleet::Frigate");
    const r = setMembers(d, ix, "n1", new Set([referenceKey({ ref: "Fleet::Ship::beacon" })]));
    expect(r.doc.nodes.find((n) => n.ref === "Fleet::Ship::beacon")?.parent).toBe("n1");
  });
});

describe("related elements", () => {
  it("finds general and specific definitions", () => {
    const r = relatedElements(ix, el("Fleet::Frigate")).filter((x) => x.kind === "specialization").map((x) => x.element.qualifiedName);
    expect(r.sort()).toEqual(["Fleet::Destroyer", "Fleet::Ship"]);
  });

  it("adds only the picked kind, with the lines between", () => {
    const d = draw(empty(), "Fleet::Frigate");
    const r = displayRelated(d, ix, "n1", new Set(["specialization"]));
    expect(r.added).toBe(2);
    expect(has(r.doc, "Fleet::Ship") && has(r.doc, "Fleet::Destroyer")).toBe(true);
    expect(has(r.doc, "Fleet::Engine")).toBe(false);
    const vm = buildViewModel(r.doc, resolveDiagram(r.doc, ix), ix);
    expect(vm.edges.filter((e) => e.style === "specialization")).toHaveLength(2);
  });

  it("nothing is missing when everything related is drawn", () => {
    let d = draw(empty(), "Fleet::Frigate");
    const all = new Set(relatedElements(ix, el("Fleet::Frigate")).map((i) => i.kind));
    d = displayRelated(d, ix, "n1", all).doc;
    expect(missingRelated(d, ix, "n1")).toEqual([]);
    const again = displayRelated(d, ix, "n1", all);
    expect(again.added).toBe(0);
  });
});

describe("copy and paste", () => {
  it("pastes nodes of the same elements into another diagram and skips drawn ones", () => {
    const a = draw(empty(), "Fleet::Ship", "Fleet::Frigate");
    const clip = copyNodes(a, ["n1", "n2"])!;
    const b = pasteNodes(empty(), ix, clip);
    expect(b.added).toBe(2);
    expect(has(b.doc, "Fleet::Ship") && has(b.doc, "Fleet::Frigate")).toBe(true);
    const c = pasteNodes(draw(empty(), "Fleet::Ship"), ix, clip);
    expect(c).toMatchObject({ added: 1, already: 1, skipped: 0 });
  });

  it("offsets the pasted nodes from where they were copied", () => {
    const a = draw(empty(), "Fleet::Ship");
    a.nodes[0] = { ...a.nodes[0]!, x: 100, y: 50 };
    const b = pasteNodes(empty(), ix, copyNodes(a, ["n1"])!);
    expect(b.doc.nodes[0]).toMatchObject({ x: 140, y: 90 });
  });

  it("skips elements the kind of diagram cannot show", () => {
    const a = draw(empty(), "Fleet::Ship");
    const r = pasteNodes(empty("sequence"), ix, copyNodes(a, ["n1"])!);
    expect(r).toMatchObject({ added: 0, skipped: 1 });
  });
});
