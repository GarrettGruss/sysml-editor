/** True when `e` says the file does not exist (Node ENOENT or a VS Code FileNotFound error): a file removed between a change event and its read. */
export function isFileGone(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { code, name, message } = e as { code?: unknown; name?: unknown; message?: unknown };
  const tag = `${typeof code === "string" ? code : ""} ${typeof name === "string" ? name : ""} ${typeof message === "string" ? message : ""}`;
  return /ENOENT|FileNotFound|EntryNotFound/.test(tag);
}
