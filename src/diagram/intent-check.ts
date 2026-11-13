/** Shape checks for the model intents that come from the webview (untrusted input). No `vscode`. */
import type { ModelIntent } from "./protocol.js";

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Why a `connectNew` or `reconnect` intent is malformed, or undefined. */
export function badConnectIntent(i: ModelIntent): string | undefined {
  if (i.kind === "connectNew") {
    if (!str(i.sourceId) || !str(i.paletteKind)) return "The request to add a node was malformed.";
    if (i.relation !== "succession" && i.relation !== "transition") return "The line kind must be a succession or a transition.";
    if (!num(i.x) || !num(i.y)) return "The position of the new node was malformed.";
  } else if (i.kind === "reconnect") {
    if (!str(i.id) || !str(i.nodeId)) return "The request to move a line end was malformed.";
    if (i.end !== "source" && i.end !== "target") return "The end to move must be the source or the target.";
  }
  return undefined;
}
