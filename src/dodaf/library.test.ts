import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ModelIndex } from "../model/index.js";
import { UAF_TO_DODAF } from "./mapping.js";
import { addLibrary, annotationNames, selectByMetadata, type LibraryFs } from "./library.js";

const LIB = readFileSync(join(__dirname, "../../resources/dodaf/DoDAF.sysml"), "utf8");

function indexOf(model: string): ModelIndex {
  const ix = new ModelIndex();
  ix.setDocument("file:///DoDAF.sysml", LIB);
  ix.setDocument("file:///m.sysml", model);
  return ix;
}

describe("DoDAF.sysml", () => {
  it("parses with no errors and declares every metadata def", () => {
    const ix = new ModelIndex();
    ix.setDocument("file:///DoDAF.sysml", LIB);
    expect(ix.getDocument("file:///DoDAF.sysml")!.errors).toEqual([]);
    for (const { uaf } of UAF_TO_DODAF) expect(ix.findByQualifiedName(`DoDAF::${uaf}`)[0]?.kind, uaf).toBe("metadata def");
  });

  it("parses allocate and metadata annotations on usages", () => {
    const ix = indexOf(`package M {
      private import DoDAF::*;
      #OperationalActivity action act;
      #SystemFunction action fn;
      #OperationalPerformer part p { @OperationalPerformer; }
      @ArchitectureDescription { purpose = "p"; scope = "s"; viewpointName = "v"; }
      allocate fn to act;
    }`);
    expect(ix.getDocument("file:///m.sysml")!.errors).toEqual([]);
  });
});

describe("selectByMetadata", () => {
  const ix = indexOf(`package M {
    private import DoDAF::*;
    #OperationalPerformer part soldier;
    part tank;
    #OperationalPerformer #System part both;
    part owned { @OperationalPerformer; }
    #OperationalActivity action act;
    #OperationalPerformer item i;
    #DoDAF::System part q;
    #Unknown part u;
  }`);
  const names = (d: string) => selectByMetadata(ix, d).map((e) => e.name);

  it("finds annotated parts, actions and items and skips unannotated ones", () => {
    expect(names("OperationalPerformer")).toEqual(["soldier", "both", "owned", "i"]);
    expect(names("OperationalActivity")).toEqual(["act"]);
    expect(names("System")).toEqual(["both", "q"]);
    expect(names("Standard")).toEqual([]);
    expect(names("Nope")).toEqual([]);
  });

  it("lists annotation names as written", () => {
    const both = ix.findByQualifiedName("M::both")[0]!;
    expect(annotationNames(ix, both)).toEqual(["OperationalPerformer", "System"]);
  });
});

describe("addLibrary", () => {
  function fake(files: Record<string, string>): LibraryFs & { files: Record<string, string>; dirs: string[] } {
    const dirs: string[] = [];
    return {
      files,
      dirs,
      exists: async (p) => p in files,
      readText: async (p) => files[p]!,
      writeText: async (p, t) => void (files[p] = t),
      mkdirs: async (p) => void dirs.push(p),
    };
  }

  it("copies the file", async () => {
    const fs = fake({ "/ext/DoDAF.sysml": "lib" });
    expect(await addLibrary(fs, "/ext/DoDAF.sysml", "/ws/model")).toEqual({ status: "copied", path: "/ws/model/DoDAF.sysml" });
    expect(fs.files["/ws/model/DoDAF.sysml"]).toBe("lib");
  });

  it("does not overwrite", async () => {
    const fs = fake({ "/ext/DoDAF.sysml": "lib", "/ws/DoDAF.sysml": "mine" });
    expect(await addLibrary(fs, "/ext/DoDAF.sysml", "/ws")).toEqual({ status: "exists", path: "/ws/DoDAF.sysml" });
    expect(fs.files["/ws/DoDAF.sysml"]).toBe("mine");
  });
});
