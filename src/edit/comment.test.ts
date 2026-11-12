import { describe, expect, test } from "vitest";
import { ModelIndex, defaultDocumentParser } from "../model/index.js";
import { buildComment, commentBodyText, commentStyle, escapeTerminator, newCommentDecl, planSetCommentBody, unescapeTerminator } from "./comment.js";
import { applyEdits, groupByUri } from "./text.js";

const URI = "file:///w/c.sysml";

/** Write `body` as a new doc in `package P`, parse with the real parser, and read the shown text back. */
function roundTrip(body: string, style?: Parameters<typeof buildComment>[3]): { shown: string; el: string } {
  const decl = style ? buildComment(escapeTerminator(body), "\n", "    ", style, "doc ") : newCommentDecl("doc", escapeTerminator(body), "\n", "    ");
  const text = `package P {\n    ${decl}\n    part x;\n}\n`;
  const r = defaultDocumentParser(URI, text);
  expect(r.errors, text).toEqual([]);
  const ix = new ModelIndex();
  ix.setDocument(URI, text);
  const P = ix.findByQualifiedName("P")[0]!;
  expect(P.members.map((m) => m.kind)).toEqual(["doc", "part"]);
  const raw = text.match(/\/\*[^]*?\*\//)![0];
  return { shown: commentBodyText(raw), el: P.members[0]!.documentation ?? "" };
}

const fixed = ["*/", "*\\/", "*\\\\/", "a*", "/", "**/", "*/*/", "ends with backslash \\", "x*/y*\\/z", "\\"];
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe("terminator convention is a bijection", () => {
  test("escape and unescape are inverse", () => {
    for (const s of fixed) expect(unescapeTerminator(escapeTerminator(s)), s).toBe(s);
    expect(escapeTerminator("*\\/")).toBe("*\\\\/");
    expect(unescapeTerminator("*\\/")).toBe("*/");
  });
  test("fixed strings survive the real parser", () => {
    for (const s of fixed) {
      const body = s.trim();
      expect(roundTrip(body).shown, s).toBe(body);
    }
  });
  test("random strings over * / \\ a space newline survive the real parser", () => {
    const r = rng(7);
    const alphabet = ["*", "/", "\\", "a", " ", "\n"];
    for (let i = 0; i < 300; i++) {
      let s = "";
      const n = 1 + Math.floor(r() * 12);
      for (let k = 0; k < n; k++) s += alphabet[Math.floor(r() * alphabet.length)];
      // Only blank lines at the start and whitespace at the end are not kept; margins keep leading `*`.
      let body = s.replace(/^(?:[ \t]*\n)+/, "").trimEnd();
      if (!body.includes("\n")) body = body.trimStart(); // a single-line comment has no margin to keep indentation
      if (body === "") continue;
      expect(roundTrip(body).shown, JSON.stringify(s)).toBe(body);
    }
  });
});

describe("margins", () => {
  test("a bullet list and a nested list survive a no-margin multi-line style", () => {
    const body = "Intro\n* item\n  * nested\n    deeper\n* last";
    const noMargin = { multi: true, margin: false, tight: false };
    expect(roundTrip(body, noMargin).shown).toBe(body);
    expect(roundTrip(body, noMargin).el).toBe(body);
    expect(roundTrip(body).shown).toBe(body);
  });
  test("planSetCommentBody keeps the first line's indentation and only trims blank lines", () => {
    const text = "package P {\n    comment /*\n     * one\n     */\n}\n";
    const ix = new ModelIndex();
    ix.setDocument(URI, text);
    const plan = planSetCommentBody(ix, ix.findByQualifiedName("P")[0]!.members[0]!, "\n\n    indented code\nnext\n\n");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const out = applyEdits(text, groupByUri(plan.edits).get(URI)!);
    const ix2 = new ModelIndex();
    ix2.setDocument(URI, out);
    expect(ix2.findByQualifiedName("P")[0]!.members[0]!.documentation).toBe("    indented code\nnext");
    expect(commentStyle(out.match(/\/\*[^]*?\*\//)![0]).margin).toBe(true);
  });
});
