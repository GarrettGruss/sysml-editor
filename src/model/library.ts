import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ModelIndex } from "./index.js";
import { LIBRARY_URI_SCHEME } from "./library-uri.js";

export interface LoadedLibrary {
  /** URIs of the documents added. */
  uris: string[];
  /** Files that could not be read, with the reason. */
  failed: { path: string; error: string }[];
}

function collect(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.name.endsWith(".sysml") || e.name.endsWith(".kerml")) out.push(p);
  }
}

/**
 * Add every `.sysml` and `.kerml` file under `dir` to `index` as read-only library documents
 * (URI scheme `sysml-library`, path relative to `dir`). `.sysml` files go through the ANTLR
 * parser, `.kerml` files through the outline indexer. A single change event is emitted.
 */
export function loadLibrary(index: ModelIndex, dir: string): LoadedLibrary {
  const files: string[] = [];
  collect(dir, files);
  files.sort();
  const entries: [string, string][] = [];
  const result: LoadedLibrary = { uris: [], failed: [] };
  for (const f of files) {
    try {
      const rel = relative(dir, f).split(sep).map(encodeURIComponent).join("/");
      const uri = `${LIBRARY_URI_SCHEME}:///${rel}`;
      entries.push([uri, readFileSync(f, "utf8")]);
      result.uris.push(uri);
    } catch (e) {
      result.failed.push({ path: f, error: String(e) });
    }
  }
  index.setDocuments(entries);
  return result;
}
