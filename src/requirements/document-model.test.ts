import { describe, expect, test } from "vitest";
import { ModelIndex } from "../model/index.js";
import { buildDocumentModel, sectionLabel } from "./document-model.js";
import { listRequirements } from "./queries.js";
import { parseMarkdown, inlineText } from "./markdown.js";

const URI = "file:///w/spec.sysml";
function model(text: string, root: string) {
  const ix = new ModelIndex();
  ix.setDocument(URI, text);
  expect(ix.getDocument(URI)!.errors).toEqual([]);
  return { ix, doc: buildDocumentModel(ix, ix.findByQualifiedName(root)[0]!) };
}

const ANNOTATED = `package VehicleSpec {
  private import DocumentAnnotations::*;
  @DocumentRoot { title = "Vehicle SRS"; version = "1.2"; }
  package 'Performance Requirements' {
    doc /* Scope of performance. */
    comment /* Second paragraph. */
    requirement <'R3'> accel { doc /* Acceleration. */ }
    part def TestRig;
    package Sub { requirement <'R4'> top; }
  }
  package Glossary { @Appendix; doc /* Terms. */ }
  package Safety;
  package Index { @Appendix; }
}`;

describe("DocumentModel", () => {
  test("annotated source renders as a document", () => {
    const { doc } = model(ANNOTATED, "VehicleSpec");
    expect(doc.title).toBe("Vehicle SRS");
    expect(doc.version).toBe("1.2");
    expect(doc.annotated).toBe(true);
    expect(doc.sections.map((s) => sectionLabel(s))).toEqual(["1 Performance Requirements", "2 Safety"]);
    expect(doc.appendices.map((s) => sectionLabel(s))).toEqual(["Appendix A Glossary", "Appendix B Index"]);
    expect(doc.toc.filter((t) => t.kind === "section").map((t) => `${t.number} ${t.heading}`)).toEqual(["1 Performance Requirements", "1.1 Sub", "2 Safety", "A Glossary", "B Index"]);
  });
  test("section content: paragraphs in order, requirement items, model elements", () => {
    const { doc } = model(ANNOTATED, "VehicleSpec");
    const s = doc.sections[0]!;
    expect(s.blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph", "item", "elements"]);
    const [p1, p2, item, els] = s.blocks as [any, any, any, any];
    expect(p1.text).toBe("Scope of performance.");
    expect(p2.source).toBe("comment");
    expect(item.info.shortName).toBe("R3");
    expect(item.info.name).toBe("accel");
    expect(item.info.text).toBe("Acceleration.");
    expect(els.items.map((i: any) => i.name)).toEqual(["TestRig"]);
    expect(s.children[0]!.level).toBe(2);
  });
  test("unannotated package: title is the package name, nested packages are sections, no appendices", () => {
    const { doc } = model("package Plain { package A; package B { package C; } }", "Plain");
    expect(doc.title).toBe("Plain");
    expect(doc.annotated).toBe(false);
    expect(doc.sections.map((s) => s.number)).toEqual(["1", "2"]);
    expect(doc.sections[1]!.children[0]!.number).toBe("2.1");
    expect(doc.appendices).toEqual([]);
  });
  test("reordering renumbers and the text has no numbers", () => {
    const a = model("package D { package One; package Two; package Three; }", "D").doc;
    const b = model("package D { package One; package Three; package Two; }", "D").doc;
    expect(a.toc.map((t) => `${t.number}${t.heading}`)).toEqual(["1One", "2Two", "3Three"]);
    expect(b.toc.map((t) => `${t.number}${t.heading}`)).toEqual(["1One", "2Three", "3Two"]);
  });
  test("the comment terminator convention is shown as the terminator", () => {
    const { doc } = model("package D { package S { doc /* use *\\/ here */ } }", "D");
    expect((doc.sections[0]!.blocks[0] as any).text).toBe("use */ here");
  });
  test("relationship summaries on items and requirement listing", () => {
    const text = `package D { private import RequirementDerivation::*;
      requirement a; requirement b; part v;
      satisfy a by v;
      verification def t { objective { verify a; } }
      #derivation connection { end #original ::> a; end #derive ::> b; }
    }`;
    const { ix, doc } = model(text, "D");
    const items = doc.blocks.filter((b) => b.kind === "item") as any[];
    expect(items[0].summary).toEqual({ satisfiedBy: ["v"], verifiedBy: ["t"], derivedFrom: [], derives: ["b"] });
    expect(items[1].summary.derivedFrom).toEqual(["a"]);
    const rows = listRequirements(ix, ix.findByQualifiedName("D")[0]!);
    expect(rows.map((r) => [r.name, r.satisfiedBy.length, r.verifiedBy.length])).toEqual([["a", 1, 1], ["b", 0, 0]]);
    // the derivation connection and the statements are not model elements
    expect(doc.blocks.find((b) => b.kind === "elements")?.kind).toBe("elements");
    expect((doc.blocks.find((b) => b.kind === "elements") as any).items.map((i: any) => i.name)).toEqual(["v", "t"]);
  });
});

describe("Markdown subset", () => {
  test("the comment terminator convention stays text", () => {
    const [p] = parseMarkdown("Comments end with */ and start with /*.");
    expect(inlineText((p as any).c)).toBe("Comments end with */ and start with /*.");
    expect((p as any).c.every((n: any) => n.t === "text")).toBe(true);
    expect(inlineText((parseMarkdown("a * b * c")[0] as any).c)).toBe("a * b * c");
    expect((parseMarkdown("*em* and **strong** and _u_")[0] as any).c.map((n: any) => n.t)).toEqual(["em", "text", "strong", "text", "em"]);
  });
  test("a bulleted list", () => {
    const b = parseMarkdown("Intro\n\n- one\n- two *em*\n\n1. first\n2. second");
    expect(b.map((x) => x.t)).toEqual(["p", "ul", "ol"]);
    expect((b[1] as any).items.map((i: any) => inlineText(i))).toEqual(["one", "two em"]);
  });
  test("emphasis, strong, code and safe links only", () => {
    const [p] = parseMarkdown("**b** *i* `c` [ok](https://example.com/a) [bad](javascript:alert(1)) <script>x</script>");
    const kinds = (p as any).c.map((n: any) => n.t);
    expect(kinds).toContain("strong");
    expect(kinds).toContain("em");
    expect(kinds).toContain("code");
    expect((p as any).c.filter((n: any) => n.t === "link")).toHaveLength(1);
    expect(inlineText((p as any).c)).toContain("<script>x</script>"); // text, never markup
    expect(JSON.stringify(p)).not.toContain("javascript:");
  });
});

const MINING = `package MiningFrigate {
  requirement def MiningFrigateRequirementsDef {
    doc /* The owner. */
    requirement <'MFRQ01'> OreExtractionEfficiencyRequirement {
      doc /* The Mining Frigate shall extract ore at 85 percent. */
      requirement <'MFRQ01_1'> Yield { doc /* Yield. */ }
      requirement <'MFRQ01_2'> Wear { doc /* Wear. */ requirement <'W1'> Deep; }
    }
    requirement <'MFRQ02'> Cargo { doc /* Cargo. */ }
  }
  package Section { requirement <'S1'> One; package Sub { requirement <'S2'> Two; } }
}`;

describe("requirement hierarchy and numbering", () => {
  test("a plain requirement definition is the document: owner heading, requirements as items with computed numbers", () => {
    const { doc } = model(MINING, "MiningFrigate::MiningFrigateRequirementsDef");
    expect(doc.title).toBe("MiningFrigateRequirementsDef");
    expect(doc.annotated).toBe(false);
    const items = doc.blocks.filter((b) => b.kind === "item") as any[];
    expect(items.map((i) => [i.number, i.info.shortName, i.info.name])).toEqual([["1", "MFRQ01", "OreExtractionEfficiencyRequirement"], ["2", "MFRQ02", "Cargo"]]);
    expect(items[0].info.text).toContain("85 percent");
    expect(items[0].children.map((c: any) => c.number)).toEqual(["1.1", "1.2"]);
    expect(items[0].children[1].children.map((c: any) => c.number)).toEqual(["1.2.1"]);
    // the owner's own doc is a paragraph of the document, not a requirement
    expect(doc.blocks.filter((b) => b.kind === "paragraph")).toHaveLength(1);
  });
  test("numbers are never part of the text", () => {
    const { doc } = model(MINING, "MiningFrigate::MiningFrigateRequirementsDef");
    expect(JSON.stringify(doc.blocks.filter((b) => b.kind === "item").map((b: any) => b.info.text))).not.toMatch(/1\.1/);
  });
  test("the table of contents has the requirement headings, nested, in document order", () => {
    const { doc } = model(MINING, "MiningFrigate::MiningFrigateRequirementsDef");
    expect(doc.toc.map((t) => `${t.kind}:${t.number} ${t.heading}:${t.level}`)).toEqual([
      "requirement:1 MFRQ01 : OreExtractionEfficiencyRequirement:1",
      "requirement:1.1 MFRQ01_1 : Yield:2",
      "requirement:1.2 MFRQ01_2 : Wear:2",
      "requirement:1.2.1 W1 : Deep:3",
      "requirement:2 MFRQ02 : Cargo:1",
    ]);
  });
  test("in a package, requirements of a section are numbered after its subsections so numbers do not clash", () => {
    const { doc } = model(MINING, "MiningFrigate");
    expect(doc.sections.map((s) => s.number)).toEqual(["1"]);
    const s = doc.sections[0]!;
    expect((s.blocks.find((b) => b.kind === "item") as any).number).toBe("1.2");
    expect(s.children[0]!.number).toBe("1.1");
  });
});
