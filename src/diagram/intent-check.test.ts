import { describe, expect, test } from "vitest";
import { badConnectIntent } from "./intent-check.js";
import type { ModelIntent } from "./protocol.js";

const bad = (i: unknown) => badConnectIntent(i as ModelIntent);
describe("connect intents from the webview", () => {
  test("well-formed intents pass", () => {
    expect(bad({ kind: "connectNew", sourceId: "n1", relation: "succession", paletteKind: "fork", x: 1, y: 2 })).toBeUndefined();
    expect(bad({ kind: "reconnect", id: "e1", end: "target", nodeId: "n2" })).toBeUndefined();
  });
  test("bad ones are refused with a reason, never thrown", () => {
    expect(bad({ kind: "connectNew", sourceId: "n1", relation: "message", paletteKind: "fork", x: 1, y: 2 })).toMatch(/succession or a transition/);
    expect(bad({ kind: "connectNew", sourceId: 5, relation: "succession", paletteKind: "fork", x: 1, y: 2 })).toBeDefined();
    expect(bad({ kind: "connectNew", sourceId: "n1", relation: "succession", paletteKind: "fork", x: NaN, y: 2 })).toBeDefined();
    expect(bad({ kind: "connectNew", sourceId: "n1", relation: "succession", paletteKind: "fork", x: 1, y: "2" })).toBeDefined();
    expect(bad({ kind: "reconnect", id: "e1", end: "middle", nodeId: "n2" })).toMatch(/source or the target/);
    expect(bad({ kind: "reconnect", id: undefined, end: "source", nodeId: "n2" })).toBeDefined();
  });
});
