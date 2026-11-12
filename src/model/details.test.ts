import { describe, expect, it } from "vitest";
import { ModelIndex, DETAILS_PENDING_MESSAGE, DETAILS_UNAVAILABLE_MESSAGE, antlrDocumentParser } from "./index.js";
import type { DetailsProvider, DetailsReply, DetailsRequest } from "./types.js";
import { callTool, type ToolContext } from "../agent-tools/index.js";

/** A provider whose replies the test releases by hand. */
class FakeProvider implements DetailsProvider {
  readonly calls: { req: DetailsRequest; resolve: (r: DetailsReply | undefined) => void }[] = [];
  request(req: DetailsRequest): Promise<DetailsReply | undefined> {
    return new Promise((resolve) => this.calls.push({ req, resolve }));
  }
  /** Answer like a real worker: the precise same-thread result. */
  answer(i: number): void {
    const { req, resolve } = this.calls[i]!;
    const d = antlrDocumentParser(req.uri, req.text);
    resolve({ uri: req.uri, version: req.version, errors: d.errors, model: d.errors.length ? undefined : d.model });
  }
}

const URI = "file:///w/a.sysml";
const GOOD = "package A { part def X; }";
const BAD = "package A {\n  part def X;\n  part y : ;\n}";

function setup() {
  const fake = new FakeProvider();
  const ix = new ModelIndex(undefined, { details: fake });
  const events: string[][] = [];
  ix.onDidChange((e) => events.push(e.uris));
  return { fake, ix, events };
}

describe("ModelIndex with a details provider", () => {
  it("keeps the last good model, reports a provisional error, then the precise errors", async () => {
    const { fake, ix, events } = setup();
    ix.setDocument(URI, GOOD);
    expect(fake.calls).toHaveLength(0); // clean text never reaches the provider
    ix.setDocument(URI, BAD);
    let d = ix.getDocument(URI)!;
    expect(d.detailsPending).toBe(true);
    expect(d.stale).toBe(true);
    expect(d.errors).toEqual([{ line: 2, column: expect.any(Number), message: DETAILS_PENDING_MESSAGE }]);
    expect(ix.findByQualifiedName("A::X")).toHaveLength(1);
    expect(ix.pendingDetails()).toEqual([URI]);
    fake.answer(0);
    await ix.settled();
    d = ix.getDocument(URI)!;
    expect(d.detailsPending).toBe(false);
    expect(d.errors).toEqual(antlrDocumentParser(URI, BAD).errors);
    expect(events).toEqual([[URI], [URI], [URI]]);
  });

  it("ignores replies for older versions", async () => {
    const { fake, ix, events } = setup();
    ix.setDocument(URI, BAD);
    ix.setDocument(URI, BAD.replace("y", "zz"));
    fake.answer(0); // stale
    await new Promise((r) => setTimeout(r, 0));
    expect(ix.getDocument(URI)!.detailsPending).toBe(true);
    expect(events).toHaveLength(2);
    fake.answer(1);
    await ix.settled();
    expect(ix.getDocument(URI)!.errors[0]!.message).not.toBe(DETAILS_PENDING_MESSAGE);
    expect(events).toHaveLength(3);
  });

  it("ignores a reply that arrives after the text became clean", async () => {
    const { fake, ix } = setup();
    ix.setDocument(URI, BAD);
    ix.setDocument(URI, GOOD);
    fake.answer(0);
    await ix.settled();
    expect(ix.getDocument(URI)!.errors).toEqual([]);
    expect(ix.findByQualifiedName("A::X")).toHaveLength(1);
  });

  it("uses the model from the reply when the text is valid (snapshot gap)", async () => {
    const fake = new FakeProvider();
    // A parser whose fast path "fails" on valid text, like a construct the snapshot never saw.
    const ix = new ModelIndex(
      (uri, text, opts) => (opts?.fastOnly ? { model: { uri, roots: [] }, errors: [{ line: 0, column: 0, message: "x" }], detailsPending: true } : antlrDocumentParser(uri, text)),
      { details: fake },
    );
    ix.setDocument(URI, GOOD);
    expect(ix.getDocument(URI)!.detailsPending).toBe(true);
    fake.answer(0);
    await ix.settled();
    const d = ix.getDocument(URI)!;
    expect(d.errors).toEqual([]);
    expect(d.everParsedCleanly).toBe(true);
    expect(ix.findByQualifiedName("A::X")[0]!.owner).toBe(ix.findByQualifiedName("A")[0]);
  });

  it("keeps a provisional error when the provider is unavailable", async () => {
    const { fake, ix } = setup();
    ix.setDocument(URI, BAD);
    fake.calls[0]!.resolve(undefined);
    await ix.settled();
    const d = ix.getDocument(URI)!;
    expect(d.detailsPending).toBe(false);
    expect(d.errors.map((e) => e.message)).toEqual([DETAILS_UNAVAILABLE_MESSAGE]);
  });

  it("without a provider parses synchronously with precise errors", () => {
    const ix = new ModelIndex();
    ix.setDocument(URI, BAD);
    const d = ix.getDocument(URI)!;
    expect(d.detailsPending).toBe(false);
    expect(d.errors).toEqual(antlrDocumentParser(URI, BAD).errors);
  });
});

describe("sysml_validate with pending details", () => {
  it("says which files are still pending, then reports the precise errors", async () => {
    const { fake, ix } = setup();
    ix.setDocument(URI, BAD);
    const ctx: ToolContext = {
      index: ix,
      uriToPath: (u) => (u.startsWith("file:///w/") ? u.slice("file:///w/".length) : undefined),
      pathToUri: (p) => "file:///w/" + p,
    };
    let r = JSON.parse((await callTool("sysml_validate", {}, ctx)).text);
    expect(r.detailsPending).toEqual(["a.sysml"]);
    expect(r.pendingNote).toMatch(/still being computed/);
    expect(r.problems).toHaveLength(1);
    fake.answer(0);
    await ix.settled();
    r = JSON.parse((await callTool("sysml_validate", {}, ctx)).text);
    expect(r.detailsPending).toBeUndefined();
    expect(r.problems[0].message).not.toBe(DETAILS_PENDING_MESSAGE);
    expect(r.problems[0].line).toBe(3);
  });
});
