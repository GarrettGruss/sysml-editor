import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { helpFor, MAIN_HELP, SKILLS_HELP, VERSION } from "./help.js";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
  home: string;
  skillsSource: string;
}

class UsageError extends Error {}
class Failure extends Error {}

function listFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, base), { withFileTypes: true })) {
    const rel = join(base, e.name);
    if (e.isSymbolicLink()) out.push(rel + "\0symlink");
    else if (e.isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

function lstatOrNull(p: string) {
  try {
    return lstatSync(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function identical(a: string, b: string): boolean {
  const fa = listFiles(a);
  const fb = listFiles(b);
  if (fa.length !== fb.length || fa.some((f, i) => f !== fb[i])) return false;
  return fa.every((f) => !f.endsWith("\0symlink") && readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
}

function skills(args: string[], io: Io): void {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        project: { type: "boolean", short: "p" },
        force: { type: "boolean", short: "f" },
        "dry-run": { type: "boolean", short: "n" },
        dir: { type: "string", short: "d" },
        quiet: { type: "boolean", short: "q" },
        verbose: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message.replace(/\.? To specify a positional.*$/, ""));
  }
  const v = parsed.values;
  if (v.help) {
    io.out(SKILLS_HELP);
    return;
  }
  if (parsed.positionals.length > 0) throw new UsageError(`unexpected argument '${parsed.positionals[0]}'`);
  if (v.project && v.dir !== undefined) throw new UsageError("-p and -d cannot be combined");
  if (v.dir === "") throw new UsageError("option '-d, --dir' needs a directory");

  const target = v.dir !== undefined ? resolve(io.cwd, v.dir) : v.project ? join(io.cwd, ".claude", "skills") : join(io.home, ".claude", "skills");
  if (!existsSync(io.skillsSource)) throw new Failure(`bundled skills not found at ${io.skillsSource}`);
  const names = readdirSync(io.skillsSource, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const say = (s: string) => {
    if (v.verbose && !v.quiet) io.out(s + "\n");
  };
  const dry = v["dry-run"] ? "would " : "";
  const plan: { name: string; action: "install" | "skip" | "overwrite" | "refuse" }[] = [];
  for (const name of names) {
    const dest = join(target, name);
    const st = lstatOrNull(dest);
    if (!st) plan.push({ name, action: "install" });
    else if (st.isSymbolicLink() || !st.isDirectory()) plan.push({ name, action: v.force ? "overwrite" : "refuse" });
    else if (identical(join(io.skillsSource, name), dest)) plan.push({ name, action: "skip" });
    else plan.push({ name, action: v.force ? "overwrite" : "refuse" });
  }
  const refused = plan.filter((p) => p.action === "refuse");
  if (refused.length > 0) {
    throw new Failure(`${refused.map((r) => r.name).join(", ")} already exist${refused.length === 1 ? "s" : ""} in ${target} and differ${refused.length === 1 ? "s" : ""} from the bundled version (use -f to overwrite)`);
  }
  for (const p of plan) {
    const dest = join(target, p.name);
    if (p.action === "skip") {
      say(`${dry}skip ${p.name} (up to date)`);
      continue;
    }
    if (!v["dry-run"]) {
      try {
        mkdirSync(target, { recursive: true });
        if (p.action === "overwrite") rmSync(dest, { recursive: true, force: true });
        cpSync(join(io.skillsSource, p.name), dest, { recursive: true });
      } catch (e) {
        throw new Failure(`cannot write ${dest}: ${(e as Error).message}`);
      }
    }
    say(`${dry}${p.action === "install" ? "install" : "overwrite"} ${p.name} -> ${dest}`);
  }
}

export function run(argv: string[], io: Io): number {
  let help = MAIN_HELP;
  try {
    const first = argv[0];
    if (first === undefined) throw new UsageError("missing command");
    if (first === "--") throw new UsageError("missing command");
    if (first === "-h" || first === "--help") {
      io.out(MAIN_HELP);
      return 0;
    }
    if (first === "-V" || first === "--version") {
      io.out(VERSION + "\n");
      return 0;
    }
    if (first === "help") {
      const cmd = argv[1];
      const text = helpFor(cmd);
      if (text === undefined) throw new UsageError(`unknown command '${cmd}'`);
      io.out(text);
      return 0;
    }
    if (first === "skills") {
      help = SKILLS_HELP;
      try {
        skills(argv.slice(1), io);
      } catch (e) {
        if (e instanceof UsageError || e instanceof Failure) throw e;
        throw new Failure((e as Error).message);
      }
      return 0;
    }
    if (first.startsWith("-")) throw new UsageError(`unknown option '${first}'`);
    throw new UsageError(`unknown command '${first}'`);
  } catch (e) {
    if (!(e instanceof UsageError || e instanceof Failure)) throw e;
    io.err(`sysml: ${e.message}\n\n${help}`);
    return e instanceof UsageError ? 2 : 1;
  }
}
