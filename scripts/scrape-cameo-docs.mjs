// Downloads a Confluence page tree from docs.nomagic.com (default: the Cameo/MagicDraw 2024x R3 User Guide)
// as local Markdown, through the public Confluence REST API. Usage: node scripts/scrape-cameo-docs.mjs [pageId] [outDir]
// Output is reference material for local use only (third-party copyright); it is git-ignored.
import TurndownService from "turndown";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://docs.nomagic.com";
const ROOT = process.argv[2] ?? "227148415";
const OUT = process.argv[3] ?? "docs/reference/cameo-user-guide";
const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s) => s.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 100);
let count = 0;

async function get(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {}
    await sleep(2000 * (i + 1));
  }
  throw new Error(`failed: ${url}`);
}

async function children(id) {
  const all = [];
  for (let start = 0; ; start += 100) {
    const r = await get(`${BASE}/rest/api/content/${id}/child/page?limit=100&start=${start}`);
    all.push(...r.results);
    if (r.size < 100) return all;
  }
}

async function walk(id, dir, index) {
  const p = await get(`${BASE}/rest/api/content/${id}?expand=body.export_view`);
  const name = `${String(index).padStart(3, "0")} ${safe(p.title)}`;
  const md = `# ${p.title}\n\nSource: ${BASE}${p._links.webui}\n\n` + td.turndown(p.body.export_view.value);
  const kids = await children(id);
  const here = kids.length ? join(dir, name) : dir;
  await mkdir(here, { recursive: true });
  await writeFile(join(here, kids.length ? "index.md" : `${name}.md`), md);
  console.log(`${++count}\t${join(here, name)}`);
  await sleep(300);
  for (const [i, k] of kids.entries()) await walk(k.id, here, i + 1);
}

await walk(ROOT, OUT, 0);
console.log(`done: ${count} pages`);
