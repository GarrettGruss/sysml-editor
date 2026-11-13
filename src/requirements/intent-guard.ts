/** Runtime shape check of the messages a webview sends: the controller only sees an `Intent` that passed it. No `vscode`, no DOM. */
import type { Intent } from "./protocol.js";

/** Longest text a paragraph or cell may carry, and longest name, key or qualified name. */
export const MAX_TEXT = 200_000;
export const MAX_NAME = 4_096;

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);

/** The checked intent, or the reason the message is not one. */
export function parseIntent(x: unknown): { ok: true; intent: Intent } | { ok: false; reason: string } {
  if (!isRec(x)) return { ok: false, reason: "The message is not an object." };
  const bad = (why: string) => ({ ok: false as const, reason: `Invalid ${String(x.type)} request: ${why}.` });
  const str = (k: string, max = MAX_NAME): string | undefined => (typeof x[k] === "string" && (x[k] as string).length <= max ? (x[k] as string) : undefined);
  const optStr = (k: string, max = MAX_NAME): boolean => x[k] === undefined || str(k, max) !== undefined;
  const optBool = (k: string): boolean => x[k] === undefined || typeof x[k] === "boolean";
  const need = (keys: readonly string[], max = MAX_NAME): string | undefined => keys.find((k) => str(k, max) === undefined);
  const ok = (): { ok: true; intent: Intent } => ({ ok: true, intent: x as unknown as Intent });
  const text = (k: string) => str(k, MAX_TEXT) !== undefined;
  switch (x.type) {
    case "setCell": {
      if (str("qn") === undefined || !text("value") || !text("expected")) return bad("qn, value and expected must be text");
      if (x.field !== "id" && x.field !== "name" && x.field !== "text") return bad("field must be id, name or text");
      return ok();
    }
    case "setHeading": return str("qn") === undefined || !text("value") || !text("expected") ? bad("qn, value and expected must be text") : ok();
    case "setParagraph": return str("key") === undefined || !text("value") || !text("expected") ? bad("key, value and expected must be text") : ok();
    case "addRequirement":
      if (x.kind !== "requirement" && x.kind !== "requirement def") return bad("kind must be requirement or requirement def");
      return need(["id", "name"]) || !optStr("ownerQn") || !optStr("afterQn") || !optStr("beforeQn") ? bad("id and name must be text, ownerQn, afterQn and beforeQn text when given") : ok();
    case "deleteRequirement": case "addSatisfy": case "addVerify": case "addDerivedFrom": case "addDerives": case "deleteSection":
      return need(["qn"]) ? bad("qn must be text") : ok();
    case "removeSatisfy": case "removeVerify": return need(["key"]) ? bad("key must be text") : ok();
    case "removeDerivation": return need(["connectionKey"]) || !optStr("derivedQn") ? bad("connectionKey must be text, derivedQn text when given") : ok();
    case "navigate":
      if (need(["qn"])) return bad("qn must be text");
      return x.to === "tree" || x.to === "text" || x.to === "diagram" ? ok() : bad("to must be tree, text or diagram");
    case "exportMatrix": return x.format === "csv" || x.format === "markdown" ? ok() : bad("format must be csv or markdown");
    case "addSection": if (x.afterQn !== undefined && x.beforeQn !== undefined) return bad("give afterQn or beforeQn, not both"); return need(["parentQn", "name"]) || !optStr("afterQn") || !optStr("beforeQn") || !optBool("appendix") ? bad("parentQn and name must be text, appendix a boolean, afterQn text when given") : ok();
    case "addParagraph": return str("pkgQn") === undefined || !text("text") ? bad("pkgQn and text must be text") : ok();
    case "moveRequirement": {
      if (need(["qn"])) return bad("qn must be text");
      const how = x.how;
      if (how === "up" || how === "down") return ok();
      if (isRec(how) && typeof how.ownerQn === "string" && how.ownerQn.length <= MAX_NAME && (how.beforeQn === undefined || (typeof how.beforeQn === "string" && how.beforeQn.length <= MAX_NAME))) return ok();
      return bad("how must be up, down or { ownerQn, beforeQn? }");
    }
    case "moveSection": {
      if (need(["qn"])) return bad("qn must be text");
      const how = x.how;
      if (how === "up" || how === "down") return ok();
      if (isRec(how) && Object.keys(how).length === 1 && ((typeof how.beforeQn === "string" && how.beforeQn.length <= MAX_NAME) || (typeof how.afterQn === "string" && how.afterQn.length <= MAX_NAME))) return ok();
      return bad("how must be up, down, { beforeQn } or { afterQn }");
    }
    default: return { ok: false, reason: `Unknown request type ${JSON.stringify(String(x.type)).slice(0, 60)}.` };
  }
}
