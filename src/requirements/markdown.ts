/**
 * The small Markdown subset of paragraph bodies: emphasis, strong, inline code, bulleted and numbered lists,
 * links with http or https only. Produces a node tree; there is no raw HTML passthrough (angle brackets are text),
 * and the renderer in the webview builds DOM nodes from it with `textContent`.
 */
export type Inline =
  | { t: "text"; s: string }
  | { t: "code"; s: string }
  | { t: "em"; c: Inline[] }
  | { t: "strong"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type MdBlock = { t: "p"; c: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "ol"; items: Inline[][] };

const safeHref = (u: string): boolean => /^https?:\/\/[^\s<>"]+$/i.test(u);

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", s: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "\\" && i + 1 < s.length && /[\\`*_\[\]()-]/.test(s[i + 1]!)) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        flush();
        out.push({ t: "code", s: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if ((s.startsWith("**", i) || s.startsWith("__", i)) && /\w/.test(s[i + 2] ?? "") && s.indexOf(s.slice(i, i + 2), i + 2) > i + 2 && /\w/.test(s[s.indexOf(s.slice(i, i + 2), i + 2) - 1] ?? "")) {
      const j = s.indexOf(s.slice(i, i + 2), i + 2);
      flush();
      out.push({ t: "strong", c: parseInline(s.slice(i + 2, j)) });
      i = j + 2;
      continue;
    }
    // Emphasis must wrap word characters: "*/ and /*" (the comment terminator convention) stays text.
    if ((ch === "*" || ch === "_") && /\w/.test(s[i + 1] ?? "") && !/\w/.test(s[i - 1] ?? " ")) {
      const j = s.indexOf(ch, i + 1);
      if (j > i + 1 && /\w/.test(s[j - 1] ?? "") && (ch === "*" || !/\w/.test(s[j + 1] ?? ""))) {
        flush();
        out.push({ t: "em", c: parseInline(s.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(s.slice(i));
      if (m) {
        flush();
        if (safeHref(m[2]!)) out.push({ t: "link", href: m[2]!, c: parseInline(m[1]!) });
        else out.push(...parseInline(m[1]!)); // an unsafe or relative target is dropped, the text stays
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const UL = /^\s{0,3}[-*+]\s+(.*)$/;
const OL = /^\s{0,3}\d+[.)]\s+(.*)$/;

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { t: "ul" | "ol"; items: string[] } | undefined;
  const endPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push({ t: list.t, items: list.items.map(parseInline) });
    list = undefined;
  };
  for (const line of lines) {
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    if (ul || ol) {
      endPara();
      const t = ul ? "ul" : "ol";
      if (list && list.t !== t) endList();
      list ??= { t, items: [] };
      list.items.push((ul ?? ol)![1]!);
    } else if (line.trim() === "") {
      endPara();
      endList();
    } else if (list && /^\s+\S/.test(line)) list.items[list.items.length - 1] += " " + line.trim();
    else {
      endList();
      para.push(line.trim());
    }
  }
  endPara();
  endList();
  return blocks;
}

/** The text of inline nodes without markup (for tests, agent output and titles). */
export function inlineText(c: readonly Inline[]): string {
  return c.map((n) => (n.t === "text" || n.t === "code" ? n.s : inlineText(n.c))).join("");
}
