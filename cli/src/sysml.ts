import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./main.js";

const code = run(process.argv.slice(2), {
  out: (s) => void process.stdout.write(s),
  err: (s) => void process.stderr.write(s),
  cwd: process.cwd(),
  home: homedir(),
  skillsSource: join(__dirname, "skills"),
});
process.exitCode = code;
