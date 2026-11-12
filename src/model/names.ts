const PLAIN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Remove the quotes of an unrestricted name and process escapes; plain names are unchanged. */
export function unquoteName(text: string): string {
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/\\(.)/gs, (_m, c: string) => {
      switch (c) {
        case "n": return "\n";
        case "t": return "\t";
        case "b": return "\b";
        case "f": return "\f";
        case "r": return "\r";
        default: return c;
      }
    });
  }
  return text;
}

/** Quote a name segment if it is not a plain identifier. */
export function quoteName(name: string): string {
  if (PLAIN.test(name)) return name;
  return "'" + name.replace(/[\\']/g, (c) => "\\" + c) + "'";
}

/**
 * Split a qualified name as written (`A::'b c'::d`, `a.b`) into unquoted segments.
 * A leading `$::` global marker is returned as the segment `$`.
 */
export function splitQualified(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let have = false;
  const flush = () => {
    if (have) out.push(cur);
    cur = "";
    have = false;
  };
  while (i < text.length) {
    const c = text[i]!;
    if (c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== "'") j += text[j] === "\\" ? 2 : 1;
      cur += unquoteName(text.slice(i, j + 1));
      have = true;
      i = j + 1;
    } else if (c === ":" && text[i + 1] === ":") {
      flush();
      i += 2;
    } else if (c === ".") {
      flush();
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      cur += c;
      have = true;
      i++;
    }
  }
  flush();
  return out;
}

/** Process a block comment body per the SysML rule: strip delimiters and `*` margins. */
export function processDocComment(raw: string): string {
  let s = raw;
  if (s.startsWith("/*")) s = s.slice(2);
  if (s.endsWith("*/")) s = s.slice(0, -2);
  const lines = s.split(/\r?\n/).map((l, i) => {
    if (i === 0) return l.replace(/^[ \t]+/, "");
    return /^[ \t]*\*/.test(l) ? l.replace(/^[ \t]*\*[ \t]?/, "") : l.replace(/^[ \t]+/, "");
  });
  return lines.join("\n").trim();
}
