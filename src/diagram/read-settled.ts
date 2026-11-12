import { parseDiagram } from "./format.js";

/** True when `text` is a complete diagram file; empty or unparseable text may be a write in progress. */
export const isSettledDiagramText = (text: string | undefined): boolean => text !== undefined && text.trim() !== "" && parseDiagram(text).ok;

/** Reads once; if the result is not settled (empty or unparseable), waits briefly and reads once more. */
export async function readSettled(read: () => Promise<string | undefined>, delayMs = 100): Promise<string | undefined> {
  const first = await read();
  if (first === undefined || isSettledDiagramText(first)) return first;
  await new Promise((r) => setTimeout(r, delayMs));
  return (await read()) ?? first;
}
