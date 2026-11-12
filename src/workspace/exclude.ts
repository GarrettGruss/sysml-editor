/** vscode-free glob exclusion shared by the scan, the file watcher and opened documents. */

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") re += "(?:";
    else if (c === "}") re += ")";
    else if (c === ",") re += braceDepth(glob, i) > 0 ? "|" : ",";
    else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end < 0) re += "\\[";
      else {
        re += "[" + glob.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\") + "]";
        i = end;
      }
    } else re += c.replace(/[.+^$()|\\/]/g, "\\$&");
  }
  return new RegExp("^" + re + "$", "i");
}

function braceDepth(glob: string, upTo: number): number {
  let d = 0;
  for (let i = 0; i < upTo; i++) {
    if (glob[i] === "{") d++;
    else if (glob[i] === "}") d--;
  }
  return d;
}

export function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * A predicate telling whether a workspace-relative path is excluded. A path is excluded when the
 * path itself or any of its parent folders matches a pattern (like VS Code's folder exclusion).
 */
export function makeExcludeFilter(patterns: readonly string[]): (relPath: string) => boolean {
  const res = patterns.filter((p) => p.trim()).map((p) => globToRegExp(normalizeRelPath(p.trim())));
  return (relPath) => {
    if (res.length === 0) return false;
    const parts = normalizeRelPath(relPath).split("/");
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? prefix + "/" + part : part;
      if (res.some((r) => r.test(prefix))) return true;
    }
    return false;
  };
}

/** Patterns of a `search.exclude`-style object: only entries set to `true` count. */
export function patternsFromObject(obj: Record<string, unknown> | undefined): string[] {
  return Object.entries(obj ?? {}).filter(([, v]) => v === true).map(([k]) => k);
}

/** The combined `sysml.exclude` + `search.exclude` predicate. */
export function makeIndexFilter(sysmlExclude: readonly string[], searchExclude: Record<string, unknown> | undefined) {
  return makeExcludeFilter([...sysmlExclude, ...patternsFromObject(searchExclude)]);
}
