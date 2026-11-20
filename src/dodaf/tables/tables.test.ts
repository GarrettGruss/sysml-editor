import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ModelIndex } from "../../model/index.js";
import { renderCsv, renderMarkdown } from "../render.js";
import { buildAv1, buildAv2, buildCv1, buildDiv2, buildOv4, buildOv5a, buildStdV1, buildSv5a } from "./index.js";

const LIB = readFileSync(join(__dirname, "../../../resources/dodaf/DoDAF.sysml"), "utf8");

function setup(model: string) {
  const ix = new ModelIndex();
  ix.setDocument("file:///DoDAF.sysml", LIB);
  ix.setDocument("file:///m.sysml", model);
  return { ix, root: ix.findByQualifiedName("M")[0]! };
}

describe("render", () => {
  const t = { columns: ["A", "B"], rows: [["a|b", "l1\nl2"], ["q\"x,y", ""]], gaps: [] };
  it("escapes pipes and newlines in Markdown", () => {
    expect(renderMarkdown(t)).toBe("| A | B |\n| --- | --- |\n| a\\|b | l1<br>l2 |\n| q\"x,y |  |\n");
  });
  it("quotes CSV cells", () => {
    expect(renderCsv(t)).toBe('A,B\r\na|b,"l1\nl2"\r\n"q""x,y",\r\n');
  });
});

describe("AV-1, AV-2, CV-1", () => {
  const { ix, root } = setup(`package M {
    private import DoDAF::*;
    doc /* The architecture. */
    @ArchitectureDescription { purpose = "Plan"; scope = "Site"; }
    #Capability part cap { doc /* Detect. */ @Vision { text = "See far"; } }
    #Capability part bare;
    #OperationalActivity action Observe { doc /* Look. */ }
  }`);
  it("AV-1 reads the annotation", () => {
    const t = buildAv1(ix, root);
    expect(t.rows).toContainEqual(["Purpose", "Plan"]);
    expect(t.rows).toContainEqual(["Scope", "Site"]);
    expect(t.rows).toContainEqual(["Description", "The architecture."]);
    expect(t.gaps).toEqual([]);
  });
  it("AV-1 reports a missing annotation", () => {
    const s = setup("package M { }");
    expect(buildAv1(s.ix, s.root).gaps[0]!.message).toMatch(/no @ArchitectureDescription/);
  });
  it("AV-2 lists rows sorted, with the missing definition as a gap", () => {
    const t = buildAv2(ix, root);
    expect(t.rows.map((r) => r[0])).toEqual(["M", "Observe", "bare", "cap"]);
    expect(t.rows.find((r) => r[0] === "bare")).toEqual(["bare", "Capability", ""]);
    expect(t.gaps.map((g) => g.element)).toEqual(["M::bare"]);
  });
  it("CV-1 shows documentation and vision", () => {
    const t = buildCv1(ix, root);
    expect(t.rows).toContainEqual(["cap", "Detect.", "See far"]);
    expect(t.gaps.filter((g) => g.element === "M::bare")).toHaveLength(2);
  });
  it("is deterministic", () => {
    expect(buildAv2(ix, root)).toEqual(buildAv2(ix, root));
  });
});

describe("OV-4 and OV-5a", () => {
  it("indents nested activities", () => {
    const { ix, root } = setup(`package M {
      private import DoDAF::*;
      #OperationalActivity action Mission { doc /* m */ action Plan { doc /* p */ action Draft; } action Fly; }
    }`);
    const t = buildOv5a(ix, root);
    expect(t.rows.map((r) => r[1])).toEqual(["Mission", "  Plan", "    Draft", "  Fly"]);
    expect(t.rows.map((r) => r[0])).toEqual(["1", "2", "3", "2"]);
  });
  it("terminates on a self-containing definition", () => {
    const { ix, root } = setup(`package M {
      private import DoDAF::*;
      action def Loop { action again : Loop; }
      #OperationalActivity action Top : Loop;
    }`);
    const t = buildOv5a(ix, root);
    expect(t.rows.length).toBeLessThan(10);
    expect(t.rows[0]![1]).toBe("Top");
  });
  it("OV-4 nests organizations only", () => {
    const { ix, root } = setup(`package M {
      private import DoDAF::*;
      #Organization part Ministry { #Organization part Dept; part other; }
    }`);
    expect(buildOv4(ix, root).rows.map((r) => r[1])).toEqual(["Ministry", "  Dept"]);
  });
});

describe("SV-5a", () => {
  const { ix, root } = setup(`package M {
    private import DoDAF::*;
    #OperationalActivity action Observe;
    #OperationalActivity action Idle;
    #SystemFunction action Track;
    #SystemFunction action Orphan;
    allocate Track to Observe;
  }`);
  const t = buildSv5a(ix, root);
  it("marks the allocated cell only", () => {
    expect(t.columns).toEqual(["Activity \\ Function", "Orphan", "Track"]);
    expect(t.rows).toContainEqual(["Observe", "", "X"]);
    expect(t.rows).toContainEqual(["Idle", "", ""]);
  });
  it("reports empty rows and columns", () => {
    expect(t.gaps.map((g) => g.element).sort()).toEqual(["M::Idle", "M::Orphan"]);
  });
});

describe("StdV-1 and DIV-2", () => {
  const { ix, root } = setup(`package M {
    private import DoDAF::*;
    #Standard part iso { attribute id = "ISO 1"; attribute title = "Units"; }
    #Standard part lonely { doc /* L */ }
    part user { ref uses ::> iso; }
    item def Track { attribute id : String; attribute pos : String [0..1]; attribute x; }
    item def Empty;
  }`);
  it("StdV-1 lists identifier, title and citations", () => {
    const t = buildStdV1(ix, root);
    expect(t.rows).toContainEqual(["iso", "ISO 1", "Units", "M::user"]);
    expect(t.gaps.map((g) => g.element)).toEqual(["M::lonely"]);
  });
  it("DIV-2 shows multiplicity and flags untyped attributes", () => {
    const t = buildDiv2(ix, root);
    expect(t.rows).toContainEqual(["Track", "pos", "String", "[0..1]"]);
    expect(t.rows).toContainEqual(["Empty", "", "", ""]);
    expect(t.gaps.map((g) => g.element)).toEqual(["M::Track::x"]);
  });
});
